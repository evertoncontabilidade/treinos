-- =====================================================================
-- 04_travar_tabela_antiga.sql
-- Rode SÓ depois de publicar o app novo e conferir que as fichas migraram.
-- A tabela antiga fica como backup, legível só pelo admin.
-- =====================================================================
do $$
declare p record;
begin
  for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'treinos' loop
    execute format('drop policy %I on public.treinos', p.policyname);
  end loop;
end $$;

alter table public.treinos enable row level security;
alter table public.treinos rename to treinos_legado;

create policy legado_admin_select on public.treinos_legado
  for select to authenticated using (public.eh_admin());
