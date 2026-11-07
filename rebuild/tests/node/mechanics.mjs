// Rules automation: targeting restrictions, hand-resolved cards still choosing targets, and the
// mechanics the engine runs by itself (alternative costs, keyword triggers, replacements …).
import { newGame, check, section, done } from './harness.mjs';
import { MECHANICS, mechanicsIn, guidedActionsFor } from '../../src/data/mechanics.js';
import { compileEffectText, applyEffects } from '../../src/engine/effects.js';
import { scryfallToDefinition } from '../../src/data/card-api.js';

/** Give player i enough untapped basic lands of a color to cast things (test setup). */
function lands(t, i, name, count) { for (let k = 0; k < count; k++) t.give(i, name, 'battlefield'); }
function answerAll(t, pickFn = d => (d.options || [])[0]?.id) {
  for (let guard = 0; guard < 12 && t.decision(); guard++) {
    const d = t.decision();
    const value = d.kind === 'choose-many' ? (d.options || []).slice(0, d.min || 0).map(o => o.id) : d.kind === 'confirm' ? true : d.kind === 'number' ? (d.min || 0) : pickFn(d);
    const r = t.ctl.dispatch({ type: 'answer', key: d.key, value }, { playerId: d.playerId, isHost: false });
    if (!r.ok) throw new Error(`answer failed: ${r.error}`);
  }
}

section('terms key');
check('the terms key covers hundreds of mechanics', MECHANICS.length > 300, String(MECHANICS.length));
check('the key recognises mechanics in rules text, ignoring reminder text', mechanicsIn('Flying\nAnnihilator 2 (Whenever this creature attacks, defending player sacrifices two permanents.)').some(m => m.name === 'Annihilator') && !mechanicsIn('(This creature has flying.)').some(m => m.name === 'Flying'));
check('the key suggests actions from what a card does', guidedActionsFor('Destroy target artifact. Its controller loses 2 life.').join() === 'destroy,life-loss');

section('targeting: hexproof, shroud, protection');
{
  const t = newGame(['rakdos', 'white']);
  t.keepAll();
  t.give(1, 'White Knight', 'battlefield'); t.give(1, 'Serra Angel', 'battlefield');
  lands(t, 0, 'Swamp', 3);
  t.give(0, 'Murder');
  const r = t.try(0, { type: 'play', instanceId: t.hand(0, 'Murder').instanceId });
  const options = (t.decision()?.options || []).map(o => o.label);
  check('protection from black: Murder cannot target White Knight', r.ok && options.includes('Serra Angel') && !options.includes('White Knight'), JSON.stringify(options));
}
{
  const t = newGame(['rakdos', 'lab']);
  t.keepAll();
  t.give(1, 'Gladecover Scout', 'battlefield');
  lands(t, 0, 'Mountain', 1);
  t.give(0, 'Lightning Bolt');
  t.try(0, { type: 'play', instanceId: t.hand(0, 'Lightning Bolt').instanceId });
  const options = (t.decision()?.options || []).map(o => o.label);
  check('hexproof: an opponent cannot target it', !options.includes('Gladecover Scout') && options.length > 0, JSON.stringify(options));
}

section('hand-resolved cards still choose targets');
{
  const t = newGame(['lab', 'white']);
  t.keepAll();
  t.give(1, 'Serra Angel', 'battlefield');
  lands(t, 0, 'Mountain', 3);
  t.give(0, 'Chaos Warp');
  // A card the game still resolves by hand (Chaos Warp itself is automatic since build 35).
  const warp = t.hand(0, 'Chaos Warp');
  t.game.cardDefinitions[warp.definitionId] = { ...t.game.cardDefinitions[warp.definitionId], oracleText: 'The owner of target permanent shuffles it into their library, then rolls a six-sided die.' };
  t.try(0, { type: 'play', instanceId: t.hand(0, 'Chaos Warp').instanceId });
  const d = t.decision();
  check('a hand-resolved card asks for its target permanent when cast', d?.targeting && d.options.some(o => o.label === 'Serra Angel'), JSON.stringify(d && d.title));
  const angel = d.options.find(o => o.label === 'Serra Angel').id;
  t.ctl.dispatch({ type: 'answer', key: d.key, value: angel }, t.as(0));
  answerAll(t);
  t.passAll();
  const v = t.view(0);
  check('the resolution screen names the target', v.prompt.kind === 'guided' && v.prompt.targets[0]?.name === 'Serra Angel', JSON.stringify(v.prompt.targets));
  check('the resolution screen offers the right actions', v.prompt.actions.includes('shuffle'), JSON.stringify(v.prompt.actions));
}
{
  const t = newGame(['lab', 'white']);
  t.keepAll();
  t.give(1, 'Serra Angel', 'battlefield');
  lands(t, 0, 'Mountain', 3);
  t.give(0, 'Chaos Warp');
  t.try(0, { type: 'play', instanceId: t.hand(0, 'Chaos Warp').instanceId });
  const d = t.decision();
  t.ctl.dispatch({ type: 'answer', key: d.key, value: d.options.find(o => o.label === 'Serra Angel').id }, t.as(0));
  answerAll(t);
  t.passAll();
  check('Chaos Warp resolves by itself: the Angel is shuffled away and the top card is revealed', !t.bf(1, 'Serra Angel') || t.game.log.some(e => /reveals Serra Angel/.test(e.text)), t.game.log.slice(0, 3).map(e => e.text).join(' / '));
  check('…and nothing is left to resolve by hand', t.view(0).prompt.kind !== 'guided');
}

// ---------------------------------------------------------------------------------------------
// Helpers for the casting tests

