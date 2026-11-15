// The reward ladder shared by playmats and life dice (no imports, so both data files and achievements.js can use it).
// Owner (15 Nov): every 3 levels a new reward. The first entry of each list is free; the k-th locked entry
// (k = 1, 2, 3 …) unlocks at 3k games (mats) or 3k wins (dice), in the order the list is written.

export const REWARD_STEP = 3;

/** Games (mats) or wins (dice) needed for the entry at `index` in its list; 0 for the free first entry. */
export function unlockAt(index) {
  return index <= 0 ? 0 : index * REWARD_STEP;
}

/** The achievement-shaped row that unlocks entry `index` of a list: kind 'mat' (games) or 'die' (wins). Null for the free one. */
export function rewardFor(kind, entry, index) {
  const n = unlockAt(index);
  if (!n) return null;
  const games = kind === 'mat';
  return {
    id: `${kind}-${n}-${games ? 'games' : 'wins'}`,
    label: `${n} ${games ? 'Games' : 'Wins'}`,
    description: games ? `Play ${n} games.` : `Win ${n} games.`,
    test: s => (games ? s.games : s.wins) >= n,
    reward: { [kind]: entry.id },
    threshold: n
  };
}

/** Whether a profile has the entry at `index`. */
export function isUnlocked(kind, index, profile) {
  const n = unlockAt(index);
  return Number(profile?.[kind === 'mat' ? 'games' : 'wins'] || 0) >= n;
}
