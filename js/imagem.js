// Reduz uma foto escolhida no celular para um quadrado pequeno em JPEG,
// pronto para guardar no perfil (data URL). Fotos de celular têm vários MB;
// reduzidas para 320x320 ficam em algumas dezenas de KB, sem perda visível num avatar.

const LADO = 320;                    // pixels do quadrado final
const LIMITE_BYTES = 300 * 1024;     // teto de segurança (uma imagem de 320 px quase nunca chega perto)
const QUALIDADES = [0.85, 0.7, 0.55];

function carregarImagem(arquivo) {
  // Usa <img>: os navegadores atuais já aplicam a rotação da câmera (EXIF) ao desenhar no canvas.
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(arquivo);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Não foi possível ler essa imagem.')); };
    img.src = url;
  });
}

/** Recebe o File do <input type="file"> e devolve um data URL JPEG quadrado de 320x320. */
export async function fotoParaPerfil(arquivo) {
  if (!arquivo || !arquivo.type.startsWith('image/')) throw new Error('Escolha um arquivo de imagem.');

  const img = await carregarImagem(arquivo);
  const largura = img.naturalWidth || img.width;
  const altura = img.naturalHeight || img.height;
  if (!largura || !altura) throw new Error('Imagem inválida.');

  // Recorte quadrado no centro
  const lado = Math.min(largura, altura);
  const origemX = (largura - lado) / 2;
  const origemY = (altura - lado) / 2;

  const canvas = document.createElement('canvas');
  canvas.width = LADO;
  canvas.height = LADO;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000';            // fundo para PNGs com transparência
  ctx.fillRect(0, 0, LADO, LADO);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, origemX, origemY, lado, lado, 0, 0, LADO, LADO);

  for (const qualidade of QUALIDADES) {
    const dataUrl = canvas.toDataURL('image/jpeg', qualidade);
    if (dataUrl.length * 0.75 <= LIMITE_BYTES) return dataUrl; // base64 ocupa ~4/3 dos bytes reais
  }
  throw new Error('A imagem ficou grande demais. Tente outra foto.');
}
