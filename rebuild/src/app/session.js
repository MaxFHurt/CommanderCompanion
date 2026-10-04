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

let current = null;

export function getSession() { return current; }

export function endSession({ keepSave = false } = {}) {
  current?.close?.();
  current = null;
  if (!keepSave) deleteRecord(GAME_SAVE_KEY);
}

function baseHostSession(game, { role, seatId = null, net = null }) {
  const listeners = new Set();
  const save = debounce(() => {
    if (game.status === 'complete') { deleteRecord(GAME_SAVE_KEY); return; }
    saveRecord(GAME_SAVE_KEY, { savedAt: new Date().toISOString(), status: game.status, role, seatId, game }).catch(error => console.warn('Autosave failed', error));
  }, 600);
  const controller = createController(game, {
    onChange: () => {
      save();
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

/** Restore the autosaved game on this device (single device or host seat). */
export async function resumeSavedSession() {
  const saved = await loadRecord(GAME_SAVE_KEY);
  if (!saved?.game || saved.game.status === 'complete') return null;
  const game = saved.game;
  // Remote seats cannot be restored without their devices: the host device takes them over.
  game.deviceMode = 'single-device';
  for (const p of game.players) p.ownership = { local: true, clientId: null };
  endSession({ keepSave: true });
  current = baseHostSession(game, { role: 'local' });
  settle(game);
  current.controller.start();
  return current;
}