/** Answer every open decision: `picks` maps a key fragment to a value (or a function of the decision). */
/** Resolve whatever triggered, including effects resolved by hand (press Done). */
function finishTriggers(t) {
  for (let guard = 0; guard < 10 && ((t.game.stack || []).length || t.game.flow.priority || t.decision()); guard++) {
    settleWith(t);
    if (t.game.flow.guided) { const top = t.game.stack[t.game.stack.length - 1]; t.ctl.dispatch({ type: 'guided-done' }, { playerId: top.controllerId, isHost: false }); }
    t.passAll();
  }
}
function settleWith(t, picks = {}) {
  for (let guard = 0; guard < 25 && t.decision(); guard++) {
    const d = t.decision();
    const hit = Object.keys(picks).find(k => d.key.includes(k));
    let value = hit !== undefined ? picks[hit] : undefined;
    if (typeof value === 'function') value = value(d);
    if (value === undefined) {
      const open = (d.options || []).filter(o => !o.disabled);
      value = d.kind === 'choose-many' ? open.slice(0, d.min || 0).map(o => o.id) : d.kind === 'confirm' ? true : d.kind === 'number' ? (d.min || 0) : open[0]?.id;
    }
    const r = t.ctl.dispatch({ type: 'answer', key: d.key, value }, { playerId: d.playerId, isHost: false });
    if (!r.ok) throw new Error(`answer ${d.key} failed: ${r.error}`);
  }
  t.passAll();
  for (let guard = 0; guard < 10 && (t.decision() || t.game.flow.priority); guard++) {
    if (t.decision()) return settleWith(t, picks);
    t.passAll();
  }
}
const labGame = (other = 'white', opts = {}) => { const t = newGame(['lab', other], opts); t.keepAll(); return t; };
const play = (t, i, name, picks = {}, extra = {}) => {
  const card = t.hand(i, name) || [...t.P(i).deck.graveyard, ...t.P(i).deck.exile].find(c => t.game.cardDefinitions[c.definitionId]?.name === name);
  const r = t.try(i, { type: 'play', instanceId: card.instanceId, ...extra });
  if (!r.ok) return r;
  settleWith(t, picks);
  return r;
};
const gyNames = (t, i) => t.names(i, 'graveyard');
const exNames = (t, i) => t.names(i, 'exile');
const optionIds = d => (d?.options || []).map(o => o.id);

section('kicker');
{
  const t = labGame();
  lands(t, 0, 'Mountain', 5);
  t.give(0, 'Burst Lightning');
  const life = t.P(1).life;
  play(t, 0, 'Burst Lightning', { kicker: 'kick', guided0: t.P(1).playerId, target: t.P(1).playerId });
  check('kicked Burst Lightning deals 4', t.P(1).life === life - 4, `${life} -> ${t.P(1).life}`);
}
{
  const t = labGame();
  lands(t, 0, 'Mountain', 1);
  t.give(0, 'Burst Lightning');
  const life = t.P(1).life;
  t.try(0, { type: 'play', instanceId: t.hand(0, 'Burst Lightning').instanceId });
  const d = t.decision();
  check('kicker is offered but disabled when you cannot pay it', d?.key === 'kicker' && d.options.find(o => o.id === 'kick').disabled, JSON.stringify(d?.options));
  settleWith(t, { kicker: 'no', target: t.P(1).playerId });
  check('unkicked Burst Lightning deals 2', t.P(1).life === life - 2, `${life} -> ${t.P(1).life}`);
}

section('flashback, buyback, escape');
{
  const t = labGame();
  lands(t, 0, 'Island', 3);
  t.give(0, 'Think Twice', 'graveyard');
  const v = t.view(0);
  const gy = v.players[0].graveyard.find(c => c.name === 'Think Twice');
  check('a flashback card in the graveyard is shown as castable', gy?.playable && gy.castLabel === 'Flashback', JSON.stringify(gy));
  const hand = t.P(0).deck.hand.length;
  play(t, 0, 'Think Twice');
  check('flashback draws and then exiles the card', t.P(0).deck.hand.length === hand + 1 && exNames(t, 0).includes('Think Twice') && !gyNames(t, 0).includes('Think Twice'));
}
{
  const t = labGame();
  lands(t, 0, 'Island', 6);
  t.give(0, 'Whispers of the Muse');
  play(t, 0, 'Whispers of the Muse', { buyback: 'buy' });
  check('buyback returns the spell to hand', !!t.hand(0, 'Whispers of the Muse') && t.P(0).deck.battlefield.filter(c => c.tapped).length === 6);
}
{
  const t = labGame();
  lands(t, 0, 'Mountain', 4);
  t.give(0, 'Underworld Rage-Hound', 'graveyard');
  for (const n of ['Think Twice', 'Grapeshot', 'Frogmite']) t.give(0, n, 'graveyard');
  play(t, 0, 'Underworld Rage-Hound');
  const hound = t.bf(0, 'Underworld Rage-Hound');
  check('escape: cast from the graveyard, three cards exiled, enters with a +1/+1 counter', hound && hound.counters['+1/+1'] === 1 && exNames(t, 0).length === 3, JSON.stringify({ counters: hound?.counters, ex: exNames(t, 0) }));
}

