// The link between the game side (this app) and the Deck Builder (deck/, formerly Deck Companion).
// The Deck Builder owns every deck (localStorage 'cc.deckProfile'; 'dc.profile' before deck build 168). This side reads them, as plain-text
// lists for player setup, and writes to them only once: moving decks saved before the merge.
// The game side owns the player's name, avatar, games, achievements and history ('ccv07-profile').
// Both pages are on one origin, so they share storage.

const DECK_BUILDER_URL = 'deck/';
const RETURN_KEY = 'cc.return';            // sessionStorage: the screen to reopen when coming back
const BUILDER_PROFILE_KEY = 'cc.deckProfile';  // the Deck Builder's saved profile (its decks live here)
// The old Deck Companion's name for it. The old app (its own site, same origin) still writes there, so it is only read when
// nothing has been saved under the new name yet, and never written.
const LEGACY_PROFILE_KEY = 'dc.profile';
const BUILDER_REV_KEY = 'cc.deckRev';      // the number of the latest save; an open Deck Builder takes a newer one
const MOVED_KEY = 'cc.decksMoved';         // ids of game-side decks already moved into the Deck Builder
const DEFAULT_BUILDER_NAMES = ['', 'me', 'planeswalker'];

/** Leave for the Deck Builder. `back` is the screen to reopen on return: { screen, params }. */
export function openDeckBuilder(back = { screen: 'landing', params: {} }) {
  try { sessionStorage.setItem(RETURN_KEY, JSON.stringify(back)); } catch { /* storage unavailable: return lands on the home screen */ }
  location.href = DECK_BUILDER_URL;
}

/** The screen to reopen after coming back from the Deck Builder, once; null when there is none. */
export function takeReturn() {
  try {
    const text = sessionStorage.getItem(RETURN_KEY);
    sessionStorage.removeItem(RETURN_KEY);
    const back = text ? JSON.parse(text) : null;
    return back && typeof back.screen === 'string' ? { screen: back.screen, params: back.params || {} } : null;
  } catch {
    return null;
  }
}

function read(storage, key, fallback) {
  try { return JSON.parse(storage?.getItem?.(key) || 'null') ?? fallback; } catch { return fallback; }
}

/** The Deck Builder's whole saved profile, as stored; null when there is none. */
export function readBuilderProfile(storage = globalThis.localStorage) {
  const profile = read(storage, BUILDER_PROFILE_KEY, null) || read(storage, LEGACY_PROFILE_KEY, null);
  return profile && Array.isArray(profile.decks) ? profile : null;
}

// Save the Deck Builder's profile as the newest copy, so the Deck Builder's own device copy (IndexedDB) does not win over it.
function saveBuilder(profile, storage) {
  const rev = Math.max(Date.now(), Number(read(storage, BUILDER_REV_KEY, {})?.rev || 0) + 1);
  storage.setItem(BUILDER_PROFILE_KEY, JSON.stringify({ ...profile, saveRev: rev }));
  storage.setItem(BUILDER_REV_KEY, JSON.stringify({ rev }));
}

/** Put back the Deck Builder's saved profile from a profile backup. */
export function writeBuilderProfile(profile, storage = globalThis.localStorage) {
  if (!profile || !Array.isArray(profile.decks)) return false;
  try { saveBuilder(profile, storage); return true; } catch { return false; }
}

// A deck moved from the old editor keeps its old id on this side, so Table Defaults and deck stats still find it.
const gameId = id => (String(id).startsWith('cc-') ? String(id).slice(3) : String(id));

/** One Deck Builder deck in the game side's deck shape: commanders first, then the rest of the list. */
export function toGameDeck(d) {
  const commanders = [d.commander, d.partner].filter(Boolean);
  const lines = [...commanders.map(name => `1 ${name}`), ...(d.cards || []).filter(e => e?.n && e.q > 0 && !commanders.includes(e.n)).map(e => `${e.q} ${e.n}`)];
  return {
    id: gameId(d.id),
    name: d.name || 'Untitled deck',
    commander1: d.commander || '',
    commander2: d.partner || '',
    deckList: lines.join('\n'),
    updatedAt: Number.isFinite(new Date(d.updatedAt).getTime()) ? new Date(d.updatedAt).toISOString() : null,
    owner: d.player || '',
    source: 'deck-builder'
  };
}

