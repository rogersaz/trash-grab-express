create table if not exists public.trash_grab_runner_applications (
  id uuid primary key default gen_random_uuid(),
  first_name text not null check (char_length(btrim(first_name)) between 1 and 60),
  last_name text not null check (char_length(btrim(last_name)) between 1 and 60),
  email text not null check (char_length(email) between 5 and 254),
  phone text not null check (char_length(phone) between 7 and 30),
  city text not null check (char_length(btrim(city)) between 2 and 100),
  zip text not null check (zip ~ '^[0-9]{5}$'),
  availability text not null check (availability in ('weekday_mornings', 'weekday_evenings', 'weekends', 'flexible')),
  reliable_transportation boolean not null default false,
  age_18_or_older boolean not null default false,
  referral_interest boolean not null default true,
  experience text check (experience is null or char_length(experience) <= 1000),
  status text not null default 'pending' check (status in ('pending', 'reviewing', 'approved', 'rejected')),
  admin_notes text check (admin_notes is null or char_length(admin_notes) <= 2000),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.trash_grab_runner_applications is
  'Private applications for the Black & Blue Trash Bin Runner program. Applicants require administrator approval before receiving routes.';

alter table public.trash_grab_runner_applications enable row level security;

revoke all on table public.trash_grab_runner_applications from anon, authenticated;

grant insert (
  first_name,
  last_name,
  email,
  phone,
  city,
  zip,
  availability,
  reliable_transportation,
  age_18_or_older,
  referral_interest,
  experience
) on table public.trash_grab_runner_applications to anon, authenticated;

grant select, update on table public.trash_grab_runner_applications to authenticated;

drop policy if exists "Visitors can apply to become Trash Grab runners"
on public.trash_grab_runner_applications;
create policy "Visitors can apply to become Trash Grab runners"
on public.trash_grab_runner_applications
for insert
to anon, authenticated
with check (
  status = 'pending'
  and age_18_or_older = true
  and admin_notes is null
  and reviewed_by is null
  and reviewed_at is null
);

drop policy if exists "Trash Grab admins can read runner applications"
on public.trash_grab_runner_applications;
create policy "Trash Grab admins can read runner applications"
on public.trash_grab_runner_applications
for select
to authenticated
using ((select private.trash_grab_is_admin()));

drop policy if exists "Trash Grab admins can review runner applications"
on public.trash_grab_runner_applications;
create policy "Trash Grab admins can review runner applications"
on public.trash_grab_runner_applications
for update
to authenticated
using ((select private.trash_grab_is_admin()))
with check ((select private.trash_grab_is_admin()));

create index if not exists trash_grab_runner_applications_status_created_idx
on public.trash_grab_runner_applications (status, created_at desc);

create index if not exists trash_grab_runner_applications_email_idx
on public.trash_grab_runner_applications (lower(email));
