// The live rules server: cloud/rules-server.mjs as a Supabase Edge Function ("games"), games kept in the table
// public.cc_games (row level security on, no policies: only this function, with the service key, reads or writes it).
// Bundled and deployed by cloud/deploy-games.sh.
import { rulesServer } from './rules-server.mjs';

const WORKER = 'https://commander-companion-games.ajw226.workers.dev';
const KEEP_DAYS = 120;   // like the Worker: games nobody opens for 120 days are deleted
const BASE = Deno.env.get('SUPABASE_URL') + '/rest/v1/cc_games';
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const HEADERS = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' };

async function rest(path, init = {}) {
  const res = await fetch(BASE + path, { ...init, headers: { ...HEADERS, ...(init.headers || {}) } });
  if (!res.ok && res.status !== 409) throw Object.assign(new Error(`store ${res.status}: ${(await res.text()).slice(0, 200)}`), { status: 0 });
  return res;
}

const store = {
  async get(code) {
    const rows = await (await rest(`?code=eq.${code}&select=*`)).json();
    return rows[0] || null;
  },
  async insert(row) {
    const res = await rest('', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(row) });
    if (res.status === 409) return false;
    // Now and then, clear out games nobody has opened for a long time.
    if (Math.random() < 0.05) rest(`?updated_at=lt.${new Date(Date.now() - KEEP_DAYS * 864e5).toISOString()}`, { method: 'DELETE' }).catch(() => {});
    return true;
  },
  async update(code, rev, patch) {
    const res = await rest(`?code=eq.${code}&rev=eq.${rev}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ ...patch, rev: rev + 1, updated_at: new Date().toISOString() }) });
    const rows = await res.json();
    return Array.isArray(rows) && rows.length === 1;
  }
};

// The owner's stored rulings, from the Worker (refreshed every two minutes while this copy of the function stays warm).
let rulings = null, rulingsAt = 0;
async function outcomes() {
  if (rulings && Date.now() - rulingsAt < 120000) return rulings;
  try {
    const res = await fetch(`${WORKER}/outcomes`, { signal: AbortSignal.timeout(2500) });
    if (res.ok) { rulings = (await res.json()).outcomes || {}; rulingsAt = Date.now(); }
  } catch { /* keep the last copy */ }
  return rulings || {};
}

const corrections = records => fetch(`${WORKER}/corrections`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ records }), signal: AbortSignal.timeout(2500) });

Deno.serve(rulesServer({ store, outcomes, corrections }));
