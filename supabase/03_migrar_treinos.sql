-- =====================================================================
-- 03_migrar_treinos.sql  |  Copia os dados da tabela antiga "treinos"
-- para o modelo novo. Pode rodar mais de uma vez sem duplicar.
-- Obs.: as cargas antigas (texto livre, ex.: "20kg") NÃO são migradas.
-- O histórico começa a ser registrado a partir do novo app.
-- =====================================================================

-- 1) Catálogo: um registro por nome de exercício (prefere o que tem vídeo)
insert into public.exercicios (nome, grupo, video_url)
select distinct on (lower(trim(exercicio)))
       trim(exercicio),
       grupo,
       nullif(trim(coalesce(video_url, '')), '')
  from public.treinos
 where coalesce(trim(exercicio), '') <> ''
   and grupo in ('Peito','Costas','Pernas','Ombros','Braços','Core')
 order by lower(trim(exercicio)),
          (coalesce(trim(video_url), '') <> '') desc
on conflict do nothing;

-- 2) Fichas: uma por aluno e letra
insert into public.fichas (aluno_id, letra)
select distinct aluno_id, letra_treino
  from public.treinos
 where letra_treino in ('A','B','C','D','E')
on conflict (aluno_id, letra) do nothing;

-- 3) Itens (só se a ficha ainda estiver vazia, para não duplicar ao rodar de novo)
insert into public.ficha_itens (ficha_id, exercicio_id, ordem, series, reps, descanso)
select f.id, e.id, coalesce(t.ordem, 0), greatest(coalesce(t.series, 3), 1),
       coalesce(nullif(trim(t.reps), ''), '10'), greatest(coalesce(t.descanso, 60), 0)
  from public.treinos t
  join public.fichas f
    on f.aluno_id = t.aluno_id and f.letra = t.letra_treino
  join public.exercicios e
    on lower(e.nome) = lower(trim(t.exercicio))
 where not exists (select 1 from public.ficha_itens x where x.ficha_id = f.id);

-- Conferência (opcional): compare as contagens
-- select (select count(*) from public.treinos)      as itens_antigos,
--        (select count(*) from public.ficha_itens)  as itens_novos;