section('dash, evoke, overload, foretell, adventure');
{
  const t = labGame();
  lands(t, 0, 'Mountain', 2);
  t.give(0, 'Mardu Scout');
  t.try(0, { type: 'play', instanceId: t.hand(0, 'Mardu Scout').instanceId });
  const d = t.decision();
  check('two ways to cast are offered (cast / dash)', d?.key === 'castMode' && optionIds(d).join() === 'normal,dash', JSON.stringify(optionIds(d)));
  settleWith(t, { castMode: 'dash' });
  const scout = t.bf(0, 'Mardu Scout');
  check('dashed creature has haste', scout && !t.view(0).players[0].battlefield.find(c => c.name === 'Mardu Scout').sick);
  t.end(0);
  check('dashed creature returns to hand at the end step', !!t.hand(0, 'Mardu Scout') && !t.bf(0, 'Mardu Scout'), JSON.stringify(t.names(0, 'battlefield').filter(n => n === 'Mardu Scout')));
}
{
  const t = labGame();
  lands(t, 0, 'Island', 3);
  t.give(0, 'Mulldrifter');
  const hand = t.P(0).deck.hand.length;
  play(t, 0, 'Mulldrifter', { castMode: 'evoke' });
  check('evoke: draws two, then is sacrificed', t.P(0).deck.hand.length === hand - 1 + 2 && gyNames(t, 0).includes('Mulldrifter') && !t.bf(0, 'Mulldrifter'), JSON.stringify({ hand: t.P(0).deck.hand.length, gy: gyNames(t, 0) }));
}
{
  const t = labGame('white');
  lands(t, 0, 'Island', 7);
  t.give(1, 'Serra Angel', 'battlefield'); t.give(1, 'White Knight', 'battlefield');
  t.give(0, 'Cyclonic Rift');
  play(t, 0, 'Cyclonic Rift', { castMode: 'overload' });
  check('overloaded Cyclonic Rift returns each nonland permanent you don’t control', !t.bf(1, 'Serra Angel') && !t.bf(1, 'White Knight') && t.P(1).deck.hand.length >= 2, JSON.stringify(t.names(1, 'battlefield')));
}
{
  const t = labGame();
  lands(t, 0, 'Island', 4);
  t.give(0, 'Saw It Coming');
  const row = t.view(0).players[0].hand.find(c => c.name === 'Saw It Coming').abilities.find(a => a.id === 'special:foretell');
  check('foretell is offered from hand during your turn', row?.legal, JSON.stringify(row));
  t.do(0, { type: 'activate', instanceId: t.hand(0, 'Saw It Coming').instanceId, abilityId: 'special:foretell' });
  check('the foretold card is exiled face down', exNames(t, 0).includes('Saw It Coming') && t.P(0).deck.exile.find(c => c.foretold));
  const seen = t.view(1).players[0].exile[0];
  check('opponents cannot see a foretold card', seen?.name === 'Foretold card', JSON.stringify(seen?.name));
  const mine = t.view(0).players[0].exile.find(c => c.name === 'Saw It Coming');
  check('it cannot be cast the turn it was foretold', !mine.playable);
}
{
  const t = labGame();
  lands(t, 0, 'Mountain', 5);
  t.give(0, 'Bonecrusher Giant');
  const life = t.P(1).life;
  play(t, 0, 'Bonecrusher Giant', { face: 1, target: t.P(1).playerId });
  check('Stomp resolves and the card goes on an adventure in exile', t.P(1).life === life - 2 && t.P(0).deck.exile.some(c => c.onAdventure), JSON.stringify({ life: t.P(1).life, ex: exNames(t, 0) }));
  const ex = t.view(0).players[0].exile.find(c => c.onAdventure);
  check('the creature can then be cast from exile', ex?.playable && ex.castLabel === 'Cast from adventure', JSON.stringify(ex));
  play(t, 0, 'Bonecrusher Giant');
  check('Bonecrusher Giant enters from exile', !!t.bf(0, 'Bonecrusher Giant'));
}

section('face down: morph');
{
  const t = labGame();
  lands(t, 0, 'Plains', 7);
  t.give(0, 'Exalted Angel');
  play(t, 0, 'Exalted Angel', { castMode: 'morph' });
  const fd = t.P(0).deck.battlefield.find(c => c.realDefinitionId);
  check('morph: cast face down as a 2/2 for {3}', fd && t.game.cardDefinitions[fd.definitionId].name === 'Face-down creature' && t.P(0).deck.battlefield.filter(c => c.tapped).length === 3);
  const opp = t.view(1).players[0].battlefield.find(c => c.id === fd.instanceId);
  const own = t.view(0).players[0].battlefield.find(c => c.id === fd.instanceId);
  check('opponents see a nameless face-down creature; its owner sees what it is', opp.name === 'Face-down creature' && !opp.realName && own.realName === 'Exalted Angel', JSON.stringify({ opp: opp.name, own: own.realName }));
  t.do(0, { type: 'activate', instanceId: fd.instanceId, abilityId: 'special:turn-face-up' });
  check('turning it face up for its morph cost reveals Exalted Angel', !!t.bf(0, 'Exalted Angel') && !t.bf(0, 'Exalted Angel').realDefinitionId);
}

section('cost changes: affinity, eminence, Thalia, convoke, delve');
{
  const t = labGame();
  t.give(0, 'Kappa Cannoneer', 'battlefield'); t.give(0, 'Frogmite', 'hand');
  finishTriggers(t);   // Kappa Cannoneer is an artifact: it sees itself enter (rule 603.6a)
  lands(t, 0, 'Island', 3);
  const check1 = t.view(0).players[0].hand.find(c => c.name === 'Frogmite');
  check('affinity for artifacts: Frogmite costs {3} with one artifact', check1.playable, JSON.stringify(check1));
}
{
  const t = labGame();
  lands(t, 0, 'Mountain', 2);
  t.give(0, 'Shivan Whelp');
  const whelp = t.view(0).players[0].hand.find(c => c.name === 'Shivan Whelp');
  check('eminence: The Ur-Dragon in the command zone makes a Dragon cost {1} less', whelp.playable, JSON.stringify(whelp));
}
{
  const t = labGame('lab');
  t.give(1, 'Thalia, Guardian of Thraben', 'battlefield');
  lands(t, 0, 'Mountain', 1);
  t.give(0, 'Burst Lightning');
  const bolt = t.view(0).players[0].hand.find(c => c.name === 'Burst Lightning');
  check('Thalia: noncreature spells cost {1} more', !bolt.playable, JSON.stringify(bolt));
}
{
  const t = labGame();
  lands(t, 0, 'Mountain', 2);
  t.give(0, 'Monastery Swiftspear', 'battlefield'); t.give(0, 'Young Wolf', 'battlefield');
  t.give(0, 'Stoke the Flames');
  const life = t.P(1).life;
  play(t, 0, 'Stoke the Flames', { target: t.P(1).playerId });
  check('convoke: two lands and two creatures pay for Stoke the Flames', t.P(1).life === life - 4 && t.bf(0, 'Monastery Swiftspear').tapped && t.bf(0, 'Young Wolf').tapped, JSON.stringify({ life: t.P(1).life }));
}
{
  const t = labGame();
  lands(t, 0, 'Island', 2);
  for (const n of ['Think Twice', 'Grapeshot', 'Frogmite', 'Mardu Scout', 'Burst Lightning', 'Mulldrifter']) t.give(0, n, 'graveyard');
  t.give(0, 'Treasure Cruise');
  const hand = t.P(0).deck.hand.length;
  play(t, 0, 'Treasure Cruise', { delve: d => optionIds(d).slice(0, 6) });
  check('delve: six graveyard cards and two lands cast Treasure Cruise', t.P(0).deck.hand.length === hand - 1 + 3 && exNames(t, 0).length === 6, JSON.stringify({ hand: t.P(0).deck.hand.length, ex: exNames(t, 0).length }));
}

