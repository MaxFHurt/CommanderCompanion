// Device-to-device messaging for hosted games.
// "peer" uses WebRTC through PeerJS (works across phones on any network).
// "loopback" uses BroadcastChannel (tabs of one browser) — used for testing and as a fallback.

const PEER_SRC = 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js';
const PREFIX = 'commander-companion-room-';

export function preferredTransport() {
  try { return new URLSearchParams(location.search).get('net') || localStorage.getItem('cc-net') || 'peer'; } catch { return 'peer'; }
}

function loadPeerLibrary() {
  if (window.Peer) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = PEER_SRC;
    script.onload = () => (window.Peer ? resolve() : reject(new Error('PeerJS did not load')));
    script.onerror = () => reject(new Error('The connection library could not be downloaded.'));
    document.head.appendChild(script);
  });
}

function emitter() {
  const fns = new Set();
  return { on: fn => { fns.add(fn); return () => fns.delete(fn); }, emit: (...a) => { for (const fn of fns) fn(...a); } };
}

// ── loopback ────────────────────────────────────────────────────────────────────
function loopbackHost(code) {
  const channel = new BroadcastChannel(PREFIX + code);
  const message = emitter(), leave = emitter();
  channel.onmessage = e => {
    const m = e.data;
    if (m?.to !== 'host') return;
    if (m.body?.type === 'hello') return channel.postMessage({ to: m.from, from: 'host', body: { type: 'welcome' } });
    if (m.body?.type === 'bye') leave.emit(m.from); else message.emit(m.from, m.body);
  };
  return Promise.resolve({
    kind: 'loopback',
    send: (clientId, body) => channel.postMessage({ to: clientId, from: 'host', body }),
    onMessage: message.on, onLeave: leave.on,
    close: () => { channel.postMessage({ to: '*', from: 'host', body: { type: 'closed' } }); channel.close(); }
  });
}

function loopbackClient(code, clientId) {
  const channel = new BroadcastChannel(PREFIX + code);
  const message = emitter(), closed = emitter();
  return new Promise((resolve, reject) => {
    let ready = false;
    const timer = setTimeout(() => { if (!ready) { channel.close(); reject(new Error('No room with that code was found.')); } }, 2500);
    channel.onmessage = e => {
      const m = e.data;
      if (m?.from !== 'host' || (m.to !== clientId && m.to !== '*')) return;
      if (!ready && m.body?.type === 'welcome') {
        ready = true; clearTimeout(timer);
        return resolve({
          kind: 'loopback', send: body => channel.postMessage({ to: 'host', from: clientId, body }),
          onMessage: message.on, onClose: closed.on,
          close: () => { channel.postMessage({ to: 'host', from: clientId, body: { type: 'bye' } }); channel.close(); }
        });
      }
      if (m.body?.type === 'closed') closed.emit(); else message.emit(m.body);
    };
    channel.postMessage({ to: 'host', from: clientId, body: { type: 'hello' } });
  });
}

// ── PeerJS ──────────────────────────────────────────────────────────────────────
async function peerHost(code) {
  await loadPeerLibrary();
  const message = emitter(), leave = emitter();
  const conns = new Map();
  const peer = new window.Peer(PREFIX + code);
  await new Promise((resolve, reject) => {
    peer.on('open', resolve);
    peer.on('error', err => reject(new Error(err?.type === 'unavailable-id' ? 'That room code is already in use. Try again.' : 'Could not open a room. Check the internet connection.')));
  });
  peer.on('connection', conn => {
    let clientId = null;
    conn.on('data', body => {
      if (body?.type === 'hello') { clientId = body.clientId; conns.set(clientId, conn); conn.send({ type: 'welcome' }); return; }
      if (clientId) message.emit(clientId, body);
    });
    conn.on('close', () => { if (clientId && conns.get(clientId) === conn) { conns.delete(clientId); leave.emit(clientId); } });
  });
  peer.on('disconnected', () => { try { peer.reconnect(); } catch { /* retry on next event */ } });
  return {
    kind: 'peer',
    send: (clientId, body) => { const c = conns.get(clientId); if (c?.open) c.send(body); },
    onMessage: message.on, onLeave: leave.on,
    close: () => { for (const c of conns.values()) { try { c.send({ type: 'closed' }); } catch { /* closing */ } } setTimeout(() => peer.destroy(), 200); }
  };
}

async function peerClient(code, clientId) {
  await loadPeerLibrary();
  const message = emitter(), closed = emitter();
  const peer = new window.Peer();
  await new Promise((resolve, reject) => { peer.on('open', resolve); peer.on('error', () => reject(new Error('Could not connect. Check the internet connection.'))); });
  const conn = peer.connect(PREFIX + code, { reliable: true });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('No room with that code was found.')), 12000);
    peer.on('error', () => { clearTimeout(timer); reject(new Error('No room with that code was found.')); });
    conn.on('open', () => { conn.send({ type: 'hello', clientId }); });
    conn.on('data', body => {
      if (body?.type === 'welcome') { clearTimeout(timer); return resolve(); }
      if (body?.type === 'closed') closed.emit(); else message.emit(body);
    });
  });
  conn.on('close', () => closed.emit());
  return { kind: 'peer', send: body => { if (conn.open) conn.send(body); }, onMessage: message.on, onClose: closed.on, close: () => { try { conn.close(); } catch { /* closing */ } peer.destroy(); } };
}

export async function openHostTransport(code) {
  if (preferredTransport() === 'loopback') return loopbackHost(code);
  try { return await peerHost(code); } catch (error) {
    if (/already in use/.test(error.message)) throw error;
    console.warn('PeerJS unavailable, using same-browser rooms', error);
    const t = await loopbackHost(code);
    t.fallback = true;
    return t;
  }
}

export async function openClientTransport(code, clientId) {
  if (preferredTransport() === 'loopback') return loopbackClient(code, clientId);
  try { return await peerClient(code, clientId); } catch (error) {
    try { return await loopbackClient(code, clientId); } catch { throw error; }
  }
}

export function newRoomCode() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  return Array.from({ length: 4 }, () => letters[Math.floor(Math.random() * letters.length)]).join('');
}
