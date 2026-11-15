// Every achievement in one list ("firsts and success streaks"). To add or retune one, edit a line here: the profile
// screen, game history and the reward levels all read from this table. 1 achievement earned = 1 level; levels unlock
// playmats and dice (data/rewards.js).
//
//   test(stats)  receives the stats built by statsOf() below from the player profile.
//
// Where each one comes from (profile fields written by data/profile.js recordGame, and by the Deck Builder through
// recordFirst below / deck/ui/companion.js):
//   computed from existing history: first game, first win, 10/50/100 games, 4-player game and Table Tracker game
//     (the last 50 history rows), and play-days streaks (history dates plus profile.playDays).
//   recorded from now on: everything else (profile.firsts, profile.streaks, winDecks, winColors).
// Nothing stores achievement ids: earned ones are computed from the profile on demand, and profile.milestones keeps labels
// only (text, so an unknown or retired label is harmless).

const day = iso => String(iso || '').slice(0, 10);

/** Longest run of consecutive calendar days in a list of YYYY-MM-DD strings. */
export function longestDayRun(days) {
  const t = [...new Set(days.filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)))].map(d => Date.parse(`${d}T00:00:00Z`)).sort((a, b) => a - b);
  let best = 0, run = 0;
  t.forEach((v, i) => { run = i && v - t[i - 1] === 86400000 ? run + 1 : 1; best = Math.max(best, run); });
  return best;
}

export function statsOf(profile) {
  const f = profile?.firsts || {}, hist = profile?.history || [], st = profile?.streaks || {};
  const has = k => !!f[k];
  const colors = new Set(profile?.winColors || []);
  return {
    games: Number(profile?.games || 0), wins: Number(profile?.wins || 0),
    fourPlayer: has('fourPlayer') || hist.some(h => (h.players || []).length >= 4),
    tracker: has('tracker') || hist.some(h => h.mode === 'table-tracker'),
    online: has('online'), hosted: has('hosted'), judge: has('judge'),
    winCommanderDamage: has('winCommanderDamage'), winPoison: has('winPoison'), winAlternate: has('winAlternate'),
    deckBuilt: has('deckBuilt'), deckImported: has('deckImported'), upgradeApplied: has('upgradeApplied'), precon: has('precon'),
    bestWinStreak: Number(st.bestWin || 0), winDecks: new Set(profile?.winDecks || []).size, colors,
    dayStreak: Math.max(Number(st.bestDays || 0), longestDayRun([...(profile?.playDays || []), ...hist.map(h => day(h.at))]))
  };
}

const COLOR_NAMES = { W: 'White', U: 'Blue', B: 'Black', R: 'Red', G: 'Green' };

export const ACHIEVEMENTS = [
  // Firsts
  { id: 'first-game', label: 'First Game', description: 'Finish your first game.', test: s => s.games >= 1 },
  { id: 'first-win', label: 'First Win', description: 'Win a game.', test: s => s.wins >= 1 },
  { id: 'first-four-player', label: 'Full Table', description: 'Play a game with 4 players.', test: s => s.fourPlayer },
  { id: 'first-online', label: 'Online Debut', description: 'Play an online game.', test: s => s.online },
  { id: 'first-hosted', label: 'Host With the Most', description: 'Host an online room.', test: s => s.hosted },
  { id: 'first-tracker', label: 'Table Tracker', description: 'Finish a Table Tracker game.', test: s => s.tracker },
  { id: 'first-judge', label: 'Judge Call', description: 'Run a game as the judge.', test: s => s.judge },
  { id: 'first-commander-win', label: 'Commander Strike', description: 'Win by commander damage.', test: s => s.winCommanderDamage },
  { id: 'first-poison-win', label: 'Toxic Victory', description: 'Win by poison counters.', test: s => s.winPoison },
  { id: 'first-alt-win', label: 'Another Way', description: 'Win with a card that says you win the game.', test: s => s.winAlternate },
  { id: 'first-deck-built', label: 'Deck Builder', description: 'Build a deck in the Deck Builder.', test: s => s.deckBuilt },
  { id: 'first-deck-imported', label: 'Import Duty', description: 'Import a deck into the Deck Builder.', test: s => s.deckImported },
  { id: 'first-upgrade', label: 'Upgrade Applied', description: 'Apply an upgrade in the Deck Builder.', test: s => s.upgradeApplied },
  { id: 'first-precon', label: 'Precon Player', description: 'Play a game with a precon deck.', test: s => s.precon },
  // Success streaks
  { id: 'win-streak-2', label: 'Back to Back', description: 'Win 2 games in a row.', test: s => s.bestWinStreak >= 2 },
  { id: 'win-streak-3', label: 'Hat Trick', description: 'Win 3 games in a row.', test: s => s.bestWinStreak >= 3 },
  { id: 'win-streak-5', label: 'Unstoppable', description: 'Win 5 games in a row.', test: s => s.bestWinStreak >= 5 },
  { id: 'win-decks-3', label: 'Three Decks', description: 'Win with 3 different decks.', test: s => s.winDecks >= 3 },
  { id: 'win-decks-5', label: 'Five Decks', description: 'Win with 5 different decks.', test: s => s.winDecks >= 5 },
  ...Object.entries(COLOR_NAMES).map(([c, name]) => ({ id: `win-color-${c.toLowerCase()}`, label: `${name} Victory`, description: `Win with a ${name.toLowerCase()} commander (its colour identity includes ${c}).`, test: s => s.colors.has(c) })),
  { id: 'play-days-3', label: 'Three Days Running', description: 'Play on 3 days in a row.', test: s => s.dayStreak >= 3 },
  { id: 'play-days-7', label: 'Week Streak', description: 'Play on 7 days in a row.', test: s => s.dayStreak >= 7 },
  // Milestones
  { id: 'table-regular', label: 'Table Regular', description: 'Play 10 games.', test: s => s.games >= 10 },
  { id: 'commander-veteran', label: 'Commander Veteran', description: 'Play 50 games.', test: s => s.games >= 50 },
  { id: 'centurion', label: 'Centurion', description: 'Play 100 games.', test: s => s.games >= 100 }
];

export function earnedAchievements(profile) {
  const stats = statsOf(profile);
  return ACHIEVEMENTS.filter(a => a.test(stats));
}

export function earnedLabels(profile) {
  return earnedAchievements(profile).map(a => a.label);
}

/** The player's level: 1 achievement earned = 1 level. */
export function achievementLevel(profile) {
  return earnedAchievements(profile).length;
}
