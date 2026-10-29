import { parseActivatedAbilities } from '../../src/engine/rules.js';
import { newGame, check, section, done } from './harness.mjs';

const mana = (t, i) => t.view(i).players[i].mana;

section('lands, mana, creatures, triggers');
{
  const t = newGame(['simic', 'white']);
  t.keepAll();
  for (const n of ['Forest', 'Island', 'Sol Ring', 'Elvish Visionary', 'Llanowar Elves']) t.give(0, n);
  t.do(0, { type: 'play', instanceId: t.hand(0, 'Forest').instanceId });
  check('land on battlefield', !!t.bf(0, 'Forest'));
  check('1 green available', mana(t, 0).fixed.G === 1);
  const second = t.try(0, { type: 'play', instanceId: t.hand(0, 'Island').instanceId });
  check('second land refused', !second.ok && /land/i.test(second.error), second.error);
  t.do(0, { type: 'play', instanceId: t.hand(0, 'Llanowar Elves').instanceId });
  check('elves resolved (no responses)', !!t.bf(0, 'Llanowar Elves') && t.game.stack.length === 0);
  check('forest tapped to pay', t.bf(0, 'Forest').tapped);
  check('elves are summoning sick → no mana', mana(t, 0).total === 0, JSON.stringify(mana(t, 0)));
  t.do(0, { type: 'next-phase' });
  check('combat auto-skipped to main 2', t.game.phase === 'postcombat-main', t.game.phase);
  t.do(0, { type: 'next-phase' });
  t.discardIfNeeded(0);
  check('turn passed to P2', t.game.activePlayerId === t.P(1).playerId && t.game.phase === 'precombat-main');
  check('turn number 2', t.game.turnNumber === 2);
  t.end(1);
  check('back to P1 turn 3', t.game.activePlayerId === t.P(0).playerId && t.game.turnNumber === 3);
  check('forest untapped', !t.bf(0, 'Forest').tapped);
  check('2 green (forest + elves)', mana(t, 0).fixed.G === 2, JSON.stringify(mana(t, 0)));
  t.do(0, { type: 'play', instanceId: t.hand(0, 'Island').instanceId });
  const handBefore = t.P(0).deck.hand.length;
  t.do(0, { type: 'play', instanceId: t.hand(0, 'Elvish Visionary').instanceId });
  check('visionary entered and drew a card', !!t.bf(0, 'Elvish Visionary') && t.P(0).deck.hand.length === handBefore, `${t.P(0).deck.hand.length} vs ${handBefore}`);
  t.do(0, { type: 'play', instanceId: t.hand(0, 'Sol Ring').instanceId });
  check('sol ring adds 2 colorless', mana(t, 0).fixed.C === 2, JSON.stringify(mana(t, 0)));
}

section('commander cast + tax');
{
  const t = newGame(['white', 'simic']);
  t.keepAll();
  t.give(0, 'Plains');
  t.do(0, { type: 'play', instanceId: t.hand(0, 'Plains').instanceId });
  const cmd = t.P(0).deck.commandZone[0];
  check('commander playable in view', t.view(0).players[0].command[0].playable === true);
  t.do(0, { type: 'play', instanceId: cmd.instanceId });
  check('isamaru on battlefield', !!t.bf(0, 'Isamaru, Hound of Konda'));
  check('tax is 2', t.P(0).commanders[0].commanderTax === 2);
  t.edit({ kind: 'move', instanceId: cmd.instanceId, to: 'command' });
  check('back in command zone', t.P(0).deck.commandZone.length === 1 && t.P(0).commanders[0].zone === 'command');
  const again = t.try(0, { type: 'play', instanceId: cmd.instanceId });
  check('cannot afford with tax', !again.ok, again.error);
}

section('instants, targets, priority, counterspell');
{
  const t = newGame(['rakdos', 'simic'], { autoPass: false });
  t.keepAll();
  t.give(0, 'Mountain', 'battlefield'); t.give(0, 'Mountain', 'battlefield');
  t.give(1, 'Island', 'battlefield'); t.give(1, 'Island', 'battlefield');
  t.give(1, 'Grizzly Bears', 'battlefield');
  t.give(0, 'Lightning Bolt'); t.give(0, 'Shock'); t.give(1, 'Counterspell');
  t.do(0, { type: 'play', instanceId: t.hand(0, 'Lightning Bolt').instanceId });
  const d = t.decision();
  check('asks for a target', d?.kind === 'choose-one' && d.targeting === true, JSON.stringify(d));
  check('targets include players and the bear', d.options.some(o => o.playerId === t.P(1).playerId) && d.options.some(o => o.label === 'Grizzly Bears'));
  t.answer(d.options.find(o => o.label === 'Grizzly Bears').id);
  check('bolt on stack, P2 has priority', t.game.stack.length === 1 && t.game.flow.priority?.holderId === t.P(1).playerId);
  check('P2 prompt is priority', t.view(1).prompt.kind === 'priority');
  check('P1 waits', t.view(0).prompt.kind === 'waiting');
  check('counterspell flagged as response', t.view(1).actions.respond.cards.includes(t.hand(1, 'Counterspell').instanceId));
  t.do(1, { type: 'play', instanceId: t.hand(1, 'Counterspell').instanceId });
  const d2 = t.decision();
  check('counterspell targets the stack', d2?.options?.length === 1, JSON.stringify(d2?.options));
  t.answer(d2.options[0].id);
  check('P1 may respond to the counterspell (has Shock)', t.game.flow.priority?.holderId === t.P(0).playerId);
  t.do(0, { type: 'pass' });
  check('bolt countered, bear alive', t.game.stack.length === 0 && !!t.bf(1, 'Grizzly Bears') && t.names(0, 'graveyard').includes('Lightning Bolt') && t.names(1, 'graveyard').includes('Counterspell'), JSON.stringify([t.game.stack.length, t.names(0, 'graveyard'), t.names(1, 'graveyard')]));
  t.do(0, { type: 'play', instanceId: t.hand(0, 'Shock').instanceId });
  t.answer(t.decision().options.find(o => o.label === 'Grizzly Bears').id);
  check('shock resolves (no response possible) and kills bear', !t.bf(1, 'Grizzly Bears') && t.names(1, 'graveyard').includes('Grizzly Bears'), JSON.stringify(t.names(1, 'graveyard')));
}

section('pass priority → resolves');
{
  const t = newGame(['rakdos', 'simic'], { autoPass: false });
  t.keepAll();
  t.give(0, 'Mountain', 'battlefield');
  t.give(1, 'Island', 'battlefield'); t.give(1, 'Forest', 'battlefield');
  t.give(0, 'Lightning Bolt'); t.give(1, 'Opt');
  t.do(0, { type: 'play', instanceId: t.hand(0, 'Lightning Bolt').instanceId });
  t.answer(t.decision().options.find(o => o.playerId === t.P(1).playerId).id);
  check('P2 may respond with Opt', t.game.flow.priority?.holderId === t.P(1).playerId);
  t.do(1, { type: 'pass' });
  check('bolt hit P2 for 3', t.P(1).life === 37 && t.game.stack.length === 0, String(t.P(1).life));
}

section('combat');
{
  const t = newGame(['white', 'simic', 'rakdos']);
  t.keepAll();
  for (const n of ['Serra Angel', 'White Knight', "Healer's Hawk"]) t.give(0, n, 'battlefield');
  t.give(1, 'Grizzly Bears', 'battlefield'); t.give(1, 'Colossal Dreadmaw', 'battlefield');
  t.give(2, 'Vampire Nighthawk', 'battlefield');
  // creatures put in by the host this turn are summoning sick; pass a full round.
  t.end(0); t.end(1); t.end(2);
  check('P1 turn 4', t.game.activePlayerId === t.P(0).playerId && t.game.turnNumber === 4, `${t.game.turnNumber}`);
  t.do(0, { type: 'next-phase' });
  check('in combat, attack options listed', t.game.phase === 'combat' && t.view(0).actions.attack.length === 3, `${t.game.phase} ${JSON.stringify(t.view(0).actions.attack)}`);
  const angel = t.bf(0, 'Serra Angel'), knight = t.bf(0, 'White Knight'), hawk = t.bf(0, "Healer's Hawk");
  t.do(0, { type: 'attack', attacks: [
    { instanceId: angel.instanceId, defenderId: t.P(2).playerId },
    { instanceId: knight.instanceId, defenderId: t.P(1).playerId },
    { instanceId: hawk.instanceId, defenderId: t.P(1).playerId }
  ] });
  check('vigilance: angel untapped, knight tapped', !angel.tapped && knight.tapped);
  check('both defenders must block', t.game.flow.blocks?.pending.length === 2, JSON.stringify(t.game.flow.blocks));
  const rows = t.view(1).prompt.rows;
  check('P2 block rows', t.view(1).prompt.kind === 'blocks' && rows.length === 2);
  const hawkRow = rows.find(r => r.attackerId === hawk.instanceId);
  check('nobody can block the flyer', hawkRow.blockers.length === 0, JSON.stringify(hawkRow));
  t.do(1, { type: 'block', assignments: [{ attackerId: knight.instanceId, blockerId: t.bf(1, 'Grizzly Bears').instanceId }] });
  check('still waiting for P3', t.game.flow.blocks?.pending.length === 1);
  t.do(2, { type: 'block', assignments: [{ attackerId: angel.instanceId, blockerId: t.bf(2, 'Vampire Nighthawk').instanceId }] });
  check('combat finished → main 2', t.game.phase === 'postcombat-main', t.game.phase);
  check('first strike: bear died, knight lived', !t.bf(1, 'Grizzly Bears') && !!t.bf(0, 'White Knight'));
  check('deathtouch killed angel; nighthawk died to 4 dmg', !t.bf(0, 'Serra Angel') && !t.bf(2, 'Vampire Nighthawk'));
  check('lifelink: hawk dealt 1, P1 gained 1; nighthawk lifelink +2 for P3', t.P(1).life === 39 && t.P(0).life === 41 && t.P(2).life === 42, `${t.P(0).life} ${t.P(1).life} ${t.P(2).life}`);
}

