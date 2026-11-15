// Reward ladder: the k-th locked mat unlocks at 3k games, the k-th locked die at 3k wins; new entries need no other change.
import { MATS } from '../../src/data/playmats.js';
import { DICE } from '../../src/data/dice.js';
import { ACHIEVEMENTS } from '../../src/data/achievements.js';
import { rewardFor, unlockAt, isUnlocked } from '../../src/data/rewards.js';

let bad = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : ' ' + extra}`); if (!ok) bad++; };

check('mats: first free, k-th at 3k games', MATS.every((m, i) => unlockAt(i) === 3 * i) && rewardFor('mat', MATS[0], 0) === null);
for (const [kind, list, stat] of [['mat', MATS, 'games'], ['die', DICE, 'wins']]) {
  list.slice(1).forEach((e, k) => {
    const a = ACHIEVEMENTS.find(x => x.reward?.[kind] === e.id);
    const n = 3 * (k + 1);
    check(`${kind} ${e.id} unlocks at ${n} ${stat}`, !!a && a.test({ games: n, wins: n }) && !a.test({ games: n - 1, wins: n - 1 }), a?.label);
  });
}
check('no-reward achievements kept', ['first-game', 'first-win', 'commander-veteran', 'centurion'].every(id => ACHIEVEMENTS.some(a => a.id === id && !a.reward)));
check('old five-step reward ids gone', !ACHIEVEMENTS.some(a => ['five-games', 'five-wins', 'champion'].includes(a.id)));
check('achievement ids are unique', new Set(ACHIEVEMENTS.map(a => a.id)).size === ACHIEVEMENTS.length);

// A 9th mat entry (index 8) gets a 24-games unlock with no other change.
const ninth = { id: 'new-mat', name: 'New Mat' };
const a = rewardFor('mat', ninth, 8);
check('9th mat unlocks at 24 games', a.label === '24 Games' && a.reward.mat === 'new-mat' && a.test({ games: 24, wins: 0 }) && !a.test({ games: 23, wins: 99 }));
check('9th mat open at 24 games, locked at 23', isUnlocked('mat', 8, { games: 24 }) && !isUnlocked('mat', 8, { games: 23 }));
const ninthDie = rewardFor('die', ninth, 8);
check('9th die unlocks at 24 wins', ninthDie.label === '24 Wins' && ninthDie.test({ games: 0, wins: 24 }) && !ninthDie.test({ games: 99, wins: 23 }));
process.exit(bad ? 1 : 0);
