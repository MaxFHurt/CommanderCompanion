// A "session" is how the game screen talks to a game, whether the game runs on this device
// (local or hosting) or on someone else's (joined as a client). The screen only ever uses:
//   session.view()            → what this device may see
//   session.send(intent)      → ask for something to happen; resolves { ok, error }
//   session.onChange(fn)      → redraw when the game changes

import { createController } from '../game/controller.js';
import { settle } from '../game/flow.js';
import { saveRecord, deleteRecord, loadRecord } from '../data/store.js';
import { GAME_SAVE_KEY } from '../game/save-keys.js';
import { debounce } from '../ui/dom.js';
import { checkpointStore } from './checkpoints.js';
import { sendCorrections } from '../net/corrections.js';
import { attachOutcomes } from '../net/outcomes.js';
import { hostRoom, joinRoom, deviceClientId } from '../net/room.js';
import { go } from './router.js';

let current = null;

export function getSession() { return current; }

export function endSession({ keepSave = false } = {}) {
  const online = current?.role === 'online';   // its save is online, not this device's game save
  current?.close?.();
  current = null;
  if (!keepSave && !online) deleteRecord(GAME_SAVE_KEY);
}

/** An online game opened by src/app/online-session.js becomes the current session. */
export function useSession(session) {
  endSession({ keepSave: true });
  current = session;
  return current;
}

function baseHostSession(game, { role, seatId = null, net = null }) {
  const listeners = new Set();
  const save = debounce(() => {
    if (game.status === 'complete') { deleteRecord(GAME_SAVE_KEY); return; }
    saveRecord(GAME_SAVE_KEY, { savedAt: new Date().toISOString(), status: game.status, role, seatId, roomCode: net?.code || null, game }).catch(error => console.warn('Autosave failed', error));
  }, 600);
  attachOutcomes(game, () => { for (const fn of listeners) fn(); });
  const controller = createController(game, {
    checkpoints: checkpointStore(game.gameId),
    onChange: () => {
      save();
      sendCorrections(game);
      net?.pushViews();
      for (const fn of listeners) fn();
    }
  });
  let actingAs = null; // single device: host may look at / act for a chosen player
  const session = {
    role, controller, game,
    isHost: true,
    /** The player this device is showing. Single device follows whoever the game is waiting on. */
    viewerId() {
      if (role === 'host-device') return null;
      if (role === 'host-player') return seatId;
      return actingAs && game.players.some(p => p.playerId === actingAs && !p.eliminated) ? actingAs : controller.actorId();
    },
    actAs(playerId) { actingAs = playerId; for (const fn of listeners) fn(); },
    actingAs: () => actingAs,
    view() { return controller.view({ playerId: session.viewerId(), isHost: true }); },
    viewFor(playerId) { return controller.view({ playerId, isHost: true }); },
    async send(intent) {
      const viewer = session.viewerId();
      const result = controller.dispatch(intent, { playerId: viewer, isHost: true });
      if (result.ok && role === 'local' && ['pass', 'answer', 'block', 'discard', 'keep', 'next-phase', 'end-turn'].includes(intent.type)) actingAs = null;
      return result;
    },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    saveNow: () => save.flush(),
    close() { save.flush(); controller.stop(); net?.close(); listeners.clear(); }
  };
  return session;
}

/** One device, everyone takes turns on it. */
export function startLocalSession(game) {
  endSession({ keepSave: true });
  current = baseHostSession(game, { role: 'local' });
  current.controller.start();
  return current;
}

/** This device hosts a room. seatId is the host's own seat, or null for a table/judge display. */
export function startHostSession(game, { seatId = null, net }) {
  endSession({ keepSave: true });
  current = baseHostSession(game, { role: seatId ? 'host-player' : 'host-device', seatId, net });
  net.attach(current.controller);
  current.net = net;
  current.controller.start();
  return current;
}

/** Joined someone else's room: views arrive over the network. */
export function startClientSession(link) {
  endSession({ keepSave: true });
  const listeners = new Set();
  let view = link.lastView || null;
  const defs = {};
  const merge = v => { Object.assign(defs, v.defs || {}); return { ...v, defs }; };
  if (view) view = merge(view);
  link.onView(v => { view = merge(v); for (const fn of listeners) fn(); });
  link.onStatus(() => { for (const fn of listeners) fn(); });
  link.onHandover(msg => takeOverHosting(msg).catch(error => console.warn('Hosting handover failed', error)));
  current = {
    role: 'client', isHost: false, link,
    viewerId: () => view?.you || null,
    view: () => view,
    send: intent => link.request(intent),
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    status: () => link.status(),
    close() { link.close(); listeners.clear(); }
  };
  return current;
}

