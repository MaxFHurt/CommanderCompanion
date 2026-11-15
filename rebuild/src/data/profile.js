import { durableGet, durableSet } from './userdata-db.js';
import { earnedLabels, longestDayRun, achievementLevel } from './achievements.js';
import { MATS, matUnlockPlan } from './playmats.js';
import { diceUnlockPlan, DICE } from './dice.js';
import { settleRewards, mergeDraws, nextDue, GAMES_PER_MAT, WINS_PER_DIE } from './rewards.js';
const KEY = 'ccv07-profile', DURABLE_KEY = 'profile';
let cache = null;
function newTokenId() { try {
  return crypto.randomUUID();
}
catch {
  return `cc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
} }
function blank() { const now = new Date().toISOString(); return { version: 6, token: { id: newTokenId(), schema: 6, createdAt: now, updatedAt: now }, games: 0, wins: 0, awards: {}, milestones: [], firsts: {}, streaks: { win: 0, bestWin: 0, bestDays: 0 }, winDecks: [], winColors: [], playDays: [], rewardsShown: [], rewardDraws: [], players: {}, decks: {}, history: [], account: { displayName: '', tagline: '', avatarGlyph: 'CC', avatarImage: '', preferredPlayerNames: [], favoriteDeckId: '', tableRuleDefaults: null, createdAt: null, updatedAt: null } }; }
function cleanName(x) { return String(x || 'Player').trim() || 'Player'; }
function playerKey(name) { return cleanName(name).toLowerCase(); }
function normalize(raw) {
  const base = blank(), now = new Date().toISOString(), source = raw && typeof raw === 'object' ? raw : {};
  const oldToken = source.token && typeof source.token === 'object' ? source.token : {};
  const out = { ...base, ...source, version: 6,
    token: { id: String(oldToken.id || base.token.id), schema: 6, createdAt: oldToken.createdAt || source.account?.createdAt || now, updatedAt: oldToken.updatedAt || source.account?.updatedAt || now },
    firsts: { ...(source.firsts || {}) }, streaks: { ...base.streaks, ...(source.streaks || {}) }, winDecks: [...(source.winDecks || [])], winColors: [...(source.winColors || [])], playDays: [...(source.playDays || [])],
    players: { ...(source.players || {}) }, decks: { ...(source.decks || {}) }, history: [...(source.history || [])],
    account: { ...base.account, ...(source.account || {}) }
  };
  // First launch of the build that adds reward pop-ups: rewards already earned count as shown (no flood).
  // Rewards are drawn at random and stored (rewards.js). A profile from before that keeps what its games and wins had unlocked
  // (mat k at 3k games, die k at 2k wins, in list order) as stored draws, so nothing is lost.
  out.rewardDraws = Array.isArray(source.rewardDraws) ? mergeDraws(source.rewardDraws) : legacyDraws(out);
  out.rewardsShown = Array.isArray(source.rewardsShown) ? [...source.rewardsShown] : unlockedRewardKeys(out);
  return out;
}

function legacyDraws(p) {
  const at = p.token?.createdAt || new Date().toISOString(), out = [];
  for (let k = 1; k < MATS.length && Number(p.games || 0) >= k * GAMES_PER_MAT; k++) out.push({ id: `mat:${MATS[k].id}`, slot: `g${k * GAMES_PER_MAT}`, at });
  for (let k = 1; k < DICE.length && Number(p.wins || 0) >= k * WINS_PER_DIE; k++) out.push({ id: `die:${DICE[k].id}`, slot: `w${k * WINS_PER_DIE}`, at });
  return out;
}

/** Draws a reward for every slot earned since the last call (achievements, games, wins). Changes the profile; returns the new draws. */
export function settleProfileRewards(p, rand = Math.random) {
  return settleRewards(p, achievementLevel(p), rewardPools(), rand);
}

export const rewardPools = () => ({ mat: MATS.slice(1).map(m => m.id), die: DICE.slice(1).map(d => d.id) });

/** "Next playmat in 2 games, next die in 1 win" for the picker and Profile ('' when nothing is left to win). */
export function nextRewardText(p) {
  const d = nextDue(p, rewardPools()), n = (x, w) => `${x} ${w}${x === 1 ? '' : 's'}`;
  return [d.mat != null && `next playmat in ${n(d.mat, 'game')}`, d.die != null && `next die in ${n(d.die, 'win')}`].filter(Boolean).join(', ').replace(/^./, c => c.toUpperCase());
}

/** Keys ("mat:ember", "die:gold") of every earned reward (the free first mat and die are not rewards). */
export function unlockedRewardKeys(p) {
  return [
    ...matUnlockPlan(p).filter(r => r.via && r.unlocked).map(r => `mat:${r.mat.id}`),
    ...diceUnlockPlan(p).filter(r => r.via && r.unlocked).map(r => `die:${r.die.id}`)
  ];
}

/** Rewards earned but not yet announced, as { kind, id, name, primary, secondary }. */
export function newRewards(p) {
  const shown = new Set(p.rewardsShown || []);
  return [
    ...matUnlockPlan(p).filter(r => r.via && r.unlocked && !shown.has(`mat:${r.mat.id}`)).map(r => ({ kind: 'mat', id: r.mat.id, name: r.mat.name, primary: r.mat.primary, secondary: r.mat.secondary, art: r.mat.thumb || '' })),
    ...diceUnlockPlan(p).filter(r => r.via && r.unlocked && !shown.has(`die:${r.die.id}`)).map(r => ({ kind: 'die', id: r.die.id, name: r.die.name, primary: r.die.primary, secondary: r.die.secondary, art: r.die.art || '' }))
  ];
}

export async function markRewardsShown(keys, storage = globalThis.localStorage) {
  const p = loadProfile(storage);
  p.rewardsShown = [...new Set([...(p.rewardsShown || []), ...keys])];
  await persistReliable(p, storage);
  return p;
}

function localRead(storage) { try {
  return normalize(JSON.parse(storage?.getItem?.(KEY) || 'null'));
}
catch {
  return blank();
} }
function localWrite(p, storage) { try {
  storage?.setItem?.(KEY, JSON.stringify(p));
  return true;
}
catch {
  return false;
} }
function newest(a, b) { const ta = Date.parse(a?.token?.updatedAt || a?.account?.updatedAt || a?.history?.[0]?.at || 0) || 0, tb = Date.parse(b?.token?.updatedAt || b?.account?.updatedAt || b?.history?.[0]?.at || 0) || 0; return tb > ta ? b : a; }
async function persistReliable(p, storage) { settleProfileRewards(p); cache = normalize(p); cache.token.updatedAt = new Date().toISOString(); const localOk = localWrite(cache, storage); let durableOk = false; try {
  await durableSet(DURABLE_KEY, cache);
  durableOk = true;
}
catch { } if (!localOk && !durableOk)
  throw new Error('Profile could not be saved because both browser recovery stores are unavailable.'); return cache; }
export async function initProfileStore(storage = globalThis.localStorage) { const local = localRead(storage); let durable = null; try {
  durable = await durableGet(DURABLE_KEY);
}
catch { } cache = normalize(durable ? newest(local, normalize(durable)) : local);
  // A reward drawn on either copy stays (the copies may come from devices that raced).
  if (durable) { cache.rewardDraws = mergeDraws(local.rewardDraws, normalize(durable).rewardDraws); }
  if (settleProfileRewards(cache).length || (durable && cache.rewardDraws.length !== normalize(durable).rewardDraws.length)) await persistReliable(cache, storage);
  localWrite(cache, storage); return structuredClone(cache); }
export function loadProfile(storage = globalThis.localStorage) { return structuredClone(cache || localRead(storage)); }
export function playerProfileToken(storage = globalThis.localStorage) {
  const p = loadProfile(storage);
  return structuredClone({
    id: p.token.id, schema: p.token.schema, createdAt: p.token.createdAt, updatedAt: p.token.updatedAt,
    identity: { displayName: p.account?.displayName || '', tagline: p.account?.tagline || '', avatarGlyph: p.account?.avatarGlyph || 'CC' },
    preferences: { preferredPlayerNames: [...(p.account?.preferredPlayerNames || [])], favoriteDeckId: p.account?.favoriteDeckId || '', tableRuleDefaults: p.account?.tableRuleDefaults ? structuredClone(p.account.tableRuleDefaults) : null },
    career: { games: p.games || 0, wins: p.wins || 0, awards: { ...(p.awards || {}) }, milestones: [...(p.milestones || [])] },
    deckLibrary: Object.values(p.decks || {}).map(d => ({ id: d.id || '', name: d.name || 'Untitled Deck', commander1: d.commander1 || '', commander2: d.commander2 || '', updatedAt: d.updatedAt || d.createdOrSavedAt || null }))
  });
}
export async function saveAccountProfile(account = {}, storage = globalThis.localStorage) { const p = loadProfile(storage), now = new Date().toISOString(); // Saving only the name or avatar must not wipe the saved table of players.
  const names = (account.preferredPlayerNames ?? p.account.preferredPlayerNames ?? []).map(x => String(x || '').trim()).filter(Boolean).slice(0, 6); p.account = { ...p.account, ...account, displayName: String(account.displayName ?? p.account.displayName ?? '').trim(), tagline: String(account.tagline ?? p.account.tagline ?? '').trim().slice(0, 80), avatarGlyph: String(account.avatarGlyph ?? p.account.avatarGlyph ?? 'CC').trim().slice(0, 3) || 'CC', avatarImage: String(account.avatarImage ?? p.account.avatarImage ?? ''), preferredPlayerNames: names, favoriteDeckId: String(account.favoriteDeckId ?? p.account.favoriteDeckId ?? ''), tableRuleDefaults: account.tableRuleDefaults === undefined ? p.account.tableRuleDefaults : (account.tableRuleDefaults ? structuredClone(account.tableRuleDefaults) : null), createdAt: p.account.createdAt || now, updatedAt: now }; await persistReliable(p, storage); return p; }
export function accountSetupDefaults(storage = globalThis.localStorage) { const p = loadProfile(storage), a = p.account || {}; const inferred = Object.values(p.players || {}).sort((x, y) => String(y.lastPlayedAt || '').localeCompare(String(x.lastPlayedAt || ''))).map(x => x.name).filter(Boolean); const names = [...(a.preferredPlayerNames || []), a.displayName, ...inferred].map(x => String(x || '').trim()).filter(Boolean); return { displayName: a.displayName || '', tagline: a.tagline || '', avatarGlyph: a.avatarGlyph || 'CC', playerNames: [...new Set(names)].slice(0, 6), favoriteDeckId: a.favoriteDeckId || '', tableRuleDefaults: a.tableRuleDefaults ? structuredClone(a.tableRuleDefaults) : null }; }
export async function reconcileProfileDeckLibrary(decks = [], storage = globalThis.localStorage) {
  const p = loadProfile(storage), now = new Date().toISOString(), rows = Array.isArray(decks) ? decks : [], byId = new Map(rows.filter(d => d?.id).map(d => [String(d.id), d]));
  let changed = false;
  p.decks = p.decks || {};
  for (const [id, d] of byId) {
    const old = p.decks[id] || {};
    const next = { ...old, id, name: d.name || old.name || 'Untitled Deck', commander1: d.commander1 || '', commander2: d.commander2 || '', analytics: d.analytics ? structuredClone(d.analytics) : old.analytics || null, importMeta: d.importMeta ? structuredClone(d.importMeta) : old.importMeta || null, createdOrSavedAt: old.createdOrSavedAt || d.createdAt || now, updatedAt: d.updatedAt || old.updatedAt || now, source: d.importMeta?.source || old.source || 'deck-editor' };
    if (JSON.stringify(old) !== JSON.stringify(next)) {
      p.decks[id] = next;
      changed = true;
    }
  }
  for (const id of Object.keys(p.decks))
    if (!byId.has(String(id))) {
      delete p.decks[id];
      changed = true;
    }
  for (const row of Object.values(p.players || {})) {
    if (!row?.decks)
      continue;
    for (const [id, link] of Object.entries(row.decks)) {
      const d = byId.get(String(id));
      if (!d)
        continue;
      const name = d.name || link.name || id, commander1 = d.commander1 || link.commander1 || '', commander2 = d.commander2 || link.commander2 || '';
      if (link.name !== name || link.commander1 !== commander1 || link.commander2 !== commander2) {
        row.decks[id] = { ...link, name, commander1, commander2 };
        changed = true;
      }
    }
  }
  if (p.account?.favoriteDeckId && !byId.has(String(p.account.favoriteDeckId))) {
    p.account.favoriteDeckId = '';
    p.account.updatedAt = now;
    changed = true;
  }
  if (changed)
    await persistReliable(p, storage);
  return structuredClone(p);
}
/** Whether a deck name is one of the Deck Builder's saved decks loaded from a precon (shared storage, read only). */
export function isPreconDeck(name, storage = globalThis.localStorage) {
  try {
    const decks = JSON.parse(storage?.getItem?.('cc.deckProfile') || 'null')?.decks || [];
    const n = String(name || '').trim().toLowerCase();
    return !!n && decks.some(d => d?.src === 'precon' && String(d.name || '').trim().toLowerCase() === n);
  } catch { return false; }
}
/** Records a one-time "first" (deckBuilt, deckImported, upgradeApplied …) on this player's profile; no-op when already set. */
export async function recordFirst(key, storage = globalThis.localStorage) {
  const p = loadProfile(storage);
  if (p.firsts?.[key]) return p;
  p.firsts = { ...(p.firsts || {}), [key]: new Date().toISOString() };
  await persistReliable(p, storage);
  return p;
}
export async function recordDeckCreated(deck, storage = globalThis.localStorage) {
  const p = loadProfile(storage), id = deck?.id || deck?.name || crypto.randomUUID(), now = new Date().toISOString();
  p.decks[id] = { ...(p.decks[id] || {}), id, name: deck?.name || 'Untitled Deck', commander1: deck?.commander1 || '', commander2: deck?.commander2 || '', analytics: deck?.analytics ? structuredClone(deck.analytics) : p.decks[id]?.analytics || null, importMeta: deck?.importMeta ? structuredClone(deck.importMeta) : p.decks[id]?.importMeta || null, createdOrSavedAt: p.decks[id]?.createdOrSavedAt || now, updatedAt: deck?.updatedAt || now, source: deck?.importMeta?.source || 'deck-editor' };
  await persistReliable(p, storage);
  return p;
}
export async function recordDeckDeleted(id, storage = globalThis.localStorage) {
  const p = loadProfile(storage), deckId = String(id || '');
  if (deckId && p.decks?.[deckId])
    delete p.decks[deckId];
  if (p.account?.favoriteDeckId === deckId) {
    p.account.favoriteDeckId = '';
    p.account.updatedAt = new Date().toISOString();
  }
  await persistReliable(p, storage);
  return p;
}
export async function recordDeckSelection({ playerName, deckId = null, deckName = '', commander1 = '', commander2 = '', source = 'setup' } = {}, storage = globalThis.localStorage) { const p = loadProfile(storage), key = playerKey(playerName), name = cleanName(playerName); const row = p.players[key] || { name, games: 0, wins: 0, decks: {}, lastPlayedAt: null }; row.name = name; const did = deckId || deckName || [commander1, commander2].filter(Boolean).join(' + ') || 'unspecified'; row.decks[did] = { ...(row.decks[did] || {}), id: did, name: deckName || did, commander1, commander2, source, selections: (row.decks[did]?.selections || 0) + 1, lastSelectedAt: new Date().toISOString() }; p.players[key] = row; await persistReliable(p, storage); return p; }
export async function recordGame(game, localPlayerId = null, storage = globalThis.localStorage) {
  const p = loadProfile(storage);
  const completionId = game?.completionId || null;
  if (completionId && p.history?.some?.(h => h.completionId === completionId))
    return p;
  p.games++;
  const winnerId = game?.winner || game?.postGame?.winnerId || null;
  if (localPlayerId && winnerId === localPlayerId)
    p.wins++;
  // Only the awards this device's player earned count toward their profile.
  for (const a of game?.postGame?.awards || game?.awards || [])
    if (!localPlayerId || !a.playerId || a.playerId === localPlayerId)
      p.awards[a.label] = (p.awards[a.label] || 0) + 1;
  for (const gp of game?.players || []) {
    const key = playerKey(gp.displayName), row = p.players[key] || { name: cleanName(gp.displayName), games: 0, wins: 0, decks: {} };
    row.games = (row.games || 0) + 1;
    if (gp.playerId === winnerId)
      row.wins = (row.wins || 0) + 1;
    row.lastPlayedAt = new Date().toISOString();
    const commanders = (gp.commanders || []).map(c => game.cardDefinitions?.[c.cardId]?.name || c.card?.name).filter(Boolean);
    const did = gp.deck?.savedDeckId || gp.deck?.sourceId || gp.deck?.sourceName || commanders.join(' + ') || 'unspecified';
    row.decks = row.decks || {};
    row.decks[did] = { ...(row.decks[did] || {}), id: did, name: gp.deck?.sourceName || did, commander1: commanders[0] || '', commander2: commanders[1] || '', games: (row.decks[did]?.games || 0) + 1, wins: (row.decks[did]?.wins || 0) + (gp.playerId === winnerId ? 1 : 0), lastPlayedAt: row.lastPlayedAt };
    p.players[key] = row;
  }
  // Firsts and streaks for the achievements (achievements.js says which ones are computed and which are recorded here).
  const meta = game?.meta || {}, iso = new Date().toISOString(), mark = k => { p.firsts[k] = p.firsts[k] || iso; };
  const me = (game?.players || []).find(x => x.playerId === localPlayerId);
  if ((game?.players || []).length >= 4) mark('fourPlayer');
  if (game?.mode === 'table-tracker') mark('tracker');
  if (meta.online) mark('online');
  if (meta.hosted) mark('hosted');
  if (meta.judge) mark('judge');
  if (meta.precon) mark('precon');
  if (localPlayerId && !meta.judge) {
    if (winnerId === localPlayerId) {
      p.streaks.win = (p.streaks.win || 0) + 1;
      p.streaks.bestWin = Math.max(p.streaks.bestWin || 0, p.streaks.win);
      if (meta.winMethod === 'commander-damage') mark('winCommanderDamage');
      if (meta.winMethod === 'poison') mark('winPoison');
      if (meta.winMethod === 'alternate') mark('winAlternate');
      const did = me?.deck?.savedDeckId || me?.deck?.sourceId || me?.deck?.sourceName || (me?.commanders || []).map(c => c.card?.name).filter(Boolean).join(' + ');
      if (did) p.winDecks = [...new Set([...p.winDecks, did])];
      p.winColors = [...new Set([...p.winColors, ...(me?.colors || []).filter(c => 'WUBRG'.includes(c))])];
    }
    else
      p.streaks.win = 0;
  }
  p.playDays = [...new Set([...p.playDays, iso.slice(0, 10)])].sort().slice(-30);
  p.streaks.bestDays = Math.max(p.streaks.bestDays || 0, longestDayRun([...p.playDays, ...p.history.map(h => String(h.at || '').slice(0, 10))]));
  // Achievements are defined once, in achievements.js.
  p.milestones = [...new Set([...p.milestones, ...earnedLabels(p)])];
  const winner = (game?.players || []).find(x => x.playerId === winnerId);
  const completedAt = new Date().toISOString();
  p.history.unshift({
    at: completedAt,
    completionId,
    result: game?.result || (winnerId ? 'winner' : 'draw'),
    winnerId,
    winnerName: winner?.displayName || '',
    turnNumber: Number(game?.turnNumber || 0),
    mode: game?.mode || '',
    online: !!meta.online,
    awards: (game?.postGame?.awards || game?.awards || []).map(a => ({ label: a.label || '', playerId: a.playerId || '', playerName: (game?.players || []).find(x => x.playerId === a.playerId)?.displayName || '' })),
    players: (game?.players || []).map(x => {
      const commanders = (x.commanders || []).map(c => game.cardDefinitions?.[c.cardId]?.name || c.card?.name).filter(Boolean);
      return { name: x.displayName, playerId: x.playerId, life: Number(x.life || 0), deckId: x.deck?.savedDeckId || x.deck?.sourceId || '', deckName: x.deck?.sourceName || '', commanders };
    })
  });
  p.history = p.history.slice(0, 50);
  await persistReliable(p, storage);
  return p;
}