section('commander damage + trample + elimination');
{
  const t = newGame(['simic', 'white']);
  t.keepAll();
  t.give(0, 'Colossal Dreadmaw', 'battlefield');
  t.give(1, 'Soul Warden', 'battlefield');
  t.end(0); t.end(1);
  t.do(0, { type: 'next-phase' });
  const maw = t.bf(0, 'Colossal Dreadmaw');
  t.do(0, { type: 'attack', attacks: [{ instanceId: maw.instanceId, defenderId: t.P(1).playerId }] });
  t.do(1, { type: 'block', assignments: [{ attackerId: maw.instanceId, blockerId: t.bf(1, 'Soul Warden').instanceId }] });
  check('trample: 5 through', t.P(1).life === 35, String(t.P(1).life));
  t.edit({ kind: 'life', playerId: t.P(1).playerId, set: 0 });
  check('P2 eliminated, P1 wins', t.game.status === 'complete' && t.game.winner === t.P(0).playerId);
  check('view says complete', t.view(0).prompt.kind === 'complete');
}

section('library search, scry, discard, graveyard, tokens, wrath');
{
  const t = newGame(['simic', 'rakdos']);
  t.keepAll();
  for (const n of ['Forest', 'Forest', 'Island', 'Sol Ring']) t.give(0, n, 'battlefield');
  t.give(0, 'Rampant Growth'); t.give(0, 'Cultivate'); t.give(0, 'Opt');
  const lands = () => t.P(0).deck.battlefield.filter(c => /Land/.test(t.game.cardDefinitions[c.definitionId].typeLine)).length;
  const before = lands();
  t.do(0, { type: 'play', instanceId: t.hand(0, 'Rampant Growth').instanceId });
  let d = t.decision();
  check('search decision is private choose-many', d?.kind === 'choose-many' && d.private && d.options.length > 5, JSON.stringify(d && { k: d.kind, n: d.options.length }));
  check('opponent sees no options', !t.view(1).prompt.decision?.options && t.view(1).prompt.kind === 'waiting');
  t.answer([d.options[0].id]);
  check('land fetched tapped', lands() === before + 1 && t.P(0).deck.battlefield.at(-1).tapped);
  t.do(0, { type: 'play', instanceId: t.hand(0, 'Cultivate').instanceId });
  d = t.decision();
  const hand0 = t.P(0).deck.hand.length;
  t.answer([d.options[0].id, d.options[1].id]);
  check('cultivate: one to battlefield, one to hand', lands() === before + 2 && t.P(0).deck.hand.length === hand0 + 1, `${lands()} ${t.P(0).deck.hand.length}`);
  t.end(0); t.end(1);
  t.do(0, { type: 'play', instanceId: t.hand(0, 'Opt').instanceId });
  d = t.decision();
  check('opt asks to arrange (scry) at resolution', d?.kind === 'arrange' && d.cards.length === 1, JSON.stringify(d));
  const topId = d.cards[0].id, h = t.P(0).deck.hand.length;
  t.answer({ top: [], other: [topId] });
  check('scry to bottom then draw', t.P(0).deck.remainingLibrary.at(-1).instanceId === topId && t.P(0).deck.hand.length === h + 1);
}
{
  const t = newGame(['rakdos', 'white']);
  t.keepAll();
  for (const n of ['Swamp', 'Mountain', 'Sol Ring', 'Command Tower', 'Badlands']) t.give(0, n, 'battlefield');
  for (const n of ['Mind Rot', 'Dragon Fodder', 'Reanimate', 'Gravedigger', 'Storm the Vault Oddity']) t.give(0, n);
  check('badlands/tower are flexible sources', t.view(0).players[0].mana.flex.length >= 1, JSON.stringify(t.view(0).players[0].mana));
  for (const n of ['Plains', 'Plains', 'Plains']) t.give(1, n);
  t.do(0, { type: 'play', instanceId: t.hand(0, 'Mind Rot').instanceId });
  t.answer(t.decision().options.find(o => o.playerId === t.P(1).playerId).id);
  let d = t.decision();
  check('target player chooses the discard', d?.playerId === t.P(1).playerId && d.kind === 'choose-many' && d.min === 2, JSON.stringify(d && { p: d.playerId, k: d.kind }));
  check('P2 gets the decision in view', t.view(1).prompt.kind === 'decision');
  t.answer([d.options[0].id, d.options[1].id]);
  check('P2 discarded 2', t.P(1).deck.hand.length === 1 && t.P(1).deck.graveyard.length === 2);
  t.end(0); t.end(1);
  t.do(0, { type: 'play', instanceId: t.hand(0, 'Dragon Fodder').instanceId });
  check('two goblin tokens', t.P(0).deck.battlefield.filter(c => c.token).length === 2);
  t.give(1, 'Serra Angel', 'graveyard');
  t.do(0, { type: 'play', instanceId: t.hand(0, 'Reanimate').instanceId });
  d = t.decision();
  t.answer(d.options.find(o => o.label === 'Serra Angel').id);
  check('reanimated angel under P1 control', !!t.bf(0, 'Serra Angel'), JSON.stringify(t.names(0, 'battlefield')));
  check('lost 5 life', t.P(0).life === 35, String(t.P(0).life));
  t.end(0); t.end(1);
  t.do(0, { type: 'play', instanceId: t.hand(0, 'Storm the Vault Oddity').instanceId });
  check('unsupported spell goes guided', t.game.flow.guided && t.view(0).prompt.kind === 'guided', JSON.stringify(t.game.flow.guided));
  check('controller may edit while guided', t.view(0).canEdit === true);
  const ed = t.ctl.dispatch({ type: 'edit', edit: { kind: 'life', playerId: t.P(1).playerId, delta: -1 } }, t.as(0));
  check('guided edit accepted', ed.ok, ed.error);
  t.do(0, { type: 'guided-done' });
  check('guided spell finished', t.game.stack.length === 0 && t.names(0, 'graveyard').includes('Storm the Vault Oddity'));
  const refused = t.ctl.dispatch({ type: 'edit', edit: { kind: 'life', playerId: t.P(1).playerId, delta: -1 } }, t.as(0));
  check('edit refused outside guided for non-host', !refused.ok);
  t.give(1, 'Day of Judgment'); for (const n of ['Plains', 'Plains', 'Plains', 'Plains']) t.give(1, n, 'battlefield');
  t.end(0);
  t.do(1, { type: 'play', instanceId: t.hand(1, 'Day of Judgment').instanceId }); t.passAll();
  check('wrath cleared creatures', t.P(0).deck.battlefield.every(c => !/Creature/.test(t.game.cardDefinitions[c.definitionId].typeLine)), JSON.stringify(t.names(0, 'battlefield')));
  check('stolen angel returned to owner graveyard', t.names(1, 'graveyard').includes('Serra Angel'));
}

section('triggers: soul warden, landfall, optional gravedigger, anthem');
{
  const t = newGame(['white', 'simic']);
  t.keepAll();
  for (const n of ['Plains', 'Plains', 'Plains', 'Plains', 'Soul Warden']) t.give(0, n, 'battlefield');
  t.give(0, 'White Knight'); t.give(0, 'Glorious Anthem');
  t.do(0, { type: 'play', instanceId: t.hand(0, 'White Knight').instanceId });
  check('soul warden gained 1', t.P(0).life === 41, String(t.P(0).life));
  t.end(0); t.end(1);
  t.do(0, { type: 'play', instanceId: t.hand(0, 'Glorious Anthem').instanceId });
  const knight = t.view(0).players[0].battlefield.find(c => c.name === 'White Knight');
  check('anthem: knight is 3/3', knight.power === 3 && knight.toughness === 3, `${knight.power}/${knight.toughness}`);
}
{
  const t = newGame(['simic', 'rakdos']);
  t.keepAll();
  t.give(0, 'Tatyova, Benthic Druid', 'battlefield');
  t.give(0, 'Forest');
  const h = t.P(0).deck.hand.length;
  t.do(0, { type: 'play', instanceId: t.hand(0, 'Forest').instanceId });
  check('landfall: +1 life and a card', t.P(0).life === 41 && t.P(0).deck.hand.length === h, `${t.P(0).life} ${t.P(0).deck.hand.length} ${h}`);
  t.end(0);
  for (const n of ['Swamp', 'Swamp', 'Swamp', 'Mountain']) t.give(1, n, 'battlefield');
  t.give(1, 'Vampire Nighthawk', 'graveyard'); t.give(1, 'Gravedigger');
  t.do(1, { type: 'play', instanceId: t.hand(1, 'Gravedigger').instanceId }); t.passAll();
  let d = t.decision();
  check('gravedigger trigger asks for target', d?.kind === 'choose-one' && d.options.some(o => o.label === 'Vampire Nighthawk'), JSON.stringify(d));
  t.answer(d.options.find(o => o.label === 'Vampire Nighthawk').id);
  d = t.decision();
  check('"you may" asks to confirm at resolution', d?.kind === 'confirm', JSON.stringify(d));
  t.answer(true);
  check('nighthawk back in hand', !!t.hand(1, 'Vampire Nighthawk'));
}

