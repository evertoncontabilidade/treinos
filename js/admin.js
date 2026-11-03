import { supabase } from './supabase.js';
import { exigirPapel, sair } from './auth.js';
import { h, $, $$, limpar, toast, comCarregando, hojeLocal, diasAtras, formatarDiaMes, diferencaDias, idYoutube } from './ui.js';
import { tornarOrdenavel } from './ordenavel.js';
import './pwa.js';

const GRUPOS = ['Peito', 'Costas', 'Pernas', 'Ombros', 'Braços', 'Core'];
const LETRAS = ['A', 'B', 'C', 'D', 'E'];
const CORES = { Peito: '#ff6b6b', Costas: '#4dabf7', Pernas: '#51cf66', Ombros: '#fcc419', 'Braços': '#cc5de8', Core: '#ff922b' };

const estado = { alunos: [], catalogo: [], letra: 'A', itens: [] };

const opcoesGrupo = (selecionado) => GRUPOS.map((g) => h('option', { value: g, selected: g === selecionado }, g));

function erroAmigavel(erro) {
  if (erro?.code === '23505') return 'Já existe um exercício com esse nome.';
  if (erro?.code === '23503') return 'Esse exercício está em uso e não pode ser removido.';
  return erro?.message || 'Algo deu errado.';
}
async function mensagemDeErro(erro) {
  try {
    const corpo = await erro.context.json();
    return corpo.erro || erro.message;
  } catch {
    return erro.message;
  }
}

// ---------- abas ----------
function trocarAba(id) {
  $$('[data-aba]').forEach((b) => {
    const ativa = b.dataset.aba === id;
    b.classList.toggle('active', ativa);
    b.setAttribute('aria-selected', String(ativa));
  });
  $$('.aba').forEach((s) => { s.hidden = s.id !== `aba-${id}`; });
  if (id === 'painel') carregarPainel();
}

// ---------- dados base ----------
async function carregarAlunos() {
  const { data, error } = await supabase.from('perfis').select('id, nome, nickname').eq('role', 'usuario').order('nome');
  if (error) return toast(`Erro ao carregar alunos: ${error.message}`, 'erro');
  estado.alunos = data;

  [['sel-ficha-aluno', 'Selecione o aluno'], ['sel-origem', 'Copiar DE (origem)'], ['sel-destino', 'Copiar PARA (destino)']].forEach(([id, rotulo]) => {
    const el = document.getElementById(id);
    const atual = el.value;
    limpar(el).append(h('option', { value: '' }, rotulo), ...data.map((a) => h('option', { value: a.id }, a.nome)));
    el.value = data.some((a) => a.id === atual) ? atual : '';
  });

  const ul = limpar($('#lista-alunos'));
  if (!data.length) ul.append(h('li', { class: 'sutil' }, 'Nenhum aluno cadastrado ainda.'));
  data.forEach((a) => ul.append(h('li', {}, h('strong', {}, a.nome), h('span', { class: 'sutil' }, ` @${a.nickname}`))));
}

async function carregarCatalogo() {
  const { data, error } = await supabase.from('exercicios').select('id, nome, grupo, video_url').order('nome');
  if (error) return toast(`Erro ao carregar exercícios: ${error.message}`, 'erro');
  estado.catalogo = data;
  limpar($('#lista-catalogo')).append(...data.map((e) => h('option', { value: e.nome })));
}

