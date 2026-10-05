-- A banned member must not be able to delete their own membership row: that erases the ban
-- and lets request_join treat them as a brand-new visitor. Only GMs can remove a banned row (unban).
drop policy members_delete on public.room_members;
create policy members_delete on public.room_members for delete to authenticated
  using (
    (select private.is_gm(room_id))
    or (user_id = (select auth.uid()) and status <> 'banned')
  );
