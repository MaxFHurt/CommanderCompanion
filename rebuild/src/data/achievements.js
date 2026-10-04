// Every achievement in one list. To add or retune one, edit a line here — the profile screen,
// game history and playmat slots all read from this table.
//
//   test(stats)  receives { games, wins } from the player profile
//   reward       optional; { matSlot: 1 } unlocks one more playmat slot

export const ACHIEVEMENTS = [
  { id: 'first-game', label: 'First Game', description: 'Finish your first game.', test: s => s.games >= 1 },
  { id: 'first-win', label: 'First Win', description: 'Win a game.', test: s => s.wins >= 1 },
  { id: 'table-regular', label: 'Table Regular', description: 'Play 10 games.', test: s => s.games >= 10, reward: { matSlot: 1 } },
  { id: 'ten-wins', label: 'Ten Wins', description: 'Win 10 games.', test: s => s.wins >= 10, reward: { matSlot: 1 } },
  { id: 'commander-veteran', label: 'Commander Veteran', description: 'Play 50 games.', test: s => s.games >= 50, reward: { matSlot: 1 } },
  { id: 'champion', label: 'Champion', description: 'Win 25 games.', test: s => s.wins >= 25, reward: { matSlot: 1 } },
  { id: 'centurion', label: 'Centurion', description: 'Play 100 games.', test: s => s.games >= 100, reward: { matSlot: 1 } }
];

/** Playmat slots every profile starts with. */
export const BASE_MAT_SLOTS = 1;

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

/** How many playmat slots this profile has unlocked. */
export function unlockedMatSlots(profile) {
  return BASE_MAT_SLOTS + earnedAchievements(profile).reduce((n, a) => n + Number(a.reward?.matSlot || 0), 0);
}

export const MAX_MAT_SLOTS = BASE_MAT_SLOTS + ACHIEVEMENTS.reduce((n, a) => n + Number(a.reward?.matSlot || 0), 0);

/**
 * One row per playmat slot: unlocked ones, then each locked slot with the achievement
 * that opens it, in the order they would normally be earned.
 */
export function matSlotPlan(profile) {
  const stats = statsOf(profile);
  const rows = [];
  for (let i = 0; i < BASE_MAT_SLOTS; i++) rows.push({ index: rows.length, unlocked: true, via: null });
  for (const a of ACHIEVEMENTS) {
    for (let i = 0; i < Number(a.reward?.matSlot || 0); i++) rows.push({ index: rows.length, unlocked: a.test(stats), via: a });
  }
  // Unlocked slots first so a slot number never has a gap before it.
  const open = rows.filter(r => r.unlocked), locked = rows.filter(r => !r.unlocked);
  return [...open, ...locked].map((row, index) => ({ ...row, index }));
}