// ---------- painel de aderência ----------
async function carregarPainel() {
  const alvo = limpar($('#painel-lista'));
  const resumo = $('#painel-resumo');
  // Limite de 1000 sessões recentes: de sobra para um grupo pequeno de alunos.
  const { data: sessoes, error } = await supabase.from('sessoes').select('aluno_id, data').order('data', { ascending: false }).limit(1000);
  if (error) {
    resumo.textContent = '';
    return alvo.append(h('p', { class: 'msg-status' }, 'Não foi possível carregar o painel.'));
  }
  if (!estado.alunos.length) {
    resumo.textContent = '';
    return alvo.append(h('p', { class: 'msg-status' }, 'Cadastre um aluno para acompanhar os treinos.'));
  }

  const hoje = hojeLocal();
  const semana = Array.from({ length: 7 }, (_, i) => diasAtras(6 - i)); // do mais antigo até hoje
  const diasPorAluno = new Map();
  sessoes.forEach((s) => {
    if (!diasPorAluno.has(s.aluno_id)) diasPorAluno.set(s.aluno_id, new Set());
    diasPorAluno.get(s.aluno_id).add(s.data);
  });

  const linhas = estado.alunos.map((a) => {
    const dias = diasPorAluno.get(a.id) || new Set();
    const ultimo = [...dias].sort().pop() || null;
    return {
      aluno: a,
      dias,
      ultimo,
      naSemana: semana.filter((d) => dias.has(d)).length,
      ausencia: ultimo ? diferencaDias(hoje, ultimo) : 9999,
    };
  }).sort((x, y) => y.ausencia - x.ausencia); // quem está sumido aparece primeiro

  const treinaram = linhas.filter((l) => l.naSemana > 0).length;
  resumo.textContent = `${treinaram} de ${linhas.length} ${linhas.length === 1 ? 'aluno treinou' : 'alunos treinaram'} nos últimos 7 dias`;

  linhas.forEach((l) => {
    const tom = l.ausencia <= 2 ? 'ok' : l.ausencia <= 6 ? 'aviso' : 'alerta';
    let status;
    if (l.ausencia === 0) status = 'Treinou hoje';
    else if (l.ausencia === 1) status = 'Treinou ontem';
    else if (l.ultimo) status = `Último treino há ${l.ausencia} dias (${formatarDiaMes(l.ultimo)})`;
    else status = 'Ainda sem treinos registrados';

    alvo.append(h('div', { class: `painel-aluno tom-${tom}` },
      h('div', { class: 'painel-topo' },
        h('strong', {}, l.aluno.nome),
        h('span', { class: 'painel-semana' }, `${l.naSemana}/7`),
      ),
      h('p', { class: 'sutil' }, status),
      h('div', { class: 'pontos', role: 'img', 'aria-label': `${l.naSemana} treinos nos últimos 7 dias` },
        semana.map((d) => h('span', { class: `ponto${l.dias.has(d) ? ' cheio' : ''}`, title: formatarDiaMes(d) })),
      ),
    ));
  });
}

// ---------- cadastro de aluno ----------
async function cadastrarAluno(e) {
  e.preventDefault();
  const f = e.target.elements;
  await comCarregando($('#btn-criar-aluno'), async () => {
    const { data, error } = await supabase.functions.invoke('criar-aluno', {
      body: { nome: f.nome.value, nick: f.nick.value, senha: f.senha.value, frase: f.frase.value },
    });
    if (error) return toast(await mensagemDeErro(error), 'erro');
    if (data?.erro) return toast(data.erro, 'erro');
    toast(`Aluno ${f.nick.value.trim().toLowerCase()} cadastrado.`, 'ok');
    e.target.reset();
    await carregarAlunos();
  });
}

// ---------- ficha: editor ----------
function renderLetras() {
  const caixa = limpar($('#letras'));
  LETRAS.forEach((l) => caixa.append(h('button', {
    type: 'button',
    class: `letra${l === estado.letra ? ' active' : ''}`,
    onclick: () => { estado.letra = l; renderLetras(); carregarFicha(); },
  }, `Treino ${l}`)));
}

async function carregarFicha() {
  const alunoId = $('#sel-ficha-aluno').value;
  const area = $('#ficha-area');
  if (!alunoId) { area.hidden = true; return; }
  area.hidden = false;

  const { data: ficha, error: erroFicha } = await supabase.from('fichas').select('id').eq('aluno_id', alunoId).eq('letra', estado.letra).maybeSingle();
  if (erroFicha) return toast(`Erro ao carregar a ficha: ${erroFicha.message}`, 'erro');

  estado.itens = [];
  if (ficha) {
    const { data, error } = await supabase
      .from('ficha_itens')
      .select('id, ordem, series, reps, descanso, exercicio_id, exercicios(nome, grupo, video_url)')
      .eq('ficha_id', ficha.id)
      .order('ordem');
    if (error) return toast(`Erro ao carregar exercícios: ${error.message}`, 'erro');
    estado.itens = data;
  }
  renderItens();
}

function renderItens() {
  const lista = limpar($('#lista-itens'));
  if (!estado.itens.length) {
    return lista.append(h('p', { class: 'msg-status' }, 'Esta ficha ainda não tem exercícios. Adicione o primeiro abaixo.'));
  }
  estado.itens.forEach((it) => lista.append(cartaoItem(it)));
}

function cartaoItem(it) {
  const ex = it.exercicios;
  const form = formEdicao(it);
  form.hidden = true;

  return h('div', {
    class: 'item-ficha',
    dataset: { id: it.id },
    style: { borderLeftColor: CORES[ex.grupo] || '#ffcc00' },
  },
    h('div', { class: 'item-topo' },
      h('button', { type: 'button', class: 'alca', title: 'Arraste para reordenar (ou use as setas ↑ ↓)', 'aria-label': `Reordenar ${ex.nome}` }, '☰'),
      h('div', { class: 'item-info' },
        h('strong', {}, ex.nome),
        h('span', { class: 'sutil' }, `${it.series}x${it.reps} · ${it.descanso}s · ${ex.grupo}`),
      ),
      h('button', { type: 'button', class: 'btn-mini', onclick: () => { form.hidden = !form.hidden; } }, 'Editar'),
    ),
    form,
  );
}

