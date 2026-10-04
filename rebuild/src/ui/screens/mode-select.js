import { html, setHtml, on } from '../dom.js';
import { go } from '../../app/router.js';
import { openModal } from '../modal.js';

function pickRemoteCount(onPick) {
  openModal({
    title: 'How many players?', size: 'small',
    body: html`<div class="grid-3">${[2, 3, 4, 5, 6].map(n => html`<button type="button" class="option" data-n="${n}"><span><strong>${n} players</strong></span></button>`)}</div>`,
    onMount(el, { close }) { on(el, 'click', '[data-n]', (e, b) => { close(); onPick(Number(b.dataset.n)); }); }
  });
}

// The background art carries the "Choose Game Mode" title; the three buttons are the approved assets.
export const modeSelectScreen = {
  mount(root) {
    setHtml(root, html`
      <main class="mode-select" aria-label="Choose game mode">
        <button class="btn-back" type="button" data-act="back" aria-label="Back"><img src="assets/img/ui/back.png" alt="Back"></button>
        <div class="mode-select__choices">
          <button type="button" data-mode="fully-tracked"><img src="assets/img/mode/guided.png" alt="Fully Guided — Rulebook enforced guided games."></button>
          <button type="button" data-mode="freeplay"><img src="assets/img/mode/freeplay.png" alt="Free Play — Create, Test, and Play."></button>
          <button type="button" data-mode="table-tracker"><img src="assets/img/mode/tracker.png" alt="Table Tracker — Shared table tracking."></button>
        </div>
      </main>`);
    const offBack = on(root, 'click', '[data-act="back"]', () => go('landing'));
    const offMode = on(root, 'click', '[data-mode]', (event, el) => {
      const mode = el.dataset.mode;
      if (mode === 'table-tracker') return go('tracker-setup');
      openModal({
        title: mode === 'freeplay' ? 'Free Play' : 'Guided Play',
        body: html`<div class="option-list">
          <button type="button" class="option" data-play="local"><span><strong>One device</strong><small>Everyone shares this device and passes it around</small></span></button>
          <button type="button" class="option" data-play="host-player"><span><strong>Host a room — I am playing too</strong><small>Other players join from their own devices; you get the host tools</small></span></button>
          <button type="button" class="option" data-play="host-device"><span><strong>Host device — table view</strong><small>This device shows the battlefield for everyone and acts as judge. It never shows hands</small></span></button>
          <button type="button" class="option" data-play="join"><span><strong>Join a room</strong><small>Enter the code shown on the host device</small></span></button>
        </div>`,
        onMount(el, { close }) {
          on(el, 'click', '[data-play]', (e, b) => {
            close();
            const play = b.dataset.play;
            if (play === 'join') return go('join');
            if (play === 'host-device') return pickRemoteCount(count => go('lobby', { mode, hostDevice: true, localSeats: [], remoteSeats: count }));
            go('player-setup', { mode, play });
          });
        }
      });
    });
    return () => { offBack(); offMode(); };
  }
};
