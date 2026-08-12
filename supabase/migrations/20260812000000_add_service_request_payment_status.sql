alter table public.trash_grab_service_requests
  add column if not exists payment_status text not null default 'unpaid',
  add column if not exists paid_at timestamp with time zone;

alter table public.trash_grab_service_requests
  drop constraint if exists trash_grab_service_requests_payment_status_check;

alter table public.trash_grab_service_requests
  add constraint trash_grab_service_requests_payment_status_check
  check (payment_status in ('paid', 'unpaid'));

drop policy if exists "Visitors can submit Trash Grab requests"
  on public.trash_grab_service_requests;

create policy "Visitors can submit Trash Grab requests"
on public.trash_grab_service_requests
for insert
to anon, authenticated
with check (
  status = 'new'
  and payment_status = 'unpaid'
  and paid_at is null
  and admin_notes is null
  and assigned_to is null
  and contacted_at is null
  and scheduled_at is null
  and completed_at is null
);

comment on column public.trash_grab_service_requests.payment_status is
  'Administrator-managed payment state. New customer requests always begin unpaid.';

comment on column public.trash_grab_service_requests.paid_at is
  'Timestamp recorded when an administrator marks the request paid.';
