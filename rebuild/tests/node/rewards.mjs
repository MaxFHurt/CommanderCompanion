// Achievements (firsts and success streaks), the level -> reward ladder, the games/wins ladder, the old-unlock check and the pop-up list.
import { MATS } from '../../src/data/playmats.js';
import { DICE } from '../../src/data/dice.js';
import { ACHIEVEMENTS, earnedAchievements, achievementLevel, statsOf, longestDayRun } from '../../src/data/achievements.js';
import { rewardFor, isUnlocked, settleRewards, mergeDraws, nextDue, earnedSlots, slotKind } from '../../src/data/rewards.js';
import { matUnlockPlan, unlockedMats } from '../../src/data/playmats.js';
import { diceUnlockPlan } from '../../src/data/dice.js';
import { recordGame, recordFirst, loadProfile, settleProfileRewards, newRewards, markRewardsShown, unlockedRewardKeys, initProfileStore } from '../../src/data/profile.js';

let bad = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : ' ' + extra}`); if (!ok) bad++; };
const store = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m }; };
const has = (p, id) => earnedAchievements(p).some(a => a.id === id);

// --- random draws: slots, pools, stability, union, empty pools
const pools = { mat: MATS.slice(1).map(m => m.id), die: DICE.slice(1).map(d => d.id) };
const seeded = seed => () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
check('slots: achievements alternate mat, die, mat', slotKind(1) === 'mat' && slotKind(2) === 'die' && slotKind(3) === 'mat' && earnedSlots(3).map(x => x.slot + ':' + x.kind).join() === 'a1:mat,a2:die,a3:mat');
check('totals: 33 mats, 33 dice, 25 + 8 each; art dice and mats follow the handoff order', MATS.length === 33 && DICE.length === 33 && MATS[8].id === 'cedar-moon-archer' && MATS[32].id === 'emberroot-caldera' && DICE[8].id === 'peacock-cats-eye' && DICE[32].id === 'astral-marrow');
check('every reward mat has a palette (one of the first eight) and art', MATS.slice(8).every(m => MATS.slice(0, 8).some(b => b.id === m.palette) && m.image && m.imagePhone && m.thumb) && MATS.slice(0, 8).every(m => m.palette === m.id));
check('picker text: random, no fixed threshold', rewardFor('mat', MATS[3], 3).description === 'Earned at random from achievements and games/wins' && rewardFor('die', DICE[1], 1).description.includes('random') && rewardFor('mat', MATS[0], 0) === null);
{
  const prof = { games: 0, wins: 0, rewardDraws: [] };
  check('nothing earned, nothing drawn', settleRewards(prof, 0, pools).length === 0);
  prof.games = 9; prof.wins = 6;
  const first = settleRewards(prof, 4, pools, seeded(1));
  check('level 4 + 9 games + 6 wins = 4 + 3 + 3 draws', first.length === 10, first.length);
  check('achievement slots follow mat, die, mat, die', first.slice(0, 4).map(d => d.id.split(':')[0]).join() === 'mat,die,mat,die' && first.slice(0, 4).map(d => d.slot).join() === 'a1,a2,a3,a4');
  check('draws never repeat', new Set(prof.rewardDraws.map(d => d.id)).size === prof.rewardDraws.length);
  const snapshot = JSON.stringify(prof.rewardDraws);
  check('settling again changes nothing (stored draws are stable)', settleRewards(prof, 4, pools, seeded(99)).length === 0 && JSON.stringify(prof.rewardDraws) === snapshot);
  check('a new slot draws only what is still locked', (() => { const have = new Set(prof.rewardDraws.map(d => d.id)); const d = settleRewards(prof, 5, pools, seeded(7))[0]; return d && !have.has(d.id) && d.slot === 'a5' && d.id.startsWith('mat:'); })());
  check('isUnlocked follows the draws', prof.rewardDraws.every(d => { const [k, id] = d.id.split(':'); const list = k === 'mat' ? MATS : DICE; return isUnlocked(k, id, list.findIndex(x => x.id === id), prof); }) && isUnlocked('mat', 'amethyst', 0, {}) && !isUnlocked('mat', 'ember', 3, { rewardDraws: [] }));
  check('games/wins draws sit on g3, g6, g9 / w2, w4, w6', ['g3', 'g6', 'g9', 'w2', 'w4', 'w6'].every(sl => prof.rewardDraws.some(d => d.slot === sl)));
  // random really varies and covers the pool
  const seen = new Set();
  for (let sd = 1; sd <= 40; sd++) { const q = { games: 0, wins: 0, rewardDraws: [] }; seen.add(settleRewards(q, 1, pools, seeded(sd))[0].id); }
  check('different seeds draw different mats', seen.size > 5, seen.size);
  // empty pool: mats all owned -> a mat slot gives a die; both empty -> nothing
  const full = { games: 0, wins: 0, rewardDraws: pools.mat.map((id, i) => ({ id: `mat:${id}`, slot: `x${i}` })) };
  const fb = settleRewards(full, 1, pools, seeded(3));
  check('empty mat pool: the slot gives a die instead', fb.length === 1 && fb[0].id.startsWith('die:') && fb[0].slot === 'a1');
  const all = { games: 0, wins: 0, rewardDraws: [...pools.mat.map((id, i) => ({ id: `mat:${id}`, slot: `x${i}` })), ...pools.die.map((id, i) => ({ id: `die:${id}`, slot: `y${i}` }))] };
  check('both pools empty: nothing drawn', settleRewards(all, 5, pools).length === 0);
  // union
  const A = [{ id: 'mat:ember', slot: 'a1', at: '2026-11-15T10:00:00Z' }, { id: 'die:gold', slot: 'a2', at: '2026-11-15T11:00:00Z' }];
  const B = [{ id: 'mat:frost', slot: 'a1', at: '2026-11-15T10:30:00Z' }, { id: 'die:gold', slot: 'a2', at: '2026-11-15T09:00:00Z' }];
  const U = mergeDraws(A, B);
  check('merge keeps every reward from both devices, none twice, earliest record', U.length === 3 && ['mat:ember', 'mat:frost', 'die:gold'].every(id => U.some(d => d.id === id)) && U.find(d => d.id === 'die:gold').at === '2026-11-15T09:00:00Z' && mergeDraws(U, A).length === 3);
}

// --- the games/wins route: a random locked mat every 3 games, a random locked die every 2 wins, fixed spacing
{
  const q = { games: 0, wins: 0, rewardDraws: [] }, at = { g: [], w: [] }, order = [];
  for (let n = 1; n <= 200; n++) {
    q.games = n; q.wins = n;
    for (const d of settleRewards(q, 0, pools, seeded(n))) { at[d.slot[0]].push(Number(d.slot.slice(1))); order.push(d.id); }
  }
  check('mats at 3, 6, 9 … games (32 of them), dice at 2, 4, 6 … wins (32), then it stops', at.g.join() === Array.from({ length: 32 }, (_, i) => 3 * (i + 1)).join() && at.w.join() === Array.from({ length: 32 }, (_, i) => 2 * (i + 1)).join());
  check('every reward drawn once, none repeated, all 64 out', new Set(order).size === 64 && q.rewardDraws.length === 64);
  const ord = i => order.filter(x => x.startsWith('mat:')).slice(0, 5).join();
  const q2 = { games: 15, wins: 0, rewardDraws: [] }; settleRewards(q2, 0, pools, seeded(777));
  check('the order is random (differs between seeds)', q2.rewardDraws.map(d => d.id).join() !== q.rewardDraws.filter(d => d.slot[0] === 'g').slice(0, 5).map(d => d.id).join());
  const one = { games: 3, wins: 2, rewardDraws: [] };
  check('3 games = one mat, 2 wins = one die, 5 games / 3 wins add nothing more', settleRewards(one, 0, pools, seeded(1)).length === 2 && (one.games = 5, one.wins = 3, settleRewards(one, 0, pools, seeded(2)).length === 0));
  check('next-due counts for the picker', nextDue({ games: 7, wins: 5, rewardDraws: [] }, pools).mat === 2 && nextDue({ games: 7, wins: 5, rewardDraws: [] }, pools).die === 1 && nextDue({ games: 3, wins: 0, rewardDraws: [] }, pools).mat === 3 && nextDue({ games: 0, wins: 0, rewardDraws: pools.mat.map(id => ({ id: `mat:${id}` })) }, pools).mat === null);
  const mine = { games: 3, wins: 0, rewardDraws: pools.mat.map((id, i) => ({ id: `mat:${id}`, slot: `x${i}` })) };
  check('empty mat pool: the games route draws nothing (and keeps drawing dice by wins)', settleRewards(mine, 0, pools, seeded(1)).length === 0 && (mine.wins = 2, settleRewards(mine, 0, pools, seeded(1)).length === 1));
}

// --- achievement list shape
check('ids unique, 14 firsts + streaks + milestones', new Set(ACHIEVEMENTS.map(a => a.id)).size === ACHIEVEMENTS.length && ACHIEVEMENTS.length === 29);

// --- each trigger, from computed history or from recorded events
const base = () => ({ games: 0, wins: 0, history: [], firsts: {}, streaks: {}, winDecks: [], winColors: [], playDays: [] });
check('first game / first win', has({ ...base(), games: 1 }, 'first-game') && !has({ ...base(), games: 1 }, 'first-win') && has({ ...base(), games: 1, wins: 1 }, 'first-win'));
check('4-player game computed from history', has({ ...base(), history: [{ players: [1, 2, 3, 4], at: '2026-01-01' }] }, 'first-four-player') && !has({ ...base(), history: [{ players: [1, 2, 3] }] }, 'first-four-player'));
check('tracker game computed from history', has({ ...base(), history: [{ mode: 'table-tracker' }] }, 'first-tracker'));
for (const [id, key] of [['first-online', 'online'], ['first-hosted', 'hosted'], ['first-judge', 'judge'], ['first-commander-win', 'winCommanderDamage'], ['first-poison-win', 'winPoison'], ['first-alt-win', 'winAlternate'], ['first-deck-built', 'deckBuilt'], ['first-deck-imported', 'deckImported'], ['first-upgrade', 'upgradeApplied'], ['first-precon', 'precon']])
  check(`${id} from firsts.${key}`, has({ ...base(), firsts: { [key]: 'x' } }, id) && !has(base(), id));
check('win streaks 2 / 3 / 5', ['2', '3', '5'].every(n => has({ ...base(), streaks: { bestWin: +n } }, `win-streak-${n}`)) && !has({ ...base(), streaks: { bestWin: 4 } }, 'win-streak-5'));
check('win with 3 / 5 different decks', has({ ...base(), winDecks: ['a', 'b', 'c'] }, 'win-decks-3') && !has({ ...base(), winDecks: ['a', 'a', 'b'] }, 'win-decks-3') && has({ ...base(), winDecks: 'abcde'.split('') }, 'win-decks-5'));
check('win with each colour', 'WUBRG'.split('').every(c => has({ ...base(), winColors: [c] }, `win-color-${c.toLowerCase()}`)) && !has({ ...base(), winColors: ['W'] }, 'win-color-u'));
check('days in a row: 3 and 7 (history dates count)', longestDayRun(['2026-02-28', '2026-03-01', '2026-03-02']) === 3 && has({ ...base(), history: ['2026-05-01', '2026-05-02', '2026-05-03'].map(at => ({ at })) }, 'play-days-3') && !has({ ...base(), playDays: ['2026-05-01', '2026-05-03', '2026-05-04'] }, 'play-days-3') && has({ ...base(), streaks: { bestDays: 7 } }, 'play-days-7'));
check('10 / 50 / 100 games', [['table-regular', 10], ['commander-veteran', 50], ['centurion', 100]].every(([id, n]) => has({ ...base(), games: n }, id) && !has({ ...base(), games: n - 1 }, id)));

// --- recordGame writes the recorded ones
const st = store();
await initProfileStore(st);
const seat = (id, name, colors = [], deck = name) => ({ playerId: id, displayName: name, life: 40, colors, commanders: [{ card: { name } }], deck: { sourceName: deck } });
let n = 0;
const play = (winner, over = {}) => recordGame({ completionId: `g${++n}`, winner, mode: 'fully-tracked', players: [seat('a', 'Me', ['W', 'G'], 'Deck1'), seat('b', 'B'), ...(over.four ? [seat('c', 'C'), seat('d', 'D')] : [])], meta: over.meta || {} }, 'a', st);
let p = await play('a', { four: true, meta: { online: true, hosted: true, winMethod: 'poison', precon: true } });
check('recordGame sets firsts (4p, online, hosted, poison win, precon)', ['fourPlayer', 'online', 'hosted', 'winPoison', 'precon'].every(k => p.firsts[k]) && !p.firsts.winCommanderDamage && !p.firsts.judge);
check('win colours and decks recorded', p.winColors.sort().join('') === 'GW' && p.winDecks.join() === 'Deck1' && p.streaks.win === 1);
p = await play('a', { meta: { winMethod: 'commander-damage' } });
p = await play('a', { meta: { winMethod: 'alternate' } });
check('streak of 3 and method firsts', p.streaks.bestWin === 3 && p.firsts.winCommanderDamage && p.firsts.winAlternate && has(p, 'win-streak-3'));
p = await play('b');
check('a loss resets the streak, best stays', p.streaks.win === 0 && p.streaks.bestWin === 3);
p = await play('a', { meta: { judge: true } });
check('judging a game sets judge and does not count a win/streak', p.firsts.judge && p.streaks.win === 0);
p = await recordFirst('deckBuilt', st);
check('recordFirst (Deck Builder) sets once', !!p.firsts.deckBuilt && has(p, 'first-deck-built'));

// --- level -> reward, pop-up list, "shown" memory
const lv = achievementLevel(p);
check('level = achievements earned', lv === earnedAchievements(p).length && lv >= 3);
check('33 dice: 8 mat dice then the 25 art dice in options-additions.json order, each with art', DICE.length === 33 && DICE[8].id === 'peacock-cats-eye' && DICE[32].id === 'astral-marrow' && DICE.slice(8).every(d => /^assets\/skin\/dice\/[a-z-]+\.webp$/.test(d.art)));
check('recordGame drew every earned slot (a mat and a die from the first two achievements, a mat from the 3rd)', p.rewardDraws.filter(d => /^a\d+$/.test(d.slot)).length === lv && p.rewardDraws.find(d => d.slot === 'a1').id.startsWith('mat:') && p.rewardDraws.find(d => d.slot === 'a2').id.startsWith('die:'));
const stored = JSON.stringify(p.rewardDraws);
check('stored draws survive a reload unchanged', JSON.stringify((await initProfileStore(st), loadProfile(st)).rewardDraws) === stored);
const fresh = newRewards(p);
check('new rewards listed until marked shown', fresh.length === p.rewardDraws.length && fresh.length >= 3);
p = await markRewardsShown(fresh.map(r => `${r.kind}:${r.id}`), st);
check('marking shown empties the list and survives reload', newRewards(p).length === 0 && newRewards(loadProfile(st)).length === 0);

// --- grandfathering: a profile saved before this build keeps what its games and wins unlocked (as stored draws), counted as shown
const old = store();
old.setItem('ccv07-profile', JSON.stringify({ version: 6, games: 12, wins: 7, awards: {}, milestones: [], players: {}, decks: {}, history: [] }));
await initProfileStore(old);
const lp = loadProfile(old);
const keep = ['mat:dark-alley', 'mat:night-flight', 'mat:ember', 'mat:frost', 'die:night-flight', 'die:dark-alley', 'die:ember'];
check('old profile: 12 games and 7 wins keep four mats and three dice', keep.every(k => lp.rewardDraws.some(d => d.id === k)) && lp.rewardsShown.length >= 7, JSON.stringify(lp.rewardDraws.map(d => d.id)));
check('old profile: those are not announced again; only the new achievement draws are', newRewards(lp).every(r => !keep.includes(`${r.kind}:${r.id}`)) && newRewards(lp).length === lp.rewardDraws.length - keep.length && newRewards(lp).length >= 3, JSON.stringify(newRewards(lp)));
const later = loadProfile(old); later.games = 30; settleProfileRewards(later, seeded(5));
check('a later unlock does appear', newRewards(later).length > newRewards(lp).length);
process.exit(bad ? 1 : 0);
