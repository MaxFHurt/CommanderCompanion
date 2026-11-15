// The reward system shared by playmats and life dice (no imports). The first entry of each list is free. Every other one is
// DRAWN AT RANDOM (owner, 15 Nov) from what the player has not unlocked yet, when a "slot" is earned:
//   - achievements: the n-th achievement earned (1 achievement = 1 level) is a slot; odd n = a playmat, even n = a die
//     (mat, die, mat, die …); slot ids a1, a2, a3 …
//   - games: a playmat every GAMES_PER_MAT games played (3, 6, 9 …); wins: a die every WINS_PER_DIE wins (2, 4, 6 …), for as long
//     as anything of that kind is still locked. Slot ids g<games> / w<wins> (the count it was earned at).
// A draw is stored on the profile (profile.rewardDraws: { id: "mat:ember", slot: "a1", at: ISO date }) and never changes: it
// is made once, when the slot is earned (settleRewards in data/profile.js). Draws never repeat (the pool is what is still
// locked). If a pool is empty the slot gives the other kind; if both are empty, nothing (it is tried again if new ones are added).
// Devices merge by union (mergeDraws): a reward is never taken away.

export const GAMES_PER_MAT = 3;     // a random locked playmat every 3 games played
export const WINS_PER_DIE = 2;      // a random locked die every 2 wins
export const ROUTE_TEXT = 'Earned at random from achievements and games/wins';

/** What kind (mat or die) the n-th achievement's slot is: 1 mat, 2 die, 3 mat … */
export function slotKind(n) {
  return n % 2 ? 'mat' : 'die';
}

/** The achievement slots a profile has earned so far: a1 (mat), a2 (die), a3 (mat) … */
export function earnedSlots(level) {
  const out = [];
  for (let n = 1; n <= level; n++) out.push({ slot: `a${n}`, kind: slotKind(n) });
  return out;
}

/** The ids ("mat:ember") of every drawn reward. */
export function drawnIds(profile) {
  return new Set((profile?.rewardDraws || []).map(d => d.id));
}

/** How a locked entry unlocks, for the picker. Null for the free first entry. */
export function rewardFor(kind, entry, index) {
  if (index <= 0) return null;
  return { kind, id: entry.id, description: ROUTE_TEXT };
}

/** Whether the profile has the entry at `index` (the free first one always, the others once drawn). */
export function isUnlocked(kind, id, index, profile) {
  return index <= 0 || drawnIds(profile).has(`${kind}:${id}`);
}

/** Draws a reward for every earned slot that has none. `pools` = { mat: [ids…], die: [ids…] } of the non-free entries.
 *  Mutates profile.rewardDraws; returns the new draws. `rand` returns [0,1). */
export function settleRewards(profile, level, pools, rand = Math.random, now = new Date().toISOString()) {
  profile.rewardDraws = Array.isArray(profile.rewardDraws) ? profile.rewardDraws : [];
  const owned = drawnIds(profile), filled = new Set(profile.rewardDraws.map(d => d.slot));
  const added = [];
  const left = k => pools[k].filter(id => !owned.has(`${k}:${id}`));
  const draw = (slot, kind, routeOnly = false) => {
    if (filled.has(slot)) return;
    for (const k of routeOnly ? [kind] : [kind, kind === 'mat' ? 'die' : 'mat']) {
      const open = left(k);
      if (!open.length) continue;
      const d = { id: `${k}:${open[Math.floor(rand() * open.length) % open.length]}`, slot, at: now };
      profile.rewardDraws.push(d); owned.add(d.id); filled.add(slot); added.push(d);
      return;
    }
  };
  for (const { slot, kind } of earnedSlots(level)) draw(slot, kind);
  for (let k = 1; k <= Math.floor(Number(profile.games || 0) / GAMES_PER_MAT); k++) draw(`g${k * GAMES_PER_MAT}`, 'mat', true);
  for (let k = 1; k <= Math.floor(Number(profile.wins || 0) / WINS_PER_DIE); k++) draw(`w${k * WINS_PER_DIE}`, 'die', true);
  return added;
}

/** How many more games / wins until the next games-route playmat / wins-route die ({ mat, die }; null when none is left to win). */
export function nextDue(profile, pools) {
  const out = {};
  for (const [k, stat, per] of [['mat', 'games', GAMES_PER_MAT], ['die', 'wins', WINS_PER_DIE]]) {
    const left = pools[k].some(id => !drawnIds(profile).has(`${k}:${id}`));
    out[k] = left ? per - (Number(profile?.[stat] || 0) % per) : null;
  }
  return out;
}

/** Union of two draw lists (devices that raced): every reward from either side stays; the same reward keeps its earliest record. */
export function mergeDraws(a = [], b = []) {
  const byId = new Map();
  for (const d of [...a, ...b]) {
    if (!d || typeof d.id !== 'string') continue;
    const have = byId.get(d.id);
    if (!have || String(d.at || '') < String(have.at || '')) byId.set(d.id, { id: d.id, slot: d.slot || '', at: d.at || '' });
  }
  return [...byId.values()].sort((x, y) => String(x.at).localeCompare(String(y.at)) || x.id.localeCompare(y.id));
}

/** What the next achievement earns, for the Profile screen: "a playmat" or "a die". */
export function nextAchievementKind(level) {
  return slotKind(level + 1);
}