function formEdicao(it) {
  const ex = it.exercicios;
  const nome = h('input', { type: 'text', value: ex.nome, maxlength: '80', required: true });
  const grupo = h('select', {}, opcoesGrupo(ex.grupo));
  const video = h('input', { type: 'url', value: ex.video_url || '', placeholder: 'Link do YouTube (opcional)' });
  const series = h('input', { type: 'number', min: '1', max: '20', value: it.series });
  const reps = h('input', { type: 'text', maxlength: '20', value: it.reps });
  const descanso = h('input', { type: 'number', min: '0', max: '900', step: '5', value: it.descanso });

  const salvar = h('button', { type: 'button', class: 'btn-verde' }, 'Salvar');
  const excluir = h('button', { type: 'button', class: 'btn-perigo' }, 'Remover da ficha');

  salvar.addEventListener('click', () => comCarregando(salvar, async () => {
    const dados = {
      nome: nome.value.trim(), grupo: grupo.value, video: video.value.trim(),
      series: parseInt(series.value, 10), reps: reps.value.trim(), descanso: parseInt(descanso.value, 10),
    };
    const problema = validarItem(dados);
    if (problema) return toast(problema, 'erro');

    const mudouCatalogo = dados.nome !== ex.nome || dados.grupo !== ex.grupo || (dados.video || null) !== (ex.video_url || null);
    if (mudouCatalogo) {
      const { error } = await supabase.from('exercicios').update({ nome: dados.nome, grupo: dados.grupo, video_url: dados.video || null }).eq('id', it.exercicio_id);
      if (error) return toast(erroAmigavel(error), 'erro');
    }
    const { error } = await supabase.from('ficha_itens').update({ series: dados.series, reps: dados.reps, descanso: dados.descanso }).eq('id', it.id);
    if (error) return toast(erroAmigavel(error), 'erro');
    toast('Exercício atualizado.', 'ok');
    await Promise.all([carregarCatalogo(), carregarFicha()]);
  }));

  excluir.addEventListener('click', () => comCarregando(excluir, async () => {
    if (!confirm(`Remover "${ex.nome}" desta ficha?`)) return;
    const { error } = await supabase.from('ficha_itens').delete().eq('id', it.id);
    if (error) return toast(erroAmigavel(error), 'erro');
    toast('Exercício removido da ficha.', 'ok');
    await carregarFicha();
  }));

  const campo = (rotulo, el) => h('label', { class: 'campo' }, h('span', {}, rotulo), el);
  return h('div', { class: 'item-edicao' },
    campo('Nome', nome),
    h('p', { class: 'sutil' }, 'Nome, grupo e vídeo valem para todos os alunos que usam este exercício.'),
    h('div', { class: 'grade-2' }, campo('Grupo', grupo), campo('Vídeo', video)),
    h('div', { class: 'grade-3' }, campo('Séries', series), campo('Reps', reps), campo('Descanso (s)', descanso)),
    h('div', { class: 'grade-2' }, salvar, excluir),
  );
}

function validarItem({ nome, video, series, reps, descanso }) {
  if (nome.length < 2) return 'Informe o nome do exercício.';
  if (video && !idYoutube(video)) return 'O vídeo precisa ser um link do YouTube.';
  if (!Number.isInteger(series) || series < 1 || series > 20) return 'Séries: informe de 1 a 20.';
  if (!reps) return 'Informe as repetições (ex.: 10 ou 8-12).';
  if (!Number.isInteger(descanso) || descanso < 0 || descanso > 900) return 'Descanso: informe de 0 a 900 segundos.';
  return null;
}