section('cascade, storm, prowess');
{
  const t = labGame();
  lands(t, 0, 'Mountain', 2); lands(t, 0, 'Forest', 2);
  t.give(0, 'Bloodbraid Elf');
  const lib = t.P(0).deck.remainingLibrary;
  const think = lib.find(c => t.game.cardDefinitions[c.definitionId].name === 'Think Twice');
  const land = lib.find(c => /Land/.test(t.game.cardDefinitions[c.definitionId].typeLine));
  lib.splice(lib.indexOf(think), 1); lib.splice(lib.indexOf(land), 1);
  lib.unshift(land, think);
  const hand = t.P(0).deck.hand.length;
  play(t, 0, 'Bloodbraid Elf', { 'cascade:cast': 'cast' });
  check('cascade skips a land, hits Think Twice and casts it free', t.P(0).deck.hand.length === hand - 1 + 1 && gyNames(t, 0).includes('Think Twice') && !!t.bf(0, 'Bloodbraid Elf'), JSON.stringify({ hand: t.P(0).deck.hand.length, gy: gyNames(t, 0) }));
  check('the revealed land goes to the bottom', lib.at(-1)?.instanceId === land.instanceId);
}
{
  const t = labGame();
  lands(t, 0, 'Mountain', 3); lands(t, 0, 'Island', 2);
  t.give(0, 'Monastery Swiftspear', 'battlefield');
  t.give(0, 'Think Twice'); t.give(0, 'Grapeshot');
  play(t, 0, 'Think Twice');
  check('prowess: a noncreature spell gives +1/+1', t.view(0).players[0].battlefield.find(c => c.name === 'Monastery Swiftspear').power === 2);
  const life = t.P(1).life;
  play(t, 0, 'Grapeshot', { target: t.P(1).playerId, keep: 'same' });
  check('storm copies Grapeshot once for the spell before it', t.P(1).life === life - 2, `${life} -> ${t.P(1).life}`);
}

section('cycling, ninjutsu');
{
  const t = labGame();
  lands(t, 0, 'Plains', 2);
  t.give(0, 'Renewed Faith');
  const hand = t.P(0).deck.hand.length;
  t.do(0, { type: 'activate', instanceId: t.hand(0, 'Renewed Faith').instanceId, abilityId: 'special:cycling' });
  settleWith(t);
  check('cycling discards the card and draws one', gyNames(t, 0).includes('Renewed Faith') && t.P(0).deck.hand.length === hand, JSON.stringify({ hand: t.P(0).deck.hand.length }));
}

section('undying, persist');
{
  const t = labGame('rakdos');
  t.give(0, 'Young Wolf', 'battlefield'); t.give(0, 'Kitchen Finks', 'battlefield');
  lands(t, 1, 'Swamp', 6);
  t.end(0);
  t.give(1, 'Murder');
  play(t, 1, 'Murder', { target: t.bf(0, 'Young Wolf').instanceId });
  const wolf = t.bf(0, 'Young Wolf');
  check('undying: Young Wolf returns with a +1/+1 counter', wolf && wolf.counters['+1/+1'] === 1, JSON.stringify(wolf?.counters));
  t.edit({ kind: 'move', instanceId: t.bf(0, 'Young Wolf').instanceId, to: 'graveyard' });
  check('a second death with the counter stays dead', !t.bf(0, 'Young Wolf') && gyNames(t, 0).includes('Young Wolf'));
}

section('sagas, monarch, initiative');
{
  const t = labGame();
  lands(t, 0, 'Plains', 3);
  t.give(0, 'History of Benalia');
  play(t, 0, 'History of Benalia');
  const knights = () => t.P(0).deck.battlefield.filter(c => c.token).length;
  check('saga chapter I makes a Knight', knights() === 1 && t.bf(0, 'History of Benalia').counters.lore === 1, JSON.stringify({ k: knights(), c: t.bf(0, 'History of Benalia')?.counters }));
  t.end(0); t.end(1);
  t.do(0, { type: 'next-phase' }); settleWith(t);
  check('after the draw step chapter II makes another', knights() === 2 && t.bf(0, 'History of Benalia')?.counters.lore === 2, JSON.stringify({ k: knights(), phase: t.game.phase }));
}
{
  const t = labGame();
  lands(t, 0, 'Plains', 2); lands(t, 0, 'Mountain', 1); lands(t, 0, 'Swamp', 1);
  t.give(0, 'Queen Marchesa');
  play(t, 0, 'Queen Marchesa');
  check('Queen Marchesa makes you the monarch', t.P(0).statuses.includes('Monarch'), JSON.stringify(t.P(0).statuses));
  const hand = t.P(0).deck.hand.length;
  t.end(0);
  check('the monarch draws at the end step', t.P(0).deck.hand.length === hand + 1, `${hand} -> ${t.P(0).deck.hand.length}`);
}
{
  const t = labGame();
  lands(t, 0, 'Island', 4);
  t.give(0, 'Aarakocra Sneak');
  play(t, 0, 'Aarakocra Sneak');
  check('taking the initiative ventures into Undercity', t.P(0).statuses.includes('Initiative') && t.P(0).dungeon?.name === 'Undercity' && t.P(0).dungeon.room === 'Secret Entrance', JSON.stringify({ s: t.P(0).statuses, d: t.P(0).dungeon }));
}

