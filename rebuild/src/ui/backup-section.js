// Backup: Load Profile, Save Profile and Online. Shown in the Settings modal; works from any screen.

import { html, on, $, setHtml } from './dom.js';
import { go, currentScreen } from '../app/router.js';
import { toast } from './toast.js';
import { openModal, confirmDialog } from './modal.js';
import { loadProfile, initProfileStore } from '../data/profile.js';
import { initDeckStore } from '../data/deck-store.js';
import { initPlaymats } from '../data/playmats.js';
import { saveProfileBackupFile, restoreProfileBackupFile } from '../data/profile-backup.js';
import { onlineProfileLink, saveProfileOnline, loadProfileOnline, unlinkOnlineProfile, formatKey, cleanKey } from '../app/online-profile.js';
import { recoveryEmail, setRecoveryEmail, validEmail, requestLink, readLinkReturn, linkKey, unlinkKey, findKey } from '../app/profile-recovery.js';

/** Re-read the stores after the profile was replaced, and redraw the screen behind the modal if it shows profile data. */
async function reloadStores() {
  await Promise.allSettled([initProfileStore(), initDeckStore(), initPlaymats()]);
  const screen = currentScreen();
  if (screen === 'landing' || screen === 'profile') go(screen);
}

export const backupSectionHtml = () => html`
  <h3 class="section-title">Backup</h3>
  <div class="row row--wrap">
    <label class="btn">Load Profile<input id="profileFile" type="file" accept=".ccsave,application/json" hidden></label>
    <button type="button" class="btn" data-backup="save">Save Profile</button>
    <button type="button" class="btn" data-backup="online" title="Online Profile: load your profile on another device">Online</button>
  </div>`;

export function bindBackupSection(el, { close } = {}) {
  on(el, 'click', '[data-backup="save"]', async () => {
    try {
      const name = await saveProfileBackupFile();
      toast(`Profile saved: ${name}`);
    } catch (error) {
      if (error?.name !== 'AbortError') toast(error.message || 'Profile could not be saved.', { bad: true });
    }
  });
  on(el, 'click', '[data-backup="online"]', () => { close?.(); openOnlineProfile(reloadStores); });
  on(el, 'change', '#profileFile', async (event, input) => {
    const file = input.files?.[0];
    if (!file) return;
    const ok = await confirmDialog({ title: 'Load Profile', message: 'Replace the profile, saved decks and playmats on this device with the ones in this backup?', confirmLabel: 'Load Profile', danger: true });
    if (!ok) { input.value = ''; return; }
    try {
      await restoreProfileBackupFile(file);
      close?.();
      await reloadStores();
      toast('Profile loaded.');
    } catch (error) {
      toast(error.message, { bad: true });
    }
  });
}

