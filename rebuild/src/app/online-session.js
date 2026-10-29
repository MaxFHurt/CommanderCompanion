// An online game ("play over time"): every player's device runs the game, and the shared copy
// lives online (src/net/online.js). After each of this player's actions the device saves; while it
// waits it checks every few seconds for the other players' moves. If someone else saved first,
// this device takes their copy and repeats its own actions on top, so no move is lost.
// The game screen uses it like any other session: view(), send(intent), onChange(fn).

import { createController } from '../game/controller.js';
import { saveRecord, loadRecord } from '../data/store.js';
import { fetchOnlineGame, saveOnlineGame } from '../net/online.js';
import { rememberOnlineGame } from './online-games.js';
import { toast } from '../ui/toast.js';

const localKey = code => `cc-online:${code}`;
const FAST = 4000, SLOW = 20000, HIDDEN = 60000, QUIET_AFTER = 10 * 60 * 1000;

function summaryOf(game, controller) {
  const waiting = game.players.find(p => p.playerId === controller.actorId());
  return {
    status: game.status === 'complete' ? 'complete' : 'playing',
    names: game.players.map(p => p.displayName),
    waitingOn: game.status === 'complete' ? '' : waiting?.displayName || '',
    waitingClientId: game.status === 'complete' ? '' : waiting?.ownership?.clientId || '',
    turn: game.turnNumber || 0
  };
}

/**
 * Open an online game on this device. `clientId` finds this device's seat; `playerId` picks a seat
 * by hand (playing on a new device). Throws OnlineError if the game cannot be loaded at all.
 */
export async function openOnlineGame(code, { clientId, playerId = null }) {
  const local = await loadRecord(localKey(code)).catch(() => null);
  let remote = null, offline = false;
  try { remote = await fetchOnlineGame(code); }
  catch (error) { if (error.status || !local?.game) throw error; offline = true; }
  if (remote && !remote.game) return { lobby: remote };
  let game = remote?.game, rev = remote?.rev || 0, unsaved = false;
  // Moves made here while offline, on top of the copy that is still the latest: keep them.
  if (local?.pending && local.game && (offline || local.baseRev === rev)) { game = local.game; rev = local.baseRev; unsaved = true; }
  const seat = game.players.find(p => p.playerId === playerId) || game.players.find(p => p.ownership?.clientId === clientId);
  if (!seat) return { chooseSeat: game.players.map(p => ({ playerId: p.playerId, name: p.displayName })), game };
  rememberOnlineGame({ code, clientId, playerId: seat.playerId, name: seat.displayName, names: game.players.map(p => p.displayName), mode: game.mode });
  return { session: onlineSession({ code, rev, game, seatId: seat.playerId, lastJson: unsaved ? '' : JSON.stringify(game), offline }) };
}

function onlineSession({ code, rev, game, seatId, lastJson, offline }) {
  const listeners = new Set();
  const queue = [];   // this player's actions since the last save, repeated if someone else saved first
  let controller = null, saving = false, again = false, closed = false, timer = null, retry = null;
  let state = offline ? 'offline' : 'saved', lastActivity = Date.now();
  const actor = { playerId: seatId, isHost: false };
  const emit = () => { for (const fn of listeners) fn(); };
  const myMove = () => game.status !== 'complete' && controller.actorId() === seatId;

  function mount(next) {
    controller?.stop();
    game = next;
    controller = createController(game, { onChange: emit });
    session.controller = controller;
    session.game = game;
    controller.start();
  }

  function setState(next, message = '') {
    if (next === state) return;
    const was = state;
    state = next;
    if (next === 'offline') toast(message || 'No connection: your moves are kept on this device and saved when it is back.', { bad: true, ms: 4500 });
    else if (next === 'saved' && was === 'offline') toast('Back online — game saved.');
  }

  function dispatch(intent) {
    const clean = { ...intent };
    // Like a joined device: nobody acts for another player or with host powers.
    delete clean.as; delete clean.approved;
    if (['edit', 'undo', 'veto', 'end-game'].includes(clean.type)) clean.force = false;
    return controller.dispatch(clean, actor);
  }

  async function keepLocal(pending) {
    await saveRecord(localKey(code), { code, baseRev: rev, pending, savedAt: new Date().toISOString(), game }).catch(() => {});
  }

  async function save() {
    if (saving) { again = true; return; }
    saving = true;
    clearTimeout(retry);
    try {
      for (;;) {
        again = false;
        const json = JSON.stringify(game);
        if (json === lastJson) { queue.length = 0; break; }
        await keepLocal(true);
        try {
          const done = await saveOnlineGame(code, rev, game, summaryOf(game, controller));
          rev = done.rev; lastJson = json; queue.length = 0;
          setState('saved');
          await keepLocal(false);
          if (!again) break;
        } catch (failed) {
          let error = failed;
          if (error.status === 409) {
            try { await catchUp(); continue; } catch (next) { error = next; }
          }
          setState('offline', error.status ? error.message : '');
          retry = setTimeout(save, 8000);
          break;
        }
      }
    } finally { saving = false; }
  }

  /** Someone else saved first: take their copy, then repeat this player's actions on it. */
  async function catchUp() {
    const latest = await fetchOnlineGame(code);
    const mine = queue.splice(0);
    rev = latest.rev; lastJson = JSON.stringify(latest.game);
    mount(latest.game);
    for (const intent of mine) {
      if (dispatch(intent).ok) queue.push(intent);
      else { toast('Another player moved at the same time, so your last action did not happen. Check the board and try again.', { bad: true, ms: 6000 }); break; }
    }
    emit();
  }

  async function poll() {
    if (closed) return;
    // Never while this device has moves that are not saved yet: those go up first.
    if (!saving && !queue.length && lastJson !== '') {
      try {
        const latest = await fetchOnlineGame(code, rev);
        setState('saved');
        if (latest?.game && !closed && !saving && !queue.length) {
          const before = myMove();
          rev = latest.rev; lastJson = JSON.stringify(latest.game);
          mount(latest.game);
          lastActivity = Date.now();
          keepLocal(false);
          emit();
          if (!before && myMove()) toast('Your move.');
        }
      } catch { /* try again next time */ }
    }
    schedule();
  }

  function schedule() {
    clearTimeout(timer);
    if (closed) return;
    const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
    timer = setTimeout(poll, hidden ? HIDDEN : Date.now() - lastActivity < QUIET_AFTER ? FAST : SLOW);
  }
  const onVisible = () => { if (document.visibilityState === 'visible') { lastActivity = Date.now(); clearTimeout(timer); poll(); } };

  const session = {
    role: 'online', isHost: false, code,
    viewerId: () => seatId,
    view: () => controller.view({ playerId: seatId, isHost: false }),
    async send(intent) {
      const result = dispatch(intent);
      if (result.ok) { queue.push(intent); lastActivity = Date.now(); save(); }
      return result;
    },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    status: () => state,
    myMove: () => myMove(),
    saveNow: () => save(),
    close() {
      closed = true;
      clearTimeout(timer); clearTimeout(retry);
      document.removeEventListener('visibilitychange', onVisible);
      controller.stop(); listeners.clear();
    }
  };
  mount(game);
  document.addEventListener('visibilitychange', onVisible);
  if (lastJson === '') save(); else schedule();
  return session;
}
