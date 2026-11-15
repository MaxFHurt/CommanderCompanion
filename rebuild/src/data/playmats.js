// Playmats: eight built-in mats named and coloured per the visual handoff (palettes.json). There is no image upload.
// Earlier builds let players upload mats; those stored rows stay in the data (never deleted, still carried in
// back-ups) but are no longer shown, and any seat or profile that points at one falls back to Amethyst.
// Amethyst is free; every later mat unlocks at 3k games played (k = its place after Amethyst) or at achievement level 3(2k-1), whichever comes first (data/rewards.js).
// TO ADD A MAT: add one row to PALETTES below (id, name, two colours) at the end, in unlock order. Nothing else is needed:
// its unlock thresholds, picker slot and settings choice are generated. Also add a die row in data/dice.js
// ORDER if it should have a matching die, and the picture later as `art`.
// The chosen mat also sets the app palette (app/theme.js) and the default life die (data/dice.js).
// Pictures: the handoff's playmats (tools/skin-assets.py).

import { durableGet } from './userdata-db.js';
import { rewardFor, isUnlocked } from './rewards.js';
import { achievementLevel } from './achievements.js';

const KEY = 'playmats';
const LOCAL_KEY = 'cc-playmats-v1';
const MAX_EDGE = 1280;
const JPEG_QUALITY = 0.8;

// Order and colours from rebuild/roadmap/visual-handoff/layout-reference/palettes.json.
const PALETTES = [
  ['amethyst', 'Amethyst', '#a052ff', '#be71ff'],
  ['dark-alley', 'Dark Alley', '#ae64f2', '#ed5eaf'],
  ['night-flight', 'Night Flight', '#8664f7', '#bc80ff'],
  ['ember', 'Ember', '#ff555c', '#ffb455'],
  ['frost', 'Frost', '#a28af7', '#d1a3ff'],
  ['gold', 'Gold', '#ffcf32', '#ffec8a'],
  ['forge', 'Forge', '#ff7928', '#ffbb5b'],
  ['emerald', 'Emerald', '#2cd88e', '#8dffb0']
];

/** The eight built-in mats, in unlock order. `image` is the full playmat (assets/skin/<id>/, downloaded when a seat or
 * the app uses it; Amethyst's installs with the app), `thumb` a small picture for pickers (all eight install). */
export const MATS = PALETTES.map(([id, name, primary, secondary]) => ({
  id, name, primary, secondary, builtIn: true, dim: 0.2,
  image: `assets/skin/${id}/playmat.webp`,
  thumb: `assets/skin/shared/thumb-${id}.webp`
}));

/** Amethyst: the free mat and the fallback for anything unknown. Older saves that say "default" resolve to it. */
export const DEFAULT_MAT = MATS[0];
export const DEFAULT_MAT_ID = DEFAULT_MAT.id;

let cache = null;

function readLocal() {
  try {
    const rows = JSON.parse(localStorage.getItem(LOCAL_KEY) || 'null');
    return Array.isArray(rows) ? rows : null;
  } catch {
    return null;
  }
}

/** Loads the old uploaded rows (kept so back-ups and sync carry them unchanged). */
export async function initPlaymats() {
  let rows = null;
  try { rows = await durableGet(KEY); } catch { /* IndexedDB unavailable */ }
  if (!Array.isArray(rows)) rows = readLocal() || [];
  cache = rows;
  return listPlaymats();
}

/** Old uploaded mats, kept only as stored data: they are not shown or selectable. */
export function listPlaymats() {
  return [...(cache || [])].sort((a, b) => a.slot - b.slot);
}

/** A built-in mat by id; "default", an old uploaded mat's id or anything unknown gives Amethyst. */
export function playmatById(id) {
  return MATS.find(m => m.id === id) || DEFAULT_MAT;
}

/** One row per mat: whether this profile has it, and the achievement that unlocks it. */
export function matUnlockPlan(profile) {
  const level = achievementLevel(profile);
  return MATS.map((mat, i) => ({ mat, via: rewardFor('mat', mat, i), unlocked: isUnlocked('mat', i, profile, level) }));
}

/** The mats this profile can use. */
export function unlockedMats(profile) {
  return matUnlockPlan(profile).filter(r => r.unlocked).map(r => r.mat);
}

/** The mat chosen on the Profile screen; Amethyst when none, unknown, an old upload or still locked. */
export function selectedMat(profile) {
  const mat = playmatById(profile?.account?.matId);
  return unlockedMats(profile).some(m => m.id === mat.id) ? mat : DEFAULT_MAT;
}

/** Read an image file, scale it down and return a compressed JPEG data URL. */
export function compressImageFile(file) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\//.test(file.type)) return reject(new Error('Choose an image file.'));
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', JPEG_QUALITY));
      } catch (error) {
        reject(error);
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That image could not be read.')); };
    img.src = url;
  });
}

/** Inline style for an element that shows a mat behind its content. */
export function matStyle(mat) {
  const m = mat || DEFAULT_MAT;
  let image = String(m.image || DEFAULT_MAT.image);
  // A custom property's url() resolves against the stylesheet that uses it, so make app paths absolute.
  if (!/^(data:|blob:|https?:)/.test(image) && typeof document !== 'undefined') image = new URL(image, document.baseURI).href;
  const safe = image.replace(/["\\\n]/g, '');
  return `--mat-image:url("${safe}");--mat-dim:${Number(m.dim ?? 0.35)}`;
}
