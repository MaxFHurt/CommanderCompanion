// Table Tracker setup: names, optional commander, and a playmat for each player.

import { html, setHtml, on, $, $$ } from '../dom.js';
import { go } from '../../app/router.js';
import { toast } from '../toast.js';
import { createTracker, PLAYER_COLORS, TRACKER_SAVE_KEY } from '../../game/tracker.js';
import { saveRecord } from '../../data/store.js';
import { accountSetupDefaults, loadProfile } from '../../data/profile.js';
import { listPlaymats, DEFAULT_MAT } from '../../data/playmats.js';
import { unlockedMatSlots } from '../../data/achievements.js';

export const trackerSetupScreen = {
  mount(root) {
    const defaults = accountSetupDefaults();
    const profile = loadProfile();
    const startingLife = Number(defaults.tableRuleDefaults?.startingLife || 40);
    const mats = [DEFAULT_MAT, ...listPlaymats().filter(m => m.slot < unlockedMatSlots(profile))];
    // The profile owner is always Player 1; other saved names fill the next seats.
    const players = [0, 1].map(i => ({ name: defaults.playerNames?.[i] || '', commander: '', matId: DEFAULT_MAT.id }));

    function draw() {
      setHtml(root, html`
        <main class="page">
          <header class="page__head">
            <button class="btn-back" type="button" data-act="back" aria-label="Back"><img src="assets/img/ui/back.png" alt="Back"></button>
            <h1 class="chrome-text">Table Tracker</h1>
          </header>
          <div class="page__body">
            <div class="setup-players">
              ${players.map((p, i) => html`
                <section class="setup-player" style="--player:${PLAYER_COLORS[i]}" data-seat="${i}">
                  <div class="setup-player__head">
                    <span>Player ${i + 1}</span>
                    ${players.length > 2 ? html`<button type="button" class="chip chip--bad" data-act="remove" data-seat="${i}">Remove</button>` : ''}
                  </div>
                  <input class="input" data-field="name" maxlength="24" placeholder="Player name" value="${p.name}" autocomplete="off">
                  <input class="input" data-field="commander" maxlength="60" placeholder="Commander (optional)" value="${p.commander}" autocomplete="off">
                  <div class="mat-pick" aria-label="Playmat">
                    ${mats.map(m => html`<button type="button" class="mat-thumb ${p.matId === m.id ? 'is-on' : ''}" data-act="mat" data-seat="${i}" data-mat="${m.id}" style="background-image:url('${m.image}')" aria-label="${m.name}"></button>`)}
                  </div>
                </section>`)}
              ${players.length < 6 ? html`<button type="button" class="setup-player setup-player--add" data-act="add">+ Add player</button>` : ''}
            </div>
          </div>
          <footer class="page__foot">
            <label class="row"><span class="muted">Starting life</span>
              <input class="input" id="startingLife" type="number" inputmode="numeric" min="1" max="999" value="${startingLife}" style="width:8rem">
            </label>
            <button type="button" class="btn btn--confirm" data-act="start">Start Tracking</button>
          </footer>
        </main>`);
    }

    function readFields() {
      $$('.setup-player[data-seat]', root).forEach(section => {
        const p = players[Number(section.dataset.seat)];
        if (!p) return;
        p.name = $('[data-field="name"]', section).value;
        p.commander = $('[data-field="commander"]', section).value;
      });
    }

    draw();

    return on(root, 'click', '[data-act]', async (event, el) => {
      readFields();
      const seat = Number(el.dataset.seat);
      switch (el.dataset.act) {
        case 'back': return go('mode-select');
        case 'add':
          players.push({ name: defaults.playerNames?.[players.length] || '', commander: '', matId: DEFAULT_MAT.id });
          return draw();
        case 'remove':
          players.splice(seat, 1);
          return draw();
        case 'mat':
          players[seat].matId = el.dataset.mat;
          return draw();
        case 'start': {
          const life = Math.max(1, Math.min(999, Number($('#startingLife', root).value) || 40));
          try {
            const state = createTracker({ players, startingLife: life });
            await saveRecord(TRACKER_SAVE_KEY, state);
            go('tracker', { state });
          } catch (error) {
            toast(error.message, { bad: true });
          }
        }
      }
    });
  }
};
