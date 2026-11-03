# Treino do Dia

App de fichas de treino (alunos e treinador), instalável no celular (PWA) e com Supabase como banco.
Sem etapa de build: são arquivos estáticos (HTML, CSS e módulos JS).

## Estrutura

```
index.html / aluno.html / admin.html   páginas
css/style.css                          estilos
js/                                    código dividido por responsabilidade
  supabase.js   cliente         auth.js    login e guard de páginas
  ui.js         utilitários     login.js   tela de login
  aluno.js      área do aluno   admin.js   painel do treinador
  timer.js      cronômetro      fila.js    gravação com fila offline
  ordenavel.js  arrastar        pwa.js     instalação do app
sw.js, manifest.webmanifest, icons/    PWA
supabase/                              SQL e Edge Function (rodam no Supabase, não no site)
```

## Como colocar no ar (nesta ordem)

**1. Banco (SQL Editor do Supabase).** Cole e execute, um de cada vez:
1. `supabase/01_schema.sql` — cria o novo modelo (catálogo, fichas, histórico). Não mexe na tabela `treinos` antiga.
2. `supabase/02_rls.sql` — as regras de segurança. Apaga as policies antigas de `perfis` (elas somam com as novas e poderiam deixar tudo aberto).

**2. Cadastro de alunos seguro (Edge Function).** Com o [Supabase CLI](https://supabase.com/docs/guides/cli) instalado:
```
supabase login
supabase link --project-ref qdmvlpnevvxvjdvgooeh
supabase functions deploy criar-aluno
```
Depois, no painel do Supabase, em Authentication, desative a opção que permite novos cadastros pela internet
(o nome do menu pode variar). A função cria usuários mesmo com ela desligada.

**3. Migrar as fichas antigas.** Execute `supabase/03_migrar_treinos.sql`. Ele copia exercícios e fichas.
As cargas antigas (texto livre) não são copiadas; o histórico começa a valer a partir do app novo.
Confira: `select count(*) from treinos;` e `select count(*) from ficha_itens;` devem ser parecidos.

**4. Publicar os arquivos.** Suba todo o conteúdo desta pasta (menos `supabase/`, se quiser) para a hospedagem que você já usa
(GitHub Pages, Netlify, Vercel…). Precisa ser **HTTPS**, senão o PWA não instala. Os caminhos são relativos,
então funciona em subpasta (ex.: `usuario.github.io/treinododia/`).

**5. Travar a tabela antiga.** Só depois de testar o app novo: `supabase/04_travar_tabela_antiga.sql`
(renomeia para `treinos_legado`, legível só pelo admin, como backup).

## Testar se a segurança está valendo

No SQL Editor, troque `UUID_DO_ALUNO` pelo id de um aluno (tabela `perfis`) e rode. Os dois comandos devem dar **erro**:
```sql
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"UUID_DO_ALUNO","role":"authenticated"}', true);
update public.perfis set role = 'admin' where id = 'UUID_DO_ALUNO';   -- deve falhar
insert into public.exercicios (nome, grupo) values ('teste', 'Core');  -- deve falhar
rollback;
```

## Instalar no celular

- **Android (Chrome):** abra o site, toque em **Instalar** no aviso (ou menu ⋮ → Instalar app).
- **iPhone (Safari):** abra o site no **Safari**, toque em Compartilhar (□↑) → **Adicionar à Tela de Início**.

## Limites que vale conhecer

- **Alarme do descanso:** o tempo é calculado pelo relógio, então ao voltar ao app o cronômetro está certo,
  mesmo depois de usar outro app. Mas o *som* só toca com o app aberto (principalmente no iPhone). Aviso com o app
  fechado exigiria notificação push enviada por um servidor.
- **Offline:** o treino já aberto fica guardado no aparelho e cargas/✅ são enviados quando a internet voltar.
  Um treino que nunca foi aberto com internet não aparece offline.
- **A cada publicação nova**, aumente o número `VERSAO` em `sw.js`, senão os aparelhos podem continuar com a versão antiga.
