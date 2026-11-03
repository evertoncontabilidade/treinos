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

export const chaveDe = (i) => [i.aluno_id, i.ficha_id, i.data, i.ficha_item_id].join('|');

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
  return ler().filter((i) => i.aluno_id === alunoId && i.ficha_id === fichaId && i.data === data);
}

/** Junta alterações do mesmo exercício no mesmo dia: a mais nova vence, campo a campo. */
export function enfileirar(item) {
  const fila = ler();
  const existente = fila.find((x) => chaveDe(x) === chaveDe(item));
  if (existente) existente.campos = { ...existente.campos, ...item.campos };
  else fila.push(item);
  gravar(fila);
}

async function enviar(item) {
  const { data: sessao, error: erroSessao } = await supabase
    .from('sessoes')
    .upsert(
      { aluno_id: item.aluno_id, ficha_id: item.ficha_id, data: item.data },
      { onConflict: 'aluno_id,ficha_id,data' },
    )
    .select('id')
    .single();
  if (erroSessao) throw erroSessao;

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

/** Tenta enviar agora; se não houver internet, guarda na fila. Retorna 'enviado' ou 'fila'. */
export async function gravarExecucao(item) {
  try {
    await enviar(item);
    return 'enviado';
  } catch (erro) {
    if (ehErroDeRede(erro)) {
      enfileirar(item);
      return 'fila';
    }
    throw erro;
  }
}

/** Envia o que ficou guardado. Retorna quantos foram enviados. */
export async function sincronizar() {
  const fila = ler();
  if (!fila.length) return 0;
  const restante = [];
  let enviados = 0;
  for (const item of fila) {
    try {
      await enviar(item);
      enviados += 1;
    } catch (erro) {
      if (ehErroDeRede(erro)) restante.push(item);
      else console.warn('Registro descartado (rejeitado pelo servidor):', erro?.message || erro);
    }
  }
  gravar(restante);
  return enviados;
}
