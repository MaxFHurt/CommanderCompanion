// Every achievement in one list. To add or retune one, edit a line here — the profile screen,
// game history and playmat slots all read from this table.
//
//   test(stats)  receives { games, wins } from the player profile
//   reward       optional; { mat: '<id>' } or { die: '<id>' }: the built-in playmat / life die this unlocks (mats and dice alternate,
//                in the order of data/playmats.js and data/dice.js; Amethyst mat, Amethyst die and match-playmat are free)

export const ACHIEVEMENTS = [
  { id: 'first-game', label: 'First Game', description: 'Finish your first game.', test: s => s.games >= 1 },
  { id: 'first-win', label: 'First Win', description: 'Win a game.', test: s => s.wins >= 1 },
  { id: 'five-games', label: 'Five Games', description: 'Play 5 games.', test: s => s.games >= 5, reward: { mat: 'dark-alley' } },
  { id: 'five-wins', label: 'Five Wins', description: 'Win 5 games.', test: s => s.wins >= 5, reward: { die: 'night-flight' } },
  { id: 'table-regular', label: 'Table Regular', description: 'Play 10 games.', test: s => s.games >= 10, reward: { mat: 'night-flight' } },
  { id: 'ten-wins', label: 'Ten Wins', description: 'Win 10 games.', test: s => s.wins >= 10, reward: { die: 'dark-alley' } },
  { id: 'fifteen-games', label: 'Fifteen Games', description: 'Play 15 games.', test: s => s.games >= 15, reward: { mat: 'ember' } },
  { id: 'fifteen-wins', label: 'Fifteen Wins', description: 'Win 15 games.', test: s => s.wins >= 15, reward: { die: 'ember' } },
  { id: 'twenty-games', label: 'Twenty Games', description: 'Play 20 games.', test: s => s.games >= 20, reward: { mat: 'frost' } },
  { id: 'twenty-wins', label: 'Twenty Wins', description: 'Win 20 games.', test: s => s.wins >= 20, reward: { die: 'frost' } },
  { id: 'quarter-century', label: 'Quarter Century', description: 'Play 25 games.', test: s => s.games >= 25, reward: { mat: 'gold' } },
  { id: 'champion', label: 'Champion', description: 'Win 25 games.', test: s => s.wins >= 25, reward: { die: 'gold' } },
  { id: 'thirty-games', label: 'Thirty Games', description: 'Play 30 games.', test: s => s.games >= 30, reward: { mat: 'forge' } },
  { id: 'thirty-wins', label: 'Thirty Wins', description: 'Win 30 games.', test: s => s.wins >= 30, reward: { die: 'forge' } },
  { id: 'thirty-five-games', label: 'Thirty-Five Games', description: 'Play 35 games.', test: s => s.games >= 35, reward: { mat: 'emerald' } },
  { id: 'thirty-five-wins', label: 'Thirty-Five Wins', description: 'Win 35 games.', test: s => s.wins >= 35, reward: { die: 'emerald' } },
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
