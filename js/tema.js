// Temas de cores. A escolha fica guardada neste aparelho (localStorage).
// O tema é aplicado ao abrir cada página por um pequeno script no <head> (evita piscar a cor errada);
// aqui ficam a lista de temas e a janela de escolha.
import { h } from './ui.js';

export const TEMAS = [
  { id: 'petroleo', nome: 'Azul petróleo', detalhe: 'Fundo escuro', fundo: '#0a0f11', cor: '#2fb5c6' },
  { id: 'petroleo-claro', nome: 'Petróleo claro', detalhe: 'Fundo claro', fundo: '#f2f6f7', cor: '#0b6b79' },
  { id: 'rosa', nome: 'Preto e rosa', detalhe: 'Fundo escuro', fundo: '#0d0a0c', cor: '#ff5fa2' },
];
const CHAVE = 'tdd:tema';

export function temaAtual() {
  try {
    const salvo = localStorage.getItem(CHAVE);
    return TEMAS.some((t) => t.id === salvo) ? salvo : TEMAS[0].id;
  } catch {
    return TEMAS[0].id;
  }
}

export function aplicarTema(id) {
  const tema = TEMAS.find((t) => t.id === id) || TEMAS[0];
  document.documentElement.dataset.tema = tema.id;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', tema.fundo);
}

function salvarTema(id) {
  try { localStorage.setItem(CHAVE, id); } catch { /* sem armazenamento: vale só nesta sessão */ }
  aplicarTema(id);
}

function montarDialogo() {
  const lista = h('div', { class: 'tema-lista' });
  const dialogo = h('dialog', { class: 'dialogo', 'aria-labelledby': 'titulo-tema' },
    h('div', { class: 'dialogo-corpo' },
      h('h2', { id: 'titulo-tema' }, 'Cores do aplicativo'),
      lista,
      h('button', { type: 'button', class: 'btn-mini', onclick: () => dialogo.close() }, 'Fechar'),
    ),
  );

  function pintarOpcoes() {
    const atual = temaAtual();
    lista.replaceChildren(...TEMAS.map((t) => h('button', {
      type: 'button',
      class: 'tema-opcao',
      'aria-pressed': String(t.id === atual),
      onclick: () => { salvarTema(t.id); pintarOpcoes(); },
    },
      h('span', { class: 'tema-amostra', style: { background: t.fundo, borderColor: t.cor } }, h('i', { style: { background: t.cor } })),
      h('span', {}, h('strong', {}, t.nome), h('small', {}, t.detalhe)),
    )));
  }
  pintarOpcoes();
  dialogo.addEventListener('click', (e) => { if (e.target === dialogo) dialogo.close(); }); // toque fora fecha
  document.body.append(dialogo);
  return dialogo;
}

/** Aplica o tema salvo e liga o botão 🎨 (se a página tiver um). */
export function iniciarTema(botao) {
  aplicarTema(temaAtual());
  if (!botao) return;
  const dialogo = montarDialogo();
  botao.addEventListener('click', () => {
    if (typeof dialogo.showModal === 'function') dialogo.showModal();
  });
}
