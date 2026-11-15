// Funções puras das medidas corporais (sem tela e sem banco), fáceis de testar.

export const CAMPOS = [
  { id: 'peso_kg', nome: 'Peso', unidade: 'kg', min: 20, max: 400, casas: 2 },
  { id: 'imc', nome: 'IMC', unidade: 'kg/m²', min: 5, max: 90, casas: 1, calculado: true, derivado: true },
  { id: 'gordura_pct', nome: 'Gordura corporal', unidade: '%', min: 2, max: 70, casas: 1, calculado: true, estimado: true },
  { id: 'pescoco_cm', nome: 'Pescoço', unidade: 'cm', min: 10, max: 300, casas: 1 },
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

// Campos que a pessoa digita (a gordura corporal é calculada, não digitada).
export const CAMPOS_FORM = CAMPOS.filter((c) => !c.calculado);
export const CAMPO_ALTURA = { min: 100, max: 250, casas: 1 };

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

/**
 * Gordura corporal estimada pelo método da Marinha dos EUA (medidas em cm).
 *  - fórmula 'masculina': usa altura, pescoço e abdômen (na altura do umbigo)
 *  - fórmula 'feminina':  usa altura, pescoço, cintura (parte mais estreita) e quadril
 * Devolve { ok: true, valor } ou { ok: false, faltando: [...], erro? }.
 */
export function calcularGorduraMarinha({ formula, alturaCm, pescocoCm, cinturaCm, abdomenCm, quadrilCm }) {
  const tem = (v) => typeof v === 'number' && Number.isFinite(v) && v > 0;
  const faltando = [];
  if (formula !== 'masculina' && formula !== 'feminina') faltando.push('fórmula');
  if (!tem(alturaCm)) faltando.push('altura');
  if (!tem(pescocoCm)) faltando.push('pescoço');
  if (formula === 'masculina' && !tem(abdomenCm)) faltando.push('abdômen');
  if (formula === 'feminina') {
    if (!tem(cinturaCm)) faltando.push('cintura');
    if (!tem(quadrilCm)) faltando.push('quadril');
  }
  if (faltando.length) return { ok: false, faltando };

  let densidade;
  if (formula === 'masculina') {
    const diferenca = abdomenCm - pescocoCm;
    if (diferenca <= 0) return { ok: false, faltando: [], erro: 'O abdômen precisa ser maior que o pescoço. Confira as medidas.' };
    densidade = 1.0324 - 0.19077 * Math.log10(diferenca) + 0.15456 * Math.log10(alturaCm);
  } else {
    const soma = cinturaCm + quadrilCm - pescocoCm;
    if (soma <= 0) return { ok: false, faltando: [], erro: 'Cintura + quadril precisam ser maiores que o pescoço. Confira as medidas.' };
    densidade = 1.29579 - 0.35004 * Math.log10(soma) + 0.221 * Math.log10(alturaCm);
  }
  const percentual = 495 / densidade - 450;
  if (!Number.isFinite(percentual) || percentual < 2 || percentual > 70) {
    return { ok: false, faltando: [], erro: 'O resultado ficou fora do esperado. Confira as medidas.' };
  }
  return { ok: true, valor: Math.round(percentual * 10) / 10 };
}

/** ['a','b','c'] -> 'a, b e c' */
export function listar(itens) {
  if (itens.length <= 1) return itens.join('');
  return `${itens.slice(0, -1).join(', ')} e ${itens[itens.length - 1]}`;
}

/** IMC = peso (kg) ÷ altura (m) ao quadrado. Devolve null se faltar dado ou o resultado for absurdo. */
export function calcularImc(pesoKg, alturaCm) {
  const peso = Number(pesoKg);
  const altura = Number(alturaCm);
  if (!(peso > 0) || !(altura > 0)) return null;
  const metros = altura / 100;
  const imc = peso / (metros * metros);
  if (!Number.isFinite(imc) || imc < 8 || imc > 90) return null;
  return Math.round(imc * 10) / 10;
}

/** Faixas da OMS para adultos. */
export function classificarImc(imc) {
  if (imc < 18.5) return 'Abaixo do peso';
  if (imc < 25) return 'Peso normal';
  if (imc < 30) return 'Sobrepeso';
  if (imc < 35) return 'Obesidade grau I';
  if (imc < 40) return 'Obesidade grau II';
  return 'Obesidade grau III';
}
