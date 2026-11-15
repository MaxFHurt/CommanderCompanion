// One palette for the whole app, set by the chosen playmat. The colours live as custom properties
// (--pal-primary, --pal-secondary, --pal-glow) in styles/app.css under :root[data-palette="..."]; this file only sets
// the attribute. Amethyst is the app's current look, so applying it changes nothing visible.

import { loadProfile } from '../data/profile.js';
import { selectedMat, matImage } from '../data/playmats.js';
import { activeDie } from '../data/dice.js';

/** Set data-palette (and data-dice) on <html> from the profile. Call at start and whenever the choice or profile changes. */
export function applyPalette(profile = loadProfile()) {
  const root = document.documentElement;
  const mat = selectedMat(profile), id = mat.id;
  root.dataset.palette = mat.palette || id;
  // A reward mat has its own picture (iPhone or iPad version by screen); the palette beside it is only the nearest of the eight.
  if (mat.imagePhone) root.style.setProperty('--sk-playmat', `url("${new URL(matImage(mat), document.baseURI).href}")`);
  else root.style.removeProperty('--sk-playmat');
  if (!applyPalette.watching) { applyPalette.watching = true; addEventListener('resize', () => applyPalette()); }
  root.dataset.dice = activeDie(profile).id;
  return id;
}
