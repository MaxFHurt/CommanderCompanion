// Player-uploaded playmat images. A mat is the background of a player's card; the controls
// float over it. Images are resized and compressed on upload so they save reliably and can be
// sent to another device.

import { durableGet, durableSet } from './userdata-db.js';

const KEY = 'playmats';
const LOCAL_KEY = 'cc-playmats-v1';
const MAX_EDGE = 1280;
const JPEG_QUALITY = 0.8;

export const DEFAULT_MAT = { id: 'default', name: 'Commander Companion', image: 'assets/img/ui/background.webp', dim: 0.2, builtIn: true };

let cache = null;

function readLocal() {
  try {
    const rows = JSON.parse(localStorage.getItem(LOCAL_KEY) || 'null');
    return Array.isArray(rows) ? rows : null;
  } catch {
    return null;
  }
}

export async function initPlaymats() {
  let rows = null;
  try { rows = await durableGet(KEY); } catch { /* IndexedDB unavailable */ }
  if (!Array.isArray(rows)) rows = readLocal() || [];
  cache = rows;
  return listPlaymats();
}

/** Saved mats in slot order (does not include the built-in default). */
export function listPlaymats() {
  return [...(cache || [])].sort((a, b) => a.slot - b.slot);
}

export function playmatById(id) {
  if (!id || id === DEFAULT_MAT.id) return DEFAULT_MAT;
  return (cache || []).find(m => m.id === id) || DEFAULT_MAT;
}

async function persist() {
  let ok = false;
  try { await durableSet(KEY, cache); ok = true; } catch { /* fall through */ }
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(cache)); ok = true; } catch { /* images may exceed localStorage; IndexedDB is the main store */ }
  if (!ok) throw new Error('This browser is not allowing Commander Companion to save playmats.');
}

/** Save (or replace) the mat in a slot. */
export async function savePlaymat({ slot, name, image, dim = 0.35 }) {
  cache = (cache || []).filter(m => m.slot !== slot);
  const mat = { id: `mat-${slot}-${Date.now().toString(36)}`, slot, name: String(name || `Playmat ${slot + 1}`).slice(0, 32), image, dim, createdAt: new Date().toISOString() };
  cache.push(mat);
  await persist();
  return mat;
}

export async function updatePlaymat(id, patch) {
  const mat = (cache || []).find(m => m.id === id);
  if (!mat) return null;
  Object.assign(mat, patch);
  await persist();
  return mat;
}

export async function deletePlaymat(id) {
  cache = (cache || []).filter(m => m.id !== id);
  await persist();
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
