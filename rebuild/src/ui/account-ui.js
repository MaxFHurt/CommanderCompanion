// Account screens: the email + code form (welcome screen and Settings), the "which profile to keep" question, and the
// Account part of Settings. No profile key is ever shown here (only Settings -> Backup -> Advanced shows it).

import { html, on, $, setHtml } from './dom.js';
import { go, currentScreen } from '../app/router.js';
import { toast } from './toast.js';
import { openModal, confirmDialog } from './modal.js';
import { initProfileStore } from '../data/profile.js';
import { initDeckStore } from '../data/deck-store.js';
import { initPlaymats } from '../data/playmats.js';
import { saveProfileBackupFile } from '../data/profile-backup.js';
import { session, accountEmail, validEmail, validCode, sendCode, verifyCode, connectAccount, resolveConflict, signOut,
  needsConnect, readAuthReturn, acceptAuthReturn } from '../app/account.js';

/** Redraw the screen behind a modal when it shows profile data. */
async function redraw() {
  await Promise.allSettled([initProfileStore(), initDeckStore(), initPlaymats()]);
  const screen = currentScreen();
  if (screen === 'landing' || screen === 'profile') go(screen);
}

const summary = b => {
  const p = b?.profile || {}, decks = (b?.deckBuilder?.decks || []).filter(d => !d.example).length || (b?.decks || []).length;
  const name = p.account?.displayName ? `${p.account.displayName}: ` : '';
  return `${name}${p.games || 0} games, ${decks} decks`;
};

/** Both the device and the account have a profile: ask once which to keep. The other stays as a backup copy. */
export function chooseProfile({ local, remote }) {
  return new Promise(resolve => {
    openModal({
      title: 'Which profile to keep?', size: 'wide', dismissible: false,
      body: html`
        <p class="modal__message" data-choose-note>This device and your account have different profiles. Choose one to use everywhere. The other is kept as a backup on this device (Settings → Backup → Advanced).</p>
        <div class="option-list">
          <button type="button" class="option" data-keep="account"><span><strong>Keep the account's profile</strong><small>${summary(remote)}</small></span></button>
          <button type="button" class="option" data-keep="device"><span><strong>Keep this device's profile</strong><small>${summary(local)}</small></span></button>
        </div>
        <div class="row row--wrap"><button type="button" class="btn" data-keep-file>Save a backup file first</button><button type="button" class="btn" data-keep="later">Decide later</button></div>`,
      onMount(el, { close }) {
        on(el, 'click', '[data-keep]', (event, b) => { close(); resolve(b.dataset.keep === 'later' ? null : b.dataset.keep); });
        on(el, 'click', '[data-keep-file]', () => saveProfileBackupFile().then(name => toast(`Profile saved: ${name}`), e => { if (e?.name !== 'AbortError') toast(e.message, { bad: true }); }));
      }
    });
  });
}

const MESSAGES = {
  linked: 'Signed in. Your profile now saves to your account.',
  same: 'Signed in.',
  loaded: 'Signed in. Your account\'s profile is on this device.',
  'kept-device': 'Signed in. This device\'s profile is now your account\'s.',
  later: 'Signed in. Choose which profile to keep from Settings → Account.'
};

/** Join this device's profile with the account (after sign-in, or a choice put off earlier). */
export async function connectNow() {
  try {
    const result = await connectAccount({ choose: chooseProfile, saveFile: saveProfileBackupFile });
    toast(MESSAGES[result] || 'Signed in.', { ms: 4500 });
    if (result === 'loaded' || result === 'kept-device') await redraw();
    return result;
  } catch (error) {
    toast(error.message || 'Your profile could not be joined to the account. Try again from Settings → Account.', { bad: true, ms: 6000 });
    return 'error';
  }
}

/** Sync conflict on a signed-in device (both changed): back up this device's profile and ask. */
export async function resolveConflictNow() {
  try {
    const result = await resolveConflict({ choose: chooseProfile, saveFile: saveProfileBackupFile });
    if (result === 'loaded' || result === 'kept-device') { toast('Profile chosen. Both are kept: the other one as a backup.'); await redraw(); }
  } catch (error) { toast(error.message || 'That did not work.', { bad: true }); }
}

/**
 * Email -> code form, drawn into `area`. mode 'signup' | 'signin'. onDone(result) after the profile is joined.
 */
