import { supabase } from './supabase.js';
import { exigirPapel } from './auth.js';
import { h, $, limpar, toast, comCarregando, hojeLocal } from './ui.js';
import { CAMPOS, rotulo, lerNumero, formatarNumero, calcularDeltas, textoDelta, geometriaGrafico } from './medidas-util.js';
import './pwa.js';

let ctx = null;
let registros = []; // do mais novo para o mais antigo

const formatarData = (iso) => { const [a, m, d] = iso.split('-'); return `${d}/${m}/${a}`; };
const registroDaData = (data) => registros.find((r) => r.data === data) || null;

function erroMedida(erro) {
  const msg = String(erro?.message || '');
  if (erro?.code === '42P01' || /does not exist|schema cache/i.test(msg)) {
    return 'A tabela de medidas ainda não existe no banco. Rode o script 05 no Supabase.';
  }
  if (/fetch|network|load failed/i.test(msg) || !navigator.onLine) return 'Sem internet. Tente de novo quando a conexão voltar.';
  return msg || 'Algo deu errado.';
}

function montarCampos() {
  const caixa = limpar($('#campos-medidas'));
  CAMPOS.forEach((c) => caixa.append(
    h('label', { class: 'campo' },
      h('span', {}, rotulo(c)),
      h('input', { type: 'text', inputmode: 'decimal', name: c.id, autocomplete: 'off', placeholder: '—' }),
    ),
  ));
}

function preencherForm(registro) {
  const f = $('#form-medidas').elements;
  CAMPOS.forEach((c) => {
    const v = registro ? registro[c.id] : null;
    f[c.id].value = v === null || v === undefined ? '' : formatarNumero(v);
  });
  $('#aviso-edicao').hidden = !registro;
}

async function salvar(e) {
  e.preventDefault();
  const f = $('#form-medidas').elements;
  const data = $('#m-data').value;
  if (!data) return toast('Escolha a data.', 'erro');
  if (data > hojeLocal()) return toast('A data não pode ser no futuro.', 'erro');

  const linha = { aluno_id: ctx.user.id, data };
  let algum = false;
  for (const c of CAMPOS) {
    const r = lerNumero(f[c.id].value, c);
    if (!r.ok) {
      f[c.id].focus();
      return toast(`${rotulo(c)}: ${r.erro}`, 'erro');
    }
    linha[c.id] = r.valor;
    if (r.valor !== null) algum = true;
  }
  if (!algum) return toast('Preencha pelo menos uma medida.', 'erro');

  await comCarregando($('#btn-salvar-medidas'), async () => {
    const { error } = await supabase.from('medidas').upsert(linha, { onConflict: 'aluno_id,data' });
    if (error) return toast(erroMedida(error), 'erro');
    toast('Medidas salvas.', 'ok');
    await carregar();
  });
}

async function excluir(registro) {
  if (!confirm(`Apagar as medidas de ${formatarData(registro.data)}?`)) return;
  const { error } = await supabase.from('medidas').delete().eq('id', registro.id);
  if (error) return toast(erroMedida(error), 'erro');
  toast('Registro apagado.', 'ok');
  await carregar();
}

function editar(registro) {
  $('#m-data').value = registro.data;
  preencherForm(registro);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderHistorico() {
  const alvo = limpar($('#historico'));
  if (!registros.length) {
    return alvo.append(h('p', { class: 'msg-status' }, 'Nenhuma medida anotada ainda.'));
  }
  const deltas = calcularDeltas(registros);
  registros.forEach((reg, i) => {
    const valores = CAMPOS.filter((c) => reg[c.id] !== null && reg[c.id] !== undefined).map((c) => h('div', {},
      h('span', { class: 'sutil' }, `${c.nome}: `),
      h('strong', {}, `${formatarNumero(reg[c.id])} ${c.unidade}`),
      h('span', { class: 'delta' }, textoDelta(deltas[i][c.id])),
    ));
    alvo.append(h('article', { class: 'registro-medida' },
      h('div', { class: 'registro-topo' },
        h('strong', {}, formatarData(reg.data)),
        h('div', { class: 'registro-acoes' },
          h('button', { type: 'button', class: 'btn-mini', onclick: () => editar(reg) }, 'Editar'),
          h('button', { type: 'button', class: 'btn-mini', onclick: () => excluir(reg) }, 'Apagar'),
        ),
      ),
      h('div', { class: 'registro-valores' }, valores),
    ));
  });
}

function renderGrafico() {
  const sel = $('#sel-grafico');
  if (!sel.options.length) {
    CAMPOS.forEach((c) => sel.append(h('option', { value: c.id }, rotulo(c))));
    sel.value = 'peso_kg';
  }
  const campo = CAMPOS.find((c) => c.id === sel.value);
  const serie = registros.filter((r) => r[campo.id] !== null && r[campo.id] !== undefined).slice(0, 12).reverse();
  const alvo = limpar($('#grafico'));
  if (serie.length < 2) {
    return alvo.append(h('p', { class: 'sutil' }, 'Anote esta medida pelo menos duas vezes para ver a evolução.'));
  }

  const g = geometriaGrafico(serie.map((r) => Number(r[campo.id])));
  const NS = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs, texto) => {
    const e = document.createElementNS(NS, tag);
    Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v));
    if (texto !== undefined) e.textContent = texto;
    return e;
  };
  const svg = el('svg', { viewBox: `0 0 ${g.largura} ${g.altura}`, role: 'img', 'aria-label': `Evolução: ${campo.nome}` });
  svg.append(el('path', { d: g.caminho, class: 'linha' }));
  g.pontos.forEach((p) => svg.append(el('circle', { cx: p.x.toFixed(1), cy: p.y.toFixed(1), r: 3.5, class: 'ponto-g' })));
  svg.append(el('text', { x: 4, y: g.margem.t + 4, class: 'eixo' }, formatarNumero(g.max)));
  svg.append(el('text', { x: 4, y: g.altura - g.margem.b, class: 'eixo' }, formatarNumero(g.min)));
  svg.append(el('text', { x: g.margem.e, y: g.altura - 6, class: 'eixo' }, formatarData(serie[0].data).slice(0, 5)));
  svg.append(el('text', { x: g.largura - g.margem.d, y: g.altura - 6, class: 'eixo', 'text-anchor': 'end' }, formatarData(serie[serie.length - 1].data).slice(0, 5)));
  alvo.append(svg);
}

async function carregar() {
  const { data, error } = await supabase.from('medidas').select('*').order('data', { ascending: false }).limit(300);
  if (error) {
    limpar($('#grafico'));
    limpar($('#historico')).append(h('p', { class: 'msg-status' }, erroMedida(error)));
    return;
  }
  registros = data;
  renderGrafico();
  renderHistorico();
  $('#aviso-edicao').hidden = !registroDaData($('#m-data').value);
}

async function iniciar() {
  ctx = await exigirPapel('usuario');
  if (!ctx) return;
  document.body.classList.remove('carregando');

  montarCampos();
  const campoData = $('#m-data');
  campoData.value = hojeLocal();
  campoData.max = hojeLocal();
  campoData.addEventListener('change', () => {
    const r = registroDaData(campoData.value);
    if (r) preencherForm(r);
    else $('#aviso-edicao').hidden = true;
  });
  $('#form-medidas').addEventListener('submit', salvar);
  $('#sel-grafico').addEventListener('change', renderGrafico);

  await carregar();
  const doDia = registroDaData(campoData.value);
  if (doDia) preencherForm(doDia);
}
iniciar();
