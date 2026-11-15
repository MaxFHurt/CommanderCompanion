// First launch (owner, 13 Nov): sign up, sign in, or keep the profile on this device only. Shown once, before the
// start screen; players who already have a profile on this device see it once too and keep everything they choose.

import { html, setHtml, on, $ } from '../dom.js';
import { go } from '../../app/router.js';
import { setWelcomeDone } from '../../app/account.js';
import { signInForm } from '../account-ui.js';

export const welcomeScreen = {
  mount(root) {
    const choices = () => html`
      <p class="muted welcome__intro">Sign up to keep your profile, decks and stats safe online and use them on any device. Anything already on this device is kept.</p>
      <div class="welcome__actions">
        <button type="button" class="btn btn--confirm" data-welcome="signup">Sign up</button>
        <button type="button" class="btn" data-welcome="signin">Sign in</button>
        <button type="button" class="btn" data-welcome="skip">Skip — save on this device only</button>
      </div>`;
    setHtml(root, html`
      <main class="welcome menu">
        <div class="menu__stack welcome__stack">
          <header class="plate"><h1 class="plate__title">Welcome</h1></header>
          <section class="welcome__panel skin-dialog" data-welcome-panel aria-label="Welcome">${choices()}</section>
          <div class="skin-sep" aria-hidden="true"></div>
        </div>
      </main>`);
    const panel = $('[data-welcome-panel]', root);
    const done = () => { setWelcomeDone(); go('landing'); };
    return on(root, 'click', '[data-welcome]', (event, b) => {
      const act = b.dataset.welcome;
      if (act === 'skip') return done();
      // A fresh area each time, so the form's listeners do not pile up.
      const area = document.createElement('div');
      panel.replaceChildren(area);
      signInForm(area, { mode: act, onDone: done, onCancel: () => setHtml(panel, choices()) });
    });
  }
};
