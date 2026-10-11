// Hosting and joining a Table Tracker room. The tracker has no hidden cards, so the host sends
// the whole table to every device. Joined players pick their seat and send changes back; the
// host's store applies them and keeps the judge's record.

import { openHostTransport, openClientTransport } from './transport.js';

function emitter() {
  const fns = new Set();
  return { on: fn => { fns.add(fn); return () => fns.delete(fn); }, emit: (...a) => { for (const fn of fns) fn(...a); } };
}

/** Host side. `store` is a tracker store created with a host role. */
export async function hostTrackerRoom(code, store, { known = [] } = {}) {
  const transport = await openHostTransport(code);
  const clients = new Map(); // clientId → { name, seatId, online }
  // Reopened after a restart: phones get their seats back when they reconnect.
  for (const k of known) if (k.clientId) clients.set(k.clientId, { name: k.name, seatId: k.seatId || null, online: false });
  const changed = emitter();

  const seats = () => {
    const out = {};
    if (store.seatId) out[store.seatId] = { name: 'Host', online: true, host: true };
    for (const [id, c] of clients) if (c.seatId) out[c.seatId] = { name: c.name, online: c.online, clientId: id };
    return out;
  };
  function push(clientId) {
    const c = clients.get(clientId);
    if (!c?.online) return;
    transport.send(clientId, { type: 'tracker', state: store.state(), seats: seats(), issues: store.issues(), you: { seatId: c.seatId } });
  }
  // `devices` = who is in the room changed (the host screen redraws its own table changes itself).
  const pushAll = (devices = true) => { for (const id of clients.keys()) push(id); if (devices) changed.emit(); };

  transport.onMessage((clientId, msg) => {
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'join') {
      const known = clients.get(clientId);
      if (known) known.online = true;
      else clients.set(clientId, { name: String(msg.name || 'Player').slice(0, 24), seatId: null, online: true });
      transport.send(clientId, { type: 'joined', kind: 'tracker', seated: !!clients.get(clientId).seatId });
      return pushAll();
    }
    const c = clients.get(clientId);
    if (!c) return transport.send(clientId, { type: 'refused', reason: 'Join the room first.' });
    if (!c.online) { c.online = true; pushAll(); }
    if (msg.type === 'claim') {
      const seatId = msg.seatId || null;
      const taken = seatId && Object.entries(seats()).some(([id, s]) => id === seatId && s.clientId !== clientId && (s.host || s.online));
      const exists = !seatId || store.state().players.some(p => p.id === seatId);
      const result = taken ? { ok: false, error: 'Someone else has that seat.' } : !exists ? { ok: false, error: 'That seat is no longer at the table.' } : { ok: true };
      if (result.ok) c.seatId = seatId;
      transport.send(clientId, { type: 'result', id: msg.id, result });
      return pushAll();
    }
    if (msg.type === 'intent') {
      let result = { ok: true };
      try { store.remote(msg.intent || {}, { clientId, name: c.name, seatId: c.seatId }); }
      catch (error) { result = { ok: false, error: error.message || 'That change did not work.' }; }
      transport.send(clientId, { type: 'result', id: msg.id, result });
      if (!result.ok) push(clientId);   // put the device back in step after a refused change
    }
  });
  transport.onLeave(clientId => { const c = clients.get(clientId); if (c) { c.online = false; pushAll(); } });
  const offStore = store.onChange(() => pushAll(false));

  return {
    code, kind: transport.kind, fallback: !!transport.fallback,
    seats, onChange: changed.on,
    devices: () => [...clients.entries()].map(([clientId, c]) => ({ clientId, ...c })),
    kick(clientId) { transport.send(clientId, { type: 'refused', reason: 'The host removed you from the room.' }); clients.delete(clientId); pushAll(); },
    close() { offStore(); transport.close(); }
  };
}

/** Client side. Resolves once the host has answered with the table. */
export async function joinTrackerRoom(code, { clientId, name = '' }) {
  let transport = await openClientTransport(code, clientId);
  const stateEv = emitter(), statusEv = emitter();
  const pending = new Map();
  let status = 'online', next = 1;
  const link = {
    code, clientId, lastState: null, reason: '', kind: null,
    onState: stateEv.on, onStatus: statusEv.on, status: () => status,
    call(msg) {
      if (status !== 'online') return Promise.resolve({ ok: false, error: 'Not connected to the host.' });
      const id = next++;
      return new Promise(resolve => {
        pending.set(id, resolve);
        transport.send({ ...msg, id });
        setTimeout(() => { if (pending.has(id)) { pending.delete(id); resolve({ ok: false, error: 'The host did not answer. Check the connection.' }); } }, 10000);
      });
    },
    request(intent) { return link.call({ type: 'intent', intent }); },
    claim(seatId) { return link.call({ type: 'claim', seatId }); },
    close() { if (status === 'closed') return; status = 'closed'; transport.close(); }
  };
  const wire = () => {
    transport.onMessage(msg => {
      if (msg.type === 'tracker') { link.lastState = msg; stateEv.emit(msg); }
      else if (msg.type === 'result') { pending.get(msg.id)?.(msg.result); pending.delete(msg.id); }
      else if (msg.type === 'refused') { status = 'closed'; link.reason = msg.reason; statusEv.emit(status); }
    });
    transport.onClose(async () => {
      if (status === 'closed') return;
      status = 'lost'; statusEv.emit(status);
      for (let attempt = 0; attempt < 40 && status === 'lost'; attempt++) {   // about two minutes: covers a host restart
        await new Promise(r => setTimeout(r, 3000));
        try {
          transport = await openClientTransport(code, clientId);
          wire();
          transport.send({ type: 'join', name });
          status = 'online'; statusEv.emit(status);
        } catch { /* keep trying */ }
      }
    });
  };
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('The host did not answer.')), 10000);
    let joined = false;
    const off = transport.onMessage(msg => {
      if (msg.type === 'joined') {
        joined = true; link.kind = msg.kind || 'game';
        if (link.kind !== 'tracker') { clearTimeout(timer); off(); resolve(); }
      }
      if (joined && msg.type === 'tracker') { clearTimeout(timer); off(); resolve(); }
    });
  });
  wire();
  transport.send({ type: 'join', name });
  await ready;
  return link;
}
