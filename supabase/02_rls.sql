-- =====================================================================
-- 02_rls.sql  |  Segurança: quem pode ler e escrever o quê
-- Rode DEPOIS do 01_schema.sql.
--
-- IMPORTANTE: policies do Postgres se somam (OR). Uma policy antiga e
-- permissiva esquece aberta e anula todas as novas. Por isso o bloco
-- abaixo apaga as policies existentes de "perfis" antes de recriar.
-- =====================================================================

-- Função auxiliar: o usuário logado é admin?
create or replace function public.eh_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.perfis where id = auth.uid() and role = 'admin'
  );
$$;
revoke execute on function public.eh_admin() from public, anon;
grant  execute on function public.eh_admin() to authenticated;

-- Apaga policies antigas de perfis
do $$
declare p record;
begin
  for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'perfis' loop
    execute format('drop policy %I on public.perfis', p.policyname);
  end loop;
end $$;

alter table public.perfis       enable row level security;
alter table public.exercicios   enable row level security;
alter table public.fichas       enable row level security;
alter table public.ficha_itens  enable row level security;
alter table public.sessoes      enable row level security;
alter table public.execucoes    enable row level security;

-- ---------- perfis ----------
create policy perfis_select on public.perfis
  for select to authenticated
  using (id = auth.uid() or public.eh_admin());

create policy perfis_update on public.perfis
  for update to authenticated
  using (id = auth.uid() or public.eh_admin())
  with check (id = auth.uid() or public.eh_admin());
-- Sem policy de INSERT/DELETE: perfis só são criados pela Edge Function (service_role).

-- Trava: aluno só pode mudar foto e frase. Nunca role, nickname, id.
create or replace function public.protege_perfil()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.eh_admin() then
    if new.id is distinct from old.id
       or new.role is distinct from old.role
       or new.nickname is distinct from old.nickname
       or new.nome is distinct from old.nome then
      raise exception 'Sem permissão para alterar este campo do perfil';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists perfis_protege on public.perfis;
create trigger perfis_protege before update on public.perfis
  for each row execute function public.protege_perfil();

-- ---------- exercicios (catálogo) ----------
create policy exercicios_select on public.exercicios
  for select to authenticated using (true);
create policy exercicios_admin_insert on public.exercicios
  for insert to authenticated with check (public.eh_admin());
create policy exercicios_admin_update on public.exercicios
  for update to authenticated using (public.eh_admin()) with check (public.eh_admin());
create policy exercicios_admin_delete on public.exercicios
  for delete to authenticated using (public.eh_admin());

-- ---------- fichas ----------
create policy fichas_select on public.fichas
  for select to authenticated
  using (aluno_id = auth.uid() or public.eh_admin());
create policy fichas_admin_insert on public.fichas
  for insert to authenticated with check (public.eh_admin());
create policy fichas_admin_update on public.fichas
  for update to authenticated using (public.eh_admin()) with check (public.eh_admin());
create policy fichas_admin_delete on public.fichas
  for delete to authenticated using (public.eh_admin());

-- ---------- ficha_itens ----------
create policy ficha_itens_select on public.ficha_itens
  for select to authenticated
  using (
    public.eh_admin()
    or exists (select 1 from public.fichas f where f.id = ficha_id and f.aluno_id = auth.uid())
  );
create policy ficha_itens_admin_insert on public.ficha_itens
  for insert to authenticated with check (public.eh_admin());
create policy ficha_itens_admin_update on public.ficha_itens
  for update to authenticated using (public.eh_admin()) with check (public.eh_admin());
create policy ficha_itens_admin_delete on public.ficha_itens
  for delete to authenticated using (public.eh_admin());

-- ---------- sessoes ----------
create policy sessoes_select on public.sessoes
  for select to authenticated
  using (aluno_id = auth.uid() or public.eh_admin());
create policy sessoes_insert_proprio on public.sessoes
  for insert to authenticated
  with check (
    aluno_id = auth.uid()
    and exists (select 1 from public.fichas f where f.id = ficha_id and f.aluno_id = auth.uid())
  );
create policy sessoes_update_proprio on public.sessoes
  for update to authenticated
  using (aluno_id = auth.uid()) with check (aluno_id = auth.uid());

-- ---------- execucoes ----------
create policy execucoes_select on public.execucoes
  for select to authenticated
  using (
    public.eh_admin()
    or exists (select 1 from public.sessoes s where s.id = sessao_id and s.aluno_id = auth.uid())
  );
create policy execucoes_insert_proprio on public.execucoes
  for insert to authenticated
  with check (
    exists (select 1 from public.sessoes s where s.id = sessao_id and s.aluno_id = auth.uid())
    and exists (
      select 1 from public.ficha_itens fi
      join public.fichas f on f.id = fi.ficha_id
      where fi.id = ficha_item_id and f.aluno_id = auth.uid()
    )
  );
create policy execucoes_update_proprio on public.execucoes
  for update to authenticated
  using (exists (select 1 from public.sessoes s where s.id = sessao_id and s.aluno_id = auth.uid()))
  with check (exists (select 1 from public.sessoes s where s.id = sessao_id and s.aluno_id = auth.uid()));