/** The Deck Builder's Commander decks that have a commander set, in the game side's deck shape. The Deck Builder's
 *  example deck (shown before you make your own) is not listed. */
export function listBuilderDecks(storage = globalThis.localStorage) {
  const profile = readBuilderProfile(storage);
  if (!profile || profile.example) return [];
  return profile.decks.filter(d => d && d.id && d.format === 'commander' && d.commander).map(toGameDeck);
}

/** What the Deck Builder holds, for the profile screen. */
export function builderSummary(storage = globalThis.localStorage) {
  const p = readBuilderProfile(storage);
  const decks = p && !p.example ? p.decks.filter(d => d && d.id) : [];
  return {
    decks: decks.length,
    collection: p?.library && typeof p.library === 'object' ? Object.keys(p.library).length : 0,
    buyList: decks.reduce((n, d) => n + (Array.isArray(d.want) ? d.want.length : 0), 0) + (Array.isArray(p?.want) ? p.want.length : 0)
  };
}

/** The name the Deck Builder was using before the merge, when it is a real name rather than its default. */
export function builderPlayerName(storage = globalThis.localStorage) {
  const p = readBuilderProfile(storage);
  const name = String(p?.name || '').trim();
  return DEFAULT_BUILDER_NAMES.includes(name.toLowerCase()) ? '' : name;
}

/** A game-side deck ({ name, commander1, commander2, deckList }) in the Deck Builder's deck shape. */
export function toBuilderDeck(deck) {
  const commanders = [deck.commander1, deck.commander2].map(s => String(s || '').trim()).filter(Boolean);
  const isCommander = name => commanders.some(c => c.toLowerCase() === name.toLowerCase());
  const counts = new Map();
  for (const raw of String(deck.deckList || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || /^(\/\/|#)/.test(line)) continue;
    const m = /^(\d+)\s*x?\s+(.+)$/i.exec(line);
    const q = m ? Number(m[1]) : 1;
    const name = (m ? m[2] : line).replace(/\*[A-Z]+\*/g, '').replace(/\s*[([][A-Za-z0-9]{2,6}[)\]].*$/, '').trim();
    if (!name || isCommander(name)) continue;
    counts.set(name, (counts.get(name) || 0) + q);
  }
  const d = {
    id: `cc-${deck.id}`,
    name: deck.name || 'Imported deck',
    format: 'commander',
    commander: commanders[0] || '',
    tier: 'budget',
    aims: [],
    tribe: '',
    colors: [],
    aimLocked: false,
    cards: [...counts].map(([n, q]) => ({ n, q })),
    dismissed: [],
    src: 'import',
    updatedAt: Date.parse(deck.updatedAt || deck.createdAt || '') || Date.now()
  };
  if (commanders[1]) d.partner = commanders[1];
  return d;
}

/** Move decks saved by the old built-in deck editor into the Deck Builder, once per deck. `again` moves them even
 *  if they were moved before (restoring an old backup), unless the Deck Builder still has them. Returns how many moved. */
export function moveGameDecks(gameDecks, storage = globalThis.localStorage, { again = false } = {}) {
  const moved = new Set(read(storage, MOVED_KEY, []));
  const todo = (gameDecks || []).filter(d => d?.id && (again || !moved.has(d.id)) && (d.deckList || d.commander1));
  if (!todo.length) return 0;
  let profile = readBuilderProfile(storage);
  if (!profile) profile = { name: '', decks: [], updatedAt: 0 };
  if (profile.example) { profile.decks = []; profile.example = false; }
  const have = new Set(profile.decks.map(d => d.id));
  for (const deck of todo) {
    const d = toBuilderDeck(deck);
    if (!have.has(d.id)) profile.decks.push(d);
    moved.add(deck.id);
  }
  profile.updatedAt = Date.now();
  try {
    saveBuilder(profile, storage);
    storage.setItem(MOVED_KEY, JSON.stringify([...moved]));
  } catch {
    return 0;   // storage full or blocked: try again next start
  }
  return todo.length;
}
