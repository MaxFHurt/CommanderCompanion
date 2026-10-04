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
done();