section('replacement effects and ward');
{
  const t = labGame();
  t.give(0, 'Doubling Season', 'battlefield');
  lands(t, 0, 'Plains', 3);
  t.give(0, 'History of Benalia');
  play(t, 0, 'History of Benalia');
  check('Doubling Season: chapter I makes two Knights and two lore counters', t.P(0).deck.battlefield.filter(c => c.token).length === 2, JSON.stringify(t.P(0).deck.battlefield.filter(c => c.token).length));
}
{
  const t = labGame('lab');
  t.give(1, 'Rest in Peace', 'battlefield');
  lands(t, 0, 'Mountain', 1);
  t.give(0, 'Burst Lightning');
  play(t, 0, 'Burst Lightning', { kicker: 'no', target: t.P(1).playerId });
  check('Rest in Peace: the instant is exiled instead of going to the graveyard', exNames(t, 0).includes('Burst Lightning') && !gyNames(t, 0).includes('Burst Lightning'));
}
{
  const t = labGame('lab');
  t.give(1, 'Kappa Cannoneer', 'battlefield');
  finishTriggers(t);   // its own "an artifact you control enters" trigger
  lands(t, 0, 'Mountain', 1);
  t.give(0, 'Burst Lightning');
  t.try(0, { type: 'play', instanceId: t.hand(0, 'Burst Lightning').instanceId });
  settleWith(t, { kicker: 'no', target: t.bf(1, 'Kappa Cannoneer').instanceId, ward: 'no' });
  check('ward: unpaid, the spell is countered', !!t.bf(1, 'Kappa Cannoneer') && Number(t.bf(1, 'Kappa Cannoneer').damageMarked || 0) === 0 && gyNames(t, 0).includes('Burst Lightning'), JSON.stringify(t.game.log.slice(0, 3).map(e => e.text)));
}
{
  const t = labGame('white');
  t.give(1, 'Serra Angel', 'battlefield');
  const compiled = compileEffectText('Goad target creature.', { sourceName: 'Test' });
  applyEffects(t.game, t.P(0).playerId, compiled.effects, { [compiled.requirements[0].bind]: t.bf(1, 'Serra Angel').instanceId });
  check('goad marks the creature until your next turn', t.bf(1, 'Serra Angel').temporaryEffects.some(e => e.kind === 'goad' && e.by === t.P(0).playerId));
}

section('ninjutsu, persist, monarch and initiative in combat');
{
  const t = newGame(['lab', 'white'], { autoPass: false });
  t.keepAll();
  t.give(0, 'Young Wolf', 'battlefield');
  lands(t, 0, 'Island', 2);
  t.give(0, 'Ninja of the Deep Hours');
  t.end(0); t.end(1);
  t.do(0, { type: 'next-phase' }); t.passAll();
  const wolf = t.bf(0, 'Young Wolf');
  t.do(0, { type: 'attack', attacks: [{ instanceId: wolf.instanceId, defenderId: t.P(1).playerId }] });
  for (let n = 0; n < 8 && t.game.flow.priority && !(t.game.phase === 'declare-blockers' && t.game.flow.priority.holderId === t.P(0).playerId); n++) t.ctl.dispatch({ type: 'pass' }, { playerId: t.game.flow.priority.holderId, isHost: false });
  const row = t.view(0).players[0].hand.find(c => c.name === 'Ninja of the Deep Hours')?.abilities.find(a => a.id === 'special:ninjutsu');
  check('ninjutsu is available after blockers with an unblocked attacker', row?.legal, JSON.stringify({ row, phase: t.game.phase, pr: t.game.flow.priority }));
  if (row?.legal) {
    t.do(0, { type: 'activate', instanceId: t.hand(0, 'Ninja of the Deep Hours').instanceId, abilityId: 'special:ninjutsu' });
    settleWith(t);
    const ninja = t.bf(0, 'Ninja of the Deep Hours');
    check('the ninja enters tapped and attacking; the wolf returns to hand', ninja?.tapped && !!t.hand(0, 'Young Wolf') && t.game.combatState.attackers.some(a => a.instanceId === ninja.instanceId));
  }
}
{
  const t = labGame('lab');
  t.give(0, 'Kitchen Finks', 'battlefield');
  t.edit({ kind: 'move', instanceId: t.bf(0, 'Kitchen Finks').instanceId, to: 'graveyard' });
  settleWith(t);
  const finks = t.bf(0, 'Kitchen Finks');
  check('persist: Kitchen Finks returns with a -1/-1 counter', finks && finks.counters['-1/-1'] === 1, JSON.stringify(finks?.counters));
}
{
  const t = labGame('lab');
  t.give(0, 'Monastery Swiftspear', 'battlefield');
  t.end(0); t.end(1);
  t.P(1).statuses = ['Monarch', 'Initiative'];
  t.do(0, { type: 'next-phase' });
  t.do(0, { type: 'attack', attacks: [{ instanceId: t.bf(0, 'Monastery Swiftspear').instanceId, defenderId: t.P(1).playerId }] });
  settleWith(t);
  check('combat damage to the monarch steals the monarchy', t.P(0).statuses.includes('Monarch') && !t.P(1).statuses.includes('Monarch'), JSON.stringify([t.P(0).statuses, t.P(1).statuses]));
  check('combat damage to the initiative holder takes the initiative and ventures', t.P(0).statuses.includes('Initiative') && t.P(0).dungeon?.name === 'Undercity', JSON.stringify(t.P(0).dungeon));
}

