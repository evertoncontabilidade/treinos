// Registro do service worker e convite para instalar o app (Android e iPhone).
import { h } from './ui.js';

const CHAVE_DISPENSA = 'tdd:instalar-dispensado';

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => { /* sem SW, o app segue funcionando online */ });
  });
}

const jaInstalado =
  window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
const ehIOS =
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

function mostrarBanner(texto, botao) {
  if (jaInstalado || localStorage.getItem(CHAVE_DISPENSA)) return;
  const banner = h(
    'div',
    { class: 'banner-instalar', role: 'region', 'aria-label': 'Instalar aplicativo' },
    h('span', {}, texto),
    botao,
    h('button', {
      type: 'button',
      class: 'banner-fechar',
      'aria-label': 'Dispensar',
      onclick: () => { localStorage.setItem(CHAVE_DISPENSA, '1'); banner.remove(); },
    }, '✕'),
  );
  document.body.append(banner);
  return banner;
}

let eventoInstalacao = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  eventoInstalacao = e;
  const banner = mostrarBanner(
    'Instale o Treino do Dia no seu celular.',
    h('button', {
      type: 'button',
      class: 'btn-mini',
      onclick: async () => {
        eventoInstalacao.prompt();
        await eventoInstalacao.userChoice;
        eventoInstalacao = null;
        document.querySelector('.banner-instalar')?.remove();
      },
    }, 'Instalar'),
  );
  if (!banner) eventoInstalacao = null;
});

// O Safari do iPhone não oferece o botão de instalar: é preciso explicar o caminho.
if (ehIOS && !jaInstalado) {
  window.addEventListener('load', () => {
    mostrarBanner('No iPhone: toque em Compartilhar (□↑) e depois em “Adicionar à Tela de Início”.', null);
  });
}

window.addEventListener('appinstalled', () => document.querySelector('.banner-instalar')?.remove());
