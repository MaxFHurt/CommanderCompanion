// Title plates (visual handoff art/screen-header, styles/skin.css): every menu and dialog title sits in the plate's
// title box. A title too long for the box shrinks (to 11px), then wraps to two lines (shrinking further only if two lines still do not fit); the element keeps the full text
// and gets it as a tooltip too (dialogs also carry it as their aria-label).

const TITLES = '.page__head h1, .modal__head h2, .plate__title';

const MIN_PX = 11;      // smallest size before the title wraps to two lines
const FLOOR_PX = 7;     // last resort for a title that still does not fit on two lines

function fit(el) {
  el.style.fontSize = ''; el.style.whiteSpace = ''; el.style.lineHeight = '';
  const style = getComputedStyle(el);
  const padX = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
  const padY = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
  const room = el.clientWidth - padX;
  const roomH = el.clientHeight - padY;
  if (room <= 0) return;
  const range = document.createRange();
  range.selectNodeContents(el);
  const fits = () => { const r = range.getBoundingClientRect(); return r.width <= room + 0.5 && r.height <= roomH + 0.5; };
  if (fits()) return;
  const base = parseFloat(style.fontSize);
  const lineH = parseFloat(style.lineHeight) || roomH;
  if (!el.title) el.title = el.textContent.trim();
  // 1. One line, shrinking down to MIN_PX.
  for (let size = base - 0.5; size >= Math.min(MIN_PX, base); size -= 0.5) {
    el.style.fontSize = `${size}px`;
    if (fits()) return;
  }
  // 2. Two lines (each half the plate's line height, so the pair fills the same box), from just above the minimum down.
  el.style.whiteSpace = 'normal';
  el.style.lineHeight = `${lineH / 2}px`;
  for (let size = Math.min(base, MIN_PX + 2); size >= FLOOR_PX; size -= 0.5) {
    el.style.fontSize = `${size}px`;
    if (fits()) return;
  }
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
