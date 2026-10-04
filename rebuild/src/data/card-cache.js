// Card data cache. Decks are stored as plain lists of names; the full card data comes from
// Scryfall the first time and is kept on the device so later games start instantly and offline.

import { durableGet, durableSet } from './userdata-db.js';
import { parseDeckList, resolveCollection, resolveNamedCard } from './card-api.js';

const KEY = 'card-cache-v1';
let cache = null;

async function load() {
  if (cache) return cache;
  try { cache = (await durableGet(KEY)) || {}; } catch { cache = {}; }
  return cache;
}

function remember(def) {
  if (!def?.name) return;
  cache[def.name.toLowerCase()] = def;
  if (def.combinedName) cache[def.combinedName.toLowerCase()] = def;
}

const lookup = name => cache[String(name || '').trim().toLowerCase()] || null;

/** Definitions for a list of names. Unknown names are fetched; names that cannot be found are returned in `missing`. */
export async function definitionsFor(names, onProgress = () => {}) {
  await load();
  const unique = [...new Set(names.map(n => String(n || '').trim()).filter(Boolean))];
  const need = unique.filter(n => !lookup(n));
  let offline = false;
  if (need.length) {
    try {
      const found = await resolveCollection(need, onProgress);
      found.forEach(remember);
      // Scryfall answers with the canonical name; map what the user typed onto it as well.
      for (const name of need) {
        if (lookup(name)) continue;
        const front = found.find(d => d.name.toLowerCase() === name.toLowerCase().split(' // ')[0]);
        if (front) cache[name.toLowerCase()] = front;
      }
      durableSet(KEY, cache).catch(() => {});
    } catch {
      offline = true;
    }
  }
  const defs = [], missing = [];
  for (const name of unique) { const d = lookup(name); if (d) defs.push(d); else missing.push(name); }
  return { definitions: [...new Map(defs.map(d => [d.definitionId, d])).values()], missing, offline, byName: lookup };
}

/** Turn a deck list (text) into a manifest plus card definitions. */
export async function hydrateDeck(text, onProgress) {
  if (/^\s*SB:/im.test(String(text || ''))) throw new Error('Commander decks do not use a sideboard. Remove the SB: lines.');
  const rows = parseDeckList(text);
  const { definitions, missing, offline, byName } = await definitionsFor(rows.map(r => r.name), onProgress);
  if (missing.length && offline) throw new Error('Card data could not be downloaded. Connect to the internet once so this deck can be loaded.');
  const merged = new Map();
  for (const row of rows) {
    const d = byName(row.name);
    if (d) merged.set(d.definitionId, (merged.get(d.definitionId) || 0) + row.quantity);
  }
  return { manifest: [...merged].map(([definitionId, quantity]) => ({ definitionId, quantity })), definitions, unresolved: missing, total: [...merged.values()].reduce((a, b) => a + b, 0) };
}

export async function definitionByName(name) {
  await load();
  const hit = lookup(name);
  if (hit) return hit;
  const def = await resolveNamedCard(name);
  remember(def);
  cache[String(name).trim().toLowerCase()] = def;
  durableSet(KEY, cache).catch(() => {});
  return def;
}