/** Online Profile: keep this profile online under a private key and load it on another device. */
export function openOnlineProfile(onLoaded) {
  const link = onlineProfileLink();
  const when = iso => iso ? new Date(iso).toLocaleString() : '';
  openModal({
    title: 'Online Profile', size: 'wide',
    body: link ? html`
      <p class="modal__message">This profile is saved online. Its key:</p>
      <p class="lobby__code"><b class="chrome-text" data-profile-key style="font-size:3.2rem;letter-spacing:.12em;white-space:nowrap">${formatKey(link.key)}</b></p>
      <p class="muted">Keep this key private — anyone with it can load your profile. On another device: Settings → Backup → Online → enter the key. Last saved ${when(link.savedAt)}. It saves again by itself after changes, whenever you return to the start screen.</p>
      <div data-recovery></div>
      <div class="row row--wrap">
        <button type="button" class="btn btn--confirm" data-online="save">Save now</button>
        <button type="button" class="btn" data-online="load">Load the online copy</button>
        <button type="button" class="btn" data-online="copy">Copy key</button>
        <button type="button" class="btn" data-online="unlink">Stop saving online</button>
      </div>` : html`
      <p class="modal__message">Save your profile, decks, playmats and stats online, then load them on another iPad or phone.</p>
      <div class="row row--wrap"><button type="button" class="btn btn--confirm" data-online="save">Save my profile online</button></div>
      <h4 class="section-title">Already saved it on another device?</h4>
      <label class="field">Profile key<input class="input input--code" data-key maxlength="14" placeholder="ABCD-EFGH-JKLM" autocomplete="off" autocapitalize="characters"></label>
      <div class="row row--wrap"><button type="button" class="btn" data-online="load-key">Load profile</button></div>
      <div data-recovery></div>`,
    actions: [{ label: 'Close', kind: 'cancel' }],
    onMount(el, { close }) {
      recoveryArea($('[data-recovery]', el), link);
      on(el, 'click', '[data-online]', async (event, b) => {
        const act = b.dataset.online;
        try {
          if (act === 'save') {
            try { await saveProfileOnline(); }
            catch (error) {
              if (error.status !== 409) throw error;
              const ok = await confirmDialog({ title: 'Saved from another device', message: 'This profile was saved online from another device since this one last saved. Replace the online copy with this device\'s profile? (Or choose Load the online copy instead.)', confirmLabel: 'Replace online copy', danger: true });
              if (!ok) return;
              await saveProfileOnline({ force: true });
            }
            close(); toast('Profile saved online.'); return openOnlineProfile(onLoaded);
          }
          if (act === 'load' || act === 'load-key') {
            const key = act === 'load' ? link.key : cleanKey($('[data-key]', el)?.value);
            if (!/^[A-Z]{12}$/.test(key)) return toast('Enter the 12-letter profile key.');
            const ok = await confirmDialog({ title: 'Load Profile', message: 'Replace the profile, saved decks and playmats on this device with the online copy?', confirmLabel: 'Load Profile', danger: true });
            if (!ok) return;
            await loadProfileOnline(key);
            close(); await onLoaded(); return toast('Profile loaded.');
          }
          if (act === 'copy') return navigator.clipboard?.writeText(formatKey(link.key)).then(() => toast('Key copied.'), () => toast(formatKey(link.key)));
          if (act === 'unlink') {
            const ok = await confirmDialog({ title: 'Stop saving online', message: 'This device stops saving to the online copy. The online copy stays; you can load it again with the key.', confirmLabel: 'Stop' });
            if (ok) { unlinkOnlineProfile(); close(); toast('This device no longer saves online.'); }
          }
        } catch (error) {
          toast(error.message || 'That did not work.', { bad: true, ms: 4500 });
        }
      });
    }
  });
}

const SENT = 'Check your email and tap the link (it works once, for 1 hour).';

/**
 * Recovery email inside the Online Profile modal. With a key: show / add / change / remove the email.
 * Without one: "Lost your key?" email -> link by email. Tapping the link reopens the app (see handleLinkReturn).
 */
function recoveryArea(area, link) {
  if (!area) return;
  const draw = markup => setHtml(area, markup);
  const err = message => { const e = $('[data-rec-error]', area); if (e) e.textContent = message; };
  const guard = fn => async (...args) => {
    try { await fn(...args); } catch (error) { err(error.message || 'That did not work.'); }
  };
  const idle = () => {
    const email = link ? recoveryEmail() : '';
    if (link) {
      draw(email ? html`
        <h4 class="section-title">Recovery email</h4>
        <p class="muted">If you lose the key, <b data-rec-email>${email}</b> can find it again.</p>
        <div class="row row--wrap"><button type="button" class="btn" data-rec="start">Change</button><button type="button" class="btn" data-rec="remove">Remove</button></div>
        <p class="muted" data-rec-error></p>` : html`
        <h4 class="section-title">Recovery email</h4>
        <p class="muted">Optional. If you lose the key, a link sent to this email finds it again.</p>
        <div class="row row--wrap"><button type="button" class="btn" data-rec="start">Add recovery email</button></div>
        <p class="muted" data-rec-error></p>`);
    } else {
      draw(html`
        <h4 class="section-title">Lost your key?</h4>
        <div class="row row--wrap"><button type="button" class="btn" data-rec="start">Recover by email</button></div>
        <p class="muted" data-rec-error></p>`);
    }
  };
  const askEmail = () => draw(html`
    <h4 class="section-title">${link ? 'Recovery email' : 'Lost your key?'}</h4>
    <label class="field">Email<input class="input" type="email" data-rec-input autocomplete="email" placeholder="you@example.com"></label>
    <div class="row row--wrap"><button type="button" class="btn btn--confirm" data-rec="send">Send link</button><button type="button" class="btn" data-rec="cancel">Cancel</button></div>
    <p class="muted" data-rec-error></p>`);
  const sent = () => draw(html`
    <h4 class="section-title">${link ? 'Recovery email' : 'Lost your key?'}</h4>
    <p class="muted" data-rec-sent>${SENT}</p>
    <div class="row row--wrap"><button type="button" class="btn" data-rec="cancel">Done</button></div>
    <p class="muted" data-rec-error></p>`);

  on(area, 'click', '[data-rec]', guard(async (event, b) => {
    const act = b.dataset.rec;
    if (act === 'start') return askEmail();
    if (act === 'cancel') return idle();
    if (act === 'send') {
      const email = ($('[data-rec-input]', area)?.value || '').trim();
      if (!validEmail(email)) return err('Enter a valid email address.');
      b.disabled = true;
      try { await requestLink(email, link ? 'link' : 'recover'); } catch (error) { b.disabled = false; throw error; }
      return sent();
    }
    if (act === 'remove') {
      const email = recoveryEmail();
      if (!await confirmDialog({ title: 'Remove recovery email', message: `Stop using ${email} to find this key? We email a link to confirm.`, confirmLabel: 'Send link' })) return;
      await requestLink(email, 'unlink');
      return sent();
    }
  }));
  idle();
}

