-- =====================================================================
-- 01_schema.sql  |  Novo modelo de dados do Treino do Dia
-- Rode no Supabase: SQL Editor > New query > colar > Run
-- Não mexe na tabela antiga "treinos" (ela só é migrada no passo 03).
-- =====================================================================

-- Perfis: garante os valores válidos de role
alter table public.perfis
  drop constraint if exists perfis_role_check;
alter table public.perfis
  add constraint perfis_role_check check (role in ('admin', 'usuario'));

-- Catálogo de exercícios (cadastrado uma vez, usado em todas as fichas)
create table if not exists public.exercicios (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null,
  grupo      text not null check (grupo in ('Peito','Costas','Pernas','Ombros','Braços','Core')),
  video_url  text,
  criado_em  timestamptz not null default now()
);
create unique index if not exists exercicios_nome_unico on public.exercicios (lower(nome));

-- Fichas: uma por aluno e por letra (A, B, C...)
create table if not exists public.fichas (
  id         uuid primary key default gen_random_uuid(),
  aluno_id   uuid not null references public.perfis(id) on delete cascade,
  letra      text not null check (letra in ('A','B','C','D','E')),
  criado_em  timestamptz not null default now(),
  unique (aluno_id, letra)
);

-- Itens da ficha: o que foi prescrito
create table if not exists public.ficha_itens (
  id           uuid primary key default gen_random_uuid(),
  ficha_id     uuid not null references public.fichas(id) on delete cascade,
  exercicio_id uuid not null references public.exercicios(id) on delete restrict,
  ordem        int  not null default 0,
  series       int  not null default 3 check (series > 0),
  reps         text not null default '10',
  descanso     int  not null default 60 check (descanso >= 0),
  criado_em    timestamptz not null default now()
);
create index if not exists ficha_itens_ficha_idx on public.ficha_itens (ficha_id, ordem);

-- Sessões: um treino feito em um dia (uma por aluno, ficha e data)
create table if not exists public.sessoes (
  id         uuid primary key default gen_random_uuid(),
  aluno_id   uuid not null references public.perfis(id) on delete cascade,
  ficha_id   uuid not null references public.fichas(id) on delete cascade,
  data       date not null,
  criado_em  timestamptz not null default now(),
  unique (aluno_id, ficha_id, data)
);
create index if not exists sessoes_aluno_data_idx on public.sessoes (aluno_id, data desc);

-- Execuções: o que o aluno fez em cada exercício da sessão (carga e "feito")
create table if not exists public.execucoes (
  id             uuid primary key default gen_random_uuid(),
  sessao_id      uuid not null references public.sessoes(id) on delete cascade,
  ficha_item_id  uuid references public.ficha_itens(id) on delete set null,
  exercicio_id   uuid not null references public.exercicios(id) on delete restrict,
  carga          numeric(6,2),
  feito          boolean not null default false,
  atualizado_em  timestamptz not null default now(),
  unique (sessao_id, ficha_item_id)
);
create index if not exists execucoes_exercicio_idx on public.execucoes (exercicio_id);

-- Histórico de cargas por exercício (base para "última carga" e gráficos futuros).
-- security_invoker: respeita o RLS de quem consulta.
create or replace view public.historico_cargas
with (security_invoker = true) as
select s.aluno_id, e.exercicio_id, e.carga, s.data
from public.execucoes e
join public.sessoes s on s.id = e.sessao_id
where e.carga is not null;

-- Reordenar itens da ficha de uma vez (security invoker: só admin consegue, via RLS)
create or replace function public.reordenar_itens(p_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.ficha_itens fi
     set ordem = x.ord
    from unnest(p_ids) with ordinality as x(id, ord)
   where fi.id = x.id;
end;
$$;

-- Clonar todas as fichas de um aluno para outro (security invoker: só admin)
create or replace function public.clonar_fichas(p_origem uuid, p_destino uuid, p_substituir boolean default false)
returns int
language plpgsql
security invoker
set search_path = ''
as $$
declare
  r        record;
  v_ficha  uuid;
  v_offset int;
  v_n      int;
  v_total  int := 0;
begin
  if p_origem = p_destino then
    raise exception 'Origem e destino são o mesmo aluno';
  end if;

  for r in select id, letra from public.fichas where aluno_id = p_origem loop
    insert into public.fichas (aluno_id, letra)
    values (p_destino, r.letra)
    on conflict (aluno_id, letra) do update set letra = excluded.letra
    returning id into v_ficha;

    if p_substituir then
      delete from public.ficha_itens where ficha_id = v_ficha;
    end if;

    select coalesce(max(ordem), 0) into v_offset from public.ficha_itens where ficha_id = v_ficha;

    insert into public.ficha_itens (ficha_id, exercicio_id, ordem, series, reps, descanso)
    select v_ficha, exercicio_id, ordem + v_offset, series, reps, descanso
      from public.ficha_itens
     where ficha_id = r.id;

    get diagnostics v_n = row_count;
    v_total := v_total + v_n;
  end loop;

  return v_total;
end;
$$;
