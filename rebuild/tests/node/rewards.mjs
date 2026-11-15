// Achievements (firsts and success streaks), the level -> reward ladder, the games/wins ladder, the old-unlock check and the pop-up list.
import { MATS } from '../../src/data/playmats.js';
import { DICE } from '../../src/data/dice.js';
import { ACHIEVEMENTS, earnedAchievements, achievementLevel, statsOf, longestDayRun } from '../../src/data/achievements.js';
import { rewardFor, unlockAt, levelFor, isUnlocked } from '../../src/data/rewards.js';
import { matUnlockPlan, unlockedMats } from '../../src/data/playmats.js';
import { diceUnlockPlan } from '../../src/data/dice.js';
import { recordGame, recordFirst, loadProfile, newRewards, markRewardsShown, unlockedRewardKeys, initProfileStore } from '../../src/data/profile.js';

let bad = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : ' ' + extra}`); if (!ok) bad++; };
const store = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m }; };
const has = (p, id) => earnedAchievements(p).some(a => a.id === id);

// --- games/wins ladder
check('k-th locked mat at 3k games, die at 3k wins', MATS.every((m, i) => unlockAt(i) === 3 * i) && isUnlocked('mat', 3, { games: 9 }) && !isUnlocked('mat', 3, { games: 8 }) && isUnlocked('die', 2, { wins: 6 }) && !isUnlocked('die', 2, { wins: 5 }));
// --- level ladder: mat k at 3(2k-1), die k at 6k
check('level ladder alternates mat, die, mat, die', [1, 2, 3].map(k => levelFor('mat', k)).join() === '3,9,15' && [1, 2, 3].map(k => levelFor('die', k)).join() === '6,12,18');
check('either route unlocks', isUnlocked('mat', 3, { games: 0 }, 15) && !isUnlocked('mat', 3, { games: 0 }, 14) && isUnlocked('die', 2, { wins: 0 }, 12) && !isUnlocked('die', 2, { wins: 0 }, 11));
check('picker text names both routes', rewardFor('mat', MATS[3], 3).description === 'Play 9 games, or reach level 15');
// --- a 9th mat entry gets a 24-games / level 45 unlock with no other change
const ninth = rewardFor('mat', { id: 'new' }, 8);
check('9th mat: 24 games or level 45', ninth.count === 24 && ninth.level === 45 && isUnlocked('mat', 8, { games: 24 }) && !isUnlocked('mat', 8, { games: 23 }, 44) && isUnlocked('mat', 8, {}, 45));
// --- old unlocks are never lost: old rule was 5k games / 5k wins
let lost = 0;
for (let g = 0; g <= 60; g++) for (let i = 1; i < MATS.length; i++) if (g >= 5 * i && !isUnlocked('mat', i, { games: g, wins: g })) lost++;
for (let w = 0; w <= 60; w++) for (let i = 1; i < DICE.length; i++) if (w >= 5 * i && !isUnlocked('die', i, { games: w, wins: w })) lost++;
check('everything the old 5-step ladder unlocked stays unlocked', lost === 0, lost);

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
const open = matUnlockPlan(p).filter(r => r.via && r.unlocked).length;
check('level 3 opens the first mat (and games >= 3 does too)', unlockedMats(p).some(m => m.id === MATS[1].id));
const fresh = newRewards(p);
check('new rewards listed until marked shown', fresh.length > 0 && fresh.some(r => r.kind === 'mat' && r.id === MATS[1].id));
p = await markRewardsShown(fresh.map(r => `${r.kind}:${r.id}`), st);
check('marking shown empties the list and survives reload', newRewards(p).length === 0 && newRewards(loadProfile(st)).length === 0);

// --- grandfathering: a profile saved before this build counts earned rewards as shown (no flood)
const old = store();
old.setItem('ccv07-profile', JSON.stringify({ version: 6, games: 12, wins: 7, awards: {}, milestones: [], players: {}, decks: {}, history: [] }));
await initProfileStore(old);
const lp = loadProfile(old);
check('old profile: earned rewards already marked shown, none new', unlockedRewardKeys(lp).length >= 3 && newRewards(lp).length === 0, JSON.stringify(newRewards(lp)));
const next = { ...lp, games: 30 };
check('a later unlock does appear', newRewards(next).length > 0);
process.exit(bad ? 1 : 0);
