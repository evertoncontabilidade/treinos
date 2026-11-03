// Utilitários de interface: criação segura de elementos, avisos e datas.

/**
 * h('div', { class: 'card', onclick: fn }, 'texto', outroElemento)
 * Textos entram via textContent, então nunca são interpretados como HTML.
 */
export function h(tag, props = {}, ...filhos) {
  const el = document.createElement(tag);
  for (const [chave, valor] of Object.entries(props || {})) {
    if (valor === undefined || valor === null || valor === false) continue;
    if (chave === 'class') el.className = valor;
    else if (chave === 'dataset') Object.assign(el.dataset, valor);
    else if (chave === 'style' && typeof valor === 'object') Object.assign(el.style, valor);
    else if (chave.startsWith('on') && typeof valor === 'function') el.addEventListener(chave.slice(2), valor);
    else if (chave === 'value' || chave === 'checked' || chave === 'selected' || chave === 'disabled') el[chave] = valor;
    else el.setAttribute(chave, valor === true ? '' : valor);
  }
  for (const filho of filhos.flat()) {
    if (filho === null || filho === undefined || filho === false) continue;
    el.append(filho instanceof Node ? filho : document.createTextNode(String(filho)));
  }
  return el;
}

export const $ = (seletor, raiz = document) => raiz.querySelector(seletor);
export const $$ = (seletor, raiz = document) => [...raiz.querySelectorAll(seletor)];

export function limpar(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

/** Aviso rápido no rodapé. tipo: 'ok' | 'erro' | 'info' */
export function toast(mensagem, tipo = 'info') {
  let area = document.getElementById('toasts');
  if (!area) {
    area = h('div', { id: 'toasts', 'aria-live': 'polite' });
    document.body.append(area);
  }
  const t = h('div', { class: `toast toast-${tipo}`, role: tipo === 'erro' ? 'alert' : 'status' }, mensagem);
  area.append(t);
  setTimeout(() => t.classList.add('saindo'), 3200);
  setTimeout(() => t.remove(), 3600);
}

/** Data local no formato AAAA-MM-DD (evita o erro de fuso: depois das 21h no Brasil, UTC já é "amanhã"). */
export function hojeLocal() {
  return dataLocal(new Date());
}
export function dataLocal(d) {
  const ano = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}
export function diasAtras(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return dataLocal(d);
}
/** '2026-11-02' -> '02/11' */
export function formatarDiaMes(iso) {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}
/** Diferença em dias entre duas datas AAAA-MM-DD */
export function diferencaDias(maisRecente, maisAntiga) {
  const a = new Date(`${maisRecente}T00:00:00`);
  const b = new Date(`${maisAntiga}T00:00:00`);
  return Math.round((a - b) / 86400000);
}

/** Extrai o ID de um link do YouTube (watch, shorts, youtu.be, embed). Retorna '' se não achar. */
export function idYoutube(url) {
  if (!url) return '';
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtu.be')) return u.pathname.slice(1).split('/')[0];
    if (u.pathname.startsWith('/shorts/')) return u.pathname.split('/')[2] || '';
    if (u.pathname.startsWith('/embed/')) return u.pathname.split('/')[2] || '';
    return u.searchParams.get('v') || '';
  } catch {
    return '';
  }
}

/** Desativa um botão enquanto uma ação assíncrona roda. */
export async function comCarregando(botao, acao) {
  const textoOriginal = botao.textContent;
  botao.disabled = true;
  botao.textContent = 'Aguarde…';
  try {
    return await acao();
  } finally {
    botao.disabled = false;
    botao.textContent = textoOriginal;
  }
}