/** A link tapped on a device with no key lands here. */
function openLinkHere(token, email) {
  openModal({
    title: 'Online Profile', size: 'wide',
    body: html`
      <p class="modal__message" data-link-note>Email confirmed. Open this link on the device that has your profile, or enter your key here to link it.</p>
      <label class="field">Profile key<input class="input input--code" data-key maxlength="14" placeholder="ABCD-EFGH-JKLM" autocomplete="off" autocapitalize="characters"></label>
      <div class="row row--wrap"><button type="button" class="btn btn--confirm" data-link-key>Link</button></div>`,
    actions: [{ label: 'Close', kind: 'cancel' }],
    onMount(el, { close }) {
      on(el, 'click', '[data-link-key]', async () => {
        const key = cleanKey($('[data-key]', el)?.value);
        if (!/^[A-Z]{12}$/.test(key)) return toast('Enter the 12-letter profile key.');
        try {
          const linked = await linkKey(token, key) || email;
          setRecoveryEmail(linked); close();
          toast(`Recovery email linked: ${linked}`);
        } catch (error) { toast(error.message || 'That did not work.', { bad: true }); }
      });
    }
  });
}

function openRecovered(key) {
  openModal({
    title: 'Your profile key', size: 'wide',
    body: html`
      <p class="lobby__code"><b class="chrome-text" data-profile-key style="font-size:3.2rem;letter-spacing:.12em;white-space:nowrap">${formatKey(key)}</b></p>
      <p class="muted">Keep this key private. Load this profile to use it on this device.</p>
      <div class="row row--wrap"><button type="button" class="btn" data-rec-copy>Copy</button><button type="button" class="btn btn--confirm" data-rec-load>Load this profile</button></div>`,
    actions: [{ label: 'Close', kind: 'cancel' }],
    onMount(el, { close }) {
      on(el, 'click', '[data-rec-copy]', () => navigator.clipboard?.writeText(formatKey(key)).then(() => toast('Key copied.'), () => toast(formatKey(key))));
      on(el, 'click', '[data-rec-load]', async () => {
        try {
          if (!await confirmDialog({ title: 'Load Profile', message: 'Replace the profile, saved decks and playmats on this device with the online copy?', confirmLabel: 'Load Profile', danger: true })) return;
          await loadProfileOnline(key);
          close(); await reloadStores(); toast('Profile loaded.');
        } catch (error) { toast(error.message || 'That did not work.', { bad: true, ms: 4500 }); }
      });
    }
  });
}

/**
 * App start: if the address is a returning recovery link, strip it (done inside readLinkReturn) and act on it.
 * Call readLinkReturn first thing and pass the result here once the app has drawn its first screen.
 * The access token is only held in this function's variables.
 */
export async function handleLinkReturn(ret) {
  if (!ret) return;
  if (ret.error) return toast('That link has expired or was used. Send a new one.', { bad: true, ms: 4500 });
  const { intent, email } = ret;
  let token = ret.token;
  try {
    if (intent === 'link') {
      const mine = onlineProfileLink();
      if (!mine) return openLinkHere(token, email);
      const linked = await linkKey(token, mine.key) || email;
      setRecoveryEmail(linked);
      toast(`Recovery email linked: ${linked}`);
    } else if (intent === 'recover') {
      const key = await findKey(token);
      if (key) openRecovered(key); else toast('No profile is linked to this email.', { bad: true });
    } else if (intent === 'unlink') {
      await unlinkKey(token);
      setRecoveryEmail('');
      toast('Recovery email removed.');
    }
  } catch (error) {
    toast(error.message || 'That did not work.', { bad: true, ms: 4500 });
  } finally { token = null; }
}

export { readLinkReturn };
