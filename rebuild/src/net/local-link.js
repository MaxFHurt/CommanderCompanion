// Local pairing by QR code (no internet, no signaling server): the host shows a QR code with its WebRTC offer, the
// other device scans it and shows a QR code with its answer, the host scans that, and the two talk directly over the
// local Wi-Fi (a phone or iPad hotspot works). Only host ("local") ICE candidates are used, so no STUN/TURN server.
//
// The QR text is a compact form of the session description: "CCL1|<o or a>|<room code>|<ice-ufrag>|<ice-pwd>|
// <fingerprint hex>|<setup>|<candidate>;<candidate>…". The full SDP is rebuilt on the other side.

const PREFIX = 'CCL1';
const CHUNK = 12000;   // data channel messages are split (Safari limits them to 64 KB)

export function isLocalPairText(text) { return String(text || '').startsWith(`${PREFIX}|`); }

function compact(desc, kind, code) {
  const sdp = String(desc.sdp || '');
  const get = re => (sdp.match(re) || [])[1] || '';
  const cands = [...sdp.matchAll(/^a=candidate:(.+)$/gm)].map(m => m[1].trim()).filter(c => / typ host\b/.test(c) && / udp /i.test(c));
  return [PREFIX, kind, code, get(/^a=ice-ufrag:(.+)$/m).trim(), get(/^a=ice-pwd:(.+)$/m).trim(), get(/^a=fingerprint:sha-256 (.+)$/m).replace(/:/g, '').trim(), get(/^a=setup:(.+)$/m).trim(), cands.join(';')].join('|');
}

function expand(text) {
  const [prefix, kind, code, ufrag, pwd, fp, setup, cands] = String(text || '').split('|');
  if (prefix !== PREFIX || !ufrag || !pwd || !fp) throw new Error('That QR code is not a Commander Companion pairing code.');
  const fingerprint = fp.match(/.{2}/g).join(':').toUpperCase();
  const lines = [
    'v=0', `o=- ${Date.now()} 2 IN IP4 127.0.0.1`, 's=-', 't=0 0', 'a=group:BUNDLE 0', 'a=msid-semantic: WMS',
    'm=application 9 UDP/DTLS/SCTP webrtc-datachannel', 'c=IN IP4 0.0.0.0',
    `a=ice-ufrag:${ufrag}`, `a=ice-pwd:${pwd}`, 'a=ice-options:trickle', `a=fingerprint:sha-256 ${fingerprint}`, `a=setup:${setup || (kind === 'o' ? 'actpass' : 'active')}`,
    'a=mid:0', 'a=sctp-port:5000', 'a=max-message-size:262144',
    ...String(cands || '').split(';').filter(Boolean).map(c => `a=candidate:${c}`), 'a=end-of-candidates'
  ];
  return { kind, code, desc: { type: kind === 'o' ? 'offer' : 'answer', sdp: `${lines.join('\r\n')}\r\n` } };
}

/** Wait until every local candidate is in the description (or a few seconds pass). */
function gathered(pc) {
  return new Promise(resolve => {
    if (pc.iceGatheringState === 'complete') return resolve();
    const done = () => { if (pc.iceGatheringState === 'complete') { pc.removeEventListener('icegatheringstatechange', done); resolve(); } };
    pc.addEventListener('icegatheringstatechange', done);
    setTimeout(resolve, 4000);
  });
}

/** A data channel that sends JSON in chunks and gives back whole messages. */
function framed(channel, onMessage) {
  const parts = new Map();
  channel.onmessage = e => {
    let m;
    try { m = JSON.parse(e.data); } catch { return; }
    if (m.c === undefined) return onMessage(m.b);
    const list = parts.get(m.i) || [];
    list[m.c] = m.d;
    parts.set(m.i, list);
    if (list.filter(x => x !== undefined).length === m.n) { parts.delete(m.i); try { onMessage(JSON.parse(list.join(''))); } catch { /* broken message */ } }
  };
  let next = 1;
  return body => {
    if (channel.readyState !== 'open') return;
    const s = JSON.stringify(body);
    if (s.length <= CHUNK) return channel.send(JSON.stringify({ b: body }));
    const id = next++, n = Math.ceil(s.length / CHUNK);
    for (let k = 0; k < n; k++) channel.send(JSON.stringify({ i: id, c: k, n, d: s.slice(k * CHUNK, (k + 1) * CHUNK) }));
  };
}

