// Rule corrections → the owner's Dev report (build 47). Each game keeps a short log of what players did by hand
// (src/game/corrections.js); new entries are sent to the online-games Worker (cloud/worker.js, POST /corrections).
// Ids are per game, so a table where several devices send the same entry stores it once. Turned off in Settings with
// "Send rule corrections". Nothing is sent from test pages (localhost) to the live service.

import { onlineUrl } from './online.js';
import { loadSettings } from '../data/store.js';

const SENT_KEY = 'cc-corrections-sent';
let timer = null;

function sentIds() { try { return new Set(JSON.parse(localStorage.getItem(SENT_KEY) || '[]')); } catch { return new Set(); } }
function remember(ids) { try { localStorage.setItem(SENT_KEY, JSON.stringify([...ids].slice(-3000))); } catch { /* ignore */ } }
function testPage() { try { return /^(127\.0\.0\.1|localhost)$/.test(location.hostname) && !/[?&]online=/.test(location.search); } catch { return true; } }

/** Send this game's new corrections soon (batched; failures are retried with the next change). */
export function sendCorrections(game) {
  if (!game?.corrections?.length || loadSettings().sendCorrections === false || testPage()) return;
  clearTimeout(timer);
  timer = setTimeout(async () => {
    const sent = sentIds();
    const fresh = game.corrections.filter(r => !sent.has(r.id)).slice(0, 100);
    if (!fresh.length) return;
    try {
      const res = await fetch(`${onlineUrl()}/corrections`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ records: fresh }) });
      if (res.ok) { for (const r of fresh) sent.add(r.id); remember(sent); }
    } catch { /* offline: tried again on the next change */ }
  }, 3000);
}

async function post(path, body) {
  const res = await fetch(`${onlineUrl()}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ...data };
}
export const devReport = {
  setPin: pin => post('/devreport/pin', { pin }),
  fetch: (pin, all = false) => post('/devreport', { pin, all }),
  mark: (pin, upTo) => post('/devreport/mark', { pin, upTo })
};

/** The report as plain text, grouped so repeated corrections read as one line with a count. */
export function reportText(records, { reportedUpTo = '', total = 0, version = '' } = {}) {
  const by = kind => records.filter(r => r.kind === kind);
  const group = (rows, key) => { const m = new Map(); for (const r of rows) { const k = key(r); const g = m.get(k) || { n: 0, games: new Set(), r }; g.n++; g.games.add(String(r.id).split(':')[0]); m.set(k, g); } return [...m.values()].sort((a, b) => b.n - a.n); };
  const span = records.length ? `${records[0].at?.slice(0, 10)} to ${records[records.length - 1].at?.slice(0, 10)}` : 'nothing new';
  const manual = group(by('manual-resolution'), r => `${r.card}||${(r.steps || []).join(' > ')}`);
  const errors = group(by('engine-error'), r => `${r.card}||${r.error}`);
  const edits = group(by('edit'), r => r.step);
  const undos = by('undo'), rulings = by('ruling');
  const lines = [
    `COMMANDER COMPANION — DEV REPORT (${new Date().toISOString().slice(0, 10)}, app ${version})`,
    `Covers ${span}. ${records.length} new records (${total} stored in all; last report up to ${reportedUpTo || 'never'}).`,
    `Summary: ${by('manual-resolution').length} manual resolutions (${new Set(by('manual-resolution').map(r => r.card)).size} cards), ${by('engine-error').length} engine errors, ${by('edit').length} manual edits, ${undos.length} undos, ${rulings.length} upheld challenges.`,
    '',
    '## Manual resolutions (card | times | games | steps the players used)'
  ];
  for (const g of manual) {
    lines.push(`- ${g.r.card} | ${g.n}x | ${g.games.size} games | steps: ${(g.r.steps || []).join(' > ') || '(none recorded)'}`);
    if (g.r.unread?.length) lines.push(`    not understood: ${g.r.unread.join(' / ')}`);
    if (g.r.text) lines.push(`    text: ${String(g.r.text).replace(/\s+/g, ' ').slice(0, 400)}`);
  }
  lines.push('', '## Engine errors (card | times | error)');
  for (const g of errors) lines.push(`- ${g.r.card} | ${g.n}x | ${g.r.error}${g.r.text ? `\n    text: ${String(g.r.text).replace(/\s+/g, ' ').slice(0, 300)}` : ''}`);
  lines.push('', '## Undos and upheld challenges (the play that was taken back or corrected)');
  for (const r of [...undos, ...rulings]) lines.push(`- ${r.kind}: ${r.play || ''}`);
  lines.push('', '## Manual edits outside a resolution (most common first)');
  for (const g of edits.slice(0, 60)) lines.push(`- ${g.n}x ${g.r.step}`);
  return lines.join('\n');
}