section('MDFC, hand mana ability, mana ability activation, sacrifice search');
{
  const t = newGame(['simic', 'rakdos']);
  t.keepAll();
  t.give(0, 'Bala Ged Recovery // Bala Ged Sanctuary'); t.give(0, 'Evolving Wilds', 'battlefield');
  const mdfc = t.hand(0, 'Bala Ged Recovery // Bala Ged Sanctuary');
  t.do(0, { type: 'play', instanceId: mdfc.instanceId });
  let d = t.decision();
  check('face choice offered', d?.options?.length === 2 && d.options[0].disabled && !d.options[1].disabled, JSON.stringify(d?.options));
  t.answer(1);
  const land = t.P(0).deck.battlefield.find(c => c.instanceId === mdfc.instanceId);
  check('played as land face, tapped', !!land && land.tapped && land.activeFaceIndex === 1);
  t.end(0); t.end(1);
  const wilds = t.bf(0, 'Evolving Wilds');
  const ab = t.view(0).players[0].battlefield.find(c => c.id === wilds.instanceId).abilities;
  check('wilds ability listed legal', ab.length === 1 && ab[0].legal, JSON.stringify(ab));
  t.do(0, { type: 'activate', instanceId: wilds.instanceId, abilityId: ab[0].id });
  d = t.decision();
  check('wilds search at resolution', d?.kind === 'choose-many' && d.private, JSON.stringify(d && d.kind));
  t.answer([d.options[0].id]);
  check('wilds sacrificed, basic fetched', t.names(0, 'graveyard').includes('Evolving Wilds') && !t.bf(0, 'Evolving Wilds'));
}
{
  const t = newGame(['rakdos', 'simic']);
  t.keepAll();
  t.give(0, 'Simian Spirit Guide'); t.give(0, 'Raging Goblin'); t.give(0, 'Sol Ring', 'battlefield');
  const guide = t.hand(0, 'Simian Spirit Guide');
  check('goblin castable via spirit guide (flex source in hand)', t.view(0).players[0].hand.find(c => c.name === 'Raging Goblin').playable);
  t.do(0, { type: 'play', instanceId: t.hand(0, 'Raging Goblin').instanceId });
  check('guide exiled to pay', t.names(0, 'exile').includes('Simian Spirit Guide') && !!t.bf(0, 'Raging Goblin'), JSON.stringify(t.names(0, 'exile')));
  const ring = t.bf(0, 'Sol Ring');
  const ab = t.view(0).players[0].battlefield.find(c => c.id === ring.instanceId).abilities[0];
  t.do(0, { type: 'activate', instanceId: ring.instanceId, abilityId: ab.id });
  check('ring tapped, 2 floating', ring.tapped && t.P(0).mana.floating.C === 2);
  t.do(0, { type: 'next-phase' });
  check('haste goblin can attack', t.view(0).actions.attack?.length === 1, JSON.stringify(t.view(0).actions.attack));
}

section('equipment and auras');
{
  const t = newGame(['white', 'simic']);
  t.keepAll();
  for (const n of ['Plains', 'Plains', 'Plains', 'Plains', 'Plains']) t.give(0, n, 'battlefield');
  for (const n of ['Swiftfoot Boots', 'Bonesplitter', 'Holy Strength', 'White Knight']) t.give(0, n);
  t.do(0, { type: 'play', instanceId: t.hand(0, 'White Knight').instanceId });
  const knight = () => t.view(0).players[0].battlefield.find(c => c.name === 'White Knight');
  check('knight is summoning sick', knight().sick && t.view(0).actions.attack === null);
  t.do(0, { type: 'play', instanceId: t.hand(0, 'Bonesplitter').instanceId });
  const split = t.view(0).players[0].battlefield.find(c => c.name === 'Bonesplitter');
  check('equip ability is offered', split.abilities.length === 1 && split.abilities[0].legal, JSON.stringify(split.abilities));
  t.do(0, { type: 'activate', instanceId: split.id, abilityId: split.abilities[0].id });
  t.answer(t.decision().options.find(o => o.label === 'White Knight').id);
  check('bonesplitter: knight is 4/2', knight().power === 4 && knight().toughness === 2, `${knight().power}/${knight().toughness}`);
  t.do(0, { type: 'play', instanceId: t.hand(0, 'Holy Strength').instanceId });
  check('aura asks what to enchant', t.decision()?.targeting === true);
  t.answer(t.decision().options.find(o => o.label === 'White Knight').id);
  check('holy strength: knight is 5/4 with 2 attachments', knight().power === 5 && knight().toughness === 4 && knight().attachments.length === 2, `${knight().power}/${knight().toughness}`);
  t.end(0); t.end(1);
  t.do(0, { type: 'play', instanceId: t.hand(0, 'Swiftfoot Boots').instanceId });
  const eq = t.try(1, { type: 'activate', instanceId: split.id, abilityId: split.abilities[0].id });
  check('other players cannot use my equipment', !eq.ok);
  t.edit({ kind: 'move', instanceId: knight().id, to: 'graveyard' });
  check('aura went to the graveyard with its creature; equipment stays', t.names(0, 'graveyard').includes('Holy Strength') && !!t.bf(0, 'Bonesplitter') && !t.bf(0, 'Bonesplitter').attachedTo, JSON.stringify(t.names(0, 'graveyard')));
  t.give(0, 'Serra Angel', 'battlefield');
  const boots = t.view(0).players[0].battlefield.find(c => c.name === 'Swiftfoot Boots');
  t.do(0, { type: 'activate', instanceId: boots.id, abilityId: boots.abilities[0].id });
  t.answer(t.decision().options.find(o => o.label === 'Serra Angel').id);
  t.do(0, { type: 'next-phase' });
  check('boots give haste: the new angel can attack', t.view(0).actions.attack?.some(a => a.instanceId === t.bf(0, 'Serra Angel').instanceId), JSON.stringify(t.view(0).actions.attack));
}

