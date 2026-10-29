// Giving a code to other players: the code itself, Copy (to paste into a text), Text invite (the
// phone's share sheet, with a link that opens the app on the join screen), and a QR code that
// people in the same room scan to join. Scan reads such a QR code with the camera.
//
// Join links: ?join=ABCDEF (online game), ?room=ABCD (hosted game) and ?table=ABCD (Table Tracker room).

import { html, raw, on, $ } from './dom.js';
import { openModal } from './modal.js';
import { toast } from './toast.js';
import qrcode from '../vendor/qrcode.js';

/** Link that opens the app straight on the join screen. Keeps test settings (?net, ?online) if any. */
export function joinLink(kind, code) {
  const url = new URL(location.href);
  url.hash = '';
  for (const k of ['join', 'room', 'table']) url.searchParams.delete(k);
  url.searchParams.set(kind === 'online' ? 'join' : kind === 'table' ? 'table' : 'room', code);
  return url.toString();
}

/** The code a scanned QR (or a typed link) points to: { kind: 'online' | 'room' | 'table', code } or null. */
export function codeFromText(text) {
  const s = String(text || '').trim();
  try {
    const url = new URL(s);
    const join = url.searchParams.get('join'), room = url.searchParams.get('room'), table = url.searchParams.get('table');
    if (join && /^[A-Za-z]{6}$/.test(join)) return { kind: 'online', code: join.toUpperCase() };
    if (room && /^[A-Za-z]{4}$/.test(room)) return { kind: 'room', code: room.toUpperCase() };
    if (table && /^[A-Za-z]{4}$/.test(table)) return { kind: 'table', code: table.toUpperCase() };
  } catch { /* not a link */ }
  if (/^[A-Za-z]{6}$/.test(s)) return { kind: 'online', code: s.toUpperCase() };
  if (/^[A-Za-z]{4}$/.test(s)) return { kind: 'room', code: s.toUpperCase() };
  return null;
}

function qrSvg(text) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  return qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
}

/**
 * Copy, Text invite and the QR code for a code. `what` names it in the invite ("game", "table").
 * `inlineQr` shows the QR code here (waiting screens); otherwise a button opens it.
 */
export function shareCodeHtml({ code, kind, what = 'game', inlineQr = false }) {
  const link = joinLink(kind, code);
  // The QR code sits beside the buttons, so the block stays short on a phone held sideways.
  return html`<div class="share-code" data-share-code="${code}" data-share-link="${link}" data-share-what="${what}" style="display:flex;align-items:center;justify-content:center;gap:1.2rem;margin-top:0.6rem">
    ${inlineQr ? html`<button type="button" class="share-code__qr" data-share-act="qr" aria-label="Show the QR code larger" style="flex:none;background:#fff;padding:5px;border:0;border-radius:10px;width:min(12rem,24vh)">${raw(qrSvg(link))}</button>` : ''}
    <div class="share-code__buttons" style="display:flex;flex-direction:${inlineQr ? 'column' : 'row'};flex-wrap:wrap;gap:0.6rem;justify-content:center">
      <button type="button" class="btn btn--small" data-share-act="copy">Copy code</button>
      <button type="button" class="btn btn--small" data-share-act="text">Text invite</button>
      ${inlineQr ? '' : html`<button type="button" class="btn btn--small" data-share-act="qr">QR code</button>`}
    </div>
  </div>`;
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* fall back below */ }
  const area = document.createElement('textarea');
  area.value = text; area.setAttribute('readonly', ''); area.style.position = 'fixed'; area.style.opacity = '0';
  document.body.appendChild(area); area.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { ok = false; }
  area.remove();
  return ok;
}

export function openQr({ code, link, what = 'game' }) {
  openModal({
    title: `Scan to join — ${code}`, size: 'small',
    body: html`<div class="share-code__qr" data-qr style="background:#fff;padding:12px;border-radius:12px;width:min(28rem,60vh);margin:0 auto">${raw(qrSvg(link))}</div>
      <p class="muted" style="text-align:center">Scan with the phone camera, or in the app: Join → Scan QR. Same ${what}, same code: <b>${code}</b></p>`,
    actions: [{ label: 'Close', kind: 'cancel' }]
  });
}

/** Wire the buttons of every share-code block inside `root`. Returns the cleanup. */
export function bindShareCode(root) {
  return on(root, 'click', '[data-share-act]', async (event, b) => {
    const box = b.closest('[data-share-code]');
    const code = box.dataset.shareCode, link = box.dataset.shareLink, what = box.dataset.shareWhat;
    const act = b.dataset.shareAct;
    if (act === 'copy') return toast((await copyText(code)) ? `Copied ${code} — paste it into a text.` : `The code is ${code}.`);
    if (act === 'qr') return openQr({ code, link, what });
    const text = `Join my Commander Companion ${what}: ${link} (code ${code})`;
    if (navigator.share) return navigator.share({ text }).catch(() => {});
    toast((await copyText(text)) ? 'Invite copied — paste it into a text.' : text, { ms: 5000 });
  });
}

/** Scan a join QR code with the camera. Resolves { kind, code } or null if cancelled. */
export function scanJoinCode() {
  return new Promise(resolve => {
    let stream = null, done = false, timer = null, decode = null;
    const finish = (value, close) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      stream?.getTracks().forEach(t => t.stop());
      close?.();
      resolve(value);
    };
    openModal({
      title: 'Scan QR code', size: 'small',
      body: html`<div class="share-code__scan"><video data-video playsinline muted style="width:100%;border-radius:12px;background:#000"></video></div>
        <p class="muted" data-scan-status>Point the camera at the QR code on the other device.</p>`,
      actions: [{ label: 'Cancel', kind: 'cancel' }],
      onClose: () => finish(null),
      async onMount(el, { close }) {
        const video = $('[data-video]', el), status = $('[data-scan-status]', el);
        try {
          [{ default: decode }, stream] = await Promise.all([import('../vendor/jsqr.js'), navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })]);
        } catch {
          status.textContent = 'The camera is not available. Type the code instead.';
          return;
        }
        if (done) { stream.getTracks().forEach(t => t.stop()); return; }
        video.srcObject = stream;
        await video.play().catch(() => {});
        const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d', { willReadFrequently: true });
        const tick = () => {
          if (done) return;
          if (video.videoWidth) {
            const scale = Math.min(1, 640 / video.videoWidth);
            canvas.width = Math.round(video.videoWidth * scale); canvas.height = Math.round(video.videoHeight * scale);
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const hit = decode(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
            const found = hit && codeFromText(hit.data);
            if (found) return finish(found, close);
            if (hit) status.textContent = 'That QR code is not a Commander Companion invite.';
          }
          timer = setTimeout(tick, 200);
        };
        tick();
      }
    });
  });
}

/** Open the screen a join code belongs to (after a scan, or a link that opened the app). */
export function goToJoin(found, go) {
  if (!found) return false;
  if (found.kind === 'online') return go('online', { code: found.code });
  if (found.kind === 'table') return go('tracker-join', { code: found.code });
  return go('join', { code: found.code });
}
