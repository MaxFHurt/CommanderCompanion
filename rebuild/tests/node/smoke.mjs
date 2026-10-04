import { newGame, check, section, done } from './harness.mjs';

section('opening + first turn');
{
  const t = newGame(['white', 'simic']);
  check('opening stage', t.game.flow.stage === 'opening');
  check('7 cards each', t.P(0).deck.hand.length === 7 && t.P(1).deck.hand.length === 7);
  t.do(0, { type: 'mulligan' });
  check('free first mulligan', t.view(0).prompt.bottom === 0);
  t.keepAll();
  check('play stage', t.game.flow.stage === 'play');
  check('main 1 after auto steps', t.game.phase === 'precombat-main', t.game.phase);
  check('drew for turn', t.P(0).deck.hand.length === 8, String(t.P(0).deck.hand.length));
  console.log(t.game.log.slice(0, 6).map(e => e.text));
}
done();
