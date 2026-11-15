// Every achievement in one list. To add or retune one, edit a line here — the profile screen,
// game history and playmat slots all read from this table.
//
//   test(stats)  receives { games, wins } from the player profile
//   reward       { mat: '<id>' } or { die: '<id>' }: generated, not written by hand. Every mat in data/playmats.js and every
//                die in data/dice.js after the first (free) one gets a reward achievement: the k-th at 3k games (mats) or
//                3k wins (dice), via data/rewards.js. New mats/dice need no change here.
//   Stored ids: nothing stores achievement ids; earned ones are computed from games/wins, and profile.milestones keeps
//   labels only (unknown ones are just text). Removed ids (five-games …) therefore need no migration.

import { MATS } from './playmats.js';
import { DICE } from './dice.js';
import { rewardFor } from './rewards.js';

const REWARDS = [
  ...MATS.map((m, i) => rewardFor('mat', m, i)),
  ...DICE.map((d, i) => rewardFor('die', d, i))
].filter(Boolean).sort((a, b) => a.threshold - b.threshold);

export const ACHIEVEMENTS = [
  { id: 'first-game', label: 'First Game', description: 'Finish your first game.', test: s => s.games >= 1 },
  { id: 'first-win', label: 'First Win', description: 'Win a game.', test: s => s.wins >= 1 },
  ...REWARDS,
  { id: 'commander-veteran', label: 'Commander Veteran', description: 'Play 50 games.', test: s => s.games >= 50 },
  { id: 'centurion', label: 'Centurion', description: 'Play 100 games.', test: s => s.games >= 100 }
];

function statsOf(profile) {
  return { games: Number(profile?.games || 0), wins: Number(profile?.wins || 0) };
}

export function earnedAchievements(profile) {
  const stats = statsOf(profile);
  return ACHIEVEMENTS.filter(a => a.test(stats));
}

export function earnedLabels(profile) {
  return earnedAchievements(profile).map(a => a.label);
}

/** Ids of the built-in mats / dice this profile has earned (Amethyst and match-playmat are always free). */
export function unlockedRewardIds(profile, kind) {
  return earnedAchievements(profile).map(a => a.reward?.[kind]).filter(Boolean);
}

/** The achievement that unlocks this mat or die (kind 'mat' | 'die'), or null for the free ones. */
export function achievementFor(kind, id) {
  return ACHIEVEMENTS.find(a => a.reward?.[kind] === id) || null;
}
