import { supabase } from './supabase.js';
import { exigirPapel } from './auth.js';
import { h, $, limpar, toast, comCarregando, hojeLocal } from './ui.js';
import {
  CAMPOS, CAMPOS_FORM, CAMPO_ALTURA, rotulo, lerNumero, formatarNumero, calcularDeltas, textoDelta,
  geometriaGrafico, calcularGorduraMarinha, listar, calcularImc, classificarImc,
} from './medidas-util.js';
import './pwa.js';

let ctx = null;
let registros = []; // do mais novo para o mais antigo
let corpo = null; // { formula, altura_cm } desta pessoa (privado)

const formatarData = (iso) => { const [a, m, d] = iso.split('-'); return `${d}/${m}/${a}`; };
const registroDaData = (data) => registros.find((r) => r.data === data) || null;

function erroMedida(erro) {
  const msg = String(erro?.message || '');
  if (erro?.code === '42P01' || /does not exist|schema cache/i.test(msg)) {
    return 'Falta criar as tabelas no banco. Rode os scripts 05 e 06 no Supabase.';
  }
  if (/fetch|network|load failed/i.test(msg) || !navigator.onLine) return 'Sem internet. Tente de novo quando a conexão voltar.';
  return msg || 'Algo deu errado.';
}

function montarCampos() {
  const caixa = limpar($('#campos-medidas'));
  CAMPOS_FORM.forEach((c) => caixa.append(
    h('label', { class: 'campo' },
      h('span', {}, rotulo(c)),
      h('input', { type: 'text', inputmode: 'decimal', name: c.id, autocomplete: 'off', placeholder: '—' }),
    ),
  ));
}

function preencherForm(registro) {
  const f = $('#form-medidas').elements;
  CAMPOS_FORM.forEach((c) => {
    const v = registro ? registro[c.id] : null;
    f[c.id].value = v === null || v === undefined ? '' : formatarNumero(v);
  });
  $('#aviso-edicao').hidden = !registro;
  atualizarCalculos();
}

// ---------- gordura corporal (Marinha dos EUA) ----------
function valoresDoForm() {
  const f = $('#form-medidas').elements;
  const valores = {};
  CAMPOS_FORM.forEach((c) => {
    const r = lerNumero(f[c.id].value, c);
    valores[c.id] = r.ok ? r.valor : null;
  });
  return valores;
}

function gorduraDe(v) {
  return calcularGorduraMarinha({
    formula: corpo?.formula,
    alturaCm: corpo ? Number(corpo.altura_cm) : null,
    pescocoCm: v.pescoco_cm,
    cinturaCm: v.cintura_cm,
    abdomenCm: v.abdomen_cm,
    quadrilCm: v.quadril_cm,
  });
}

function atualizarImcAuto() {
  const alvo = limpar($('#imc-auto'));
  const peso = valoresDoForm().peso_kg;
  const altura = corpo ? Number(corpo.altura_cm) : null;
  const imc = calcularImc(peso, altura);
  if (imc !== null) {
    alvo.append('IMC: ', h('strong', {}, formatarNumero(imc)), h('span', { class: 'sutil' }, ` · ${classificarImc(imc)}`));
    return;
  }
  const faltam = [];
  if (!peso) faltam.push('peso');
  if (!altura) faltam.push('altura');
  alvo.append(h('span', { class: 'sutil' }, faltam.length ? `IMC (automático): falta ${listar(faltam)}.` : 'IMC: confira o peso e a altura.'));
}

function atualizarCalculos() {
  atualizarImcAuto();
  atualizarGorduraAuto();
}

// O IMC não é gravado: é recalculado do peso de cada registro e da altura atual.
function calcularImcDosRegistros() {
  const altura = corpo ? Number(corpo.altura_cm) : null;
  registros.forEach((r) => { r.imc = calcularImc(r.peso_kg, altura); });
}

function atualizarGorduraAuto() {
  const caixa = limpar($('#gordura-auto'));
  const g = gorduraDe(valoresDoForm());
  if (g.ok) {
    caixa.append('Gordura corporal estimada: ', h('strong', {}, `${formatarNumero(g.valor)}%`),
      h('span', { class: 'sutil' }, ' · método da Marinha dos EUA'));
  } else if (g.erro) {
    caixa.append(h('span', { class: 'sutil' }, g.erro));
  } else {
    caixa.append(h('span', { class: 'sutil' }, `Gordura corporal (automática): falta ${listar(g.faltando)}.`));
  }
}

