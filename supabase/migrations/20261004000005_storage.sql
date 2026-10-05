-- Private bucket for room images: room-assets/<room_id>/<sha256>.<ext>
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('room-assets', 'room-assets', false, 5242880, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy room_assets_read on storage.objects for select to authenticated
  using (
    bucket_id = 'room-assets'
    and (select private.is_member(private.try_uuid((storage.foldername(name))[1])))
  );

create policy room_assets_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'room-assets'
    and (select private.is_member(private.try_uuid((storage.foldername(name))[1])))
    and name ~ '^[0-9a-f-]{36}/[0-9a-f]{64}\.(webp|jpg|png)$'
  );

create policy room_assets_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'room-assets'
    and (select private.is_gm(private.try_uuid((storage.foldername(name))[1])))
  );
