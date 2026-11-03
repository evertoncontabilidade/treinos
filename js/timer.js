// Cronômetro de descanso baseado em HORÁRIO DE TÉRMINO, não em contagem regressiva.
// Se o aluno sair do app (rede social, bloqueio de tela), ao voltar o tempo restante
// continua correto, porque é recalculado a partir do relógio.
//
// Limite honesto: navegadores suspendem páginas em segundo plano (principalmente no iPhone),
// então o ALARME só toca com o app aberto. Fora dele, o app mostra quanto tempo passou ao voltar.
// Para aviso com o app fechado seria preciso notificação push enviada por servidor.

const CHAVE_FIM = 'tdd:timer-fim';
const TOLERANCIA_ALARME_S = 3;   // só apita se voltar até 3 s depois do fim
const VALIDADE_AVISO_S = 600;    // depois de 10 min, descarta o aviso de "terminou"

export function criarTimer({ aoTick, aoFim, aoParar }) {
  let fim = Number(localStorage.getItem(CHAVE_FIM)) || 0;
  let idIntervalo = null;
  let contextoAudio = null;
  let travaTela = null;

  const restante = () => Math.ceil((fim - Date.now()) / 1000);

  function destravarAudio() {
    // Precisa acontecer dentro de um toque do usuário (regra do iOS e do Chrome).
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      contextoAudio = contextoAudio || new Ctx();
      if (contextoAudio.state === 'suspended') contextoAudio.resume();
    } catch { /* sem áudio, segue só com vibração e texto */ }
  }

  function apitar() {
    try { navigator.vibrate?.([250, 120, 250, 120, 400]); } catch { /* iOS não vibra */ }
    if (!contextoAudio) return;
    const t0 = contextoAudio.currentTime;
    [0, 0.28, 0.56].forEach((atraso, i) => {
      const osc = contextoAudio.createOscillator();
      const ganho = contextoAudio.createGain();
      osc.type = 'sine';
      osc.frequency.value = i === 2 ? 1320 : 880;
      ganho.gain.setValueAtTime(0.0001, t0 + atraso);
      ganho.gain.exponentialRampToValueAtTime(0.5, t0 + atraso + 0.02);
      ganho.gain.exponentialRampToValueAtTime(0.0001, t0 + atraso + 0.22);
      osc.connect(ganho).connect(contextoAudio.destination);
      osc.start(t0 + atraso);
      osc.stop(t0 + atraso + 0.25);
    });
  }

  async function pedirTravaTela() {
    // Mantém a tela acesa durante o descanso (Android e iOS 16.4+). Se falhar, tudo bem.
    try {
      if (!('wakeLock' in navigator) || travaTela) return;
      travaTela = await navigator.wakeLock.request('screen');
      travaTela.addEventListener('release', () => { travaTela = null; });
    } catch { travaTela = null; }
  }
  function soltarTravaTela() {
    try { travaTela?.release(); } catch { /* ignora */ }
    travaTela = null;
  }

  function parouDeContar() {
    clearInterval(idIntervalo);
    idIntervalo = null;
    localStorage.removeItem(CHAVE_FIM);
    soltarTravaTela();
  }

  function tick() {
    const r = restante();
    if (r > 0) { aoTick(r); return; }
    const atraso = Math.max(0, Math.round((Date.now() - fim) / 1000));
    parouDeContar();
    if (atraso <= TOLERANCIA_ALARME_S) apitar();
    aoFim(atraso);
  }

  function correr() {
    clearInterval(idIntervalo);
    idIntervalo = setInterval(tick, 250);
    tick();
  }

  return {
    /** Chame direto de um clique/toque. */
    iniciar(segundos) {
      destravarAudio();
      fim = Date.now() + segundos * 1000;
      localStorage.setItem(CHAVE_FIM, String(fim));
      pedirTravaTela();
      correr();
    },
    parar() {
      parouDeContar();
      aoParar();
    },
    /** Chame ao abrir a página e quando ela voltar a ficar visível. */
    retomar() {
      fim = Number(localStorage.getItem(CHAVE_FIM)) || 0;
      if (!fim) return;
      if (fim > Date.now()) {
        pedirTravaTela();
        correr();
      } else if ((Date.now() - fim) / 1000 <= VALIDADE_AVISO_S) {
        tick();
      } else {
        parouDeContar();
        aoParar();
      }
    },
    ativo: () => idIntervalo !== null,
  };
}