/** Open a room under a code another device is giving up: it may take a moment to be free. */
async function reopenRoom(code, known) {
  for (let attempt = 0; attempt < 12; attempt++) {
    try { return await hostRoom(code, { remoteSeats: 0, known }); }
    catch { await new Promise(r => setTimeout(r, 1500)); }
  }
  return null;
}

/** The host handed this game to this device: host it from here under the same room code. */
async function takeOverHosting(msg) {
  const game = msg.game;
  const known = game.players.filter(p => p.ownership?.clientId).map(p => ({ clientId: p.ownership.clientId, name: p.displayName }));
  const net = await reopenRoom(msg.code, known);
  if (!net) {
    // The room could not be reopened: carry on here, this device takes over the remote seats (as after a failed resume).
    game.deviceMode = 'single-device';
    for (const p of game.players) p.ownership = { local: true, clientId: null };
    startLocalSession(game);
  } else startHostSession(game, { seatId: msg.seatId, net });
  settle(game);
  go('game');
}

/**
 * The host hands hosting to the device `clientId` (owner, 7 Nov: hosted games between devices). This device sends the game,
 * closes its room and rejoins as a player (or as a watcher for a table display). Its own saved copy is dropped, so only the new
 * host restores the game. Returns { ok, error }.
 */
export async function handOverHosting(clientId) {
  const s = current;
  if (!s?.isHost || !s.net) return { ok: false, error: 'This device is not hosting a room.' };
  const game = s.game, hostSeat = s.role === 'host-player' ? s.viewerId() : null;
  const localSeats = game.players.filter(p => !p.eliminated && p.ownership?.local && p.playerId !== hostSeat);
  if (localSeats.length) return { ok: false, error: 'More than one player is playing on this device: hand over only when each player has their own device.' };
  const me = deviceClientId(), code = s.net.code, name = game.players.find(p => p.playerId === hostSeat)?.displayName || 'Table';
  if (!s.net.handover(clientId, game, { hostClientId: me, hostSeat })) return { ok: false, error: 'That device is not connected.' };
  await new Promise(r => setTimeout(r, 800));
  endSession({ keepSave: false });   // the new host saves it from now on
  await deleteRecord(GAME_SAVE_KEY).catch(() => {});
  for (let attempt = 0; attempt < 20; attempt++) {
    try {
      const link = await joinRoom(code, { clientId: me, name });
      startClientSession(link);
      go('game');
      return { ok: true };
    } catch { await new Promise(r => setTimeout(r, 1500)); }
  }
  return { ok: false, error: 'The new host did not open the room. Join it again with the code.' };
}

/**
 * Restore the autosaved game on this device. A hosted game reopens its room with the same code,
 * so joined phones reconnect to their own seats; if the room cannot be reopened, this device
 * takes over the remote seats and the game carries on here.
 */
export async function resumeSavedSession({ onStatus = () => {} } = {}) {
  const saved = await loadRecord(GAME_SAVE_KEY);
  if (!saved?.game || saved.game.status === 'complete') return null;
  const game = saved.game;
  let net = null;
  if (saved.roomCode && (saved.role === 'host-device' || saved.role === 'host-player')) {
    onStatus(`Reopening room ${saved.roomCode}…`);
    const known = game.players.filter(p => p.ownership?.clientId).map(p => ({ clientId: p.ownership.clientId, name: p.displayName }));
    // The connection service may still hold the old room for a short while after a restart.
    for (let attempt = 0; attempt < 8 && !net; attempt++) {
      try { net = await hostRoom(saved.roomCode, { remoteSeats: 0, known }); }
      catch { await new Promise(r => setTimeout(r, 2500)); }
    }
  }
  endSession({ keepSave: true });
  if (net) {
    current = baseHostSession(game, { role: saved.role, seatId: saved.role === 'host-player' ? saved.seatId : null, net });
    net.attach(current.controller);
    current.net = net;
  } else {
    // Remote seats cannot be restored without their devices: this device takes them over.
    game.deviceMode = 'single-device';
    for (const p of game.players) p.ownership = { local: true, clientId: null };
    current = baseHostSession(game, { role: 'local' });
  }
  const snaps = await checkpointStore(game.gameId).load().catch(() => new Map());
  current.controller.restoreCheckpoints(snaps);
  settle(game);
  current.controller.start();
  return current;
}
