drop policy if exists "Trash Grab admins manage runner profiles"
on public.trash_grab_runners;

drop policy if exists "Runners can view their own profile"
on public.trash_grab_runners;

create policy "Admins and runners view permitted runner profiles"
on public.trash_grab_runners
for select
to authenticated
using (
  (select private.trash_grab_is_admin())
  or (
    auth_user_id = (select auth.uid())
    and active = true
  )
);

create policy "Trash Grab admins insert runner profiles"
on public.trash_grab_runners
for insert
to authenticated
with check ((select private.trash_grab_is_admin()));

create policy "Trash Grab admins update runner profiles"
on public.trash_grab_runners
for update
to authenticated
using ((select private.trash_grab_is_admin()))
with check ((select private.trash_grab_is_admin()));

create policy "Trash Grab admins delete runner profiles"
on public.trash_grab_runners
for delete
to authenticated
using ((select private.trash_grab_is_admin()));

drop policy if exists "Trash Grab admins manage runner assignments"
on public.trash_grab_runner_assignments;

drop policy if exists "Runners can view only their assigned stops"
on public.trash_grab_runner_assignments;

create policy "Admins and runners view permitted assignments"
on public.trash_grab_runner_assignments
for select
to authenticated
using (
  (select private.trash_grab_is_admin())
  or (select private.trash_grab_is_active_runner(runner_id))
);

create policy "Trash Grab admins insert runner assignments"
on public.trash_grab_runner_assignments
for insert
to authenticated
with check ((select private.trash_grab_is_admin()));

create policy "Trash Grab admins update runner assignments"
on public.trash_grab_runner_assignments
for update
to authenticated
using ((select private.trash_grab_is_admin()))
with check ((select private.trash_grab_is_admin()));

create policy "Trash Grab admins delete runner assignments"
on public.trash_grab_runner_assignments
for delete
to authenticated
using ((select private.trash_grab_is_admin()));
