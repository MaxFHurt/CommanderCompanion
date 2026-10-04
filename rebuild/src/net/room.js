// Hosting and joining a room. The host device owns the game; other devices only receive the
// view they are allowed to see and send back requests ("intents").

import { openHostTransport, openClientTransport } from './transport.js';

function emitter() {
  const fns = new Set();
  return { on: fn => { fns.add(fn); return () => fns.delete(fn); }, emit: (...a) => { for (const fn of fns) fn(...a); } };
}

/** Host side. `seats` = how many remote players are expected. */
export async function hostRoom(code, { remoteSeats = 0 } = {}) {
  const transport = await openHostTransport(code);
  const clients = new Map(); // clientId → { name, seat (prepared setup), playerId, sentDefs:Set, online }
  const lobby = emitter();
  let controller = null, open = true;

  const lobbyState = () => ({
    code, remoteSeats, started: !!controller,
    players: [...clients.entries()].filter(([, c]) => c.seat).map(([id, c]) => ({ clientId: id, name: c.name, deckName: c.seat.deckName, online: c.online })),
    spectators: [...clients.values()].filter(c => !c.seat).length
  });
  const tellLobby = () => {
    const state = lobbyState();
    for (const [id, c] of clients) if (c.online) transport.send(id, { type: 'lobby', lobby: { ...state, you: id } });
    lobby.emit(state);
  };

  function pushView(clientId) {
    const c = clients.get(clientId);
    if (!controller || !c?.online) return;
    const view = controller.view({ playerId: c.playerId || null, isHost: false });
    const defs = {};
    for (const [id, def] of Object.entries(view.defs)) if (!c.sentDefs.has(id)) { defs[id] = def; c.sentDefs.add(id); }
    transport.send(clientId, { type: 'view', view: { ...view, defs } });
  }

  transport.onMessage((clientId, msg) => {
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'join') {
      const known = clients.get(clientId);
      if (known) { known.online = true; known.sentDefs = new Set(); transport.send(clientId, { type: 'joined', seated: !!known.seat }); tellLobby(); return pushView(clientId); }
      if (controller) {
        // The game is running: a new device may only watch.
        clients.set(clientId, { name: String(msg.name || 'Spectator').slice(0, 24), seat: null, playerId: null, sentDefs: new Set(), online: true });
        transport.send(clientId, { type: 'joined', seated: false });
        return pushView(clientId);
      }
      const seated = [...clients.values()].filter(c => c.seat).length;
      const wantsSeat = !!msg.seat && seated < remoteSeats && open;
      clients.set(clientId, { name: String(msg.seat?.name || msg.name || 'Player').slice(0, 24), seat: wantsSeat ? msg.seat : null, playerId: null, sentDefs: new Set(), online: true });
      transport.send(clientId, { type: 'joined', seated: wantsSeat, reason: wantsSeat || !msg.seat ? '' : 'All seats are taken — you are watching.' });
      return tellLobby();
    }
    const c = clients.get(clientId);
    if (!c) return transport.send(clientId, { type: 'refused', reason: 'Join the room first.' });
    if (msg.type === 'intent') {
      if (!controller) return transport.send(clientId, { type: 'result', id: msg.id, result: { ok: false, error: 'The game has not started.' } });
      const intent = { ...(msg.intent || {}) };
      // A remote device can never act as the host or as another player.
      delete intent.as; delete intent.approved;
      if (intent.type === 'edit' || intent.type === 'undo' || intent.type === 'veto' || intent.type === 'end-game') intent.force = false;
      const result = controller.dispatch(intent, { playerId: c.playerId, isHost: false });
      transport.send(clientId, { type: 'result', id: msg.id, result });
    }
  });
  transport.onLeave(clientId => { const c = clients.get(clientId); if (c) { c.online = false; tellLobby(); } });

  return {
    code, kind: transport.kind, fallback: !!transport.fallback,
    lobby: lobbyState, onLobby: lobby.on,
    kick(clientId) { transport.send(clientId, { type: 'refused', reason: 'The host removed you from the room.' }); clients.delete(clientId); tellLobby(); },
    /** Prepared seats of everyone who joined, in join order. */
    seats: () => [...clients.entries()].filter(([, c]) => c.seat).map(([clientId, c]) => ({ ...c.seat, clientId })),
    /** Called once the game exists: links each client to its player. */
    attach(ctl) {
      controller = ctl;
      open = false;
      for (const p of ctl.game.players) {
        const c = p.ownership?.clientId ? clients.get(p.ownership.clientId) : null;
        if (c) c.playerId = p.playerId;
      }
      tellLobby();
    },
    pushViews() { for (const id of clients.keys()) pushView(id); },
    close() { transport.close(); }
  };
}

/** Client side. Resolves once the host has accepted the join. */
export async function joinRoom(code, { clientId, seat = null, name = '' }) {
  let transport = await openClientTransport(code, clientId);
  const view = emitter(), status = emitter(), lobby = emitter();
  const pending = new Map();
  let state = 'online', next = 1, lastLobby = null;
  const link = {
    code, clientId, lastView: null, seated: false, reason: '',
    onView: view.on, onStatus: status.on, onLobby: lobby.on, lobby: () => lastLobby,
    status: () => state,
    request(intent) {
      if (state !== 'online') return Promise.resolve({ ok: false, error: 'Not connected to the host.' });
      const id = next++;
      return new Promise(resolve => {
        pending.set(id, resolve);
        transport.send({ type: 'intent', id, intent });
        setTimeout(() => { if (pending.has(id)) { pending.delete(id); resolve({ ok: false, error: 'The host did not answer. Check the connection.' }); } }, 10000);
      });
    },
    close() { state = 'closed'; transport.close(); }
  };
  const wire = () => {
    transport.onMessage(msg => {
      if (msg.type === 'view') { link.lastView = msg.view; view.emit(msg.view); }
      else if (msg.type === 'result') { pending.get(msg.id)?.(msg.result); pending.delete(msg.id); }
      else if (msg.type === 'lobby') { lastLobby = msg.lobby; lobby.emit(msg.lobby); }
      else if (msg.type === 'refused') { state = 'closed'; link.reason = msg.reason; status.emit(state); }
    });
    transport.onClose(async () => {
      if (state === 'closed') return;
      state = 'lost'; status.emit(state);
      // Try to get back in for a while (phone slept, wifi blip).
      for (let attempt = 0; attempt < 20 && state === 'lost'; attempt++) {
        await new Promise(r => setTimeout(r, 3000));
        try {
          transport = await openClientTransport(code, clientId);
          wire();
          transport.send({ type: 'join', name });
          state = 'online'; status.emit(state);
        } catch { /* keep trying */ }
      }
    });
  };
  const joined = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('The host did not answer.')), 10000);
    const off = transport.onMessage(msg => {
      if (msg.type === 'joined') { clearTimeout(timer); off(); link.seated = !!msg.seated; link.reason = msg.reason || ''; resolve(); }
    });
  });
  wire();
  transport.send({ type: 'join', seat, name });
  await joined;
  return link;
}

export function deviceClientId() {
  try {
    // Kept across app restarts so a player gets their seat back; per-tab when testing in one browser.
    const store = /[?&]net=loopback/.test(location.search) ? sessionStorage : localStorage;
    let id = store.getItem('cc-client-id');
    if (!id) { id = `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`; store.setItem('cc-client-id', id); }
    return id;
  } catch { return `c-${Math.random().toString(36).slice(2, 10)}`; }
}
