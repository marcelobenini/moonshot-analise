-- Minha conta: foto de perfil.
-- A foto fica no bucket publico 'avatares', em <id do perfil>/<arquivo>.
-- Cada pessoa so mexe na propria pasta; perfil.foto guarda o caminho.
-- Aplicar DEPOIS de sistema_evolucao.sql.

alter table perfil add column if not exists foto text;

do $$ begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('avatares', 'avatares', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
    on conflict (id) do nothing;
    if not exists (select 1 from pg_policies where schemaname = 'storage' and policyname = 'avatares_subir') then
      create policy avatares_subir on storage.objects for insert to authenticated
        with check (bucket_id = 'avatares' and (storage.foldername(name))[1] = auth.uid()::text);
      create policy avatares_mudar on storage.objects for update to authenticated
        using (bucket_id = 'avatares' and (storage.foldername(name))[1] = auth.uid()::text);
      create policy avatares_apagar on storage.objects for delete to authenticated
        using (bucket_id = 'avatares' and (storage.foldername(name))[1] = auth.uid()::text);
    end if;
  end if;
end $$;
