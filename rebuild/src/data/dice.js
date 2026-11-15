// Life dice: eight designs (rebuild/roadmap/visual-handoff/layout-reference/life-dice/options.json, in that order).
// The choice is stored on the profile (account.diceId) and is independent of the playmat; the default is
// "match-playmat", meaning the die named like the chosen mat (shown even while that die is still locked: it is the
// mat's own look). The Amethyst die is free; every later die is drawn at random when earned (2nd, 4th … achievement, every 3 wins; data/rewards.js).
// TO ADD A DIE: add its id to ORDER below (at the end, in unlock order); the id must be a mat id in data/playmats.js, from which it takes
// its name and colours. Nothing else is needed: its unlock thresholds, picker slot and choice are generated. Only the setting and picker exist so far:
// the dice pictures arrive with the art, so each die shows its palette colours for now.

import { MATS, selectedMat } from './playmats.js';
import { rewardFor, isUnlocked } from './rewards.js';

export const MATCH_PLAYMAT = 'match-playmat';
const ORDER = ['amethyst', 'night-flight', 'dark-alley', 'ember', 'frost', 'gold', 'forge', 'emerald'];

// Art dice (rebuild/roadmap/visual-handoff/rewards/life-dice/options-additions.json, in that order): their own picture,
// assets/skin/dice/<id>.webp (tools/skin-assets.py --dice; lazy, not precached). They have no mat, so no palette: neutral colours.
const ART = [
  ['peacock-cats-eye', "Peacock Cat's Eye"],
  ['ruby-cats-eye', "Ruby Cat's Eye"],
  ['indigo-cats-eye', "Indigo Cat's Eye"],
  ['tigers-eye', "Tiger's Eye"],
  ['moon-cats-eye', "Moon Cat's Eye"],
  ['violet-tempest', "Violet Tempest"],
  ['verdigris-tide', "Verdigris Tide"],
  ['cherry-smoke', "Cherry Smoke"],
  ['solar-flare', "Solar Flare"],
  ['ghost-pearl', "Ghost Pearl"],
  ['cobalt-relic', "Cobalt Relic"],
  ['opal-eclipse', "Opal Eclipse"],
  ['malachite-crown', "Malachite Crown"],
  ['ultraviolet-labradorite', "Ultraviolet Labradorite"],
  ['bloodstone', "Bloodstone"],
  ['damascus-noir', "Damascus Noir"],
  ['scorched-titanium', "Scorched Titanium"],
  ['copper-forge', "Copper Forge"],
  ['midnight-mokume', "Midnight Mokume"],
  ['obsidian-kintsugi', "Obsidian Kintsugi"],
  ['ivory-ossuary', "Ivory Ossuary"],
  ['jade-fossil', "Jade Fossil"],
  ['glacier-wraith', "Glacier Wraith"],
  ['charred-reliquary', "Charred Reliquary"],
  ['astral-marrow', "Astral Marrow"]
];

export const DICE = [
  ...ORDER.map(id => {
    const mat = MATS.find(m => m.id === id);
    return { id, name: mat.name, primary: mat.primary, secondary: mat.secondary };
  }),
  ...ART.map(([id, name]) => ({ id, name, primary: '#5a5a66', secondary: '#c8c8d2', art: `assets/skin/dice/${id}.webp` }))
];

/** CSS background for a die's swatch: its art when it has some, otherwise a ball in its palette colours. */
export function dieBackground(d) {
  return d.art ? `url('${d.art}') center / contain no-repeat` : `radial-gradient(circle at 35% 30%, ${d.secondary}, ${d.primary} 70%)`;
}

/** One row per die: whether this profile has it, and the achievement that unlocks it. */
export function diceUnlockPlan(profile) {
  return DICE.map((die, i) => ({ die, via: rewardFor('die', die, i), unlocked: isUnlocked('die', die.id, i, profile) }));
}

/** The die id stored on the profile; anything unknown or still locked means "match playmat". */
export function diceChoice(profile) {
  const id = profile?.account?.diceId;
  return diceUnlockPlan(profile).some(r => r.die.id === id && r.unlocked) ? id : MATCH_PLAYMAT;
}

/** The die actually shown: the chosen one, or the one matching the chosen playmat. */
export function activeDie(profile) {
  const id = diceChoice(profile);
  return DICE.find(d => d.id === (id === MATCH_PLAYMAT ? selectedMat(profile).palette : id));
}
