// Title plates (visual handoff art/screen-header, styles/skin.css): every menu and dialog title sits in the plate's
// title box. A title too long for the box shrinks (to 60% at most), then ends in "…"; the element keeps the full text
// and gets it as a tooltip too (dialogs also carry it as their aria-label).

const TITLES = '.page__head h1, .modal__head h2, .plate__title';

function fit(el) {
  el.style.fontSize = '';
  const style = getComputedStyle(el);
  const room = el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
  if (room <= 0) return;
  const range = document.createRange();
  range.selectNodeContents(el);
  const width = range.getBoundingClientRect().width;
  if (width <= room + 0.5) return;
  const size = parseFloat(style.fontSize);
  el.style.fontSize = `${Math.max(size * 0.6, (size * room) / width - 0.25)}px`;
  if (!el.title) el.title = el.textContent.trim();
}

export function fitPlates(root = document) {
  root.querySelectorAll(TITLES).forEach(fit);
}

/** Fits every plate title now and whenever screens or dialogs change, or the window is resized. */
export function watchPlates() {
  let queued = false;
  const later = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; fitPlates(); });
  };
  const observer = new MutationObserver(later);
  for (const id of ['app', 'modalLayer']) {
    const el = document.getElementById(id);
    if (el) observer.observe(el, { childList: true, subtree: true });
  }
  addEventListener('resize', later);
  document.fonts?.ready?.then(later);
  later();
}
