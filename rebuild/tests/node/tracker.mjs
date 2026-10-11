// Hosted Table Tracker: the store's judge record, legality marks, undo and reverse, and who may do what.
import { check, section, done } from './harness.mjs';
import { createTracker } from '../../src/game/tracker.js';
import { createTrackerStore } from '../../src/app/tracker-session.js';

const table = () => createTracker({ players: [{ name: 'Aaron' }, { name: 'Lex' }, { name: 'Charlie' }] });

section('hosted tracker: record and legality');
{
  const store = createTrackerStore(table(), { role: 'host-device' });
  const [a, l] = store.state().players;
  const aaron = { clientId: 'c1', name: 'Aaron', seatId: a.id }, lex = { clientId: 'c2', name: 'Lex', seatId: l.id };
  store.remote({ type: 'life', playerId: a.id, delta: -1 }, aaron);
  store.remote({ type: 'life', playerId: a.id, delta: -1 }, aaron);
  store.remote({ type: 'life', playerId: a.id, delta: -1 }, aaron);
  let plays = store.plays();
  check('quick taps on one value become one record entry', plays.length === 1 && plays[0].taps === 3 && /40 → 37/.test(plays[0].text), JSON.stringify(plays));
  check('a change to your own seat is marked legal', plays[0].verdict === 'legal' && plays[0].by === 'Aaron');
  store.remote({ type: 'life', playerId: a.id, delta: -2 }, lex);
  plays = store.plays();
  check('a change to another seat is flagged with who did it', plays[0].verdict === 'other' && plays[0].by === 'Lex' && /Aaron/.test(plays[0].note), JSON.stringify(plays[0]));
  store.act({ type: 'poison', playerId: l.id, delta: 10 });
  check('a host change is marked as a host change', store.plays()[0].verdict === 'host');
  check('the table state flags a player who should be out', store.issues().length === 1 && /Lex: 10 poison/.test(store.issues()[0].text), JSON.stringify(store.issues()));
  store.act({ type: 'eliminate', playerId: l.id, eliminated: true });
  check('marking the player out clears the issue', store.issues().length === 0);

  let threw = '';
  try { store.remote({ type: 'reset' }, aaron); } catch (e) { threw = e.message; }
  check('a joined player cannot reset the table', /Only the host/.test(threw) && store.state().players[1].eliminated);
  threw = '';
  try { store.remote({ type: 'life', playerId: a.id, delta: 5 }, { clientId: 'c3', name: 'Watcher', seatId: null }); } catch (e) { threw = e.message; }
  check('a watching device cannot change the table', /Pick your seat/.test(threw));
  threw = '';
  try { store.remote({ type: 'name', playerId: l.id, name: 'Bob' }, aaron); } catch (e) { threw = e.message; }
  check('a joined player cannot rename another seat', /Only the host/.test(threw));

  threw = '';
  try { store.remote({ type: 'undo' }, aaron); } catch (e) { threw = e.message; }
  check('a player cannot undo once someone else changed the table', /ask the host/.test(threw));
  const lifeEntry = store.plays().find(p => p.by === 'Aaron');
  store.reverse(lifeEntry.id);
  const s = store.state();
  check('reversing an entry takes back it and every later change', s.players[0].life === 40 && s.players[1].poison === 0 && !s.players[1].eliminated && store.plays().length === 0, JSON.stringify(s.players.map(p => [p.life, p.poison])));
  check('the log says the judge reversed it', /Judge reversed: .*Aaron.*3 later changes/.test(s.log[0].text), s.log[0].text);
}
{
  const store = createTrackerStore(table(), { role: 'host-device' });
  const a = store.state().players[0];
  const aaron = { clientId: 'c1', name: 'Aaron', seatId: a.id };
  store.remote({ type: 'counter', playerId: a.id, name: 'Energy', set: 1 }, aaron);
  store.remote({ type: 'life', playerId: a.id, delta: 3 }, aaron);
  store.remote({ type: 'undo' }, aaron);
  check('a player can undo their own newest change', store.state().players[0].life === 40 && store.state().players[0].counters.Energy === 1 && store.plays().length === 1);
  store.remote({ type: 'life', playerId: a.id, delta: -1 }, aaron);
  store.reverse(store.plays()[0].id);
  store.remote({ type: 'counter', playerId: a.id, name: 'Energy', delta: 1 }, aaron);
  store.undo();
  check('undo keeps the judge note in the log', store.state().log.some(e => /Judge reversed/.test(e.text)));
  store.remote({ type: 'card-add', playerId: a.id, name: 'Sol Ring', id: 'tc-fixed' }, aaron);
  store.remote({ type: 'card-counter', playerId: a.id, cardId: 'tc-fixed', name: 'Charge', delta: 1 }, aaron);
  check('a joined device chooses the tracked card id so counters anchor to it', store.state().players[0].cards[0]?.counters.Charge === 1);
}
{
  const t = table();
  const hp = createTrackerStore(t, { role: 'host-player', seatId: t.players[0].id });
  hp.act({ type: 'life', playerId: t.players[0].id, delta: -1 });
  hp.act({ type: 'life', playerId: t.players[1].id, delta: -1 });
  check('a playing host: own seat is legal, other seats are host changes', hp.plays()[1].verdict === 'legal' && hp.plays()[0].verdict === 'host', JSON.stringify(hp.plays().map(p => p.verdict)));
  const local = createTrackerStore(table());
  local.act({ type: 'life', playerId: local.state().players[1].id, delta: -4 });
  check('one-device tables mark every change legal', local.plays()[0].verdict === 'legal');
  local.undo();
  check('one-device undo still works', local.state().players[1].life === 40);
}
done();
