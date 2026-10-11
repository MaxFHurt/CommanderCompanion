// Rules automation: targeting restrictions, hand-resolved cards still choosing targets, and the
// mechanics the engine runs by itself (alternative costs, keyword triggers, replacements …).
import { newGame, check, section, done } from './harness.mjs';
import { MECHANICS, mechanicsIn, guidedActionsFor } from '../../src/data/mechanics.js';

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
  t.try(0, { type: 'play', instanceId: t.hand(0, 'Chaos Warp').instanceId });
  const d = t.decision();
  check('Chaos Warp asks for its target permanent when cast', d?.targeting && d.options.some(o => o.label === 'Serra Angel'), JSON.stringify(d && d.title));
  const angel = d.options.find(o => o.label === 'Serra Angel').id;
  t.ctl.dispatch({ type: 'answer', key: d.key, value: angel }, t.as(0));
  answerAll(t);
  t.passAll();
  const v = t.view(0);
  check('the resolution screen names the target', v.prompt.kind === 'guided' && v.prompt.targets[0]?.name === 'Serra Angel', JSON.stringify(v.prompt.targets));
  check('the resolution screen offers the right actions', v.prompt.actions.includes('shuffle'), JSON.stringify(v.prompt.actions));
}
done();
