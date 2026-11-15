// The reward ladder shared by playmats and life dice (no imports). The first entry of each list is free. After that
// there are two routes, and whichever comes first unlocks the entry (owner, 15 Nov):
//   1. play: the k-th locked mat at 3k games played, the k-th locked die at 3k wins;
//   2. level: 1 achievement earned = 1 level; a reward every 3 levels, alternating mat, die, mat, die:
//      mat k at level 3(2k-1) (3, 9, 15 …), die k at level 3(2k) (6, 12, 18 …).
// k = the entry's index in its list (index 0 is the free one).

export const REWARD_STEP = 3;

/** Games (mats) or wins (dice) needed for the entry at `index`; 0 for the free first entry. */
export function unlockAt(index) {
  return index <= 0 ? 0 : index * REWARD_STEP;
}

/** The achievement level that unlocks the entry at `index` (0 for the free one). */
export function levelFor(kind, index) {
  if (index <= 0) return 0;
  return kind === 'mat' ? REWARD_STEP * (2 * index - 1) : REWARD_STEP * 2 * index;
}

/** How a locked entry unlocks, for the picker. Null for the free first entry. */
export function rewardFor(kind, entry, index) {
  const n = unlockAt(index);
  if (!n) return null;
  const games = kind === 'mat', level = levelFor(kind, index);
  return {
    kind, id: entry.id, count: n, level, stat: games ? 'games' : 'wins',
    description: `${games ? 'Play' : 'Win'} ${n} games, or reach level ${level}`
  };
}

/** Whether a profile (with its current achievement level) has the entry at `index`. */
export function isUnlocked(kind, index, profile, level = 0) {
  if (index <= 0) return true;
  const stat = Number(profile?.[kind === 'mat' ? 'games' : 'wins'] || 0);
  return stat >= unlockAt(index) || Number(level) >= levelFor(kind, index);
}
