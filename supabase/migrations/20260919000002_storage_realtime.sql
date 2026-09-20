-- Storage (fotos de itens) e Realtime (fila de pedidos ao vivo).
-- Guardado por verificações: só corre no Supabase (onde estes objetos existem).

do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('item-images', 'item-images', true, 2097152, array['image/jpeg','image/png','image/webp'])
    on conflict (id) do nothing;

    -- ficheiros ficam em  {tenant_id}/{ficheiro}  e só owner/admin desse negócio escrevem
    execute $p$create policy item_images_write on storage.objects for insert to authenticated
      with check (bucket_id = 'item-images' and public.has_role(((storage.foldername(name))[1])::uuid, array['owner','admin']::public.tenant_role[]))$p$;
    execute $p$create policy item_images_update on storage.objects for update to authenticated
      using (bucket_id = 'item-images' and public.has_role(((storage.foldername(name))[1])::uuid, array['owner','admin']::public.tenant_role[]))$p$;
    execute $p$create policy item_images_delete on storage.objects for delete to authenticated
      using (bucket_id = 'item-images' and public.has_role(((storage.foldername(name))[1])::uuid, array['owner','admin']::public.tenant_role[]))$p$;
  end if;

  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.orders, public.bookings;
  end if;
end $$;
