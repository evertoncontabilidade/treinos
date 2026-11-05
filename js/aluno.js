import { supabase } from './supabase.js';
import { exigirPapel, sair } from './auth.js';
import { h, $, limpar, toast, hojeLocal, formatarDiaMes, idYoutube } from './ui.js';
import { gravarExecucao, sincronizar, pendentes, execucoesPendentes } from './fila.js';
import { criarTimer } from './timer.js';
import { fotoParaPerfil } from './imagem.js';
import './pwa.js';

const AVATAR_PADRAO = 'icons/avatar.svg';
const CORES = { Peito: '#ff6b6b', Costas: '#4dabf7', Pernas: '#51cf66', Ombros: '#fcc419', 'Braços': '#cc5de8', Core: '#ff922b' };

let ctx = null;          // { user, perfil }
let fichas = [];         // [{ id, letra }]
let letraAtual = null;
let fichaAtual = null;
let itens = [];          // itens da ficha aberta
let ultimas = {};        // exercicio_id -> { carga, data } (último treino anterior a hoje)
let estadoHoje = {};     // ficha_item_id -> { carga, feito } (treino de hoje)

const lista = $('#lista-exercicios');
const hoje = hojeLocal;

// ---------- cache local (leitura offline) ----------
const chave = (nome) => `tdd:${ctx.user.id}:${nome}`;
function guardar(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sem espaço */ } }
function lerCache(k, padrao = null) {
  try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : padrao; } catch { return padrao; }
}

// ---------- cronômetro ----------
const elCrono = $('#cronometro');
const elTempo = $('#cronometro-tempo');
let ocultarAviso = null;

const timer = criarTimer({
  aoTick(segundos) {
    clearTimeout(ocultarAviso);
    elCrono.classList.add('visible');
    elCrono.classList.remove('terminou');
    const m = String(Math.floor(segundos / 60)).padStart(2, '0');
    const s = String(segundos % 60).padStart(2, '0');
    elTempo.textContent = `${m}:${s}`;
  },
  aoFim(atraso) {
    elCrono.classList.add('visible', 'terminou');
    elTempo.textContent = atraso <= 3 ? 'TREINE!' : `Acabou há ${formatarAtraso(atraso)}`;
    clearTimeout(ocultarAviso);
    ocultarAviso = setTimeout(() => elCrono.classList.remove('visible', 'terminou'), 8000);
  },
  aoParar() {
    clearTimeout(ocultarAviso);
    elCrono.classList.remove('visible', 'terminou');
  },
});
$('#btn-parar-timer').addEventListener('click', () => timer.parar());

