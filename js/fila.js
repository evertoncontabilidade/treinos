// Gravação de execuções (carga e "feito") com fila offline.
// Sem internet, o registro fica guardado no aparelho e é enviado quando a conexão voltar.
import { supabase } from './supabase.js';

const CHAVE = 'tdd:fila';

function ler() {
  try { return JSON.parse(localStorage.getItem(CHAVE) || '[]'); } catch { return []; }
}
function gravar(fila) {
  try { localStorage.setItem(CHAVE, JSON.stringify(fila)); } catch { /* armazenamento cheio: perde só a fila */ }
}

export const chaveDe = (i) => [i.aluno_id, i.ficha_id, i.data, i.ficha_item_id ?? 'fim'].join('|');

export function ehErroDeRede(erro) {
  if (!navigator.onLine) return true;
  const msg = String(erro?.message || erro || '');
  return erro instanceof TypeError || /fetch|network|load failed/i.test(msg);
}

export function pendentes() {
  return ler().length;
}

/** Alterações ainda não enviadas de uma ficha/dia, para somar ao que veio do servidor. */
export function execucoesPendentes(alunoId, fichaId, data) {
  return ler().filter((i) => i.tipo !== 'finalizar' && i.aluno_id === alunoId && i.ficha_id === fichaId && i.data === data);
}

/** Fim de treino ainda não enviado para essa ficha/dia (ou undefined). */
export function finalizacaoPendente(alunoId, fichaId, data) {
  return ler().find((i) => i.tipo === 'finalizar' && i.aluno_id === alunoId && i.ficha_id === fichaId && i.data === data);
}

/** Junta alterações do mesmo exercício no mesmo dia: a mais nova vence, campo a campo. */
export function enfileirar(item) {
  const fila = ler();
  const existente = fila.find((x) => chaveDe(x) === chaveDe(item));
  if (existente) {
    existente.campos = { ...existente.campos, ...item.campos };
    if (item.finalizada_em) existente.finalizada_em = item.finalizada_em;
    existente.t = item.t;
  } else {
    fila.push(item);
  }
  gravar(fila);
}

/** Tira da fila só o que foi enviado, se ninguém alterou o item enquanto a requisição estava no ar. */
function remover(item) {
  const fila = ler();
  const i = fila.findIndex((x) => chaveDe(x) === chaveDe(item) && x.t === item.t);
  if (i >= 0) {
    fila.splice(i, 1);
    gravar(fila);
  }
}

async function enviar(item) {
  const dadosSessao = { aluno_id: item.aluno_id, ficha_id: item.ficha_id, data: item.data };
  if (item.tipo === 'finalizar') dadosSessao.finalizada_em = item.finalizada_em;

  const { data: sessao, error: erroSessao } = await supabase
    .from('sessoes')
    .upsert(dadosSessao, { onConflict: 'aluno_id,ficha_id,data' })
    .select('id')
    .single();
  if (erroSessao) throw erroSessao;
  if (item.tipo === 'finalizar') return; // fim do treino: só marca a sessão

  const { error: erroExec } = await supabase
    .from('execucoes')
    .upsert(
      {
        sessao_id: sessao.id,
        ficha_item_id: item.ficha_item_id,
        exercicio_id: item.exercicio_id,
        ...item.campos,
        atualizado_em: new Date().toISOString(),
      },
      { onConflict: 'sessao_id,ficha_item_id' },
    );
  if (erroExec) throw erroExec;
}

// Um envio de cada vez, na ordem em que foram pedidos (evita que uma carga antiga chegue depois da nova).
let cadeia = Promise.resolve();
const emSequencia = (fn) => {
  const resultado = cadeia.then(fn);
  cadeia = resultado.catch(() => {});
  return resultado;
};

/**
 * Guarda no aparelho ANTES de enviar. Se o app for fechado ou trocado no meio do envio,
 * o registro continua na fila e é enviado na próxima abertura.
 * Retorna 'enviado' ou 'fila' (sem internet). Se o servidor recusar, lança o erro.
 */
export function gravarExecucao(item) {
  enfileirar({ ...item, t: Date.now() });
  return emSequencia(async () => {
    const atual = ler().find((x) => chaveDe(x) === chaveDe(item));
    if (!atual) return 'enviado'; // já seguiu junto com uma gravação anterior
    try {
      await enviar(atual);
      remover(atual);
      return 'enviado';
    } catch (erro) {
      if (ehErroDeRede(erro)) return 'fila';
      remover(atual); // o servidor recusou: insistir não adianta
      throw erro;
    }
  });
}

/** Envia o que ficou guardado. Retorna quantos foram enviados. */
export function sincronizar() {
  return emSequencia(async () => {
    let enviados = 0;
    for (const item of ler()) {
      try {
        await enviar(item);
        remover(item);
        enviados += 1;
      } catch (erro) {
        if (ehErroDeRede(erro)) break; // sem rede: tenta de novo mais tarde
        console.warn('Registro descartado (recusado pelo servidor):', erro?.message || erro);
        remover(item);
      }
    }
    return enviados;
  });
}
