// Screen router. A screen is { mount(root, params) } and may return a cleanup function.

import { closeAllModals } from '../ui/modal.js';
import { toast } from '../ui/toast.js';

const screens = new Map();
let current = { name: null, cleanup: null };

export function registerScreen(name, screen) {
  screens.set(name, screen);
}

export function go(name, params = {}) {
  const screen = screens.get(name);
  if (!screen) {
    console.warn(`Unknown screen: ${name}`);
    toast('That screen is not available in this build yet.', { bad: true });
    return false;
  }
  closeAllModals();
  try { current.cleanup?.(); } catch (error) { console.error('Screen cleanup failed', error); }
  const root = document.getElementById('app');
  root.innerHTML = '';
  root.dataset.screen = name;
  window.scrollTo(0, 0);
  const cleanup = screen.mount(root, params);
  current = { name, cleanup: typeof cleanup === 'function' ? cleanup : null };
  return true;
}

export function currentScreen() {
  return current.name;
}
