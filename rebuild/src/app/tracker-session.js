// Who changes a Table Tracker table, and how. The tracker screen only ever uses a store:
//   store.state()          → the table
//   store.act(action)      → change it (returns true/false straight away)
//   store.undo()           → take back the last change this device may take back
//   store.onChange(fn)     → redraw
// Local and hosted tables apply changes here. A hosted table also keeps the judge's record:
// every change with who made it, a legality mark, and a restore point so it can be reversed.

import { trackerApply, trackerPlayer, trackerIssues } from '../game/tracker.js';
import { newId } from '../game/helpers.js';

// Only the host changes the shape of the table or ends the game.
const HOST_ONLY = new Set(['add-player', 'remove-player', 'reset', 'clear-log', 'end-game', 'mat']);
// Cosmetic: never recorded or undone.
const SILENT = new Set(['art']);
// Quick taps on the same value become one entry in the judge's record.
const MERGEABLE = new Set(['life', 'poison', 'tax', 'counter', 'mana', 'commander-damage', 'card-counter']);
const MERGE_MS = 4000;
const MAX_PLAYS = 300;

function emitter() {
  const fns = new Set();
  return { on: fn => { fns.add(fn); return () => fns.delete(fn); }, emit: (...a) => { for (const fn of fns) fn(...a); } };
}

const mergeKey = (actor, a) => [actor.clientId || 'here', a.type, a.playerId, a.color, a.name, a.fromId, a.cardId].join('|');

/**
 * The change that cancels `action`, worked out from the table before and after it. Used when a
 * phone undoes its own change after someone else has changed the table: only that change is
 * taken back. Returns null for changes that cannot be cancelled this way (turns, players, reset).
 */
function inverseOf(action, before, after) {
  const pb = before.players.find(p => p.id === action.playerId), pa = after.players.find(p => p.id === action.playerId);
  if (!pb || !pa) return null;
  const id = action.playerId;
  switch (action.type) {
    case 'life': return { type: 'life', playerId: id, delta: pb.life - pa.life };
    case 'poison': return { type: 'poison', playerId: id, delta: pb.poison - pa.poison };
    case 'tax': return { type: 'tax', playerId: id, delta: pb.commander.tax - pa.commander.tax };
    case 'mana': return action.clear ? null : { type: 'mana', playerId: id, color: action.color, delta: pb.mana[action.color] - pa.mana[action.color] };
    case 'commander-damage': return { type: 'commander-damage', playerId: id, fromId: action.fromId, delta: Number(pb.commanderDamage[action.fromId] || 0) - Number(pa.commanderDamage[action.fromId] || 0) };
    case 'counter': {
      const name = String(action.name || '').trim();
      if (!(name in pb.counters)) return { type: 'counter', playerId: id, name, remove: true };
      return { type: 'counter', playerId: id, name, delta: pb.counters[name] - Number(pa.counters[name] || 0) };
    }
    case 'card-counter': {
      const cb = pb.cards.find(c => c.id === action.cardId), ca = pa.cards.find(c => c.id === action.cardId);
      if (!cb || !ca) return null;
      const name = String(action.name || '').trim();
      return { type: 'card-counter', playerId: id, cardId: action.cardId, name, delta: Number(cb.counters[name] || 0) - Number(ca.counters[name] || 0) };
    }
    case 'card-add': return { type: 'card-remove', playerId: id, cardId: pa.cards.find(c => !pb.cards.some(x => x.id === c.id))?.id };
    case 'status': return { type: 'status', playerId: id, status: action.status, enabled: pb.statuses.includes(String(action.status || '').trim().slice(0, 28)) };
    case 'eliminate': return { type: 'eliminate', playerId: id, eliminated: pb.eliminated };
    default: return null;
  }
}

/**
 * The table lives on this device (one device, or the host of a room).
 * role: 'local' | 'host-player' | 'host-device'; seatId: the host's own seat when playing.
 */