async function adicionarExercicio(e) {
  e.preventDefault();
  const alunoId = $('#sel-ficha-aluno').value;
  if (!alunoId) return toast('Selecione um aluno primeiro.', 'erro');
  const f = e.target.elements;
  const dados = {
    nome: f.nome.value.trim(), grupo: f.grupo.value, video: f.video.value.trim(),
    series: parseInt(f.series.value, 10), reps: f.reps.value.trim(), descanso: parseInt(f.descanso.value, 10),
  };
  const problema = validarItem(dados);
  if (problema) return toast(problema, 'erro');

  await comCarregando($('#btn-adicionar'), async () => {
    // 1) exercício no catálogo (reaproveita se o nome já existir)
    let ex = estado.catalogo.find((c) => c.nome.toLowerCase() === dados.nome.toLowerCase());
    if (ex) {
      if (ex.grupo !== dados.grupo || (ex.video_url || '') !== dados.video) {
        const { error } = await supabase.from('exercicios').update({ grupo: dados.grupo, video_url: dados.video || null }).eq('id', ex.id);
        if (error) return toast(erroAmigavel(error), 'erro');
      }
    } else {
      const { data, error } = await supabase.from('exercicios')
        .insert({ nome: dados.nome, grupo: dados.grupo, video_url: dados.video || null })
        .select('id, nome, grupo, video_url').single();
      if (error) return toast(erroAmigavel(error), 'erro');
      ex = data;
    }

    // 2) ficha do aluno nessa letra (cria se não existir)
    const { data: ficha, error: erroFicha } = await supabase.from('fichas')
      .upsert({ aluno_id: alunoId, letra: estado.letra }, { onConflict: 'aluno_id,letra' })
      .select('id').single();
    if (erroFicha) return toast(erroAmigavel(erroFicha), 'erro');

    // 3) item no fim da ficha
    const ordem = estado.itens.reduce((max, i) => Math.max(max, i.ordem), 0) + 1;
    const { error } = await supabase.from('ficha_itens').insert({
      ficha_id: ficha.id, exercicio_id: ex.id, ordem, series: dados.series, reps: dados.reps, descanso: dados.descanso,
    });
    if (error) return toast(erroAmigavel(error), 'erro');

    toast(`${dados.nome} adicionado ao Treino ${estado.letra}.`, 'ok');
    f.nome.value = '';
    f.video.value = '';
    await Promise.all([carregarCatalogo(), carregarFicha()]);
  });
}

function preencherPeloCatalogo() {
  const f = $('#form-novo').elements;
  const ex = estado.catalogo.find((c) => c.nome.toLowerCase() === f.nome.value.trim().toLowerCase());
  if (!ex) return;
  f.grupo.value = ex.grupo;
  f.video.value = ex.video_url || '';
}

async function salvarOrdem(ids) {
  const { error } = await supabase.rpc('reordenar_itens', { p_ids: ids });
  if (error) {
    toast('Não foi possível salvar a nova ordem.', 'erro');
    return carregarFicha();
  }
  toast('Ordem salva.', 'ok');
}

// ---------- clonar ----------
async function clonarFichas(e) {
  e.preventDefault();
  const origem = $('#sel-origem').value;
  const destino = $('#sel-destino').value;
  const substituir = $('#chk-substituir').checked;
  if (!origem || !destino) return toast('Escolha o aluno de origem e o de destino.', 'erro');
  if (origem === destino) return toast('Origem e destino precisam ser diferentes.', 'erro');
  const nomeDestino = estado.alunos.find((a) => a.id === destino)?.nome;
  const aviso = substituir
    ? `Isto APAGA as fichas atuais de ${nomeDestino} e copia as novas. Continuar?`
    : `Copiar as fichas para ${nomeDestino}? Os exercícios serão adicionados ao final das fichas dele.`;
  if (!confirm(aviso)) return;

  await comCarregando($('#btn-clonar'), async () => {
    const { data, error } = await supabase.rpc('clonar_fichas', { p_origem: origem, p_destino: destino, p_substituir: substituir });
    if (error) return toast(erroAmigavel(error), 'erro');
    toast(`${data} ${data === 1 ? 'exercício copiado' : 'exercícios copiados'}.`, 'ok');
  });
}

// ---------- início ----------
async function iniciar() {
  const ctx = await exigirPapel('admin');
  if (!ctx) return;
  document.body.classList.remove('carregando');

  $('#btn-sair').addEventListener('click', sair);
  $$('[data-aba]').forEach((b) => b.addEventListener('click', () => trocarAba(b.dataset.aba)));
  $('#form-aluno').addEventListener('submit', cadastrarAluno);
  $('#form-novo').addEventListener('submit', adicionarExercicio);
  $('#form-clone').addEventListener('submit', clonarFichas);
  $('#sel-ficha-aluno').addEventListener('change', carregarFicha);
  $('#form-novo').elements.nome.addEventListener('change', preencherPeloCatalogo);
  $('#form-novo').elements.nome.addEventListener('input', preencherPeloCatalogo);
  limpar($('#form-novo').elements.grupo).append(...opcoesGrupo('Peito'));

  tornarOrdenavel($('#lista-itens'), { itemSel: '.item-ficha', alcaSel: '.alca', aoSoltar: salvarOrdem });

  renderLetras();
  await Promise.all([carregarAlunos(), carregarCatalogo()]);
  trocarAba('painel');
}
iniciar();
