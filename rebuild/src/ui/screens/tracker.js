// Table Tracker screen: every player card plus the change log on one screen.
//
// The card skeleton is built once per player. After each action only the small parts that
// show values are refreshed.

import { html, raw, esc, setHtml, on, $, debounce, clockTime } from '../dom.js';
import { go } from '../../app/router.js';
import { toast } from '../toast.js';
import { openModal, confirmDialog } from '../modal.js';
import { openJudge } from '../judge-modal.js';
import { saveRecord, loadRecord } from '../../data/store.js';
import { playmatById, matStyle } from '../../data/playmats.js';
import { recordGame, loadProfile } from '../../data/profile.js';
import { earnedLabels } from '../../data/achievements.js';
import { searchCards } from '../../data/card-api.js';
import {
  TRACKER_SAVE_KEY, MANA_COLORS, MANA_NAMES, STATUS_PRESETS, PLAYER_COUNTER_PRESETS, CARD_COUNTER_PRESETS,
  trackerApply, trackerPlayer, lossHints, trackerToGameRecord
} from '../../game/tracker.js';

const UNDO_LIMIT = 30;

export const trackerScreen = {
  mount(root, params = {}) {
    let state = params.state || null;
    let disposed = false;
    const cleanups = [];

    if (state) start();
    else {
      loadRecord(TRACKER_SAVE_KEY).then(saved => {
        if (disposed) return;
        if (!saved) return go('tracker-setup');
        state = saved;
        start();
      });
    }

    function start() {
      const undoStack = [];
      const lastLife = new Map();

      const save = debounce(() => {
        state.savedAt = new Date().toISOString();
        saveRecord(TRACKER_SAVE_KEY, state).catch(error => toast(error.message, { bad: true }));
      }, 600);
      const flushSave = () => save.flush();
      window.addEventListener('pagehide', flushSave);
      cleanups.push(() => { window.removeEventListener('pagehide', flushSave); flushSave(); });

      // ── Actions ────────────────────────────────────────────────────────────────
      function act(action) {
        const before = JSON.stringify(state);
        try {
          trackerApply(state, action);
        } catch (error) {
          toast(error.message, { bad: true });
          return false;
        }
        undoStack.push(before);
        if (undoStack.length > UNDO_LIMIT) undoStack.shift();
        const structural = ['add-player', 'remove-player', 'reset'].includes(action.type);
        if (structural) buildPlayers(); else refresh();
        save();
        return true;
      }

      function undo() {
        const previous = undoStack.pop();
        if (!previous) return toast('Nothing to undo.');
        const countBefore = state.players.length;
        state = JSON.parse(previous);
        if (state.players.length !== countBefore) buildPlayers(); else refresh();
        save();
        toast('Last change undone.');
      }

      // ── Rendering ──────────────────────────────────────────────────────────────
      setHtml(root, html`
        <main class="tracker">
          <header class="tracker__head">
            <div class="tracker__turn">
              <button type="button" class="btn btn--small" data-act="next-turn">Next Turn</button>
              <span id="trackerTurn"></span>
            </div>
            <div class="tracker__title">
              <h1 class="chrome-text">Table Tracker</h1>
              <small>Physical table is authoritative • Adjust common values directly</small>
            </div>
            <div class="tracker__head-end">
              <button type="button" class="btn btn--small" data-act="menu">Menu</button>
              <button type="button" class="btn-art" data-act="undo" aria-label="Undo"><img src="assets/img/ui/undo.png" alt="Undo"></button>
              <button type="button" class="btn-art" data-act="home" aria-label="Home"><img src="assets/img/ui/home.png" alt="Home"></button>
            </div>
          </header>
          <div class="tracker__body">
            <section class="tracker__players" id="trackerPlayers"></section>
            <aside class="tlog">
              <div class="tlog__head">
                <div class="tlog__title"><h2>Change Log</h2><small id="trackerLogCount"></small></div>
                <button type="button" class="judge-btn" data-act="judge"><img src="assets/img/ui/crest.png" alt="">Ask the Judge</button>
              </div>
              <div class="tlog__list scroll-y" id="trackerLog"></div>
              <div class="tlog__foot"><button type="button" class="btn btn--small btn--ghost" data-act="clear-log">Clear Log</button></div>
            </aside>
          </div>
        </main>`);

      const playersHost = $('#trackerPlayers', root);

      function buildPlayers() {
        lastLife.clear();
        playersHost.dataset.count = String(state.players.length);
        setHtml(playersHost, html`
          ${state.players.map(p => html`
            <article class="tp" data-player="${p.id}" style="--player:${p.color};${matStyle(playmatById(p.matId))}">
              <div class="tp__top">
                <button type="button" class="tp__avatar" data-act="set-active" aria-label="Make active player"></button>
                <input class="tp__name" data-act-input="name" maxlength="24" value="${p.name}" aria-label="Player name" autocomplete="off" spellcheck="false">
                <button type="button" class="tp__statuses" data-act="status" aria-label="Status"></button>
              </div>
              <div class="tp__mid">
                <div class="tp__life tp__glass">
                  <button type="button" class="icon-btn" data-act="life" data-delta="-1" aria-label="Lose 1 life">−</button>
                  <button type="button" class="tp__life-value" data-act="life-editor" data-life aria-label="Edit life"></button>
                  <button type="button" class="icon-btn" data-act="life" data-delta="1" aria-label="Gain 1 life">+</button>
                </div>
                <div class="tp__counters tp__glass" data-part="counters"></div>
              </div>
              <div class="tp__mana-row" data-part="mana"></div>
              <div class="tp__cards" data-part="cards"></div>
            </article>`)}
          <button type="button" class="judge-btn judge-btn--center" data-act="judge"><img src="assets/img/ui/crest.png" alt="">Ask the Judge</button>`);
        refresh();
      }

      function refresh() {
        const active = trackerPlayer(state, state.activeId);
        $('#trackerTurn', root).textContent = `Turn ${state.turn} — ${active?.name || ''}`;
        for (const p of state.players) refreshPlayer(p);
        refreshLog();
      }

      function refreshPlayer(p) {
        const card = $(`.tp[data-player="${p.id}"]`, playersHost);
        if (!card) return;
        const isActive = p.id === state.activeId;
        card.classList.toggle('is-active', isActive);
        card.classList.toggle('is-out', !!p.eliminated);
        card.setAttribute('style', `--player:${p.color};${matStyle(playmatById(p.matId))}`);

        $('.tp__avatar', card).textContent = isActive ? '♛' : (p.name.trim()[0] || '?').toUpperCase();
        const nameInput = $('.tp__name', card);
        if (document.activeElement !== nameInput) nameInput.value = p.name;

        const hints = lossHints(state, p);
        const chips = [
          ...p.statuses.map(s => html`<span class="chip chip--gold">${s}</span>`),
          p.poison > 0 ? html`<span class="chip chip--good">Poison ×${p.poison}</span>` : '',
          hints.length ? html`<span class="chip chip--bad">${hints[0]}</span>` : ''
        ];
        const hasChips = p.statuses.length || p.poison > 0 || hints.length;
        setHtml($('.tp__statuses', card), hasChips ? chips : html`<span class="chip chip--none">Status</span>`);

        // Life: white normally, flashing green on gain and red on loss.
        const lifeEl = $('[data-life]', card);
        const previous = lastLife.get(p.id);
        lifeEl.textContent = String(p.life);
        lifeEl.dataset.life = String(p.life);
        lifeEl.dataset.digits = String(String(p.life).length);   // long totals use a smaller size
        if (previous !== undefined && previous !== p.life) {
          lifeEl.classList.remove('is-gain', 'is-loss');
          void lifeEl.offsetWidth;   // restart the flash if it is already running
          lifeEl.classList.add(p.life > previous ? 'is-gain' : 'is-loss');
          clearTimeout(lifeEl._flash);
          lifeEl._flash = setTimeout(() => lifeEl.classList.remove('is-gain', 'is-loss'), 1600);
        }
        lastLife.set(p.id, p.life);

        const counters = Object.entries(p.counters);
        setHtml($('[data-part="counters"]', card), html`
          <div class="tp__counters-head"><span class="tp__label">Counters</span><button type="button" class="tp__counters-add" data-act="counters" aria-label="Add or edit counters">+</button></div>
          <div class="tp__counter tp__counter--tax" data-act="life-editor">
            <span>Cmd tax</span>
            <button type="button" data-act="tax" data-delta="-2" aria-label="Lower commander tax">−</button>
            <b>${p.commander.tax}</b>
            <button type="button" data-act="tax" data-delta="2" aria-label="Raise commander tax">+</button>
          </div>
          ${counters.length ? counters.map(([name, value]) => html`
            <div class="tp__counter" data-act="counters">
              <span>${name}</span>
              <button type="button" data-act="counter" data-name="${name}" data-delta="-1" aria-label="Remove one ${name}">−</button>
              <b>${value}</b>
              <button type="button" data-act="counter" data-name="${name}" data-delta="1" aria-label="Add one ${name}">+</button>
            </div>`) : html`<span class="tp__counters-empty">None</span>`}`);

        setHtml($('[data-part="mana"]', card), html`
          <div class="tp__mana tp__glass" aria-label="Mana pool">
            ${MANA_COLORS.map(c => html`
              <button type="button" class="mana-pip ${p.mana[c] ? '' : 'is-zero'}" data-act="mana" data-color="${c}" aria-label="Add ${MANA_NAMES[c]} mana">
                <img src="assets/img/mana/${c}.png" alt=""><b>${p.mana[c]}</b>
              </button>`)}
          </div>
          <button type="button" class="tp__tax tp__glass" data-act="life-editor"><span>Tax</span><b>${p.commander.tax}</b></button>
          <button type="button" class="chip tp__counter-count" data-act="counters" aria-label="Counters">${counters.length ? `◈ ${counters.length}` : '◈ +'}</button>
          <button type="button" class="btn-frame tp__add-counter" data-act="counters">+ Counter</button>`);

        setHtml($('[data-part="cards"]', card), html`
          ${p.cards.map(c => {
            const total = Object.values(c.counters).reduce((n, v) => n + v, 0);
            return html`<button type="button" class="tcard" data-act="card" data-card="${c.id}" style="${c.image ? `background-image:url('${c.image}')` : ''}">
              <span class="tcard__name">${c.name}</span>${total ? html`<span class="tcard__badge">${total}</span>` : ''}
            </button>`;
          })}
          <button type="button" class="tcard tcard--add" data-act="card-add" aria-label="Track a card">+</button>`);
      }

      function refreshLog() {
        $('#trackerLogCount', root).textContent = `${state.log.length} event${state.log.length === 1 ? '' : 's'}`;
        setHtml($('#trackerLog', root), state.log.length
          ? state.log.slice(0, 80).map(e => html`
              <div class="tlog__entry" style="--player:${trackerPlayer(state, e.playerId)?.color || 'var(--accent)'}">
                <small>${clockTime(e.at)}</small><span>${e.text}</span>
              </div>`)
          : html`<p class="tlog__empty">No changes yet. Edits you make will appear here.</p>`);
      }

      // ── Popups ─────────────────────────────────────────────────────────────────
      const attr = (name, value) => raw(`${name}="${esc(value)}"`);
      const stepper = (act, value, attrs = '') => html`
        <span class="stepper">
          <button type="button" class="icon-btn" data-pop="${act}" data-delta="-1" ${attrs}>−</button>
          <span class="stepper__value">${value}</span>
          <button type="button" class="icon-btn" data-pop="${act}" data-delta="1" ${attrs}>+</button>
        </span>`;

      /** Open a popup whose body is redrawn after every change made inside it. */
      function popup({ title, size, top = '', render, handle, onDraw, actions = [] }) {
        return openModal({
          title, size,
          // `top` is drawn once and kept; the part below it is redrawn after each change.
          body: html`${top}<div class="kv-list" data-popup-body></div>`,
          actions: actions.length ? actions : [{ label: 'Done', kind: 'confirm' }],
          onMount(el, api) {
            const body = $('[data-popup-body]', el);
            const draw = () => { setHtml(body, render()); onDraw?.(el); };
            draw();
            on(el, 'click', '[data-pop]', (event, target) => { handle(target, { ...api, el, draw }); if (document.contains(el)) draw(); });
          }
        });
      }

      function openLifeEditor(playerId) {
        const others = () => state.players.filter(x => x.id !== playerId);
        popup({
          title: `${trackerPlayer(state, playerId).name} — Life`,
          top: html`
            <div class="life-editor">
              <div class="life-editor__row">
                <button type="button" class="btn" data-pop="life" data-delta="-5">−5</button>
                <button type="button" class="btn" data-pop="life" data-delta="-1">−1</button>
                <strong class="life-editor__value" id="lifeEditorValue"></strong>
                <button type="button" class="btn" data-pop="life" data-delta="1">+1</button>
                <button type="button" class="btn" data-pop="life" data-delta="5">+5</button>
              </div>
            </div>`,
          onDraw(el) {
            $('#lifeEditorValue', el).textContent = String(trackerPlayer(state, playerId).life);
          },
          render() {
            const p = trackerPlayer(state, playerId);
            return html`
              <div class="row" style="justify-content:center">
                <input class="input" id="lifeExact" type="number" inputmode="numeric" min="0" max="999999" placeholder="Set exact" style="width:11rem">
                <button type="button" class="btn btn--small" data-pop="life-set">Set</button>
              </div>
              <div class="kv"><span>Poison counters</span>${stepper('poison', p.poison)}</div>
              <div class="kv"><span>Commander tax${p.commander.name ? ` — ${p.commander.name}` : ''}</span>
                <span class="stepper">
                  <button type="button" class="icon-btn" data-pop="tax" data-delta="-2">−</button>
                  <span class="stepper__value">${p.commander.tax}</span>
                  <button type="button" class="icon-btn" data-pop="tax" data-delta="2">+</button>
                </span>
              </div>
              ${others().map(o => html`<div class="kv"><span>Commander damage from ${o.name}</span>${stepper('cmd', p.commanderDamage[o.id] || 0, attr('data-from', o.id))}</div>`)}
              <button type="button" class="option" data-pop="eliminate"><span><strong>${p.eliminated ? 'Return to the game' : 'Mark as out of the game'}</strong>
                <small>${p.eliminated ? 'This player is currently out.' : 'Dims the card and skips this player on Next Turn.'}</small></span></button>`;
          },
          handle(target, { el }) {
            const delta = Number(target.dataset.delta || 0);
            switch (target.dataset.pop) {
              case 'life': act({ type: 'life', playerId, delta }); break;
              case 'life-set': {
                const value = $('#lifeExact', el).value;
                if (value !== '') act({ type: 'life', playerId, set: Number(value) });
                break;
              }
              case 'poison': act({ type: 'poison', playerId, delta }); break;
              case 'tax': act({ type: 'tax', playerId, delta }); break;
              case 'cmd': act({ type: 'commander-damage', playerId, fromId: target.dataset.from, delta }); break;
              case 'eliminate': act({ type: 'eliminate', playerId, eliminated: !trackerPlayer(state, playerId).eliminated }); break;
            }
          }
        });
      }

      function openStatus(playerId) {
        popup({
          title: `${trackerPlayer(state, playerId).name} — Status`,
          render() {
            const p = trackerPlayer(state, playerId);
            const names = [...new Set([...STATUS_PRESETS, ...p.statuses])];
            return html`
              <div class="kv"><span>Poison counters</span>${stepper('poison', p.poison)}</div>
              <div class="grid-2">
                ${names.map(name => html`<button type="button" class="option ${p.statuses.includes(name) ? 'is-on' : ''}" data-pop="status" data-status="${name}"><strong>${name}</strong></button>`)}
              </div>
              <div class="row">
                <input class="input" id="customStatus" maxlength="28" placeholder="Custom status" autocomplete="off">
                <button type="button" class="btn btn--small" data-pop="status-custom">Add</button>
              </div>`;
          },
          handle(target, { el }) {
            if (target.dataset.pop === 'poison') act({ type: 'poison', playerId, delta: Number(target.dataset.delta) });
            if (target.dataset.pop === 'status') act({ type: 'status', playerId, status: target.dataset.status });
            if (target.dataset.pop === 'status-custom') {
              const value = $('#customStatus', el).value.trim();
              if (value) act({ type: 'status', playerId, status: value, enabled: true });
            }
          }
        });
      }

      function openCounters(playerId) {
        popup({
          title: `${trackerPlayer(state, playerId).name} — Counters`,
          render() {
            const p = trackerPlayer(state, playerId);
            const tracked = Object.entries(p.counters);
            const presets = PLAYER_COUNTER_PRESETS.filter(name => !(name in p.counters));
            return html`
              <div class="kv-list">
                ${tracked.length ? tracked.map(([name, value]) => html`
                  <div class="kv"><span>${name}</span>${stepper('counter', value, attr('data-name', name))}
                    <button type="button" class="chip chip--bad" data-pop="counter-remove" data-name="${name}">Remove</button></div>`)
                  : html`<p class="muted">No counters tracked for this player yet.</p>`}
              </div>
              <h3 class="section-title">Add a counter</h3>
              <div class="grid-3">
                ${presets.map(name => html`<button type="button" class="option" data-pop="counter-add" data-name="${name}"><strong>${name}</strong></button>`)}
              </div>
              <div class="row">
                <input class="input" id="customCounter" maxlength="28" placeholder="Custom counter name" autocomplete="off">
                <button type="button" class="btn btn--small" data-pop="counter-custom">Add</button>
              </div>`;
          },
          handle(target, { el }) {
            const name = target.dataset.name;
            switch (target.dataset.pop) {
              case 'counter': act({ type: 'counter', playerId, name, delta: Number(target.dataset.delta) }); break;
              case 'counter-remove': act({ type: 'counter', playerId, name, remove: true }); break;
              case 'counter-add': act({ type: 'counter', playerId, name, set: 1 }); break;
              case 'counter-custom': {
                const value = $('#customCounter', el).value.trim();
                if (value) act({ type: 'counter', playerId, name: value, set: 1 });
                break;
              }
            }
          }
        });
      }

      function openMana(playerId) {
        popup({
          title: `${trackerPlayer(state, playerId).name} — Mana Pool`,
          size: 'small',
          render() {
            const p = trackerPlayer(state, playerId);
            return html`
              <div class="kv-list">
                ${MANA_COLORS.map(c => html`<div class="kv"><span class="row"><span class="mana-pip"><img src="assets/img/mana/${c}.png" alt=""></span>${MANA_NAMES[c]}</span>${stepper('mana', p.mana[c], attr('data-color', c))}</div>`)}
                <button type="button" class="btn btn--ghost" data-pop="mana-clear">Empty mana pool</button>
              </div>`;
          },
          handle(target) {
            if (target.dataset.pop === 'mana') act({ type: 'mana', playerId, color: target.dataset.color, delta: Number(target.dataset.delta) });
            if (target.dataset.pop === 'mana-clear') act({ type: 'mana', playerId, clear: true });
          }
        });
      }

      function openCard(playerId, cardId) {
        const find = () => trackerPlayer(state, playerId)?.cards.find(c => c.id === cardId);
        if (!find()) return;
        popup({
          title: find().name,
          render() {
            const card = find();
            if (!card) return html`<p class="muted">This card is no longer tracked.</p>`;
            const names = [...new Set([...Object.keys(card.counters), ...CARD_COUNTER_PRESETS])];
            return html`
              <div class="kv-list">
                ${names.map(name => html`<div class="kv"><span>${name}</span>${stepper('card-counter', card.counters[name] || 0, attr('data-name', name))}</div>`)}
              </div>
              <div class="row">
                <input class="input" id="customCardCounter" maxlength="28" placeholder="Custom counter name" autocomplete="off">
                <button type="button" class="btn btn--small" data-pop="card-counter-custom">Add</button>
              </div>
              <button type="button" class="btn btn--danger" data-pop="card-remove">Stop tracking this card</button>`;
          },
          handle(target, { el, close }) {
            switch (target.dataset.pop) {
              case 'card-counter': act({ type: 'card-counter', playerId, cardId, name: target.dataset.name, delta: Number(target.dataset.delta) }); break;
              case 'card-counter-custom': {
                const value = $('#customCardCounter', el).value.trim();
                if (value) act({ type: 'card-counter', playerId, cardId, name: value, delta: 1 });
                break;
              }
              case 'card-remove': act({ type: 'card-remove', playerId, cardId }); close(); break;
            }
          }
        });
      }

      function openAddCard(playerId) {
        let results = [], status = '', timer = null, token = 0;
        const modal = openModal({
          title: 'Track a Card',
          body: html`
            <div class="row">
              <input class="input" id="trackCardName" maxlength="80" placeholder="Card name" autocomplete="off">
              <button type="button" class="btn btn--small" data-add="typed">Track</button>
            </div>
            <p class="muted" id="trackCardStatus">Type a name and press Track, or pick a match to include its art.</p>
            <div class="search-results" id="trackCardResults"></div>`,
          actions: [{ label: 'Cancel', kind: 'cancel' }],
          onMount(el, { close }) {
            const input = $('#trackCardName', el);
            const drawResults = () => {
              $('#trackCardStatus', el).textContent = status || 'Type a name and press Track, or pick a match to include its art.';
              setHtml($('#trackCardResults', el), results.map((d, i) => html`
                <button type="button" class="search-result" data-add="result" data-index="${i}">
                  ${d.imageUris?.art_crop ? html`<img src="${d.imageUris.art_crop}" alt="">` : ''}
                  <span><strong>${d.name}</strong><small>${d.typeLine || ''}</small></span>
                </button>`));
            };
            const search = async () => {
              const query = input.value.trim();
              if (query.length < 3) { results = []; status = ''; return drawResults(); }
              const mine = ++token;
              status = 'Searching…'; drawResults();
              try {
                const rows = await searchCards(query, { allPrintings: false });
                if (mine !== token) return;
                results = rows.slice(0, 12);
                status = results.length ? '' : 'No matching card found — you can still track it by name.';
              } catch {
                if (mine !== token) return;
                results = [];
                status = 'Card lookup is offline — you can still track it by name.';
              }
              drawResults();
            };
            input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(search, 350); });
            input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addTyped(); } });
            const addTyped = () => {
              const name = input.value.trim();
              if (!name) return toast('Enter a card name.', { bad: true });
              if (act({ type: 'card-add', playerId, name })) close();
            };
            on(el, 'click', '[data-add]', (event, target) => {
              if (target.dataset.add === 'typed') return addTyped();
              const d = results[Number(target.dataset.index)];
              if (d && act({ type: 'card-add', playerId, name: d.name, image: d.imageUris?.art_crop || '' })) close();
            });
            input.focus();
          }
        });
        return modal;
      }

      function openMenu() {
        openModal({
          title: 'Table Menu',
          size: 'small',
          body: html`
            <div class="option-list">
              <button type="button" class="option" data-menu="save"><span><strong>Save now</strong><small>The table also saves itself as you go.</small></span></button>
              <button type="button" class="option" data-menu="players"><span><strong>Add or remove players</strong><small>${state.players.length} at the table (2–6).</small></span></button>
              <button type="button" class="option" data-menu="end"><span><strong>End game</strong><small>Pick the winner and record the game to your profile.</small></span></button>
              <button type="button" class="option" data-menu="reset"><span><strong>Reset table</strong><small>New game with the same players.</small></span></button>
            </div>`,
          actions: [{ label: 'Close', kind: 'cancel' }],
          onMount(el, { close }) {
            on(el, 'click', '[data-menu]', async (event, target) => {
              const choice = target.dataset.menu;
              close();
              if (choice === 'save') { save.flush(); toast('Table saved.'); }
              if (choice === 'players') openPlayers();
              if (choice === 'end') openEndGame();
              if (choice === 'reset') {
                const ok = await confirmDialog({ title: 'Reset Table', message: 'Start a new game with the same players? Life, counters, mana, tracked cards and the change log are cleared.', confirmLabel: 'Reset Table', danger: true });
                if (ok) act({ type: 'reset' });
              }
            });
          }
        });
      }

      function openPlayers() {
        popup({
          title: 'Players',
          size: 'small',
          render() {
            return html`
              <div class="kv-list">
                ${state.players.map(p => html`<div class="kv"><span>${p.name}</span>
                  ${state.players.length > 2 ? html`<button type="button" class="chip chip--bad" data-pop="remove" data-player="${p.id}">Remove</button>` : ''}</div>`)}
                ${state.players.length < 6 ? html`<button type="button" class="btn" data-pop="add">+ Add player</button>` : ''}
              </div>`;
          },
          handle(target) {
            if (target.dataset.pop === 'add') act({ type: 'add-player' });
            if (target.dataset.pop === 'remove') act({ type: 'remove-player', playerId: target.dataset.player });
          }
        });
      }

      function openEndGame() {
        openModal({
          title: 'End Game',
          size: 'small',
          body: html`
            <p class="modal__message">Who won?</p>
            <div class="option-list">
              ${state.players.map(p => html`<button type="button" class="option" data-winner="${p.id}"><strong>${p.name}</strong></button>`)}
              <button type="button" class="option" data-winner=""><strong>Draw — no winner</strong></button>
            </div>`,
          actions: [{ label: 'Cancel', kind: 'cancel' }],
          onMount(el, { close }) {
            on(el, 'click', '[data-winner]', async (event, target) => {
              close();
              const before = earnedLabels(loadProfile());
              act({ type: 'end-game', winnerId: target.dataset.winner || null });
              save.flush();
              // Player 1 is the profile owner, so their result counts toward wins.
              let unlocked = [];
              try {
                const profile = await recordGame(trackerToGameRecord(state), state.players[0].id);
                unlocked = earnedLabels(profile).filter(label => !before.includes(label));
              } catch (error) {
                toast('The game could not be saved to your profile.', { bad: true });
              }
              const winner = trackerPlayer(state, state.result?.winnerId);
              openModal({
                title: 'Game Complete',
                size: 'small',
                dismissible: false,
                body: html`
                  <p class="modal__message"><strong>${winner ? `${winner.name} wins` : 'The game is a draw'}</strong> after ${state.turn} turn${state.turn === 1 ? '' : 's'}.</p>
                  ${unlocked.length ? html`<p class="modal__message">Achievement unlocked: <strong>${unlocked.join(', ')}</strong></p>` : ''}`,
                actions: [
                  { label: 'Home', kind: 'cancel', onClick: () => go('landing') },
                  { label: 'New Game', kind: 'confirm', onClick: ({ close: done }) => { done(); act({ type: 'reset' }); } }
                ]
              });
            });
          }
        });
      }

      // ── Events ─────────────────────────────────────────────────────────────────
      const playerOf = el => el.closest('.tp')?.dataset.player || null;

      cleanups.push(on(root, 'click', '[data-act]', async (event, el) => {
        const playerId = playerOf(el);
        switch (el.dataset.act) {
          case 'life': return void act({ type: 'life', playerId, delta: Number(el.dataset.delta) });
          case 'life-editor': return void openLifeEditor(playerId);
          case 'status': return void openStatus(playerId);
          case 'counter': return void act({ type: 'counter', playerId, name: el.dataset.name, delta: Number(el.dataset.delta) });
          case 'counters': return void openCounters(playerId);
          case 'tax': return void act({ type: 'tax', playerId, delta: Number(el.dataset.delta) });
          case 'mana': return void act({ type: 'mana', playerId, color: el.dataset.color, delta: 1 });
          case 'card': return void openCard(playerId, el.dataset.card);
          case 'card-add': return void openAddCard(playerId);
          case 'set-active': return void act({ type: 'active', playerId });
          case 'next-turn': return void act({ type: 'next-turn' });
          case 'undo': return void undo();
          case 'judge': return void openJudge();
          case 'menu': return void openMenu();
          case 'home': save.flush(); return void go('landing');
          case 'clear-log':
            if (await confirmDialog({ title: 'Clear Log', message: 'Clear the change log for this table?', confirmLabel: 'Clear Log', danger: true })) act({ type: 'clear-log' });
            return;
        }
      }));

      // Long-press a mana symbol to open the pool editor (a tap adds one).
      let holdTimer = null, suppressClick = false;
      const cancelHold = () => { clearTimeout(holdTimer); holdTimer = null; };
      playersHost.addEventListener('pointerdown', event => {
        const pip = event.target instanceof Element ? event.target.closest('[data-act="mana"]') : null;
        if (!pip) return;
        const playerId = playerOf(pip);
        cancelHold();
        holdTimer = setTimeout(() => { holdTimer = null; suppressClick = true; openMana(playerId); }, 450);
      });
      for (const type of ['pointerup', 'pointercancel', 'pointerleave']) playersHost.addEventListener(type, cancelHold);
      playersHost.addEventListener('click', event => {
        if (!suppressClick) return;
        suppressClick = false;
        event.stopPropagation();
        event.preventDefault();
      }, true);

      // Inline name editing.
      cleanups.push(on(root, 'change', '[data-act-input="name"]', (event, input) => {
        const playerId = playerOf(input);
        const value = input.value.trim();
        if (!value) { input.value = trackerPlayer(state, playerId).name; return; }
        act({ type: 'name', playerId, name: value });
      }));
      cleanups.push(on(root, 'keydown', '[data-act-input="name"]', (event, input) => { if (event.key === 'Enter') input.blur(); }));

      buildPlayers();
    }

    return () => {
      disposed = true;
      for (const cleanup of cleanups) { try { cleanup(); } catch (error) { console.error(error); } }
    };
  }
};

