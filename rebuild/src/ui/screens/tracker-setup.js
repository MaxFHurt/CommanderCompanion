// Table Tracker setup: names, optional commander, and a playmat for each player.

import { html, setHtml, on, $, $$ } from '../dom.js';
import { go } from '../../app/router.js';
import { toast } from '../toast.js';
import { createTracker, PLAYER_COLORS, TRACKER_SAVE_KEY } from '../../game/tracker.js';
import { saveRecord } from '../../data/store.js';
import { accountSetupDefaults, loadProfile } from '../../data/profile.js';
import { routeScreen, routePanel } from '../route-kit.js';
import { unlockedMats, playmatById, DEFAULT_MAT } from '../../data/playmats.js';

export const trackerSetupScreen = {
  mount(root, params = {}) {
    const play = params.play || 'local';   // local | host-player | host-device
    const defaults = accountSetupDefaults();
    const profile = loadProfile();
    const startingLife = Number(defaults.tableRuleDefaults?.startingLife || 40);
    const mats = unlockedMats(profile);
    // The profile owner is always Player 1; other saved names fill the next seats.
    const players = [0, 1].map(i => ({ name: defaults.playerNames?.[i] || '', commander: '', matId: DEFAULT_MAT.id }));

    function draw() {
      setHtml(root, routeScreen({
        cls: 'route--tracker-setup', w: 1160, h: 475, ph: 276,
        title: play === 'host-device' ? 'Host Table' : play === 'host-player' ? 'Host a Table' : 'Table Tracker',
        panels: [
          routePanel('Players', html`
            <div class="setup-players">
              ${players.map((p, i) => html`
                <section class="setup-player" style="--player:${PLAYER_COLORS[i]}" data-seat="${i}">
                  <div class="setup-player__head">
                    <span>Player ${i + 1}${play === 'host-player' && i === 0 ? ' — this device' : play !== 'local' ? ' — joins on their phone' : ''}</span>
                    ${players.length > 2 ? html`<button type="button" class="chip chip--bad" data-act="remove" data-seat="${i}">Remove</button>` : ''}
                  </div>
                  <input class="input" data-field="name" maxlength="24" placeholder="Player name" value="${p.name}" autocomplete="off">
                  <input class="input" data-field="commander" maxlength="60" placeholder="Commander (optional)" value="${p.commander}" autocomplete="off">
                  <div class="mat-pick" aria-label="Playmat">
                    ${mats.map(m => html`<button type="button" class="mat-thumb ${playmatById(p.matId).id === m.id ? 'is-on' : ''}" data-act="mat" data-seat="${i}" data-mat="${m.id}" style="background-image:url('${m.thumb || m.image}')" aria-label="${m.name}"></button>`)}
                  </div>
                </section>`)}
              ${players.length < 6 ? html`<button type="button" class="btn btn--cancel" data-act="add">+ Add player</button>` : ''}
            </div>`),
          routePanel('Table', html`
            <label class="field"><span>Starting life</span>
              <input class="input" id="startingLife" type="number" inputmode="numeric" min="1" max="999" value="${startingLife}">
            </label>`)],
        actions: html`
          <button class="btn" type="button" data-act="back" aria-label="Back">Back</button>
          <button type="button" class="btn btn--confirm" data-act="start">${play === 'local' ? 'Start Tracking' : 'Open Table'}</button>`
      }));
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
            go('tracker', { state, host: play === 'local' ? null : play });
          } catch (error) {
            toast(error.message, { bad: true });
          }
        }
      }
    });
  }
};