const RTC = { iceServers: [] };   // local network only

/**
 * Host side: adds local peers to a host transport ({ send, onMessage, onLeave, close } as in transport.js).
 * `local.offer()` gives the QR text for one more device; `local.accept(answerText)` finishes pairing it.
 */
export function withLocalPeers(base, code) {
  const fns = { message: new Set(), leave: new Set() };
  const conns = new Map();   // clientId → send
  let pending = null;
  const local = {
    async offer() {
      const pc = new RTCPeerConnection(RTC);
      const channel = pc.createDataChannel('cc', { ordered: true });
      let clientId = null;
      const send = framed(channel, body => {
        if (body?.type === 'hello') { clientId = body.clientId; conns.set(clientId, send); send({ type: 'welcome' }); return; }
        if (clientId) for (const fn of fns.message) fn(clientId, body);
      });
      channel.onclose = () => { if (clientId && conns.get(clientId) === send) { conns.delete(clientId); for (const fn of fns.leave) fn(clientId); } };
      await pc.setLocalDescription(await pc.createOffer());
      await gathered(pc);
      pending = { pc, channel };
      return compact(pc.localDescription, 'o', code);
    },
    async accept(text) {
      const { kind, desc } = expand(text);
      if (kind !== 'a') throw new Error('Scan the answer QR code shown on the other device.');
      if (!pending) throw new Error('Show a pairing QR code first.');
      const { pc, channel } = pending;
      pending = null;
      await pc.setRemoteDescription(desc);
      await new Promise((resolve, reject) => {
        if (channel.readyState === 'open') return resolve();
        const t = setTimeout(() => reject(new Error('The devices could not connect. Are they on the same Wi-Fi or hotspot?')), 15000);
        channel.addEventListener('open', () => { clearTimeout(t); resolve(); }, { once: true });
      });
    }
  };
  return {
    ...base,
    kind: base.kind,
    local,
    send: (clientId, body) => { const s = conns.get(clientId); if (s) s(body); else base.send(clientId, body); },
    onMessage: fn => { fns.message.add(fn); const off = base.onMessage(fn); return () => { fns.message.delete(fn); off?.(); }; },
    onLeave: fn => { fns.leave.add(fn); const off = base.onLeave(fn); return () => { fns.leave.delete(fn); off?.(); }; },
    close: () => { for (const s of conns.values()) { try { s({ type: 'closed' }); } catch { /* closing */ } } base.close(); }
  };
}

/**
 * Joining device: from the host's QR text, make the answer (shown to the host as a QR code by `onAnswer`) and resolve
 * the client transport ({ send, onMessage, onClose, close }) once the host scanned it.
 */
export async function localClient(offerText, clientId, onAnswer) {
  const { kind, desc } = expand(offerText);
  if (kind !== 'o') throw new Error('Scan the pairing QR code shown on the host.');
  const pc = new RTCPeerConnection(RTC);
  const message = new Set(), closed = new Set();
  const channelReady = new Promise(resolve => { pc.ondatachannel = e => resolve(e.channel); });
  await pc.setRemoteDescription(desc);
  await pc.setLocalDescription(await pc.createAnswer());
  await gathered(pc);
  onAnswer(compact(pc.localDescription, 'a', ''));
  const channel = await Promise.race([channelReady, new Promise((_, reject) => setTimeout(() => reject(new Error('The host did not scan the answer in time.')), 120000))]);
  let welcomed;
  const welcome = new Promise(r => { welcomed = r; });
  const send = framed(channel, body => {
    if (body?.type === 'welcome') return welcomed();
    if (body?.type === 'closed') { for (const fn of closed) fn(); return; }
    for (const fn of message) fn(body);
  });
  if (channel.readyState !== 'open') await new Promise(r => channel.addEventListener('open', r, { once: true }));
  channel.onclose = () => { for (const fn of closed) fn(); };
  send({ type: 'hello', clientId });
  await welcome;
  return {
    kind: 'local', send, onMessage: fn => { message.add(fn); return () => message.delete(fn); }, onClose: fn => { closed.add(fn); return () => closed.delete(fn); },
    close: () => { try { channel.close(); pc.close(); } catch { /* closing */ } }
  };
}

export const __test = { compact, expand };