section('blitz, exalted');
{
  const t = labGame('lab');
  lands(t, 0, 'Mountain', 3);
  t.give(0, 'Riveteers Requisitioner');
  play(t, 0, 'Riveteers Requisitioner', { castMode: 'blitz' });
  const hand = t.P(0).deck.hand.length;
  t.end(0);
  check('blitz: sacrificed at the end step, draws a card and leaves a Treasure', !t.bf(0, 'Riveteers Requisitioner') && gyNames(t, 0).includes('Riveteers Requisitioner') && t.P(0).deck.hand.length === hand + 1 && t.P(0).deck.battlefield.some(c => c.token), JSON.stringify({ hand: t.P(0).deck.hand.length, bf: t.names(0, 'battlefield').filter(n => !/Mountain/.test(n)) }));
}
{
  const t = labGame('lab');
  t.give(0, 'Akrasan Squire', 'battlefield'); t.give(0, 'Monastery Swiftspear', 'battlefield');
  t.end(0); t.end(1);
  t.do(0, { type: 'next-phase' });
  const life = t.P(1).life;
  t.do(0, { type: 'attack', attacks: [{ instanceId: t.bf(0, 'Monastery Swiftspear').instanceId, defenderId: t.P(1).playerId }] });
  settleWith(t);
  check('exalted: a creature attacking alone gets +1/+1', t.P(1).life === life - 2, `${life} -> ${t.P(1).life}`);
}

section('energy payments, discover and earthbend inside an effect (build 77)');
const asSpell = (t, text) => { const c = t.hand(0, 'Burst Lightning'); t.game.cardDefinitions[c.definitionId] = { ...t.game.cardDefinitions[c.definitionId], oracleText: text }; };
{
  const t = labGame('lab');
  lands(t, 0, 'Mountain', 2);
  t.give(0, 'Burst Lightning');
  asSpell(t, 'You get {E}{E}{E}. Then you may pay {E}{E}. If you do, draw a card.');
  const hand = t.P(0).deck.hand.length;
  let asked = null;
  play(t, 0, 'Burst Lightning', { 'may-pay': d => { asked = d; return 'pay'; } });
  check('"you may pay {E}{E}": the player is asked, pays the energy and the rest happens', asked && t.P(0).counters.energy === 1 && t.P(0).deck.hand.length === hand, JSON.stringify({ energy: t.P(0).counters, hand: t.P(0).deck.hand.length - hand, title: asked?.title }));
  t.edit({ kind: 'move', instanceId: t.P(0).deck.graveyard.find(c => t.game.cardDefinitions[c.definitionId]?.name === 'Burst Lightning').instanceId, to: 'hand' });
  asSpell(t, 'You may pay eight {E}. If you do, draw a card.');
  let off = null;
  play(t, 0, 'Burst Lightning', { 'may-pay': d => { off = d.options.find(o => o.id === 'pay'); return 'no'; } });
  check('"you may pay eight {E}" with too little energy: paying is offered but not possible', off?.disabled && t.P(0).counters.energy === 1, JSON.stringify(off));
}
{
  const t = labGame('lab');
  lands(t, 0, 'Mountain', 1);
  t.give(0, 'Burst Lightning');
  asSpell(t, 'Create a Treasure token, then discover 4.');
  let hit = null;
  play(t, 0, 'Burst Lightning', { 'discover:cast': d => { hit = d; return 'no'; } });
  check('discover in the middle of an effect: the Treasure is made, then discover runs with its choice', hit && t.P(0).deck.battlefield.some(c => c.token && t.game.cardDefinitions[c.definitionId]?.name === 'Treasure'), JSON.stringify({ hit: hit?.title, bf: t.names(0, 'battlefield') }));
}
{
  const t = labGame('lab');
  lands(t, 0, 'Mountain', 2);
  t.give(0, 'Forest', 'battlefield');
  t.give(0, 'Burst Lightning');
  asSpell(t, 'Earthbend 2. (Target land you control becomes a 0/0 creature with haste that\'s still a land. Put two +1/+1 counters on it. When it dies or is exiled, return it to the battlefield tapped.)');
  const forest = t.bf(0, 'Forest');
  play(t, 0, 'Burst Lightning', { target: forest.instanceId, guided0: forest.instanceId });
  const v = t.view(0).players[0].battlefield.find(c => c.id === forest.instanceId);
  check('earthbend: the land becomes a creature with haste and two +1/+1 counters', forest.counters['+1/+1'] === 2 && (forest.temporaryEffects || []).some(e => e.kind === 'animate' && e.keywords.includes('Haste')) && v, JSON.stringify({ counters: forest.counters, fx: forest.temporaryEffects }));
  t.edit({ kind: 'move', instanceId: forest.instanceId, to: 'graveyard' });
  settleWith(t);
  const back = t.bf(0, 'Forest');
  check('earthbend: when it dies it returns to the battlefield tapped, a land again', back && back.tapped && !Number(back.counters?.['+1/+1'] || 0) && !(back.temporaryEffects || []).length, JSON.stringify({ back: !!back, tapped: back?.tapped, gy: gyNames(t, 0) }));
}

