// One palette for the whole app, set by the chosen playmat. The colours live as custom properties
// (--pal-primary, --pal-secondary, --pal-glow) in styles/app.css under :root[data-palette="..."]; this file only sets
// the attribute. Amethyst is the app's current look, so applying it changes nothing visible.

import { loadProfile } from '../data/profile.js';
import { selectedMat } from '../data/playmats.js';
import { activeDie } from '../data/dice.js';

/** Set data-palette (and data-dice) on <html> from the profile. Call at start and whenever the choice or profile changes. */
export function applyPalette(profile = loadProfile()) {
  const root = document.documentElement;
  const id = selectedMat(profile).id;
  root.dataset.palette = id;
  root.dataset.dice = activeDie(profile).id;
  return id;
}
