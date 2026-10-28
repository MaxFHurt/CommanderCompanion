// Saved decks. The Deck Builder (deck/) owns every deck; this module lists them for player setup and the profile.
// Decks saved by the old built-in deck editor ('ccv07-decks', with a copy in IndexedDB) are moved into the Deck
// Builder once, on start. The old copies stay on the device untouched.

import { durableGet } from './userdata-db.js';
import { listBuilderDecks, moveGameDecks } from './deck-builder.js';

const LEGACY_KEY = 'ccv07-decks', LEGACY_DURABLE_KEY = 'decks';

function legacyLocal(storage) {
  try {
    const v = JSON.parse(storage?.getItem?.(LEGACY_KEY) || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export async function initDeckStore(storage = globalThis.localStorage) {
  let durable = [];
  try {
    const v = await durableGet(LEGACY_DURABLE_KEY);
    if (Array.isArray(v)) durable = v;
  } catch { /* no recovery copy */ }
  const byId = new Map();
  for (const d of [...durable, ...legacyLocal(storage)]) if (d?.id) byId.set(d.id, d);
  moveGameDecks([...byId.values()], storage);
  return listDecks(storage);
}

export function listDecks(storage = globalThis.localStorage) {
  return listBuilderDecks(storage);
}