section('cleanup discard, undo, veto, vote, redaction, concede, physical draw, freeplay');
{
  const t = newGame(['white', 'simic'], { keepHands: true });
  t.keepAll();
  for (let i = 0; i < 3; i++) t.edit({ kind: 'draw', playerId: t.P(0).playerId, count: 1 });
  check('11 in hand', t.P(0).deck.hand.length === 11);
  t.do(0, { type: 'end-turn' });
  check('discard prompt for 4', t.view(0).prompt.kind === 'discard' && t.view(0).prompt.need === 4, JSON.stringify(t.view(0).prompt));
  const bad = t.try(0, { type: 'discard', ids: [t.P(0).deck.hand[0].instanceId] });
  check('wrong discard count refused', !bad.ok);
  t.do(0, { type: 'discard', ids: t.P(0).deck.hand.slice(0, 4).map(c => c.instanceId) });
  check('turn passed after discard', t.game.activePlayerId === t.P(1).playerId && t.P(0).deck.hand.length === 7);
  const v = t.view(0);
  check('own hand visible, opponent hand hidden', Array.isArray(v.players[0].hand) && v.players[1].hand === null && v.players[1].handCount === 8);
  const j = t.view(null);
  check('judge view sees no hands', j.players.every(p => p.hand === null));
  check('no library contents anywhere in view', !JSON.stringify(v).includes('remainingLibrary'));
  const life = t.P(0).life;
  t.edit({ kind: 'life', playerId: t.P(0).playerId, delta: -5 });
  check('edit applied', t.P(0).life === life - 5);
  check('non-host cannot undo in guided', !t.ctl.dispatch({ type: 'undo' }, t.as(0)).ok);
  check('host undo', t.ctl.dispatch({ type: 'undo' }, t.host).ok && t.P(0).life === life);
}
{
  const t = newGame(['rakdos', 'simic'], { autoPass: false });
  t.keepAll();
  t.give(0, 'Mountain', 'battlefield'); t.give(1, 'Island', 'battlefield'); t.give(1, 'Forest', 'battlefield'); t.give(1, 'Opt');
  t.give(0, 'Lightning Bolt');
  t.do(0, { type: 'play', instanceId: t.hand(0, 'Lightning Bolt').instanceId });
  t.answer(t.decision().options.find(o => o.playerId === t.P(1).playerId).id);
  const r = t.ctl.dispatch({ type: 'veto', stackId: t.game.stack[0].id }, t.host);
  check('veto rewinds the play', r.ok && t.game.stack.length === 0 && !!t.hand(0, 'Lightning Bolt') && !t.bf(0, 'Mountain').tapped, r.error);
  // vote: sorcery-speed creature at instant speed
  t.give(0, 'Raging Goblin');
  t.end(0);
  const illegal = t.try(0, { type: 'play', instanceId: t.hand(0, 'Raging Goblin').instanceId });
  check('goblin illegal on opponent turn', !illegal.ok, illegal.error);
  t.do(0, { type: 'vote-request', label: 'casting Raging Goblin now', intent: { type: 'play', instanceId: t.hand(0, 'Raging Goblin').instanceId } });
  check('vote prompt for P2', t.view(1).prompt.kind === 'vote' && t.view(1).prompt.canVote);
  t.do(1, { type: 'vote', approve: true });
  check('approved play went through', !!t.bf(0, 'Raging Goblin') || t.game.stack.length === 1, JSON.stringify(t.game.log.slice(0, 3).map(e => e.text)));
  t.do(1, { type: 'concede' });
  check('concede ends 2-player game', t.game.status === 'complete' && t.game.winner === t.P(0).playerId);
}
{
  const t = newGame(['white', 'simic'], { rules: { physicalDraw: true } });
  t.keepAll();
  const d = t.decision();
  check('physical draw asks which card', d?.kind === 'choose-one' && d.private && d.playerId === t.P(0).playerId, JSON.stringify(d && d.kind));
  const pick = d.options.find(o => o.label === 'Serra Angel') || d.options[0];
  t.answer(pick.id);
  check('picked card is in hand', !!t.hand(0, pick.label) && t.game.phase === 'precombat-main');
}
{
  const t = newGame(['white', 'simic'], { mode: 'freeplay' });
  t.keepAll();
  t.give(0, 'Serra Angel');
  const r = t.try(0, { type: 'play', instanceId: t.hand(0, 'Serra Angel').instanceId });
  check('freeplay still explains illegal play', !r.ok, r.error);
  t.do(0, { type: 'play', instanceId: t.hand(0, 'Serra Angel').instanceId, force: true });
  check('freeplay force puts it on battlefield', !!t.bf(0, 'Serra Angel'));
  check('freeplay player can edit', t.ctl.dispatch({ type: 'edit', edit: { kind: 'token', playerId: t.P(0).playerId, name: 'Soldier', power: 1, toughness: 1, count: 3 } }, t.as(0)).ok && t.P(0).deck.battlefield.filter(c => c.token).length === 3);
  check('freeplay undo by player', t.ctl.dispatch({ type: 'undo' }, t.as(0)).ok && t.P(0).deck.battlefield.filter(c => c.token).length === 0);
}
{
  const t = newGame(['white', 'simic']);
  t.keepAll();
  t.give(0, 'Plains');
  const c = t.view(0).coach;
  check('coach suggests the land drop in main phase', c.headline === 'Play a land' && c.jewel?.label === 'PLAY LAND', JSON.stringify(c));
  t.do(0, { type: 'play', instanceId: t.hand(0, 'Plains').instanceId });
  check('coach stops suggesting a land after the drop', t.view(0).coach.headline !== 'Play a land', t.view(0).coach.headline);
}
{
  const t = newGame(['white', 'simic']);
  t.keepAll();
  t.give(0, 'Plains'); t.give(0, 'Evolving Wilds');
  const c = t.view(0).coach;
  check('coach lists every playable land as an option', c.options.filter(o => /^Play /.test(o.label)).length >= 2, JSON.stringify(c.options));
  check('coach explains its land suggestion', /Suggested|about equal|only land/.test(c.detail) && c.options[0].best && c.options[0].sub.length > 20, c.detail);
  check('coach options include moving on', c.options.some(o => o.act === 'next-phase') && c.options.some(o => o.act === 'end-turn'));
}
{
  const t = newGame(['white', 'simic']);
  t.keepAll();
  check('advice is on by default', t.view(0).players[0].advice === true);
  t.do(0, { type: 'set-advice', on: false });
  check('a player can switch advice off', t.view(0).players[0].advice === false && t.view(1).players[1].advice === true);
  check('coach always has advice text, even while waiting', !!t.view(1).coach.detail && !!t.view(0).coach.detail, JSON.stringify(t.view(1).coach));
}
{
  // One shared device in Guided Play: the rules hold, no host tools, no "play anyway".
  const t = newGame(['white', 'simic'], { deviceMode: 'single-device' });
  t.keepAll();
  // The opening draw can already have put Serra Angel in hand.
  const angel = t.hand(0, 'Serra Angel') || t.game.players[0].deck.remainingLibrary.find(c => t.game.cardDefinitions[c.definitionId]?.name === 'Serra Angel');
  if (angel.zone !== 'hand') { angel.zone = 'hand'; t.game.players[0].deck.hand.push(t.game.players[0].deck.remainingLibrary.splice(t.game.players[0].deck.remainingLibrary.indexOf(angel), 1)[0]); }
  const local = { playerId: t.P(0).playerId, isHost: true };
  const forced = t.ctl.dispatch({ type: 'play', instanceId: angel.instanceId, force: true }, local);
  check('guided on one device refuses a forced play without mana', !forced.ok && !t.bf(0, 'Serra Angel'), forced.error);
  const v = t.ctl.view(local);
  check('guided on one device has host tools but no forcing', v.canEdit && !v.canForce && !v.canChallenge);
  const asked = t.ctl.dispatch({ type: 'vote-request', label: 'playing Serra Angel', intent: { type: 'play', instanceId: angel.instanceId }, decide: true }, local);
  check('one device: the table can agree to allow a blocked play', asked.ok && !!t.bf(0, 'Serra Angel') && t.ctl.view(local).plays.some(p => p.verdict === 'approved'), asked.error);
  check('guided on one device allows host-tool edits', t.ctl.dispatch({ type: 'edit', edit: { kind: 'life', playerId: t.P(0).playerId, delta: 5 } }, local).ok);
}
{
  // Hosted Guided Play: the host (player or table/judge device) keeps the host tools.
  const t = newGame(['white', 'simic']);
  t.keepAll();
  const playingHost = { playerId: t.P(0).playerId, isHost: true };
  check('only a non-playing host device gets host tools in a room', t.view(null).canEdit && t.view(null).isJudge && !t.ctl.view(playingHost).canEdit);
  check('a playing host gets Challenge like everyone else', t.ctl.view(playingHost).canChallenge && t.view(1).canChallenge);
  check('a playing host cannot edit, undo or reverse directly', !t.ctl.dispatch({ type: 'edit', edit: { kind: 'life', playerId: t.P(1).playerId, delta: -5 } }, playingHost).ok && !t.ctl.dispatch({ type: 'undo' }, playingHost).ok);
  check('room host cannot force plays in guided play', !t.view(null).canForce);
  check('joined player gets no host tools in guided play', !t.view(1).canEdit);
}
{
  const t = newGame(['white', 'simic'], { mode: 'freeplay', deviceMode: 'single-device' });
  t.keepAll();
  const v = t.ctl.view({ playerId: t.P(0).playerId, isHost: true });
  check('free play on one device always has tools and force', v.canEdit && v.canForce);
}
{
  // Judge record: every play has a legality verdict and can be reversed with everything after it.
  const t = newGame(['white', 'simic'], { mode: 'freeplay' });
  t.keepAll();
  t.give(0, 'Plains'); t.give(0, 'Serra Angel');
  t.do(0, { type: 'play', instanceId: t.hand(0, 'Plains').instanceId });
  t.do(0, { type: 'play', instanceId: t.hand(0, 'Serra Angel').instanceId, force: true });
  const plays = t.view(null).plays;
  const land = plays.find(p => /plays Plains/.test(p.text)), angel = plays.find(p => /casts Serra Angel/.test(p.text));
  check('judge record marks a legal play as legal', land?.verdict === 'legal', JSON.stringify(land));
  check('judge record marks a forced play as illegal, with the reason', angel?.verdict === 'illegal' && angel.reasons.length > 0, JSON.stringify(angel));
  check('legality summary counts illegal plays', t.view(0).legality.illegal === 1);
  check('every recent play can be reversed', plays.every(p => p.reversible));
  const r = t.ctl.dispatch({ type: 'reverse', playId: land.id }, t.host);
  check('reversing a play takes back it and every later play', r.ok && !t.bf(0, 'Serra Angel') && !t.bf(0, 'Plains') && !!t.hand(0, 'Plains') && !!t.hand(0, 'Serra Angel'), r.error);
  check('the reversed plays leave the record and the log says so', !t.view(null).plays.some(p => p.id === land.id || p.id === angel.id) && /Judge reversed: .*Plains.*1 later play/.test(t.game.log[0].text), t.game.log[0].text);
}
{
  const t = newGame(['white', 'simic']);
  t.keepAll();
  t.give(0, 'Plains');
  t.do(0, { type: 'play', instanceId: t.hand(0, 'Plains').instanceId });
  const play = t.view(null).plays.find(p => /plays Plains/.test(p.text));
  check('joined players do not get the judge record in guided play', t.view(1).plays === null && t.view(0).legality.plays > 0);
  check('a joined player cannot reverse plays', !t.ctl.dispatch({ type: 'reverse', playId: play.id }, t.as(1)).ok && !!t.bf(0, 'Plains'));
  check('the room host can reverse plays', t.ctl.dispatch({ type: 'reverse', playId: play.id }, t.host).ok && !t.bf(0, 'Plains'));
}
{
  // Players without a judge: undo is a table rule, needs every player still in, and only this turn.
  {
    const o = newGame(['white', 'simic', 'rakdos']);
    o.keepAll(); o.give(0, 'Plains');
    o.do(0, { type: 'play', instanceId: o.hand(0, 'Plains').instanceId });
    const off = o.ctl.dispatch({ type: 'ask-undo' }, o.as(0));
    check('undo is refused when the table rules leave it off', !off.ok && /table rules/.test(off.error), off.error);
  }
  const t = newGame(['white', 'simic', 'rakdos'], { rules: { undo: true } });
  t.keepAll();
  t.give(0, 'Plains');
  t.do(0, { type: 'play', instanceId: t.hand(0, 'Plains').instanceId });
  check('asking to undo opens a request for the other players', t.ctl.dispatch({ type: 'ask-undo' }, t.as(0)).ok && t.view(1).prompt.kind === 'proposal' && t.view(0).prompt.kind === 'waiting');
  const id = t.game.flow.proposal.id;
  t.ctl.dispatch({ type: 'answer-proposal', id, accept: true }, t.as(1));
  check('one acceptance is not enough', !!t.bf(0, 'Plains') && !!t.game.flow.proposal);
  t.ctl.dispatch({ type: 'answer-proposal', id, accept: true }, t.as(2));
  check('when everyone accepts, the play is undone', !t.bf(0, 'Plains') && !!t.hand(0, 'Plains') && !t.game.flow.proposal);
  t.do(0, { type: 'play', instanceId: t.hand(0, 'Plains').instanceId });
  t.ctl.dispatch({ type: 'ask-undo' }, t.as(0));
  t.ctl.dispatch({ type: 'answer-proposal', id: t.game.flow.proposal.id, accept: false }, t.as(1));
  check('any decline and the play stands', !!t.bf(0, 'Plains') && !t.game.flow.proposal && t.view(0).notices.some(n => /declined/.test(n.text)));
  t.end(0);
  const late = t.ctl.dispatch({ type: 'ask-undo' }, t.as(0));
  check('once the turn has passed, its plays cannot be undone', !late.ok && /turn has passed/.test(late.error), late.error);
}
{
  // Challenge: the table accepts, the challenger corrects, the table accepts or rejects the correction.
  const t = newGame(['white', 'simic', 'rakdos']);
  t.keepAll();
  const lifeBefore = t.P(1).life;
  t.give(0, 'Plains');
  t.do(0, { type: 'play', instanceId: t.hand(0, 'Plains').instanceId });
  check('a player cannot edit the game without a challenge', !t.ctl.dispatch({ type: 'edit', edit: { kind: 'life', playerId: t.P(1).playerId, delta: -3 } }, t.as(1)).ok);
  t.ctl.dispatch({ type: 'challenge' }, t.as(1));
  const cid = t.game.flow.proposal.id;
  t.ctl.dispatch({ type: 'answer-proposal', id: cid, accept: true }, t.as(0));
  t.ctl.dispatch({ type: 'answer-proposal', id: cid, accept: true }, t.as(2));
  check('an accepted challenge lets the challenger make a correction', t.view(1).correction?.mine && t.view(1).canEdit && !t.view(2).canEdit && t.view(2).prompt.kind === 'waiting');
  t.ctl.dispatch({ type: 'edit', edit: { kind: 'life', playerId: t.P(1).playerId, delta: -3 } }, t.as(1));
  t.ctl.dispatch({ type: 'propose-correction' }, t.as(1));
  check('the correction goes to the table with the changes listed', t.view(0).prompt.kind === 'proposal' && /life/i.test(t.view(0).prompt.detail), JSON.stringify(t.view(0).prompt));
  t.ctl.dispatch({ type: 'answer-proposal', id: t.game.flow.proposal.id, accept: false }, t.as(0));
  check('a rejected correction is undone and the challenger is told', t.P(1).life === lifeBefore && !t.game.flow.correction && t.view(1).notices.some(n => n.text === 'Correction rejected'));
  // Accepted path; an eliminated player does not vote.
  t.P(2).eliminated = true;
  t.ctl.dispatch({ type: 'challenge' }, t.as(1));
  t.ctl.dispatch({ type: 'answer-proposal', id: t.game.flow.proposal.id, accept: true }, t.as(0));
  t.ctl.dispatch({ type: 'edit', edit: { kind: 'life', playerId: t.P(1).playerId, delta: -3 } }, t.as(1));
  t.ctl.dispatch({ type: 'propose-correction' }, t.as(1));
  t.ctl.dispatch({ type: 'answer-proposal', id: t.game.flow.proposal.id, accept: true }, t.as(0));
  check('an accepted correction stays, and eliminated players never vote', t.P(1).life === lifeBefore - 3 && !t.game.flow.correction && !t.game.flow.proposal);
  check('Free Play has no challenge', !newGame(['white', 'simic'], { mode: 'freeplay' }).view(0).canChallenge);
}
{
  const t = newGame(['white', 'simic']);
  t.game.hasJudge = true;
  check('with a judge device in the room, players get no Challenge button', !t.view(0).canChallenge);
}
section('"deals combat damage" triggers: blocking and attacking, once per step');
{
  const TEXT = 'Whenever this creature deals combat damage, put a +1/+1 counter on it.';
  const withText = (t, card, text) => { t.game.cardDefinitions[card.definitionId] = { ...t.game.cardDefinitions[card.definitionId], oracleText: text }; };
  {
    const t = newGame(['simic', 'simic']);
    t.keepAll();
    t.give(0, 'Grizzly Bears', 'battlefield'); t.give(1, 'Colossal Dreadmaw', 'battlefield');
    const maw = t.bf(1, 'Colossal Dreadmaw');
    withText(t, maw, TEXT);
    t.end(0); t.end(1);
    t.do(0, { type: 'next-phase' });
    const bear = t.bf(0, 'Grizzly Bears');
    t.do(0, { type: 'attack', attacks: [{ instanceId: bear.instanceId, defenderId: t.P(1).playerId }] });
    t.do(1, { type: 'block', assignments: [{ attackerId: bear.instanceId, blockerId: maw.instanceId }] });
    t.passAll();
    check('a blocker that deals combat damage gets its +1/+1 counter', maw.counters?.['+1/+1'] === 1, JSON.stringify(maw.counters));
  }
  {
    const t = newGame(['simic', 'simic']);
    t.keepAll();
    t.give(0, 'Colossal Dreadmaw', 'battlefield');
    const maw = t.bf(0, 'Colossal Dreadmaw');
    withText(t, maw, TEXT);
    t.end(0); t.end(1);
    t.do(0, { type: 'next-phase' });
    t.do(0, { type: 'attack', attacks: [{ instanceId: maw.instanceId, defenderId: t.P(1).playerId }] });
    if (t.game.flow.blocks) t.do(1, { type: 'block', assignments: [] });
    t.passAll();
    check('an unblocked attacker triggers once and gets one counter', maw.counters?.['+1/+1'] === 1 && t.game.log.filter(e => /triggers\./.test(e.text)).length === 1, JSON.stringify(maw.counters));
  }
  {
    const t = newGame(['simic', 'simic']);
    t.keepAll();
    t.give(0, 'Grizzly Bears', 'battlefield'); t.give(1, 'Colossal Dreadmaw', 'battlefield');
    const maw = t.bf(1, 'Colossal Dreadmaw');
    withText(t, maw, 'Whenever this creature deals combat damage to a player, put a +1/+1 counter on it.');
    t.end(0); t.end(1);
    t.do(0, { type: 'next-phase' });
    const bear = t.bf(0, 'Grizzly Bears');
    t.do(0, { type: 'attack', attacks: [{ instanceId: bear.instanceId, defenderId: t.P(1).playerId }] });
    t.do(1, { type: 'block', assignments: [{ attackerId: bear.instanceId, blockerId: maw.instanceId }] });
    t.passAll();
    check('"to a player" does not trigger when blocking', !maw.counters?.['+1/+1'], JSON.stringify(maw.counters));
  }
}
section('attacking planeswalkers and battles');
{
  // Test-only cards: put straight onto the battlefield by cloning a land's card object.
  const addPermanent = (t, i, def, extra = {}) => {
    t.game.cardDefinitions[def.definitionId] = def;
    const land = t.give(i, 'Forest', 'battlefield') || t.bf(i, 'Forest');
    const card = { ...structuredClone(land), definitionId: def.definitionId, instanceId: `test-${def.definitionId}`, counters: {}, tapped: false, ...extra };
    t.P(i).deck.battlefield.push(card);
    return card;
  };
  const walker = { definitionId: 'test-walker', name: 'Test Walker', typeLine: 'Legendary Planeswalker — Test', oracleText: '', loyalty: '5', manaCost: '{3}', manaValue: 3, colors: [] };
  const battle = { definitionId: 'test-battle', name: 'Test Siege', typeLine: 'Battle — Siege', oracleText: '', defense: '4', manaCost: '{3}', manaValue: 3, colors: [] };
  {
    const t = newGame(['simic', 'simic']);
    t.keepAll();
    t.give(0, 'Grizzly Bears', 'battlefield');
    const pw = addPermanent(t, 1, walker, { counters: { loyalty: 5 } });
    t.end(0); t.end(1);
    t.do(0, { type: 'next-phase' });
    const row = t.view(0).actions.attack.find(r => r.instanceId === t.bf(0, 'Grizzly Bears').instanceId);
    check('the opponent\'s planeswalker is offered as an attack target', row?.targets?.some(x => x.id === pw.instanceId && x.kind === 'planeswalker' && x.value === 5), JSON.stringify(row));
    t.do(0, { type: 'attack', attacks: [{ instanceId: t.bf(0, 'Grizzly Bears').instanceId, defenderId: t.P(1).playerId, targetId: pw.instanceId }] });
    if (t.game.flow.blocks) t.do(1, { type: 'block', assignments: [] });
    t.passAll();
    check('unblocked damage removes loyalty, not life', pw.counters.loyalty === 3 && t.P(1).life === 40, `${pw.counters.loyalty} ${t.P(1).life}`);
    check('the log names the planeswalker', t.game.log.some(e => /attacks Test Walker/.test(e.text)));
  }
  {
    const t = newGame(['simic', 'simic']);
    t.keepAll();
    t.give(0, 'Colossal Dreadmaw', 'battlefield');
    const pw = addPermanent(t, 1, walker, { counters: { loyalty: 2 } });
    t.end(0); t.end(1);
    t.do(0, { type: 'next-phase' });
    t.do(0, { type: 'attack', attacks: [{ instanceId: t.bf(0, 'Colossal Dreadmaw').instanceId, defenderId: t.P(1).playerId, targetId: pw.instanceId }] });
    if (t.game.flow.blocks) t.do(1, { type: 'block', assignments: [] });
    t.passAll();
    check('a planeswalker with no loyalty left goes to the graveyard', !t.P(1).deck.battlefield.some(c => c.instanceId === pw.instanceId) && t.P(1).life === 40);
  }
  {
    const t = newGame(['simic', 'simic']);
    t.keepAll();
    t.give(0, 'Grizzly Bears', 'battlefield');
    const siege = addPermanent(t, 0, battle);   // P1's own Siege, protected by P2
    t.end(0); t.end(1);
    check('a Siege gets its defense and an opponent as protector', siege.counters.defense === 4 && siege.protectorId === t.P(1).playerId, JSON.stringify([siege.counters, siege.protectorId]));
    t.do(0, { type: 'next-phase' });
    const row = t.view(0).actions.attack.find(r => r.instanceId === t.bf(0, 'Grizzly Bears').instanceId);
    check('its controller can attack their own Siege', row?.targets?.some(x => x.id === siege.instanceId && x.kind === 'battle'), JSON.stringify(row));
    t.do(0, { type: 'attack', attacks: [{ instanceId: t.bf(0, 'Grizzly Bears').instanceId, defenderId: t.P(1).playerId, targetId: siege.instanceId }] });
    check('the protector is the one who blocks', !t.game.flow.blocks || t.game.flow.blocks.pending.includes(t.P(1).playerId));
    if (t.game.flow.blocks) t.do(1, { type: 'block', assignments: [] });
    t.passAll();
    check('damage removes defense counters', siege.counters.defense === 2 && t.P(1).life === 40, `${siege.counters.defense} ${t.P(1).life}`);
    siege.counters.defense = 1;
    t.end(0); t.end(1);
    t.do(0, { type: 'next-phase' });
    t.do(0, { type: 'attack', attacks: [{ instanceId: t.bf(0, 'Grizzly Bears').instanceId, defenderId: t.P(1).playerId, targetId: siege.instanceId }] });
    if (t.game.flow.blocks) t.do(1, { type: 'block', assignments: [] });
    t.passAll();
    check('a defeated Siege is exiled', t.P(0).deck.exile.some(c => c.instanceId === siege.instanceId), t.game.log.slice(0, 3).map(e => e.text).join(' / '));
  }
  {
    const t = newGame(['simic', 'simic']);
    t.keepAll();
    t.give(0, 'Grizzly Bears', 'battlefield');
    const pw = addPermanent(t, 0, walker, { counters: { loyalty: 5 } });
    t.end(0); t.end(1);
    t.do(0, { type: 'next-phase' });
    const r = t.try(0, { type: 'attack', attacks: [{ instanceId: t.bf(0, 'Grizzly Bears').instanceId, defenderId: t.P(1).playerId, targetId: pw.instanceId }] });
    check('nobody can attack their own planeswalker', !r.ok);
  }
}
section('counters: the player chooses which creature gets them');
{
  const t = newGame(['simic', 'simic']);
  t.keepAll();
  t.give(0, 'Colossal Dreadmaw', 'battlefield'); t.give(0, 'Grizzly Bears', 'battlefield'); t.give(0, 'Llanowar Elves', 'battlefield');
  const maw = t.bf(0, 'Colossal Dreadmaw'), bear = t.bf(0, 'Grizzly Bears'), elf = t.bf(0, 'Llanowar Elves');
  t.game.cardDefinitions[maw.definitionId] = { ...t.game.cardDefinitions[maw.definitionId], oracleText: 'Whenever this creature attacks, put a +1/+1 counter on another creature you control.' };
  t.end(0); t.end(1);
  t.do(0, { type: 'next-phase' });
  t.autoPass = false;
  t.do(0, { type: 'attack', attacks: [{ instanceId: maw.instanceId, defenderId: t.P(1).playerId }] });
  t.passAll();
  const d = t.decision();
  const ids = (d?.options || []).map(o => o.id);
  check('the player is asked which other creature gets the counter', d && ids.includes(bear.instanceId) && ids.includes(elf.instanceId) && !ids.includes(maw.instanceId), JSON.stringify(d && { title: d.title, ids }));
  if (d) t.answer(elf.instanceId);
  t.passAll();
  check('the chosen creature gets it', elf.counters?.['+1/+1'] === 1 && !bear.counters?.['+1/+1'] && !maw.counters?.['+1/+1'], JSON.stringify([elf.counters, bear.counters]));
}
section('trigger wordings: plural verbs, short names, "you control enters", draw step');
{
  const setText = (t, card, text, name) => { t.game.cardDefinitions[card.definitionId] = { ...t.game.cardDefinitions[card.definitionId], oracleText: text, ...(name ? { name, typeLine: 'Legendary Creature — Bear' } : {}) }; };
  // "Whenever an opponent casts a spell" (Rhystic Study wording)
  {
    const t = newGame(['simic', 'simic']);
    t.keepAll();
    t.give(0, 'Grizzly Bears', 'battlefield');
    setText(t, t.bf(0, 'Grizzly Bears'), 'Whenever an opponent casts a spell, you gain 1 life.');
    t.end(0);
    t.give(1, 'Forest', 'battlefield'); t.give(1, 'Llanowar Elves');
    t.do(1, { type: 'play', instanceId: t.hand(1, 'Llanowar Elves').instanceId });
    t.passAll();
    check('"an opponent casts a spell" fires when the opponent casts', t.P(0).life === 41, String(t.P(0).life));
  }
  // "Whenever a land you control enters" (Lotus Cobra / landfall, newer wording)
  {
    const t = newGame(['simic', 'simic']);
    t.keepAll();
    t.give(0, 'Grizzly Bears', 'battlefield');
    setText(t, t.bf(0, 'Grizzly Bears'), 'Whenever a land you control enters, you gain 1 life.');
    t.give(0, 'Forest');
    t.do(0, { type: 'play', instanceId: t.hand(0, 'Forest').instanceId });
    t.passAll();
    check('"a land you control enters" fires on a land drop', t.P(0).life === 41, String(t.P(0).life));
    t.end(0);
    t.give(1, 'Forest');
    t.do(1, { type: 'play', instanceId: t.hand(1, 'Forest').instanceId });
    t.passAll();
    check('…and not for the opponent\'s land', t.P(0).life === 41, String(t.P(0).life));
  }
  // A legendary creature named by its short name ("Whenever Gorm attacks")
  {
    const t = newGame(['simic', 'simic']);
    t.keepAll();
    t.give(0, 'Grizzly Bears', 'battlefield');
    const bear = t.bf(0, 'Grizzly Bears');
    setText(t, bear, 'Whenever Gorm attacks, you gain 2 life.', 'Gorm, the Great Bear');
    t.end(0); t.end(1);
    t.do(0, { type: 'next-phase' });
    t.do(0, { type: 'attack', attacks: [{ instanceId: bear.instanceId, defenderId: t.P(1).playerId }] });
    if (t.game.flow.blocks) t.do(1, { type: 'block', assignments: [] });
    t.passAll();
    check('a card that names itself by its short name triggers', t.P(0).life === 42, String(t.P(0).life));
  }
  // "At the beginning of your draw step" and "Whenever an opponent draws a card"
  {
    const t = newGame(['simic', 'simic']);
    t.keepAll();
    t.give(0, 'Grizzly Bears', 'battlefield'); t.give(0, 'Llanowar Elves', 'battlefield');
    setText(t, t.bf(0, 'Grizzly Bears'), 'At the beginning of your draw step, you gain 1 life.');
    setText(t, t.bf(0, 'Llanowar Elves'), 'Whenever an opponent draws a card, you gain 3 life.');
    t.end(0);
    check('"an opponent draws a card" fires on the opponent\'s draw', t.P(0).life === 43, String(t.P(0).life));
    t.end(1);
    check('"at the beginning of your draw step" fires on your turn', t.P(0).life === 44, String(t.P(0).life));
  }
}
section('popular spells: Beast Within, Path to Exile, Village Rites, Toxic Deluge, Heroic Intervention, Negate, free with a commander');
{
  // Borrow a simic instant/sorcery and give it the real card's text.
  const asCard = (t, name, text, cost) => { const c = t.hand(0, name); t.game.cardDefinitions[c.definitionId] = { ...t.game.cardDefinitions[c.definitionId], oracleText: text, ...(cost !== undefined ? { manaCost: cost } : {}) }; return c; };
  const settle = (t, picks = {}) => {
    for (let guard = 0; guard < 20 && t.decision(); guard++) {
      const d = t.decision(), key = Object.keys(picks).find(k => d.key.includes(k));
      let v = key !== undefined ? picks[key] : undefined;
      if (typeof v === 'function') v = v(d);
      if (v === undefined) { const open = (d.options || []).filter(o => !o.disabled); v = d.kind === 'choose-many' ? open.slice(0, Math.max(d.min || 0, 1)).map(o => o.id) : d.kind === 'confirm' ? true : d.kind === 'number' ? (d.min || 0) : open[0]?.id; }
      const r = t.ctl.dispatch({ type: 'answer', key: d.key, value: v }, { playerId: d.playerId, isHost: false });
      if (!r.ok) throw new Error(`answer ${d.key}: ${r.error}`);
    }
    t.passAll();
  };
  const setup = () => {
    const t = newGame(['simic', 'simic']);
    t.keepAll();
    for (let i = 0; i < 4; i++) t.give(0, 'Forest', 'battlefield');
    for (let i = 0; i < 2; i++) t.give(0, 'Island', 'battlefield');
    t.give(1, 'Grizzly Bears', 'battlefield');
    return t;
  };
  const cast = (t, card, picks) => { t.autoPass = false; const r = t.ctl.dispatch({ type: 'play', instanceId: card.instanceId }, t.as(0)); if (!r.ok) throw new Error(r.error); settle(t, picks); };
  {
    const t = setup(); t.give(0, 'Naturalize');
    const spell = asCard(t, 'Naturalize', 'Destroy target permanent. Its controller creates a 3/3 green Beast creature token.');
    const bear = t.bf(1, 'Grizzly Bears');
    cast(t, spell, { target: bear.instanceId });
    check('Beast Within: the permanent is destroyed and its controller gets a 3/3 Beast', !t.bf(1, 'Grizzly Bears') && t.P(1).deck.battlefield.some(c => c.token && /Beast/.test(t.game.cardDefinitions[c.definitionId]?.name || '')), JSON.stringify(t.P(1).deck.battlefield.map(c => t.game.cardDefinitions[c.definitionId]?.name)));
  }
  {
    const t = setup(); t.give(0, 'Giant Growth');
    const spell = asCard(t, 'Giant Growth', 'Exile target creature. Its controller may search their library for a basic land card, put that card onto the battlefield tapped, then shuffle.');
    const bear = t.bf(1, 'Grizzly Bears');
    let asked = null;
    cast(t, spell, { target: bear.instanceId, 'their-search': d => { asked = d; return d.options.slice(0, 1).map(o => o.id); } });
    const land = t.P(1).deck.battlefield.find(c => /Land/.test(t.game.cardDefinitions[c.definitionId]?.typeLine || ''));
    check('Path to Exile: the opponent (not the caster) chooses the basic land', asked?.playerId === t.P(1).playerId, JSON.stringify(asked && asked.playerId));
    check('…the creature is exiled and the land enters tapped', t.P(1).deck.exile.some(c => c.instanceId === bear.instanceId) && land?.tapped === true);
  }
  {
    const t = setup(); t.give(0, 'Llanowar Elves', 'battlefield'); t.give(0, 'Opt');
    const spell = asCard(t, 'Opt', 'As an additional cost to cast this spell, sacrifice a creature.\nDraw two cards.');
    const before = t.P(0).deck.hand.length;
    cast(t, spell, { 'cost:sacrifice': t.bf(0, 'Llanowar Elves').instanceId });
    check('Village Rites: a creature is sacrificed as it is cast, then two cards are drawn', !t.bf(0, 'Llanowar Elves') && t.P(0).deck.hand.length === before - 1 + 2, `${before} → ${t.P(0).deck.hand.length}`);
  }
  {
    const t = setup(); t.give(0, 'Divination');
    const spell = asCard(t, 'Divination', 'As an additional cost to cast this spell, pay X life.\nAll creatures get -X/-X until end of turn.');
    cast(t, spell, { 'cost:life-x': 2 });
    check('Toxic Deluge: pay 2 life and every creature gets -2/-2', t.P(0).life === 38 && !t.bf(1, 'Grizzly Bears'), `${t.P(0).life}`);
  }
  {
    const t = setup(); t.give(0, 'Grizzly Bears', 'battlefield'); t.give(0, 'Giant Growth');
    const spell = asCard(t, 'Giant Growth', 'Permanents you control gain hexproof and indestructible until end of turn.');
    cast(t, spell, {});
    const kws = (t.bf(0, 'Grizzly Bears').temporaryEffects || []).filter(e => e.kind === 'keyword').map(e => e.keyword.toLowerCase());
    check('Heroic Intervention: hexproof and indestructible, as two separate keywords', kws.includes('hexproof') && kws.includes('indestructible'), JSON.stringify(kws));
  }
  {
    const t = setup(); t.give(0, 'Counterspell'); t.give(1, 'Forest', 'battlefield'); t.give(1, 'Forest', 'battlefield'); t.give(1, 'Llanowar Elves');
    t.end(0);
    t.autoPass = false;
    const neg = asCard(t, 'Counterspell', 'Counter target noncreature spell.');
    t.ctl.dispatch({ type: 'play', instanceId: t.hand(1, 'Llanowar Elves').instanceId }, t.as(1)); settle(t);
    const r = t.ctl.dispatch({ type: 'play', instanceId: neg.instanceId }, t.as(0));
    check('Negate cannot target a creature spell', !r.ok || !(t.decision()?.options || []).length, JSON.stringify(r));
  }
  {
    const t = setup(); t.give(0, 'Giant Growth');
    t.give(0, 'Tatyova, Benthic Druid', 'battlefield');
    const spell = asCard(t, 'Giant Growth', 'If you control a commander, you may cast this spell without paying its mana cost.\nDraw a card.', '{9}');
    for (const c of t.P(0).deck.battlefield) c.tapped = true;   // no mana at all
    const before = t.P(0).deck.hand.length;
    cast(t, spell, { castMode: 'commander-free' });
    check('Fierce Guardianship: free while you control your commander', t.P(0).deck.hand.length === before, `${before} → ${t.P(0).deck.hand.length}`);
  }
}
section('trigger effects: unless that player pays, that much life, that player, bounce lands');
{
  const setText = (t, card, text) => { t.game.cardDefinitions[card.definitionId] = { ...t.game.cardDefinitions[card.definitionId], oracleText: text }; };
  const settle = (t, picks = {}, seen = []) => {
    for (let guard = 0; guard < 30; guard++) {
      t.passAll();
      const d = t.decision();
      if (!d) break;
      seen.push(d);
      const key = Object.keys(picks).find(k => d.key.includes(k));
      let v = key !== undefined ? picks[key] : undefined;
      if (typeof v === 'function') v = v(d);
      if (v === undefined) { const open = (d.options || []).filter(o => !o.disabled); v = d.kind === 'choose-many' ? open.slice(0, d.min || 0).map(o => o.id) : d.kind === 'confirm' ? true : open[0]?.id; }
      const r = t.ctl.dispatch({ type: 'answer', key: d.key, value: v }, { playerId: d.playerId, isHost: false });
      if (!r.ok) throw new Error(`answer ${d.key}: ${r.error}`);
    }
    return seen;
  };
  // Rhystic Study: P2 casts a spell; P2 is asked to pay {1}.
  for (const answer of ['pay', 'no']) {
    const t = newGame(['simic', 'simic']);
    t.keepAll(); t.autoPass = false;
    t.give(0, 'Grizzly Bears', 'battlefield');
    setText(t, t.bf(0, 'Grizzly Bears'), 'Whenever an opponent casts a spell, you may draw a card unless that player pays {1}.');
    t.end(0);
    t.give(1, 'Forest', 'battlefield'); t.give(1, 'Forest', 'battlefield'); t.give(1, 'Llanowar Elves');
    const hand = t.P(0).deck.hand.length;
    t.ctl.dispatch({ type: 'play', instanceId: t.hand(1, 'Llanowar Elves').instanceId }, t.as(1));
    const seen = settle(t, { 'unless-pays': answer });
    const asked = seen.find(d => d.key.includes('unless-pays'));
    check(`Rhystic Study asks the opponent to pay {1} (${answer})`, asked?.playerId === t.P(1).playerId, JSON.stringify(asked && asked.playerId));
    const forests = t.P(1).deck.battlefield.filter(c => t.game.cardDefinitions[c.definitionId]?.name === 'Forest');
    if (answer === 'pay') check('…paying stops the draw and taps a land for it', t.P(0).deck.hand.length === hand && forests.every(c => c.tapped), `${hand} → ${t.P(0).deck.hand.length}`);
    else check('…not paying lets you draw', t.P(0).deck.hand.length === hand + 1, `${hand} → ${t.P(0).deck.hand.length}`);
  }
  // Smothering Tithe: P2 draws for the turn and does not pay {2}: P1 gets a Treasure.
  {
    const t = newGame(['simic', 'simic']);
    t.keepAll();
    t.give(0, 'Grizzly Bears', 'battlefield');
    setText(t, t.bf(0, 'Grizzly Bears'), 'Whenever an opponent draws a card, that player may pay {2}. If the player doesn\'t, you create a Treasure token.');
    t.autoPass = false;
    t.do(0, { type: 'end-turn' });
    settle(t, { 'unless-pays': 'no' });
    check('Smothering Tithe: no payment, you create a Treasure', t.P(0).deck.battlefield.some(c => c.token && /Treasure/.test(t.game.cardDefinitions[c.definitionId]?.name || '')));
  }
  // Sanguine Bond: you gain 3 life, target opponent loses that much.
  {
    const t = newGame(['simic', 'simic']);
    t.keepAll();
    t.give(0, 'Grizzly Bears', 'battlefield');
    setText(t, t.bf(0, 'Grizzly Bears'), 'Whenever you gain life, target opponent loses that much life.');
    t.give(0, 'Island', 'battlefield'); t.give(0, 'Opt');
    const opt = t.hand(0, 'Opt');
    t.game.cardDefinitions[opt.definitionId] = { ...t.game.cardDefinitions[opt.definitionId], oracleText: 'You gain 3 life.' };
    t.autoPass = false;
    t.ctl.dispatch({ type: 'play', instanceId: opt.instanceId }, t.as(0));
    settle(t);
    check('Sanguine Bond: the opponent loses as much as you gained', t.P(1).life === 37, String(t.P(1).life));
  }
  // Massacre Wurm: a creature an opponent controls dies, that player loses 2 life.
  {
    const t = newGame(['simic', 'simic']);
    t.keepAll();
    t.give(0, 'Colossal Dreadmaw', 'battlefield'); t.give(1, 'Grizzly Bears', 'battlefield');
    setText(t, t.bf(0, 'Colossal Dreadmaw'), 'Whenever a creature an opponent controls dies, that player loses 2 life.');
    t.edit({ kind: 'move', instanceId: t.bf(1, 'Grizzly Bears').instanceId, to: 'graveyard' });
    settle(t);
    check('Massacre Wurm: "that player" is the dying creature’s controller', t.P(1).life === 38 && t.P(0).life === 40, `${t.P(0).life} ${t.P(1).life}`);
  }
  // Bounce land: return a land you control to its owner's hand (you choose which).
  {
    const t = newGame(['simic', 'simic']);
    t.keepAll();
    t.give(0, 'Forest', 'battlefield'); t.give(0, 'Island', 'battlefield'); t.give(0, 'Forest');
    const land = t.hand(0, 'Forest');
    t.game.cardDefinitions[land.definitionId] = { ...t.game.cardDefinitions[land.definitionId] };
    const island = t.bf(0, 'Island');
    t.give(0, 'Llanowar Elves', 'battlefield');
    setText(t, t.bf(0, 'Llanowar Elves'), 'Whenever a land you control enters, return a land you control to its owner’s hand.');
    t.autoPass = false;
    t.ctl.dispatch({ type: 'play', instanceId: land.instanceId }, t.as(0));
    let asked = null;
    settle(t, { resolve: d => { asked = d; return island.instanceId; } });
    check('bounce lands ask which land to return', asked && t.P(0).deck.hand.some(c => c.instanceId === island.instanceId), JSON.stringify(asked && asked.title));
  }
}
section("activated abilities: Rogue's Passage, cycling reminder text");
{
  const t = newGame(['simic', 'simic']);
  t.keepAll();
  for (let i = 0; i < 5; i++) t.give(0, 'Forest', 'battlefield');
  t.give(0, 'Island', 'battlefield'); t.give(0, 'Grizzly Bears', 'battlefield'); t.give(1, 'Llanowar Elves', 'battlefield');
  const passage = t.bf(0, 'Island');
  t.game.cardDefinitions[passage.definitionId] = { ...t.game.cardDefinitions[passage.definitionId], name: "Rogue's Passage", typeLine: 'Land', oracleText: "{T}: Add {C}.\n{4}, {T}: Target creature can't be blocked this turn." };
  t.end(0); t.end(1);
  const ability = t.view(0).players[0].battlefield.find(c => c.id === passage.instanceId).abilities.find(a => /blocked/.test(a.text || a.effect || ''));
  check("Rogue's Passage offers its ability", !!ability, JSON.stringify(t.view(0).players[0].battlefield.find(c => c.id === passage.instanceId).abilities));
  if (ability) {
    t.autoPass = false;
    const r = t.ctl.dispatch({ type: 'activate', instanceId: passage.instanceId, abilityId: ability.id }, t.as(0));
    for (let g = 0; g < 10 && t.decision(); g++) { const d = t.decision(); t.ctl.dispatch({ type: 'answer', key: d.key, value: d.kind === 'choose-one' ? t.bf(0, 'Grizzly Bears').instanceId : true }, { playerId: d.playerId, isHost: false }); }
    t.passAll();
    t.do(0, { type: 'next-phase' });
    t.do(0, { type: 'attack', attacks: [{ instanceId: t.bf(0, 'Grizzly Bears').instanceId, defenderId: t.P(1).playerId }] });
    const rows = t.game.flow.blocks ? t.view(1).prompt.rows || [] : [];
    check("…the creature it targets can't be blocked", r.ok && rows.every(row => !(row.blockers || []).length), JSON.stringify(rows));
  }
  const triome = { name: 'Ketria Triome', typeLine: 'Land — Forest Island Mountain', oracleText: '({T}: Add {G}, {U}, or {R}.)\nThis land enters tapped.\nCycling {3} ({3}, Discard this card: Draw a card.)' };
  check('a cycling land has no extra "Draw a card" ability on the battlefield', parseActivatedAbilities(triome).length === 1, JSON.stringify(parseActivatedAbilities(triome).map(a => a.text)));
}
section('more effects: conditions, up to one target, wheels, devotion, flicker, untap lands, attackers home');
{
  const asText = (t, card, text, extra = {}) => { t.game.cardDefinitions[card.definitionId] = { ...t.game.cardDefinitions[card.definitionId], oracleText: text, ...extra }; return card; };
  const settle = (t, picks = {}) => {
    for (let guard = 0; guard < 30; guard++) {
      t.passAll();
      const d = t.decision();
      if (!d) break;
      const key = Object.keys(picks).find(k => d.key.includes(k));
      let v = key !== undefined ? picks[key] : undefined;
      if (typeof v === 'function') v = v(d);
      if (v === undefined) { const open = (d.options || []).filter(o => !o.disabled); v = d.kind === 'choose-many' ? open.slice(0, d.min || 0).map(o => o.id) : d.kind === 'confirm' ? true : d.kind === 'number' ? (d.min || 0) : open[0]?.id; }
      const r = t.ctl.dispatch({ type: 'answer', key: d.key, value: v }, { playerId: d.playerId, isHost: false });
      if (!r.ok) throw new Error(`answer ${d.key}: ${r.error}`);
    }
  };
  const setup = () => { const t = newGame(['simic', 'simic']); t.keepAll(); for (let i = 0; i < 4; i++) t.give(0, 'Forest', 'battlefield'); for (let i = 0; i < 3; i++) t.give(0, 'Island', 'battlefield'); t.autoPass = false; return t; };
  const cast = (t, name, text, picks = {}, extra = {}) => { t.give(0, name); const c = asText(t, t.hand(0, name), text, extra); const r = t.ctl.dispatch({ type: 'play', instanceId: c.instanceId }, t.as(0)); if (!r.ok) throw new Error(r.error); settle(t, picks); };
  // Condition: "If you control a creature with power 4 or greater, draw a card."
  for (const big of [true, false]) {
    const t = setup();
    t.give(0, big ? 'Colossal Dreadmaw' : 'Grizzly Bears', 'battlefield');
    const before = t.P(0).deck.hand.length;
    cast(t, 'Opt', 'If you control a creature with power 4 or greater, draw a card.');
    check(`a condition is checked as it resolves (${big ? 'met' : 'not met'})`, t.P(0).deck.hand.length === before + (big ? 1 : 0) - 0, `${before} → ${t.P(0).deck.hand.length}`);
  }
  // Up to one target: choose none, nothing happens; choose one, it is destroyed.
  {
    const t = setup(); t.give(1, 'Grizzly Bears', 'battlefield');
    cast(t, 'Naturalize', 'Destroy up to one target creature.', { cast: d => (d.allowNone ? null : d.options[0].id) });
    check('"up to one target": choosing none is allowed and does nothing', !!t.bf(1, 'Grizzly Bears'));
  }
  // Wheel of Fortune
  {
    const t = setup(); t.give(1, 'Forest');
    cast(t, 'Divination', 'Each player discards their hand, then draws seven cards.');
    check('Wheel of Fortune: everyone discards their hand and draws seven', t.P(0).deck.hand.length === 7 && t.P(1).deck.hand.length === 7, `${t.P(0).deck.hand.length} ${t.P(1).deck.hand.length}`);
  }
  // Gray Merchant: devotion to black (here: two Grizzly Bears made black {B}{B}), opponents lose that much, you gain it.
  {
    const t = setup();
    t.give(0, 'Grizzly Bears', 'battlefield');
    const bear = t.bf(0, 'Grizzly Bears');
    t.game.cardDefinitions[bear.definitionId] = { ...t.game.cardDefinitions[bear.definitionId], manaCost: '{B}{B}' };
    cast(t, 'Opt', 'Each opponent loses X life, where X is your devotion to black. You gain life equal to the life lost this way.');
    check('Gray Merchant: devotion counts the black symbols; you gain what they lost', t.P(1).life === 38 && t.P(0).life === 42, `${t.P(0).life} ${t.P(1).life}`);
  }
  // Ephemerate (without rebound): the creature leaves and comes back, a new object.
  {
    const t = setup(); t.give(0, 'Grizzly Bears', 'battlefield');
    const bear = t.bf(0, 'Grizzly Bears'); bear.counters = { '+1/+1': 2 };
    cast(t, 'Giant Growth', 'Exile target creature you control, then return it to the battlefield under its owner\'s control.', { cast: bear.instanceId });
    check('flicker: the creature comes back without its counters', !!t.bf(0, 'Grizzly Bears') && !t.bf(0, 'Grizzly Bears').counters?.['+1/+1']);
  }
  // Frantic Search: untap up to three lands.
  {
    const t = setup();
    for (const c of t.P(0).deck.battlefield) c.tapped = true;
    t.P(0).deck.battlefield.find(c => t.game.cardDefinitions[c.definitionId]?.name === 'Island').tapped = false;
    cast(t, 'Opt', 'Untap up to three lands.', { resolve: d => d.options.slice(0, 3).map(o => o.id) }, { manaCost: '{U}' });
    check('Frantic Search: three lands untap (you choose up to three)', t.P(0).deck.battlefield.filter(c => !c.tapped).length === 3, String(t.P(0).deck.battlefield.filter(c => !c.tapped).length));
  }
  // Aetherize: attacking creatures go back to their owners' hands.
  {
    const t = newGame(['simic', 'simic']); t.keepAll();
    t.give(0, 'Grizzly Bears', 'battlefield'); t.give(1, 'Island', 'battlefield'); t.give(1, 'Island', 'battlefield'); t.give(1, 'Island', 'battlefield'); t.give(1, 'Island', 'battlefield'); t.give(1, 'Opt');
    asText(t, t.hand(1, 'Opt'), 'Return all attacking creatures to their owner\'s hand.');
    t.end(0); t.end(1);
    t.do(0, { type: 'next-phase' });
    t.autoPass = false;
    t.do(0, { type: 'attack', attacks: [{ instanceId: t.bf(0, 'Grizzly Bears').instanceId, defenderId: t.P(1).playerId }] });
    for (let g = 0; g < 5 && t.game.flow.priority?.holderId !== t.P(1).playerId; g++) t.ctl.dispatch({ type: 'pass' }, { playerId: t.game.flow.priority.holderId, isHost: false });
    t.ctl.dispatch({ type: 'play', instanceId: t.hand(1, 'Opt').instanceId }, t.as(1));
    settle(t);
    check('Aetherize: the attacking creature returns to its owner’s hand', !t.bf(0, 'Grizzly Bears') && t.P(0).deck.hand.some(c => t.game.cardDefinitions[c.definitionId]?.name === 'Grizzly Bears'));
  }
}
done();