function pintarResumoCorpo() {
  $('#resumo-corpo').textContent = corpo ? `${corpo.formula} · ${formatarNumero(corpo.altura_cm)} cm` : 'preencha para calcular';
}

async function carregarCorpo() {
  const { data, error } = await supabase.from('perfil_corporal').select('formula, altura_cm').maybeSingle();
  if (error) return toast(erroMedida(error), 'erro');
  corpo = data; // null enquanto a pessoa não preencher
  if (corpo) {
    const f = $('#form-corpo').elements;
    f.formula.value = corpo.formula;
    f.altura.value = formatarNumero(corpo.altura_cm);
  }
  pintarResumoCorpo();
  $('#dados-corpo').open = !corpo;
}

async function salvarCorpo(e) {
  e.preventDefault();
  const f = $('#form-corpo').elements;
  if (!f.formula.value) return toast('Escolha a fórmula (masculina ou feminina).', 'erro');
  const alt = lerNumero(f.altura.value, CAMPO_ALTURA);
  if (!alt.ok || alt.valor === null) return toast(`Altura: ${alt.erro || 'informe em cm, ex.: 175'}`, 'erro');
  await comCarregando($('#btn-salvar-corpo'), async () => {
    const dados = { aluno_id: ctx.user.id, formula: f.formula.value, altura_cm: alt.valor, atualizado_em: new Date().toISOString() };
    const { error } = await supabase.from('perfil_corporal').upsert(dados, { onConflict: 'aluno_id' });
    if (error) return toast(erroMedida(error), 'erro');
    corpo = dados;
    pintarResumoCorpo();
    atualizarCalculos();
    calcularImcDosRegistros();
    renderGrafico();
    renderHistorico();
    $('#dados-corpo').open = false;
    toast('Dados salvos.', 'ok');
  });
}

async function salvar(e) {
  e.preventDefault();
  const f = $('#form-medidas').elements;
  const data = $('#m-data').value;
  if (!data) return toast('Escolha a data.', 'erro');
  if (data > hojeLocal()) return toast('A data não pode ser no futuro.', 'erro');

  const linha = { aluno_id: ctx.user.id, data };
  let algum = false;
  const valores = {};
  for (const c of CAMPOS_FORM) {
    const r = lerNumero(f[c.id].value, c);
    if (!r.ok) {
      f[c.id].focus();
      return toast(`${rotulo(c)}: ${r.erro}`, 'erro');
    }
    linha[c.id] = r.valor;
    valores[c.id] = r.valor;
    if (r.valor !== null) algum = true;
  }
  if (!algum) return toast('Preencha pelo menos uma medida.', 'erro');

  // Gordura calculada. Se não der para calcular, mantém o valor antigo do mesmo dia (não apaga histórico).
  const existente = registroDaData(data);
  const g = gorduraDe(valores);
  linha.gordura_pct = g.ok ? g.valor : (existente?.gordura_pct ?? null);

  await comCarregando($('#btn-salvar-medidas'), async () => {
    const { error } = await supabase.from('medidas').upsert(linha, { onConflict: 'aluno_id,data' });
    if (error) return toast(erroMedida(error), 'erro');
    toast(g.ok ? `Medidas salvas. Gordura estimada: ${formatarNumero(g.valor)}%` : 'Medidas salvas.', 'ok');
    if (!g.ok && g.erro) toast(`A gordura não foi calculada: ${g.erro}`, 'info');
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
      h('span', { class: 'sutil' }, `${c.nome}${c.estimado ? ' (est.)' : ''}: `),
      h('strong', {}, `${formatarNumero(reg[c.id])} ${c.unidade}`),
      c.id === 'imc' ? h('span', { class: 'delta' }, classificarImc(reg.imc)) : null,
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
  calcularImcDosRegistros();
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
  $('#form-medidas').addEventListener('input', atualizarCalculos);
  $('#form-corpo').addEventListener('submit', salvarCorpo);
  $('#sel-grafico').addEventListener('change', renderGrafico);

  await carregarCorpo();
  await carregar();
  const doDia = registroDaData(campoData.value);
  if (doDia) preencherForm(doDia);
  else atualizarCalculos();
}
iniciar();
