// Life dice: eight designs (rebuild/roadmap/visual-handoff/layout-reference/life-dice/options.json, in that order).
// The choice is stored on the profile (account.diceId) and is independent of the playmat; the default is
// "match-playmat", meaning the die named like the chosen mat (shown even while that die is still locked: it is the
// mat's own look). The Amethyst die is free; every later die unlocks by wins, every 3 wins in ORDER (3, 6, 9 …), via data/rewards.js.
// TO ADD A DIE: add its id to ORDER below (at the end, in unlock order); the id must be a mat id in data/playmats.js, from which it takes
// its name and colours. Nothing else is needed: the "<n> Wins" achievement, picker slot and choice are generated. Only the setting and picker exist so far:
// the dice pictures arrive with the art, so each die shows its palette colours for now.

import { MATS, selectedMat } from './playmats.js';
import { rewardFor, isUnlocked } from './rewards.js';

export const MATCH_PLAYMAT = 'match-playmat';
const ORDER = ['amethyst', 'night-flight', 'dark-alley', 'ember', 'frost', 'gold', 'forge', 'emerald'];

export const DICE = ORDER.map(id => {
  const mat = MATS.find(m => m.id === id);
  return { id, name: mat.name, primary: mat.primary, secondary: mat.secondary };
});

/** One row per die: whether this profile has it, and the achievement that unlocks it. */
export function diceUnlockPlan(profile) {
  return DICE.map((die, i) => ({ die, via: rewardFor('die', die, i), unlocked: isUnlocked('die', i, profile) }));
}

/** The die id stored on the profile; anything unknown or still locked means "match playmat". */
export function diceChoice(profile) {
  const id = profile?.account?.diceId;
  return diceUnlockPlan(profile).some(r => r.die.id === id && r.unlocked) ? id : MATCH_PLAYMAT;
}

/** The die actually shown: the chosen one, or the one matching the chosen playmat. */
export function activeDie(profile) {
  const id = diceChoice(profile);
  return DICE.find(d => d.id === (id === MATCH_PLAYMAT ? selectedMat(profile).id : id));
}