function formatarAtraso(s) {
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)} min`;
}

// ---------- status de rede / fila ----------
const elStatus = $('#status-rede');
function atualizarStatus() {
  const n = pendentes();
  const partes = [];
  if (!navigator.onLine) partes.push('Sem internet');
  if (n > 0) partes.push(`${n} ${n === 1 ? 'registro' : 'registros'} para enviar`);
  elStatus.textContent = partes.join(' · ');
  elStatus.hidden = partes.length === 0;
}
async function tentarSincronizar() {
  if (!navigator.onLine || pendentes() === 0) return atualizarStatus();
  const enviados = await sincronizar();
  atualizarStatus();
  if (enviados > 0) toast('Registros enviados.', 'ok');
}
window.addEventListener('online', tentarSincronizar);
window.addEventListener('offline', atualizarStatus);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') { timer.retomar(); tentarSincronizar(); }
});

// ---------- perfil ----------
function pintarPerfil(perfil) {
  $('#nome-aluno').textContent = perfil.nome;
  $('#frase-aluno').textContent = perfil.frase || '';
  $('#foto-aluno').src = perfil.foto_url || AVATAR_PADRAO;
}
const dialogoFoto = $('#dialogo-foto');

function abrirFoto() {
  // Navegador sem <dialog>: vai direto para a escolha da foto
  if (typeof dialogoFoto.showModal !== 'function') return $('#input-foto').click();
  const atual = $('#foto-aluno').src;
  $('#foto-grande').src = atual;
  $('#btn-trocar-foto').textContent = atual.endsWith(AVATAR_PADRAO) ? 'Escolher foto' : 'Trocar foto';
  $('#foto-status').textContent = '';
  dialogoFoto.showModal();
}

// O quadro aberto fica na frente de tudo (inclusive dos avisos), então o retorno aparece dentro dele.
function avisoFoto(texto, tipo = 'info') {
  if (dialogoFoto.open) {
    const el = $('#foto-status');
    el.textContent = texto;
    el.dataset.tipo = tipo;
  } else {
    toast(texto, tipo);
  }
}

async function aoEscolherFoto(e) {
  const arquivo = e.target.files[0];
  e.target.value = ''; // permite escolher a mesma foto outra vez
  if (!arquivo) return;
  const botao = $('#btn-trocar-foto');
  botao.disabled = true;
  try {
    avisoFoto('Preparando a foto…');
    const dataUrl = await fotoParaPerfil(arquivo);
    const { error } = await supabase.from('perfis').update({ foto_url: dataUrl }).eq('id', ctx.user.id);
    if (error) throw error;
    $('#foto-aluno').src = dataUrl;
    $('#foto-grande').src = dataUrl;
    botao.textContent = 'Trocar foto';
    avisoFoto('Foto atualizada.', 'ok');
  } catch (erro) {
    avisoFoto(erro.message || 'Não foi possível trocar a foto.', 'erro');
  } finally {
    botao.disabled = false;
  }
}

// ---------- fichas (A, B, C...) ----------
function mensagem(texto) {
  limpar(lista).append(h('p', { class: 'msg-status' }, texto));
}

async function carregarFichas() {
  let { data, error } = await supabase.from('fichas').select('id, letra').eq('aluno_id', ctx.user.id).order('letra');
  if (error) {
    data = lerCache(chave('fichas'));
    if (!data) return mensagem('Não foi possível carregar suas fichas. Verifique a conexão.');
  } else {
    guardar(chave('fichas'), data);
  }
  fichas = data;

  const filtros = limpar($('#filtros'));
  if (!fichas.length) return mensagem('Você ainda não tem ficha de treino.');
  fichas.forEach((f) => {
    filtros.append(h('button', {
      type: 'button',
      class: 'letra',
      dataset: { letra: f.letra },
      onclick: () => selecionar(f.letra),
    }, `Treino ${f.letra}`));
  });

  const salva = localStorage.getItem('tdd:letra');
  selecionar(fichas.some((f) => f.letra === salva) ? salva : fichas[0].letra);
}

async function selecionar(letra) {
  letraAtual = letra;
  localStorage.setItem('tdd:letra', letra);
  document.querySelectorAll('#filtros .letra').forEach((b) => b.classList.toggle('active', b.dataset.letra === letra));
  await carregarTreino();
}

// ---------- treino ----------
async function carregarTreino() {
  fichaAtual = fichas.find((f) => f.letra === letraAtual);
  const dia = hoje();
  mensagem('Carregando treino…');

  const resp = await supabase
    .from('ficha_itens')
    .select('id, ordem, series, reps, descanso, exercicio_id, exercicios(nome, grupo, video_url)')
    .eq('ficha_id', fichaAtual.id)
    .order('ordem');

  if (!resp.error) {
    itens = resp.data;
    estadoHoje = {};
    ultimas = {};

    const { data: sessao } = await supabase
      .from('sessoes').select('id')
      .eq('aluno_id', ctx.user.id).eq('ficha_id', fichaAtual.id).eq('data', dia)
      .maybeSingle();
    if (sessao) {
      const { data: execs } = await supabase
        .from('execucoes').select('ficha_item_id, carga, feito').eq('sessao_id', sessao.id);
      (execs || []).forEach((e) => { estadoHoje[e.ficha_item_id] = { carga: e.carga, feito: e.feito }; });
    }

    const exercicioIds = [...new Set(itens.map((i) => i.exercicio_id))];
    if (exercicioIds.length) {
      const { data: hist } = await supabase
        .from('historico_cargas').select('exercicio_id, carga, data')
        .in('exercicio_id', exercicioIds).lt('data', dia)
        .order('data', { ascending: false }).limit(300);
      (hist || []).forEach((r) => { if (!ultimas[r.exercicio_id]) ultimas[r.exercicio_id] = { carga: r.carga, data: r.data }; });
    }
    guardar(chave(`treino:${fichaAtual.id}`), { itens, ultimas });
  } else {
    const cache = lerCache(chave(`treino:${fichaAtual.id}`));
    if (!cache) return mensagem('Sem conexão e sem cópia deste treino no aparelho.');
    itens = cache.itens;
    ultimas = cache.ultimas;
    estadoHoje = lerCache(chave(`hoje:${fichaAtual.id}:${dia}`), {});
  }

  // O que ainda não foi enviado vale mais do que o que veio do servidor.
  execucoesPendentes(ctx.user.id, fichaAtual.id, dia).forEach((p) => {
    estadoHoje[p.ficha_item_id] = { ...estadoHoje[p.ficha_item_id], ...p.campos };
  });
  guardar(chave(`hoje:${fichaAtual.id}:${dia}`), estadoHoje);

  renderTreino();
}

function renderTreino() {
  limpar(lista);
  if (!itens.length) return mensagem('Esta ficha ainda não tem exercícios.');
  const pendentesPrimeiro = [...itens].sort((a, b) => Number(!!estadoHoje[a.id]?.feito) - Number(!!estadoHoje[b.id]?.feito));
  pendentesPrimeiro.forEach((item) => lista.append(cartao(item)));
}

function formatarCarga(valor) {
  return valor === null || valor === undefined ? '' : String(valor).replace('.', ',');
}

function lerCargaDoCartao(card) {
  const texto = $('.input-carga', card).value.trim().replace(',', '.');
  if (texto === '') return { ok: true, valor: null };
  const n = Number(texto);
  if (!Number.isFinite(n) || n < 0 || n >= 10000) return { ok: false, valor: null };
  return { ok: true, valor: Math.round(n * 100) / 100 };
}

async function salvarCampos(item, campos) {
  const dia = hoje();
  estadoHoje[item.id] = { ...estadoHoje[item.id], ...campos };
  guardar(chave(`hoje:${fichaAtual.id}:${dia}`), estadoHoje);
  const resultado = await gravarExecucao({
    aluno_id: ctx.user.id,
    ficha_id: fichaAtual.id,
    data: dia,
    ficha_item_id: item.id,
    exercicio_id: item.exercicio_id,
    campos,
  });
  atualizarStatus();
  return resultado;
}

function cartao(item) {
  const ex = item.exercicios;
  const estado = estadoHoje[item.id] || {};
  const anterior = ultimas[item.exercicio_id];

  const card = h('div', {
    class: `card-treino${estado.feito ? ' feito' : ''}`,
    style: { borderLeftColor: CORES[ex.grupo] || '#ffcc00' },
  });

  const entrada = h('input', {
    class: 'input-carga',
    type: 'text',
    inputmode: 'decimal',
    placeholder: 'kg',
    'aria-label': `Carga em kg para ${ex.nome}`,
    value: formatarCarga(estado.carga),
  });
  const botaoSalvar = h('button', { type: 'button', class: 'btn-acao-mini' }, 'Salvar');
  async function salvarCarga() {
    const c = lerCargaDoCartao(card);
    if (!c.ok) return toast('Carga inválida. Use só números, ex.: 22,5', 'erro');
    try {
      const r = await salvarCampos(item, { carga: c.valor });
      toast(r === 'fila' ? 'Salvo no aparelho. Envia quando voltar a internet.' : 'Carga salva.', r === 'fila' ? 'info' : 'ok');
    } catch {
      toast('Não foi possível salvar a carga.', 'erro');
    }
  }
  botaoSalvar.addEventListener('click', salvarCarga);
  entrada.addEventListener('keydown', (e) => { if (e.key === 'Enter') salvarCarga(); });

  const botaoCheck = h('button', {
    type: 'button',
    class: 'check-icon',
    'aria-label': `Marcar ${ex.nome} como feito`,
    'aria-pressed': String(!!estado.feito),
  }, '✅');
  botaoCheck.addEventListener('click', async () => {
    const novo = !card.classList.contains('feito');
    card.classList.toggle('feito', novo);
    botaoCheck.setAttribute('aria-pressed', String(novo));
    const campos = { feito: novo };
    const c = lerCargaDoCartao(card);
    if (novo && c.ok && c.valor !== null) campos.carga = c.valor;
    if (novo) setTimeout(() => lista.append(card), 350);
    try {
      await salvarCampos(item, campos);
    } catch {
      card.classList.toggle('feito', !novo);
      botaoCheck.setAttribute('aria-pressed', String(!novo));
      toast('Não foi possível registrar.', 'erro');
    }
  });

  const botaoTimer = h('button', { type: 'button', class: 'btn-timer' }, `⏱️ Descanso ${item.descanso}s`);
  botaoTimer.addEventListener('click', () => timer.iniciar(item.descanso));

  const idVideo = idYoutube(ex.video_url);
  const acoes = h('div', { class: 'card-acoes' });
  let areaVideo = null;
  if (/^[\w-]{6,20}$/.test(idVideo)) {
    const botaoVideo = h('button', { type: 'button', class: 'btn-video' }, '▶ Vídeo');
    areaVideo = h('div', { class: 'video-dropdown' });
    botaoVideo.addEventListener('click', () => {
      const abrir = !areaVideo.classList.contains('open');
      limpar(areaVideo);
      if (abrir) {
        areaVideo.append(h('div', { class: 'video-container' }, h('iframe', {
          src: `https://www.youtube-nocookie.com/embed/${idVideo}?rel=0`,
          title: `Vídeo: ${ex.nome}`,
          allow: 'accelerometer; encrypted-media; gyroscope; picture-in-picture',
          allowfullscreen: true,
          loading: 'lazy',
        })));
      }
      areaVideo.classList.toggle('open', abrir);
    });
    acoes.append(botaoVideo);
  }
  acoes.append(botaoCheck);

  card.append(
    h('div', { class: 'card-content' },
      h('div', { class: 'card-info' },
        h('h3', {}, ex.nome),
        h('p', { class: 'sutil' }, `${item.series}x${item.reps} · ${ex.grupo}`),
        anterior ? h('p', { class: 'ultima-carga' }, `Última vez: ${formatarCarga(anterior.carga)} kg (${formatarDiaMes(anterior.data)})`) : null,
        h('div', { class: 'linha-carga' }, entrada, botaoSalvar),
        botaoTimer,
      ),
      acoes,
    ),
    areaVideo,
  );
  return card;
}

// ---------- início ----------
async function iniciar() {
  ctx = await exigirPapel('usuario');
  if (!ctx) return;
  document.body.classList.remove('carregando');
  pintarPerfil(ctx.perfil);
  $('#foto-aluno').closest('.foto-perfil').addEventListener('click', abrirFoto);
  $('#btn-trocar-foto').addEventListener('click', () => $('#input-foto').click());
  $('#btn-fechar-foto').addEventListener('click', () => dialogoFoto.close());
  dialogoFoto.addEventListener('click', (e) => { if (e.target === dialogoFoto) dialogoFoto.close(); }); // toque fora fecha
  $('#input-foto').addEventListener('change', aoEscolherFoto);
  // Se uma foto antiga (link externo) sumir do ar, volta para o avatar local
  $('#foto-aluno').addEventListener('error', (e) => {
    if (!e.target.src.endsWith(AVATAR_PADRAO)) e.target.src = AVATAR_PADRAO;
  });
  $('#btn-sair').addEventListener('click', sair);
  timer.retomar();
  atualizarStatus();
  await tentarSincronizar();
  await carregarFichas();
}
iniciar();
