create table if not exists public.trash_grab_runners (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null unique
    references public.trash_grab_runner_applications(id) on delete cascade,
  auth_user_id uuid unique references auth.users(id) on delete set null,
  first_name text not null check (char_length(btrim(first_name)) between 1 and 60),
  last_name text not null check (char_length(btrim(last_name)) between 1 and 60),
  email text not null check (char_length(email) between 5 and 254),
  active boolean not null default true,
  approved_by uuid references auth.users(id),
  approved_at timestamptz not null default now(),
  invited_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.trash_grab_runners is
  'Approved Black & Blue runners. Auth users are linked by verified email and receive only their own route assignments.';

create unique index if not exists trash_grab_runners_email_key
on public.trash_grab_runners (lower(email));

create index if not exists trash_grab_runners_auth_user_idx
on public.trash_grab_runners (auth_user_id)
where auth_user_id is not null;

create index if not exists trash_grab_runners_approved_by_idx
on public.trash_grab_runners (approved_by)
where approved_by is not null;

create table if not exists public.trash_grab_runner_assignments (
  id uuid primary key default gen_random_uuid(),
  runner_id uuid not null
    references public.trash_grab_runners(id) on delete cascade,
  service_request_id uuid
    references public.trash_grab_service_requests(id) on delete set null,
  pickup_date date not null,
  pickup_window text not null default 'Before collection'
    check (char_length(btrim(pickup_window)) between 2 and 80),
  stop_label text not null
    check (char_length(btrim(stop_label)) between 2 and 120),
  service_address text not null
    check (char_length(btrim(service_address)) between 5 and 300),
  bin_count smallint not null check (bin_count between 1 and 20),
  runner_notes text check (runner_notes is null or char_length(runner_notes) <= 1000),
  sequence_order smallint not null default 1 check (sequence_order between 1 and 100),
  status text not null default 'assigned'
    check (status in ('assigned', 'completed', 'cancelled')),
  assigned_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.trash_grab_runner_assignments is
  'Runner-safe route snapshots. Customer contact details and private administrator notes are intentionally excluded.';

create index if not exists trash_grab_runner_assignments_runner_date_idx
on public.trash_grab_runner_assignments (runner_id, pickup_date, sequence_order);

create index if not exists trash_grab_runner_assignments_request_idx
on public.trash_grab_runner_assignments (service_request_id)
where service_request_id is not null;

create index if not exists trash_grab_runner_assignments_assigned_by_idx
on public.trash_grab_runner_assignments (assigned_by);

create index if not exists trash_grab_runner_applications_reviewed_by_idx
on public.trash_grab_runner_applications (reviewed_by)
where reviewed_by is not null;

alter table public.trash_grab_runners enable row level security;
alter table public.trash_grab_runner_assignments enable row level security;

revoke all on table public.trash_grab_runners from anon, authenticated;
revoke all on table public.trash_grab_runner_assignments from anon, authenticated;

grant select, insert, update, delete on table public.trash_grab_runners to authenticated;
grant select, insert, update, delete on table public.trash_grab_runner_assignments to authenticated;

create or replace function private.trash_grab_is_active_runner(target_runner_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.trash_grab_runners
    where id = target_runner_id
      and auth_user_id = (select auth.uid())
      and active = true
  );
$$;

revoke all on function private.trash_grab_is_active_runner(uuid) from public, anon;
grant execute on function private.trash_grab_is_active_runner(uuid) to authenticated, service_role;

drop policy if exists "Trash Grab admins manage runner profiles"
on public.trash_grab_runners;
create policy "Trash Grab admins manage runner profiles"
on public.trash_grab_runners
for all
to authenticated
using ((select private.trash_grab_is_admin()))
with check ((select private.trash_grab_is_admin()));

drop policy if exists "Runners can view their own profile"
on public.trash_grab_runners;
create policy "Runners can view their own profile"
on public.trash_grab_runners
for select
to authenticated
using (
  auth_user_id = (select auth.uid())
  and active = true
);

drop policy if exists "Trash Grab admins manage runner assignments"
on public.trash_grab_runner_assignments;
create policy "Trash Grab admins manage runner assignments"
on public.trash_grab_runner_assignments
for all
to authenticated
using ((select private.trash_grab_is_admin()))
with check ((select private.trash_grab_is_admin()));

drop policy if exists "Runners can view only their assigned stops"
on public.trash_grab_runner_assignments;
create policy "Runners can view only their assigned stops"
on public.trash_grab_runner_assignments
for select
to authenticated
using ((select private.trash_grab_is_active_runner(runner_id)));

create or replace function private.trash_grab_sync_runner_from_application()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'approved' then
    if not (select private.trash_grab_is_admin()) then
      raise exception 'Administrator approval is required.' using errcode = '42501';
    end if;

    insert into public.trash_grab_runners (
      application_id,
      first_name,
      last_name,
      email,
      active,
      approved_by,
      approved_at,
      updated_at
    ) values (
      new.id,
      new.first_name,
      new.last_name,
      lower(new.email),
      true,
      coalesce(new.reviewed_by, (select auth.uid())),
      coalesce(new.reviewed_at, now()),
      now()
    )
    on conflict (application_id) do update set
      first_name = excluded.first_name,
      last_name = excluded.last_name,
      email = excluded.email,
      active = true,
      approved_by = excluded.approved_by,
      approved_at = excluded.approved_at,
      updated_at = now();

    update public.trash_grab_runners as runner
    set auth_user_id = auth_user.id, updated_at = now()
    from auth.users as auth_user
    where runner.application_id = new.id
      and runner.auth_user_id is null
      and auth_user.email is not null
      and lower(auth_user.email) = lower(new.email);
  elsif tg_op = 'UPDATE' and old.status = 'approved' then
    if not (select private.trash_grab_is_admin()) then
      raise exception 'Administrator approval is required.' using errcode = '42501';
    end if;

    update public.trash_grab_runners
    set active = false, updated_at = now()
    where application_id = new.id;
  end if;

  return new;
end;
$$;

revoke all on function private.trash_grab_sync_runner_from_application() from public, anon, authenticated;

drop trigger if exists trash_grab_sync_runner_after_review
on public.trash_grab_runner_applications;
create trigger trash_grab_sync_runner_after_review
after insert or update of status, first_name, last_name, email, reviewed_by, reviewed_at
on public.trash_grab_runner_applications
for each row
execute function private.trash_grab_sync_runner_from_application();

create or replace function private.trash_grab_link_runner_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is not null then
    update public.trash_grab_runners
    set auth_user_id = new.id, updated_at = now()
    where lower(email) = lower(new.email)
      and active = true
      and (auth_user_id is null or auth_user_id = new.id);
  end if;
  return new;
end;
$$;

revoke all on function private.trash_grab_link_runner_auth_user() from public, anon, authenticated;

drop trigger if exists trash_grab_link_runner_after_auth_user
on auth.users;
create trigger trash_grab_link_runner_after_auth_user
after insert or update of email
on auth.users
for each row
execute function private.trash_grab_link_runner_auth_user();

insert into public.trash_grab_runners (
  application_id,
  first_name,
  last_name,
  email,
  active,
  approved_by,
  approved_at
)
select
  application.id,
  application.first_name,
  application.last_name,
  lower(application.email),
  true,
  application.reviewed_by,
  coalesce(application.reviewed_at, now())
from public.trash_grab_runner_applications as application
where application.status = 'approved'
on conflict (application_id) do nothing;

update public.trash_grab_runners as runner
set auth_user_id = auth_user.id, updated_at = now()
from auth.users as auth_user
where runner.auth_user_id is null
  and auth_user.email is not null
  and lower(runner.email) = lower(auth_user.email);