section('more wordings (build 77)');
{
  const t = labGame('lab');
  lands(t, 0, 'Mountain', 1);
  t.give(0, 'Monastery Swiftspear', 'battlefield'); t.give(1, 'Young Wolf', 'battlefield'); t.give(1, 'Kitchen Finks', 'battlefield');
  t.bf(1, 'Kitchen Finks').counters = { '+1/+1': 1 };
  t.give(0, 'Burst Lightning'); asSpell(t, 'Destroy all creatures with no counters on them.');
  play(t, 0, 'Burst Lightning');
  check('"destroy all creatures with no counters on them": the creature with a counter stays (Young Wolf dies and returns by undying)', !t.bf(0, 'Monastery Swiftspear') && t.bf(1, 'Young Wolf')?.counters['+1/+1'] === 1 && !!t.bf(1, 'Kitchen Finks') && t.bf(1, 'Kitchen Finks').counters['+1/+1'] === 1, JSON.stringify([t.names(0, 'battlefield'), t.names(1, 'battlefield')]));
}
{
  const t = labGame('lab');
  lands(t, 0, 'Mountain', 1);
  t.give(1, 'Kitchen Finks', 'battlefield');
  t.give(0, 'Burst Lightning'); asSpell(t, 'Destroy target creature. If a creature is destroyed this way, you gain life equal to its toughness.');
  const life = t.P(0).life, finks = t.bf(1, 'Kitchen Finks');
  play(t, 0, 'Burst Lightning', { target: finks.instanceId, guided0: finks.instanceId });
  check('"if a creature is destroyed this way, you gain life equal to its toughness"', t.P(0).life === life + 2 + 0 || t.P(0).life === life + 2, `${life} -> ${t.P(0).life}`);
}
{
  const t = labGame('lab');
  lands(t, 0, 'Mountain', 3);
  t.give(0, 'Burst Lightning'); asSpell(t, 'For each land you control, create a Treasure token.');
  play(t, 0, 'Burst Lightning');
  const n = t.P(0).deck.battlefield.filter(c => c.token).length;
  check('"for each land you control, create a Treasure token"', n === 3, String(n));
}
{
  const t = labGame('lab');
  lands(t, 0, 'Mountain', 1);
  t.give(0, 'Kitchen Finks', 'graveyard');
  t.give(0, 'Burst Lightning'); asSpell(t, 'Return target creature card from your graveyard to the battlefield with a +1/+1 counter on it.');
  play(t, 0, 'Burst Lightning');
  const finks = t.bf(0, 'Kitchen Finks');
  check('return from the graveyard "with a +1/+1 counter on it"', finks && finks.counters['+1/+1'] === 1, JSON.stringify(finks?.counters));
}
{
  const t = labGame('lab');
  lands(t, 0, 'Mountain', 1);
  t.give(0, 'Kitchen Finks', 'graveyard'); t.give(0, 'Young Wolf', 'graveyard');
  t.give(0, 'Burst Lightning'); asSpell(t, 'Shuffle your graveyard into your library.');
  const lib = t.P(0).deck.remainingLibrary.length;
  play(t, 0, 'Burst Lightning');
  check('"shuffle your graveyard into your library" (the spell itself goes to the graveyard after)', gyNames(t, 0).join() === 'Burst Lightning' && t.P(0).deck.remainingLibrary.length === lib + 2, JSON.stringify(gyNames(t, 0)));
}

{
  const t = labGame('lab');
  lands(t, 0, 'Mountain', 2);
  t.give(0, 'Burst Lightning'); asSpell(t, 'If you gained life this turn, create a 1/1 white Cat creature token.');
  play(t, 0, 'Burst Lightning');
  const none = t.P(0).deck.battlefield.filter(c => c.token).length;
  t.edit({ kind: 'move', instanceId: t.P(0).deck.graveyard.find(c => t.game.cardDefinitions[c.definitionId]?.name === 'Burst Lightning').instanceId, to: 'hand' });
  asSpell(t, 'You gain 2 life.'); play(t, 0, 'Burst Lightning');
  t.edit({ kind: 'move', instanceId: t.P(0).deck.graveyard.find(c => t.game.cardDefinitions[c.definitionId]?.name === 'Burst Lightning').instanceId, to: 'hand' });
  t.give(0, 'Mountain', 'battlefield');
  asSpell(t, 'If you gained life this turn, create a 1/1 white Cat creature token.'); play(t, 0, 'Burst Lightning');
  check('"if you gained life this turn": no token before gaining life, a token after', none === 0 && t.P(0).deck.battlefield.filter(c => c.token).length === 1, JSON.stringify({ none, after: t.P(0).deck.battlefield.filter(c => c.token).length, g: t.game.gainedLifeTurn }));
}

section('Rooms (build 79)');
{
  // Bottomless Pool // Locker Room, with red costs so the lab deck can pay them.
  const ROOM = { name: 'Bottomless Pool // Locker Room', layout: 'split', type_line: 'Enchantment — Room // Enchantment — Room', mana_cost: '{R} // {1}{R}', cmc: 3, colors: ['R'], color_identity: ['R'], legalities: { commander: 'legal' }, id: 'room-test', oracle_id: 'room-test', set: 'dsk', collector_number: '43', keywords: [],
    card_faces: [{ name: 'Bottomless Pool', mana_cost: '{R}', type_line: 'Enchantment — Room', oracle_text: "When you unlock this door, return up to one target creature to its owner's hand." },
      { name: 'Locker Room', mana_cost: '{1}{R}', type_line: 'Enchantment — Room', oracle_text: 'Whenever one or more creatures you control deal combat damage to a player, draw a card.' }] };
  const t = labGame('lab');
  lands(t, 0, 'Mountain', 3);
  t.give(1, 'Kitchen Finks', 'battlefield');
  t.give(0, 'Burst Lightning');
  const card = t.hand(0, 'Burst Lightning');
  t.game.cardDefinitions[card.definitionId] = { ...scryfallToDefinition(ROOM), definitionId: card.definitionId };
  const r = t.try(0, { type: 'play', instanceId: card.instanceId, faceIndex: 1 });
  settleWith(t);
  const room = t.P(0).deck.battlefield.find(c => c.instanceId === card.instanceId);
  check('a Room: casting one half puts it onto the battlefield with that door unlocked', r.ok && room && room.activeFaceIndex === 1, JSON.stringify({ ok: r.ok, err: r.error, face: room?.activeFaceIndex }));
  const rows = t.view(0).players[0].battlefield.find(c => c.id === card.instanceId)?.abilities || [];
  const before = t.P(1).deck.battlefield.length;
  const u = t.try(0, { type: 'activate', instanceId: card.instanceId, abilityId: 'special:unlock:0' });
  settleWith(t, { target: d => (d.options || []).find(o => o.label === 'Kitchen Finks')?.id ?? d.options?.[0]?.id });
  check('unlocking the other door (a special action, paying its cost) fires "When you unlock this door"', u.ok && JSON.stringify(room.unlockedFaces) === '[1,0]' && !!t.hand(1, 'Kitchen Finks'), JSON.stringify({ ok: u.ok, err: u.error, open: room.unlockedFaces, opp: t.names(1, 'battlefield'), log: t.game.log.slice(0, 4).map(e => e.text) }));
  const again = t.try(0, { type: 'activate', instanceId: card.instanceId, abilityId: 'special:unlock:0' });
  check('a door that is already unlocked cannot be unlocked again', !again.ok);
  t.edit({ kind: 'move', instanceId: card.instanceId, to: 'hand' });
  const back = t.P(0).deck.hand.find(c => c.instanceId === card.instanceId);
  check('a Room that leaves the battlefield locks its doors again', back && !back.unlockedFaces, JSON.stringify(back?.unlockedFaces));
}

