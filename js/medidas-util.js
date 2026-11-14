// Funções puras das medidas corporais (sem tela e sem banco), fáceis de testar.

export const CAMPOS = [
  { id: 'peso_kg', nome: 'Peso', unidade: 'kg', min: 20, max: 400, casas: 2 },
  { id: 'gordura_pct', nome: 'Gordura corporal', unidade: '%', min: 2, max: 70, casas: 1 },
  { id: 'peito_cm', nome: 'Peito / busto', unidade: 'cm', min: 10, max: 300, casas: 1 },
  { id: 'cintura_cm', nome: 'Cintura', unidade: 'cm', min: 10, max: 300, casas: 1 },
  { id: 'abdomen_cm', nome: 'Abdômen', unidade: 'cm', min: 10, max: 300, casas: 1 },
  { id: 'quadril_cm', nome: 'Quadril', unidade: 'cm', min: 10, max: 300, casas: 1 },
  { id: 'braco_d_cm', nome: 'Braço direito', unidade: 'cm', min: 10, max: 300, casas: 1 },
  { id: 'braco_e_cm', nome: 'Braço esquerdo', unidade: 'cm', min: 10, max: 300, casas: 1 },
  { id: 'coxa_d_cm', nome: 'Coxa direita', unidade: 'cm', min: 10, max: 300, casas: 1 },
  { id: 'coxa_e_cm', nome: 'Coxa esquerda', unidade: 'cm', min: 10, max: 300, casas: 1 },
  { id: 'panturrilha_d_cm', nome: 'Panturrilha direita', unidade: 'cm', min: 10, max: 300, casas: 1 },
  { id: 'panturrilha_e_cm', nome: 'Panturrilha esquerda', unidade: 'cm', min: 10, max: 300, casas: 1 },
];

export const rotulo = (c) => `${c.nome} (${c.unidade})`;

/** '72,5' -> { ok: true, valor: 72.5 }. Vazio -> { ok: true, valor: null }. */
export function lerNumero(texto, { min, max, casas }) {
  const t = String(texto ?? '').trim().replace(',', '.');
  if (t === '') return { ok: true, valor: null };
  if (!/^\d+(\.\d+)?$/.test(t)) return { ok: false, erro: 'use só números, ex.: 72,5' };
  const n = Number(t);
  if (n < min || n > max) return { ok: false, erro: `valor fora do esperado (${min} a ${max})` };
  const f = 10 ** casas;
  return { ok: true, valor: Math.round(n * f) / f };
}

/** 72.5 -> '72,5'; 72 -> '72' */
export function formatarNumero(valor) {
  return String(Number(valor)).replace('.', ',');
}

/**
 * Diferença de cada medida em relação ao registro anterior que tinha essa mesma medida.
 * `registros` vem do mais novo para o mais antigo. Devolve um objeto por registro: { peso_kg: -0.8, ... }
 */
export function calcularDeltas(registros, campos = CAMPOS) {
  return registros.map((reg, i) => {
    const deltas = {};
    for (const c of campos) {
      const atual = reg[c.id];
      if (atual === null || atual === undefined) continue;
      const anterior = registros.slice(i + 1).find((r) => r[c.id] !== null && r[c.id] !== undefined);
      if (!anterior) continue;
      const f = 10 ** c.casas;
      deltas[c.id] = Math.round((Number(atual) - Number(anterior[c.id])) * f) / f;
    }
    return deltas;
  });
}

export function textoDelta(delta) {
  if (delta === undefined) return '';
  if (delta === 0) return '= igual ao anterior';
  return `${delta > 0 ? '▲ +' : '▼ −'}${formatarNumero(Math.abs(delta))} desde o anterior`;
}

/** Coordenadas de um gráfico de linha simples. */
export function geometriaGrafico(valores, { largura = 320, altura = 150, margem = { e: 40, d: 12, t: 14, b: 26 } } = {}) {
  const n = valores.length;
  const min = Math.min(...valores);
  const max = Math.max(...valores);
  const folga = (max - min) || Math.max(Math.abs(max) * 0.05, 1);
  const y0 = min - folga * 0.15;
  const y1 = max + folga * 0.15;
  const w = largura - margem.e - margem.d;
  const h = altura - margem.t - margem.b;
  const pontos = valores.map((valor, i) => ({
    x: margem.e + (n === 1 ? w / 2 : (w * i) / (n - 1)),
    y: margem.t + h - ((valor - y0) / (y1 - y0)) * h,
    valor,
  }));
  const caminho = pontos.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  return { pontos, caminho, min, max, largura, altura, margem };
}
