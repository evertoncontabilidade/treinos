// Reordenar itens de uma lista arrastando (mouse e toque), sem biblioteca.
// Também funciona pelo teclado: foque na alça e use as setas ↑ ↓.
//
// tornarOrdenavel(container, { itemSel: '.item', alcaSel: '.alca', aoSoltar: (ids) => {} })
// Cada item precisa de data-id. A alça precisa de "touch-action: none" no CSS.

export function tornarOrdenavel(container, { itemSel, alcaSel, aoSoltar }) {
  let arrastando = null;
  let idPonteiro = null;
  let ultimoY = 0;
  let quadro = null;

  const itens = () => [...container.querySelectorAll(`:scope > ${itemSel}`)];
  const ids = () => itens().map((el) => el.dataset.id);

  function autoRolagem() {
    if (!arrastando) return;
    const margem = 80;
    if (ultimoY < margem) window.scrollBy(0, -14);
    else if (ultimoY > window.innerHeight - margem) window.scrollBy(0, 14);
    quadro = requestAnimationFrame(autoRolagem);
  }

  container.addEventListener('pointerdown', (e) => {
    const alca = e.target.closest(alcaSel);
    if (!alca) return;
    const item = alca.closest(itemSel);
    if (!item || item.parentElement !== container) return;
    e.preventDefault();
    arrastando = item;
    idPonteiro = e.pointerId;
    ultimoY = e.clientY;
    // A captura fica no container (que não se move). Se ficasse na alça, mover o item no DOM
    // poderia soltar a captura no meio do arrasto.
    container.setPointerCapture(e.pointerId);
    item.classList.add('arrastando');
    document.body.classList.add('sem-selecao');
    quadro = requestAnimationFrame(autoRolagem);
  });

  container.addEventListener('pointermove', (e) => {
    if (!arrastando || e.pointerId !== idPonteiro) return;
    ultimoY = e.clientY;
    const outros = itens().filter((el) => el !== arrastando);
    const alvo = outros.find((el) => {
      const r = el.getBoundingClientRect();
      return e.clientY < r.top + r.height / 2;
    });
    if (alvo) {
      if (arrastando.nextElementSibling !== alvo) container.insertBefore(arrastando, alvo);
    } else if (container.lastElementChild !== arrastando) {
      container.append(arrastando);
    }
  });

  function soltar(e) {
    if (!arrastando || e.pointerId !== idPonteiro) return;
    cancelAnimationFrame(quadro);
    arrastando.classList.remove('arrastando');
    document.body.classList.remove('sem-selecao');
    try { container.releasePointerCapture(e.pointerId); } catch { /* já liberado */ }
    arrastando = null;
    idPonteiro = null;
    aoSoltar(ids());
  }
  container.addEventListener('pointerup', soltar);
  container.addEventListener('pointercancel', soltar);

  container.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    const alca = e.target.closest(alcaSel);
    if (!alca) return;
    const item = alca.closest(itemSel);
    if (!item || item.parentElement !== container) return;
    e.preventDefault();
    if (e.key === 'ArrowUp' && item.previousElementSibling) {
      container.insertBefore(item, item.previousElementSibling);
    } else if (e.key === 'ArrowDown' && item.nextElementSibling) {
      container.insertBefore(item.nextElementSibling, item);
    } else {
      return;
    }
    alca.focus();
    aoSoltar(ids());
  });
}