export function createTrackerStore(initial, { role = 'local', seatId = null } = {}) {
  let state = initial;
  let seq = 0;
  const plays = [];   // newest first: { id, at, by, clientId, seatId, key, verdict, note, text, acts: [{ seq, before, text }] }
  const changed = emitter();
  const hosting = role !== 'local';
  const me = { isHost: true, clientId: null, seatId, name: role === 'host-device' ? 'Host' : (trackerPlayer(state, seatId)?.name || 'Host') };

  function verdictFor(actor, action) {
    const target = action.playerId ? trackerPlayer(state, action.playerId) : null;
    if (!hosting) return { verdict: 'legal', note: '' };
    if (actor.isHost && (!actor.seatId || (target && target.id !== actor.seatId))) return { verdict: 'host', note: 'Host change' };
    if (target && actor.seatId && target.id !== actor.seatId) return { verdict: 'other', note: `Changed ${target.name}, not their own seat` };
    return { verdict: 'legal', note: '' };
  }

  /** Apply one change for an actor. Throws a readable Error when it is not allowed or not possible. */
  function apply(action, actor = me) {
    if (!actor.isHost) {
      if (!actor.seatId) throw new Error('Pick your seat to make changes.');
      if (HOST_ONLY.has(action.type)) throw new Error('Only the host can do that.');
      if ((action.type === 'name' || action.type === 'commander') && action.playerId !== actor.seatId) throw new Error('Only the host can rename another player.');
    }
    const before = JSON.stringify(state);
    const topBefore = state.log[0] ? `${state.log[0].id}|${state.log[0].text}` : '';
    const { verdict, note } = verdictFor(actor, action);
    trackerApply(state, action);
    if (SILENT.has(action.type)) { changed.emit(); return; }
    seq += 1;
    const top = state.log[0];
    const target = action.playerId ? trackerPlayer(state, action.playerId) : null;
    const text = top && `${top.id}|${top.text}` !== topBefore ? top.text
      : action.type === 'commander' ? `${target?.name}: Commander set to ${action.name || 'none'}`
      : action.type === 'mat' ? `${target?.name}: Playmat changed` : `${actor.name}: ${action.type}`;
    const key = mergeKey(actor, action);
    const last = plays[0];
    const inverse = inverseOf(action, JSON.parse(before), state);
    if (last && MERGEABLE.has(action.type) && last.key === key && Date.now() - Date.parse(last.at) < MERGE_MS) {
      last.at = new Date().toISOString();
      last.text = text;
      last.acts.push({ seq, before, text, inverse });
    } else {
      plays.unshift({ id: newId('tplay'), at: new Date().toISOString(), by: actor.name, clientId: actor.clientId || null, seatId: actor.seatId || null, key, verdict, note, text, acts: [{ seq, before, text, inverse }] });
      if (plays.length > MAX_PLAYS) plays.length = MAX_PLAYS;
    }
    changed.emit();
  }

  /** Go back to a saved copy of the table, keeping the judge's notes in the log. */
  function restore(json) {
    const notes = state.log.filter(e => e.tag === 'judge');
    const next = JSON.parse(json);
    const have = new Set(next.log.map(e => e.id));
    next.log = [...next.log, ...notes.filter(e => !have.has(e.id))].sort((x, y) => Date.parse(y.at) - Date.parse(x.at));
    state = next;
  }

  /** Take back the newest change (one tap at a time). */
  function undoLast() {
    const last = plays[0];
    if (!last) throw new Error('Nothing to undo.');
    const step = last.acts.pop();
    restore(step.before);
    if (!last.acts.length) plays.shift(); else last.text = last.acts[last.acts.length - 1].text;
    changed.emit();
  }

  /** Judge: take back one entry of the record and everything after it. */
  function reverse(playId) {
    const i = plays.findIndex(p => p.id === playId);
    if (i < 0) throw new Error('That change is no longer in the record.');
    const target = plays[i];
    restore(target.acts[0].before);
    plays.splice(0, i + 1);
    state.log.unshift({ id: newId('tl'), at: new Date().toISOString(), playerId: null, text: `Judge reversed: ${target.text}${i ? ` (and ${i} later change${i === 1 ? '' : 's'})` : ''}`, tag: 'judge' });
    changed.emit();
  }

  return {
    role, seatId, hosting,
    state: () => state,
    act(action) { apply(action, me); return true; },
    undo: undoLast,
    reverse,
    /** For the room: a change asked for by a joined device. */
    remote(action, actor) {
      if (action.type === 'undo') {
        // A player takes back their own newest change. If nobody changed anything since, the table
        // simply goes back; otherwise only that change is cancelled and everyone else's stays.
        if (plays[0]?.clientId === actor.clientId) return undoLast();
        const mine = plays.find(p => p.clientId === actor.clientId);
        const step = mine?.acts[mine.acts.length - 1];
        if (!step) throw new Error('You have no change to undo.');
        if (!step.inverse) throw new Error('That change cannot be undone from a phone — ask the host to reverse it in Judge mode.');
        apply(step.inverse, { ...actor, isHost: false });
        plays[0].text = `${actor.name} undid: ${step.text}`;
        mine.acts.pop();
        if (!mine.acts.length) plays.splice(plays.indexOf(mine), 1); else mine.text = mine.acts[mine.acts.length - 1].text;
        changed.emit();
        return;
      }
      return apply(action, { ...actor, isHost: false });
    },
    plays: () => plays.map(p => ({ id: p.id, at: p.at, by: p.by, verdict: p.verdict, note: p.note, text: p.text, taps: p.acts.length, seatId: p.seatId })),
    issues: () => trackerIssues(state),
    onChange: changed.on
  };
}

/**
 * The table lives on the host; this device shows it and sends changes.
 * Changes are applied here at once so taps feel instant; the host's copy always wins.
 */
export function createTrackerClientStore(link) {
  let state = link.lastState?.state || null;
  let pending = 0, latest = null;
  const changed = emitter();
  link.onState(msg => {
    latest = msg;
    if (pending) return;           // keep showing our own taps until the host has answered them
    state = msg.state; changed.emit();
  });
  link.onStatus(() => changed.emit());
  async function send(action) {
    pending += 1;
    const result = await link.request(action);
    pending -= 1;
    if (!result.ok) changed.emit({ error: result.error });
    if (!pending && latest) { state = latest.state; changed.emit(); }
    return result;
  }
  return {
    role: 'client', hosting: false,
    seatId: () => link.lastState?.you?.seatId || null,
    seats: () => link.lastState?.seats || {},
    issues: () => link.lastState?.issues || [],
    code: link.code,
    status: () => link.status(),
    state: () => state,
    act(action) {
      const local = action.type === 'art';   // art looked up on this device only
      if (!local && link.status() !== 'online') { changed.emit({ error: 'Reconnecting to the host — try again in a moment.' }); return false; }
      if (!local && !link.lastState?.you?.seatId) { changed.emit({ error: 'You are watching. Rejoin and pick a seat to make changes.' }); return false; }
      try { trackerApply(state, structuredClone(action)); }
      catch (error) { changed.emit({ error: error.message }); return false; }
      changed.emit();
      if (!local) send(action);
      return true;
    },
    undo() { return send({ type: 'undo' }); },
    onChange: changed.on,
    close: () => link.close()
  };
}
