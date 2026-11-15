import { html, setHtml, on } from '../dom.js';
import { go } from '../../app/router.js';
import { openDeckBuilder } from '../../data/deck-builder.js';
import { VERSION } from '../../version.js';
import { loadRecord } from '../../data/store.js';
import { TRACKER_SAVE_KEY } from '../../game/tracker.js';
import { GAME_SAVE_KEY } from '../../game/save-keys.js';
import { openJudge } from '../judge-modal.js';
import { openSettings } from '../settings-modal.js';
import { toast } from '../toast.js';
import { syncProfileOnOpen } from '../../app/online-profile.js';
import { session } from '../../app/account.js';
import { resolveConflictNow } from '../account-ui.js';
import { showNewRewards } from '../reward-popup.js';

/** Most recent saved session of either kind, or null. */
async function latestSave() {
  const [tracker, game] = await Promise.all([loadRecord(TRACKER_SAVE_KEY), loadRecord(GAME_SAVE_KEY)]);
  const rows = [];
  if (tracker && !tracker.result) rows.push({ screen: 'tracker', at: Date.parse(tracker.savedAt || tracker.startedAt || 0) || 0 });
  if (game && game.status !== 'complete') rows.push({ screen: 'game', at: Date.parse(game.savedAt || 0) || 0 });
  rows.sort((a, b) => b.at - a.at);
  return rows[0] || null;
}

export const landingScreen = {
  mount(root) {
    setHtml(root, html`
      <main class="landing menu" aria-label="Commander Companion">
        <div class="menu__stack landing__stack">
          <header class="plate plate--landing"><h1 class="plate__title">Commander Companion</h1></header>
          <img class="landing__crest" src="assets/skin/shared/crest.webp" alt="">
          <div class="landing__primary">
            <button type="button" class="jewel-key jewel-key--start" data-act="start"><span>Start Game</span></button>
            <button type="button" class="jewel-key jewel-key--continue" data-act="continue" disabled><span>Continue Game</span></button>
          </div>
          <nav class="landing__tools" aria-label="Tools">
            <button type="button" class="btn" data-act="profile">Profile</button>
            <button type="button" class="btn" data-act="decks">Deck Builder</button>
            <button type="button" class="btn" data-act="settings">Settings</button>
            <button type="button" class="btn" data-act="help">Help</button>
          </nav>
          <div class="skin-sep" aria-hidden="true"></div>
        </div>
        <div class="landing__foot">Commander Companion • ${VERSION}</div>
      </main>`);

    showNewRewards().catch(() => {});
    let resume = null;
    const findResume = () => latestSave().then(save => {
      resume = save;
      const button = root.querySelector('[data-act="continue"]');
      if (button) button.disabled = !save;
    });
    findResume();

    // Linked to an online profile: take the newer copy from another device, or save this one's changes.
    syncProfileOnOpen().then(state => {
      if (state === 'conflict') {
        if (session()) return resolveConflictNow();   // signed in: back up this device's profile and ask which to keep
        toast('Your online profile was saved from another device. Open Settings → Backup → Advanced to choose which to keep.', { ms: 6000 });
      }
      if (state === 'loaded') toast('Profile and decks updated from your other device.');
      if (state === 'loaded-game') { toast('Game carried over: tap Continue.'); findResume(); }
    });

    return on(root, 'click', '[data-act]', (event, el) => {
      switch (el.dataset.act) {
        case 'start': return go('mode-select');
        case 'continue': return resume ? go(resume.screen, { resume: true }) : toast('No saved game yet.');
        case 'profile': return go('profile');
        case 'decks': return openDeckBuilder({ screen: 'landing' });
        case 'settings': return openSettings();
        case 'help': return openJudge();
      }
    });
  }
};
