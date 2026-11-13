// Recovery email: a lost profile key is found again with a one-time code sent to an email (Supabase Auth, no SDK).
// The key keeps working exactly as before; the email only finds it. The access token lives only inside one flow.
// Only the linked email (for display) is kept on this device, next to the online profile link.

export const SUPABASE_URL = 'https://wdngytwilqxcdoqtefgg.supabase.co';
// The project's public (anon) key: safe to ship, access is limited by the row rules in cloud/supabase-recovery.sql.
// OWNER: paste it here at release (Supabase dashboard -> Project Settings -> API).
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indkbmd5dHdpbHF4Y2RvcXRlZmdnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQwNzI4ODIsImV4cCI6MjEwOTY0ODg4Mn0.ilEw4jDoDMwedxdjtYlDVEgKAfGGg5EqIwYPnk9aa6g';

const EMAIL_KEY = 'cc-recovery-email';
const TABLE = '/rest/v1/profile_recovery';

export class RecoveryError extends Error {
  constructor(message, status = 0) { super(message); this.status = status; }
}

export function recoveryEmail() { try { return localStorage.getItem(EMAIL_KEY) || ''; } catch { return ''; } }
export function setRecoveryEmail(email) {
  try { email ? localStorage.setItem(EMAIL_KEY, email) : localStorage.removeItem(EMAIL_KEY); } catch { /* optional */ }
}
export const validEmail = text => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(text || '').trim());

async function call(path, { method = 'POST', body, token, headers = {} } = {}) {
  let res;
  try {
    res = await fetch(SUPABASE_URL + path, {
      method, cache: 'no-store',
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token || SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json', ...headers },
      body: body ? JSON.stringify(body) : undefined
    });
  } catch { throw new RecoveryError('No internet connection.'); }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 429) throw new RecoveryError('Too many tries. Try again in a few minutes.', 429);
    throw new RecoveryError(data?.msg || data?.error_description || data?.message || `The email service answered ${res.status}.`, res.status);
  }
  return data;
}

/** Send a one-time code (6 to 8 digits, set by the project) to the email. Creates the (hidden) account the first time. */
export async function requestCode(email) {
  await call('/auth/v1/otp', { body: { email: email.trim(), create_user: true } });
}

/** Check the code. Returns the access token, to use for this flow only. */
export async function verifyCode(email, code) {
  try {
    const data = await call('/auth/v1/verify', { body: { type: 'email', email: email.trim(), token: String(code).replace(/\D/g, '') } });
    if (!data?.access_token) throw new RecoveryError('That code did not work.');
    return data.access_token;
  } catch (error) {
    if (error.status === 400 || error.status === 401 || error.status === 403 || error.status === 422) throw new RecoveryError('Wrong or expired code.', error.status);
    throw error;
  }
}

/** Save the profile key under the verified email (replaces an earlier one). */
export async function linkKey(token, key) {
  const user = await call('/auth/v1/user', { method: 'GET', token });
  await call(`${TABLE}?on_conflict=user_id`, { token, headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: { user_id: user.id, profile_key: key, updated_at: new Date().toISOString() } });
}

/** Remove the link (the verified email's row). */
export async function unlinkKey(token) {
  const user = await call('/auth/v1/user', { method: 'GET', token });
  await call(`${TABLE}?user_id=eq.${encodeURIComponent(user.id)}`, { method: 'DELETE', token, headers: { Prefer: 'return=minimal' } });
}

/** The key linked to the verified email, or null. */
export async function findKey(token) {
  const rows = await call(`${TABLE}?select=profile_key`, { method: 'GET', token });
  return rows?.[0]?.profile_key || null;
}