export function signInForm(area, { mode = 'signup', onDone, onCancel } = {}) {
  let email = '';
  const draw = markup => setHtml(area, markup);
  const err = message => { const e = $('[data-auth-error]', area); if (e) e.textContent = message; };
  const title = mode === 'signup' ? 'Sign up' : 'Sign in';
  const askEmail = () => {
    draw(html`
      <h3 class="section-title">${title}</h3>
      <p class="muted">We email you a code. No password.</p>
      <label class="field">Email<input class="input" type="email" data-auth-email autocomplete="email" placeholder="you@example.com" value="${email}"></label>
      <div class="row row--wrap"><button type="button" class="btn btn--confirm" data-auth="send">Send code</button>${onCancel ? html`<button type="button" class="btn" data-auth="cancel">Back</button>` : ''}</div>
      <p class="muted" data-auth-error></p>`);
    $('[data-auth-email]', area)?.focus();
  };
  const askCode = () => {
    draw(html`
      <h3 class="section-title">${title}</h3>
      <p class="muted" data-auth-sent>Enter the code we emailed to <b>${email}</b>. (If the email holds a link instead, tap it.)</p>
      <label class="field">Code<input class="input input--code" data-auth-code inputmode="numeric" autocomplete="one-time-code" maxlength="8" placeholder="123456"></label>
      <div class="row row--wrap"><button type="button" class="btn btn--confirm" data-auth="verify">Confirm</button><button type="button" class="btn" data-auth="resend">Send a new code</button><button type="button" class="btn" data-auth="other">Use another email</button></div>
      <p class="muted" data-auth-error></p>`);
    $('[data-auth-code]', area)?.focus();
  };
  const busy = async (button, fn) => {
    button.disabled = true;
    try { await fn(); } catch (error) { err(error.message || 'That did not work.'); } finally { if (button.isConnected) button.disabled = false; }
  };
  on(area, 'click', '[data-auth]', (event, b) => {
    const act = b.dataset.auth;
    if (act === 'cancel') return onCancel?.();
    if (act === 'other') return askEmail();
    if (act === 'send' || act === 'resend') return busy(b, async () => {
      if (act === 'send') email = ($('[data-auth-email]', area)?.value || '').trim();
      if (!validEmail(email)) return err('Enter a valid email address.');
      await sendCode(email, { create: mode === 'signup' });
      if (act === 'resend') { err(''); return toast('New code sent.'); }
      askCode();
    });
    if (act === 'verify') return busy(b, async () => {
      const code = $('[data-auth-code]', area)?.value || '';
      if (!validCode(code)) return err('Enter the code from the email (6 to 8 digits).');
      await verifyCode(email, code);
      draw(html`<p class="muted" data-auth-joining>Signed in. Setting up your profile…</p>`);
      onDone?.(await connectNow());
    });
  });
  on(area, 'keydown', 'input', (event) => {
    if (event.key !== 'Enter') return;
    $('[data-auth="send"], [data-auth="verify"]', area)?.click();
  });
  askEmail();
}

export function openSignIn(mode, onDone) {
  openModal({
    title: mode === 'signup' ? 'Sign up' : 'Sign in', size: 'wide',
    body: html`<div data-auth-area></div>`,
    actions: [{ label: 'Close', kind: 'cancel' }],
    onMount(el, { close }) {
      signInForm($('[data-auth-area]', el), { mode, onDone: result => { close(); onDone?.(result); } });
    }
  });
}

export const accountSectionHtml = () => {
  const email = accountEmail();
  return email ? html`
    <h3 class="section-title">Account</h3>
    <p class="muted">Signed in as <b data-account-email>${email}</b>. Your profile and decks save to your account by themselves.</p>
    <div class="row row--wrap">
      ${needsConnect() ? html`<button type="button" class="btn btn--confirm" data-account="connect">Choose which profile to keep</button>` : ''}
      <button type="button" class="btn" data-account="signout">Sign out</button>
    </div>` : html`
    <h3 class="section-title">Account</h3>
    <p class="muted">Sign up to keep your profile and decks safe online and use them on any device. Everything on this device stays.</p>
    <div class="row row--wrap"><button type="button" class="btn btn--confirm" data-account="signup">Sign up</button><button type="button" class="btn" data-account="signin">Sign in</button></div>`;
};

export function bindAccountSection(el, { close, reopen } = {}) {
  on(el, 'click', '[data-account]', async (event, b) => {
    const act = b.dataset.account;
    if (act === 'signup' || act === 'signin') { close?.(); return openSignIn(act); }
    if (act === 'connect') { close?.(); await connectNow(); return; }
    if (act === 'signout') {
      if (!await confirmDialog({ title: 'Sign out', message: 'Sign out on this device? Your profile stays on this device and in your account; this device stops saving online until you sign in again.', confirmLabel: 'Sign out' })) return;
      await signOut();
      close?.(); toast('Signed out.'); reopen?.();
    }
  });
}

/** App start: a sign-in link returned (email held a link instead of a code). Call readAuthReturn first thing. */
export { readAuthReturn };
export async function handleAuthReturn(ret) {
  if (!ret) {
    if (session() && needsConnect()) connectNow();   // a choice put off earlier, or a join that failed offline
    return;
  }
  if (ret.error) return toast('That link has expired or was used. Sign in again for a new code.', { bad: true, ms: 4500 });
  try { await acceptAuthReturn(ret); }
  catch (error) { return toast(error.message || 'Sign-in did not work.', { bad: true, ms: 4500 }); }
  if (currentScreen() === 'welcome') go('landing');
  await connectNow();
}
