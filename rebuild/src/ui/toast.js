let timer = null;

/** Brief message at the bottom of the screen. `bad` styles it as an error. */
export function toast(message, { bad = false, ms = 2600 } = {}) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = message;
  el.classList.toggle('is-bad', bad);
  el.hidden = false;
  clearTimeout(timer);
  timer = setTimeout(() => { el.hidden = true; }, ms);
}
