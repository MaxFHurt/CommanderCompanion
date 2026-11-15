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

// Visual handoff screens/mode-select: title plate, three panels (title, mode button, what it is), Back.
const MODES = [
  ['fully-tracked', 'Guided Play', 'Fully Guided', 'Rulebook enforced guided games.'],
  ['freeplay', 'Free Play', 'Free Play', 'Create, test, and play.'],
  ['table-tracker', 'Table Tracker', 'Table Tracker', 'Shared table tracking.']
];

export const modeSelectScreen = {
  mount(root) {
    setHtml(root, html`
      <main class="mode-select menu" aria-label="Choose game mode">
        <div class="menu__stack mode-select__stack">
          <header class="plate"><h1 class="plate__title">Choose Game Mode</h1></header>
          <div class="mode-select__choices">
            ${MODES.map(([mode, panel, label, text]) => html`
              <section class="mode-card skin-dialog" aria-labelledby="mode-${mode}-title">
                <h2 class="readout mode-card__title" id="mode-${mode}-title">${panel}</h2>
                <button type="button" class="btn" id="mode-${mode}" data-mode="${mode}" aria-describedby="mode-${mode}-text">${label}</button>
                <p class="readout mode-card__text" id="mode-${mode}-text">${text}</p>
              </section>`)}
          </div>
          <button class="btn mode-select__back" type="button" data-act="back">Back</button>
          <div class="skin-sep" aria-hidden="true"></div>
        </div>
      </main>`);
    const offBack = on(root, 'click', '[data-act="back"]', () => go('landing'));
    const offMode = on(root, 'click', '[data-mode]', (event, el) => {
      const mode = el.dataset.mode;
      if (mode === 'table-tracker') {
        return openModal({
          title: 'Table Tracker',
          body: html`<div class="option-list">
            <button type="button" class="option" data-track="local"><span><strong>One device</strong><small>Track the whole table on this device</small></span></button>
            <button type="button" class="option" data-track="host-player"><span><strong>Host a table — I am playing too</strong><small>Players track their own seat on their phones; you get the host tools and Judge mode</small></span></button>
            <button type="button" class="option" data-track="host-device"><span><strong>Host device — table view</strong><small>This device shows the whole table and acts as judge</small></span></button>
            <button type="button" class="option" data-track="join"><span><strong>Join a table</strong><small>Enter the code shown on the host device</small></span></button>
          </div>`,
          onMount(box, { close }) {
            on(box, 'click', '[data-track]', (e, b) => { close(); b.dataset.track === 'join' ? go('tracker-join') : go('tracker-setup', { play: b.dataset.track }); });
          }
        });
      }
      openModal({
        title: mode === 'freeplay' ? 'Free Play' : 'Guided Play',
        body: html`<div class="option-list">
          <button type="button" class="option" data-play="local"><span><strong>One device</strong><small>Everyone shares this device and passes it around</small></span></button>
          <button type="button" class="option" data-play="host-player"><span><strong>Host a room — I am playing too</strong><small>Other players join from their own devices; you get the host tools</small></span></button>
          <button type="button" class="option" data-play="host-device"><span><strong>Host device — table view</strong><small>This device shows the battlefield for everyone and acts as judge. It never shows hands</small></span></button>
          <button type="button" class="option" data-play="join"><span><strong>Join a room</strong><small>Enter the code shown on the host device</small></span></button>
          <button type="button" class="option" data-play="online"><span><strong>Online games — play over time</strong><small>Each player on their own device, whenever they have time. Saved online after every move</small></span></button>
        </div>`,
        onMount(el, { close }) {
          on(el, 'click', '[data-play]', (e, b) => {
            close();
            const play = b.dataset.play;
            if (play === 'join') return go('join');
            if (play === 'online') return go('online', { mode });
            if (play === 'host-device') return pickRemoteCount(count => go('lobby', { mode, hostDevice: true, localSeats: [], remoteSeats: count }));
            go('player-setup', { mode, play });
          });
        }
      });
    });
    return () => { offBack(); offMode(); };
  }
};
