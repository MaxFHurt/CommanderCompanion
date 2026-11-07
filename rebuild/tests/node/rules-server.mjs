// The online-games rules server (cloud/rules-server.mjs): seats with private keys, the game dealt on the server,
// each seat sees only its own hidden cards, moves checked by the rules, simultaneous moves both kept.
import { rulesServer, memoryStore } from '../../../cloud/rules-server.mjs';
import { playerSetup, DEFS } from './harness.mjs';

let passed = 0, failed = 0;
const check = (name, ok, extra = '') => { if (ok) passed++; else { failed++; console.log(`FAIL ${name} ${extra}`); } };

const store = memoryStore();
const handle = rulesServer({ store });
const BASE = 'http://x/games';
const call = async (method, path, body, key) => {
  const res = await handle(new Request(BASE + path, { method, headers: { 'Content-Type': 'application/json', ...(key ? { 'X-Seat-Key': key } : {}) }, body: body ? JSON.stringify(body) : undefined }));
  return { status: res.status, data: res.status === 204 ? null : await res.json() };
};
const seatFor = (name, deck, clientId) => { const s = playerSetup(name, deck); return { ...s, deckName: deck, clientId, definitions: DEFS.filter(d => s.manifest.some(m => m.definitionId === d.definitionId) || s.commanderIds.includes(d.definitionId)) }; };
const KA = 'a'.repeat(32), KB = 'b'.repeat(32), KC = 'c'.repeat(32);

const made = await call('POST', '', { lobby: { mode: 'fully-tracked', rules: {}, firstPlayer: 0, seatsWanted: 2, seats: [seatFor('Aaron', 'white', 'c-a')] }, key: KA });
check('a game is created with a code', made.status === 200 && /^[A-Z]{6}$/.test(made.data.code), JSON.stringify(made.data));
const code = made.data.code;
check('no key: refused', (await call('POST', '', { lobby: { seats: [seatFor('X', 'white', 'c-x')], seatsWanted: 2 } })).status === 400);

let lobby = await call('GET', `/${code}`, null, KA);
check('the lobby knows this device\'s seat', lobby.data.phase === 'lobby' && lobby.data.you === 0);
check('the lobby shows names, not deck lists', !JSON.stringify(lobby.data).includes('manifest') && lobby.data.lobby.seats[0].name === 'Aaron');
check('a stranger sees the lobby without a seat', (await call('GET', `/${code}`)).data.you === -1);

const joined = await call('POST', `/${code}/seat`, { seat: seatFor('Lex', 'simic', 'c-b'), key: KB });
check('the second player takes the last seat', joined.status === 200 && joined.data.index === 1, JSON.stringify(joined.data));
check('a third player is refused', (await call('POST', `/${code}/seat`, { seat: seatFor('Zed', 'red', 'c-c'), key: KC })).status === 409);

const row = store.rows.get(code);
check('the game is dealt on the server once the seats are full', row.phase === 'playing' && JSON.parse(row.game).players.length === 2);
check('the stored lobby no longer holds the deck lists', !JSON.stringify(row.lobby).includes('manifest'));
check('only key hashes are stored', !JSON.stringify(row).includes(KA) && row.keys.length === 2);

const a = await call('GET', `/${code}`, null, KA), b = await call('GET', `/${code}`, null, KB), s = await call('GET', `/${code}`);
check('each player gets a view', a.data.view?.you && b.data.view?.you && a.data.view.you !== b.data.view.you);
const handOf = (view, playerId) => view.players.find(p => p.playerId === playerId).hand;
check('Aaron sees his own hand', handOf(a.data.view, a.data.view.you)?.length === 7);
check('Aaron does not see Lex\'s hand', handOf(a.data.view, b.data.view.you) === null);
const game = JSON.parse(row.game), lexHand = game.players[1].deck.hand.map(c => c.instanceId), lexLib = game.players[1].deck.remainingLibrary.map(c => c.instanceId);
const aText = JSON.stringify(a.data);
check('none of Lex\'s hidden cards reach Aaron\'s device', !lexHand.some(id => aText.includes(id)) && !lexLib.some(id => aText.includes(id)));
check('a stranger with the code gets no view', s.data.view === null && s.data.seats.length === 2);
check('unchanged: 204', (await call('GET', `/${code}?rev=${a.data.rev}`, null, KA)).status === 204);

// Keep both hands (opening), then play on.
let view = a.data.view;
const act = async (key, intent) => call('POST', `/${code}/act`, { intent }, key);
check('a move with no seat key is refused', (await act(null, { type: 'keep', bottom: [] })).status === 403);
let r = await act(KA, { type: 'keep', bottom: [] });
check('Aaron keeps', r.status === 200 && r.data.result.ok, JSON.stringify(r.data).slice(0, 300));
r = await act(KB, { type: 'keep', bottom: [] });
check('Lex keeps', r.status === 200 && r.data.result.ok, JSON.stringify(r.data).slice(0, 300));
view = (await call('GET', `/${code}`, null, KA)).data.view;
check('Aaron draws... and it is his turn', view.prompt.kind === 'turn' || view.prompt.kind === 'priority', view.prompt.kind);
r = await act(KB, { type: 'next-phase' });
check('Lex cannot move on Aaron\'s turn', r.status === 200 && !r.data.result.ok);
r = await act(KB, { type: 'edit', force: true, as: view.you });
check('nobody acts for another player or edits the game', !r.data.result?.ok);
const land = view.players.find(p => p.playerId === view.you).hand.find(c => c.land && c.playable);
r = await act(KA, { type: 'play', instanceId: land.id });
check('Aaron plays a land', r.data.result.ok && r.data.view.players.find(p => p.playerId === view.you).battlefield.some(c => c.id === land.id));
const lexView = (await call('GET', `/${code}`, null, KB)).data.view;
check('Lex sees the land on the battlefield', lexView.players.find(p => p.playerId === view.you).battlefield.some(c => c.id === land.id));

// Two moves at once: the second is played again on the newer game, not lost.
const before = store.rows.get(code).rev;
const slow = store.update;
let once = true;
store.update = async (c, rev, patch) => {
  if (once) { once = false; await slow.call(store, c, rev, { summary: store.rows.get(c).summary }); }
  return slow.call(store, c, rev, patch);
};
r = await act(KA, { type: 'next-phase' });
store.update = slow;
check('a move made while someone else saved is replayed and kept', r.data.result?.ok && store.rows.get(code).rev === before + 2, `${before} → ${store.rows.get(code).rev} ${JSON.stringify(r.data).slice(0, 200)}`);

const sum = await call('GET', `/${code}/summary`);
check('the summary says who to wait for', sum.data.summary.status === 'playing' && sum.data.summary.waitingOn === 'Aaron', JSON.stringify(sum.data.summary));
check('an unknown code: 404', (await call('GET', '/ZZZZZZ')).status === 404);

console.log(`rules-server: ${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
