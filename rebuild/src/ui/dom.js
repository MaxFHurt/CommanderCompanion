// Minimal DOM helpers. Screens build markup with the `html` tag, which escapes every
// interpolated value unless it is itself `html` output or wrapped in raw().

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ESCAPES[ch]);
}

class Markup {
  constructor(text) { this.text = text; }
  toString() { return this.text; }
}

export function raw(text) {
  return new Markup(String(text ?? ''));
}

function render(value) {
  if (value === null || value === undefined || value === false) return '';
  if (value instanceof Markup) return value.text;
  if (Array.isArray(value)) return value.map(render).join('');
  return esc(value);
}

export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += render(values[i]) + strings[i + 1];
  return new Markup(out);
}

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

/** Delegated event listener: on(root, 'click', '[data-act]', (event, element) => …). */
export function on(root, type, selector, handler) {
  const listener = event => {
    const target = event.target instanceof Element ? event.target.closest(selector) : null;
    if (target && root.contains(target)) handler(event, target);
  };
  root.addEventListener(type, listener);
  return () => root.removeEventListener(type, listener);
}

/** Replace an element's content. Accepts html`` output, a plain string, or an array of either. */
export function setHtml(element, markup) {
  element.innerHTML = render(markup instanceof Markup || Array.isArray(markup) ? markup : raw(markup));
  return element;
}

export function debounce(fn, ms) {
  let timer = null;
  const wrapped = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
  wrapped.flush = (...args) => { clearTimeout(timer); fn(...args); };
  return wrapped;
}

export function clockTime(iso) {
  const d = iso ? new Date(iso) : new Date();
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}
