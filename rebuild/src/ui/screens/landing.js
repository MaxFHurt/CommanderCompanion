import { html, setHtml, on } from '../dom.js';
import { go } from '../../app/router.js';
import { VERSION } from '../../version.js';
import { loadRecord } from '../../data/store.js';
import { TRACKER_SAVE_KEY } from '../../game/tracker.js';
import { GAME_SAVE_KEY } from '../../game/save-keys.js';
import { openJudge } from '../judge-modal.js';
import { openSettings } from '../settings-modal.js';
import { toast } from '../toast.js';

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
      <main class="landing">
        <div class="landing__brand"><img src="assets/img/landing/logo.png" alt="Commander Companion — Track, Play, Learn"></div>
        <div class="landing__primary">
          <button type="button" data-act="start"><img src="assets/img/landing/start.png" alt="Start Game"></button>
          <button type="button" data-act="continue" disabled><img src="assets/img/landing/continue.png" alt="Continue Game"></button>
        </div>
        <nav class="landing__tools" aria-label="Tools">
          <button type="button" data-act="profile"><img src="assets/img/landing/profile.png" alt="Profile"></button>
          <button type="button" data-act="decks"><img src="assets/img/landing/deck-builder.png" alt="Deck Builder"></button>
          <button type="button" data-act="settings"><img src="assets/img/landing/settings.png" alt="Settings"></button>
          <button type="button" data-act="help"><img src="assets/img/landing/help.png" alt="Help"></button>
        </nav>
        <div class="landing__foot">Commander Companion • ${VERSION}</div>
      </main>`);

    let resume = null;
    latestSave().then(save => {
      resume = save;
      const button = root.querySelector('[data-act="continue"]');
      if (button) button.disabled = !save;
    });

    return on(root, 'click', '[data-act]', (event, el) => {
      switch (el.dataset.act) {
        case 'start': return go('mode-select');
        case 'continue': return resume ? go(resume.screen, { resume: true }) : toast('No saved game yet.');
        case 'profile': return go('profile');
        case 'decks': return go('deck-editor');
        case 'settings': return openSettings();
        case 'help': return openJudge();
      }
    });
  }
};