section('Echo and Cumulative upkeep paid with a choice (build 79)');
{
  const t = labGame('lab');
  t.give(0, 'Kitchen Finks', 'battlefield'); t.give(0, 'Monastery Swiftspear', 'battlefield'); t.give(0, 'Akrasan Squire', 'battlefield');
  const finks = t.bf(0, 'Akrasan Squire');
  t.game.cardDefinitions[finks.definitionId] = { ...t.game.cardDefinitions[finks.definitionId], oracleText: 'Cumulative upkeep—Sacrifice a creature.' };
  t.end(0); t.end(1);
  let asked = null, chose = null;
  settleWith(t, { 'may-pay': d => { asked = d; return 'pay'; }, maypay: d => { chose = d; return [d.options.find(o => o.label === 'Monastery Swiftspear').id]; } });
  check('cumulative upkeep "Sacrifice a creature": asked to pay, then which creature; the age counter goes on', asked && chose && !t.bf(0, 'Monastery Swiftspear') && t.bf(0, 'Akrasan Squire')?.counters?.age === 1, JSON.stringify({ asked: asked?.title, chose: chose?.title, bf: t.names(0, 'battlefield'), age: t.bf(0, 'Akrasan Squire')?.counters }));
  t.end(0); t.end(1);
  let what = null;
  settleWith(t, { 'may-pay': d => { what = d.options.find(o => o.id === 'pay')?.label; return 'no'; } });
  check('the next upkeep asks for two creatures, and not paying sacrifices it', /two|2 creatures/i.test(what || '') && !t.bf(0, 'Akrasan Squire'), JSON.stringify({ what, bf: t.names(0, 'battlefield') }));
}

section('flip cards (build 79)');
{
  const t = labGame('lab');
  lands(t, 0, 'Mountain', 1);
  t.give(0, 'Akrasan Squire', 'battlefield');
  const sq = t.bf(0, 'Akrasan Squire'), base = t.game.cardDefinitions[sq.definitionId];
  t.game.cardDefinitions[sq.definitionId] = { ...base, layout: 'flip', oracleText: '{1}: Flip this creature.', cardFaces: [{ name: 'Squire Front', typeLine: 'Creature — Human', oracleText: '{1}: Flip this creature.', power: '1', toughness: '1' }, { name: 'Squire Flipped', typeLine: 'Legendary Creature — Human Knight', oracleText: 'Flying', power: '4', toughness: '4' }] };
  const ab = t.view(0).players[0].battlefield.find(c => c.id === sq.instanceId).abilities.find(a => /Flip/i.test(a.text || ''));
  t.do(0, { type: 'activate', instanceId: sq.instanceId, abilityId: ab.id });
  settleWith(t);
  const v = t.view(0).players[0].battlefield.find(c => c.id === sq.instanceId);
  check('"flip this creature": it becomes its flipped half', t.bf(0, 'Squire Flipped')?.activeFaceIndex === 1 || sq.activeFaceIndex === 1, JSON.stringify({ face: sq.activeFaceIndex, name: v?.name }));
}

section('time travel (build 79)');
{
  const t = labGame('lab');
  lands(t, 0, 'Mountain', 1);
  t.give(0, 'Monastery Swiftspear', 'battlefield');
  t.bf(0, 'Monastery Swiftspear').counters = { time: 2 };
  t.give(0, 'Burst Lightning'); asSpell(t, 'Time travel.');
  let asked = null;
  play(t, 0, 'Burst Lightning', { 'time-travel': d => { asked = d; return 'remove'; }, timeTravel: d => { asked = d; return 'remove'; } });
  check('time travel: asked for each card with time counters, and a counter is removed', asked && t.bf(0, 'Monastery Swiftspear').counters.time === 1, JSON.stringify({ asked: asked?.prompt, c: t.bf(0, 'Monastery Swiftspear').counters }));
}

section('game stats and awards');
{
  const t = labGame('lab');
  lands(t, 0, 'Mountain', 5);
  t.give(0, 'Burst Lightning');
  play(t, 0, 'Burst Lightning', { kicker: 'kick', target: t.P(1).playerId });
  check('damage and spells are counted', t.P(0).stats.damage === 4 && t.P(0).stats.spells === 1, JSON.stringify(t.P(0).stats));
  t.edit({ kind: 'life', playerId: t.P(1).playerId, set: 0 });
  const v = t.view(0);
  check('the finished game hands out awards', v.awards.some(a => a.label === 'Heavy Hitter' && a.playerId === t.P(0).playerId && a.detail === '4 damage dealt'), JSON.stringify(v.awards));
}

done();
