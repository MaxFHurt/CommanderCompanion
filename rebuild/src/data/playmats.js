// Playmats: eight built-in mats named and coloured per the visual handoff (palettes.json). There is no image upload.
// Earlier builds let players upload mats; those stored rows stay in the data (never deleted, still carried in
// back-ups) but are no longer shown, and any seat or profile that points at one falls back to Amethyst.
// Amethyst is free; every later mat is drawn at random when earned (data/rewards.js).
// TO ADD A MAT: add one row to PALETTES below (id, name, two colours) at the end, in unlock order. Nothing else is needed:
// its unlock thresholds, picker slot and settings choice are generated. Also add a die row in data/dice.js
// ORDER if it should have a matching die, and the picture later as `art`.
// The chosen mat also sets the app palette (app/theme.js) and the default life die (data/dice.js).
// Pictures: the handoff's playmats (tools/skin-assets.py).

import { durableGet } from './userdata-db.js';
import { rewardFor, isUnlocked } from './rewards.js';

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

// Reward mats (rebuild/roadmap/visual-handoff/rewards/playmats/manifest.json, in that order): [id, name, palette]. They have
// no palette of their own, so `palette` is the nearest of the eight by dominant hue (tools/skin-assets.py --mats); change it
// by hand if one looks wrong. Art: assets/skin/mats/<id>/{phone,pad,thumb}.webp (lazy, not precached); phone is 1160x535, pad 1180x760.
const ART_MATS = [
  ['cedar-moon-archer', 'Cedar Moon Archer', 'emerald'],
  ['the-plasma-smith', 'The Plasma Smith', 'frost'],
  ['moonwell-unicorn', 'Moonwell Unicorn', 'frost'],
  ['stormglass-mage', 'Stormglass Mage', 'emerald'],
  ['cinderwing-griffin', 'Cinderwing Griffin', 'forge'],
  ['mirelight-druid', 'Mirelight Druid', 'emerald'],
  ['midnight-koi-dragon', 'Midnight Koi Dragon', 'emerald'],
  ['brass-citadel-artificer', 'Brass Citadel Artificer', 'ember'],
  ['ashen-phoenix', 'Ashen Phoenix', 'forge'],
  ['starlit-grave-mage', 'Starlit Grave Mage', 'dark-alley'],
  ['frost-antler-colossus', 'Frost Antler Colossus', 'dark-alley'],
  ['deepglass-leviathan', 'Deepglass Leviathan', 'emerald'],
  ['sirocco-sphinx', 'Sirocco Sphinx', 'forge'],
  ['the-iron-forges', 'The Iron Forges', 'forge'],
  ['violet-reef', 'Violet Reef', 'emerald'],
  ['glass-salt-flats', 'Glass Salt Flats', 'emerald'],
  ['the-drowned-abbey', 'The Drowned Abbey', 'frost'],
  ['lanterns-over-kyren', 'Lanterns Over Kyren', 'dark-alley'],
  ['blackwater-mangroves', 'Blackwater Mangroves', 'gold'],
  ['aurora-bastion', 'Aurora Bastion', 'frost'],
  ['saffron-dunes', 'Saffron Dunes', 'forge'],
  ['floating-orchards', 'Floating Orchards', 'ember'],
  ['thunderhead-causeway', 'Thunderhead Causeway', 'frost'],
  ['eventide-ringworks', 'Eventide Ringworks', 'dark-alley'],
  ['emberroot-caldera', 'Emberroot Caldera', 'ember']
];

/** The built-in mats, in unlock order. `image` is the full playmat (assets/skin/<id>/, downloaded when a seat or
 * the app uses it; Amethyst's installs with the app), `thumb` a small picture for pickers (all eight install). */
export const MATS = [
  ...PALETTES.map(([id, name, primary, secondary]) => ({
    id, name, primary, secondary, palette: id, builtIn: true, dim: 0.2,
    image: `assets/skin/${id}/playmat.webp`,
    thumb: `assets/skin/shared/thumb-${id}.webp`
  })),
  ...ART_MATS.map(([id, name, palette]) => {
    const base = PALETTES.find(p => p[0] === palette);
    return {
      id, name, primary: base[2], secondary: base[3], palette, builtIn: true, dim: 0.2,
      image: `assets/skin/mats/${id}/pad.webp`, imagePhone: `assets/skin/mats/${id}/phone.webp`,
      thumb: `assets/skin/mats/${id}/thumb.webp`
    };
  })
];

/** True on a wide, short screen (phone held sideways, about 2.2:1) where the phone version of a mat fits; iPads are about 1.4:1. */
export function wideScreen() {
  return typeof window !== 'undefined' && window.innerWidth / Math.max(1, window.innerHeight) > 1.85;
}

/** The mat's picture for this screen: the iPhone version on a wide phone screen when it has one. */
export function matImage(mat) {
  return (wideScreen() && mat.imagePhone) || mat.image;
}

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
  return MATS.map((mat, i) => ({ mat, via: rewardFor('mat', mat, i), unlocked: isUnlocked('mat', mat.id, i, profile) }));
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
  let image = String(matImage(m) || DEFAULT_MAT.image);
  // A custom property's url() resolves against the stylesheet that uses it, so make app paths absolute.
  if (!/^(data:|blob:|https?:)/.test(image) && typeof document !== 'undefined') image = new URL(image, document.baseURI).href;
  const safe = image.replace(/["\\\n]/g, '');
  return `--mat-image:url("${safe}");--mat-dim:${Number(m.dim ?? 0.35)}`;
}
