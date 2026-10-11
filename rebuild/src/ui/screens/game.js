// The in-game screen for Guided Play and Free Play (and the host/judge display).
// It draws one "view" from the session and turns taps into intents. It never edits the game.

import { html, setHtml, on, raw } from '../dom.js';
import { go } from '../../app/router.js';
import { getSession, endSession, resumeSavedSession } from '../../app/session.js';
import { toast } from '../toast.js';
import { openModal, confirmDialog, closeAllModals } from '../modal.js';
import { loadSettings } from '../../data/store.js';
import { playmatById, matStyle, DEFAULT_MAT } from '../../data/playmats.js';
import { cardHtml, cardBackHtml, imageOf, manaPoolHtml } from '../card-view.js';
import { openJudge } from '../judge-modal.js';
import { openDecision } from '../game/decision.js';
import { openAttack, openBlocks } from '../game/combat-ui.js';
import { openCardDetail, openZone, openPlayerBoard, openTable, tableHtml } from '../game/card-modals.js';
import { openHostTools } from '../game/host-tools.js';
import { openOpeningHand, openDiscard, openGuided, openVote, openPostGame, openLog, openStack, openChat, openGameSettings, openCardId, openPlayerInfo } from '../game/panels.js';

const PHASE_STEPS = [['untap', 'Untap'], ['upkeep', 'Upkeep'], ['draw', 'Draw'], ['precombat-main', 'Main 1'], ['combat', 'Combat'], ['postcombat-main', 'Main 2'], ['end-step', 'End']];
const COMBAT = ['combat', 'begin-combat', 'declare-attackers', 'declare-blockers', 'combat-damage', 'end-combat'];

function phaseKey(phase) { return COMBAT.includes(phase) ? 'combat' : phase === 'cleanup' ? 'end-step' : phase; }

export const gameScreen = {
  mount(root, params = {}) {
    let session = getSession();
    const offs = [];
    const ui = { screen: null, promptKey: '', closePrompt: null, minimized: false, curtainFor: null, lastViewer: undefined, focusId: null, sort: 'played', highlight: new Set(), timer: null, recorded: false, chatSeen: 0 };
    const ctx = {
      get session() { return session; },
      get view() { return session?.view(); },
      send, def: id => session?.view()?.defs?.[id] || null, refresh: () => render(), ui
    };

    setHtml(root, html`<main class="game"><div class="game__loading">Loading game…</div></main>`);

    async function send(intent, { quiet = false } = {}) {
      const result = await session.send(intent);
      if (!result.ok && !quiet) toast(result.error || 'That did not work.', { bad: true });
      return result;
    }

    function matFor(player) {
      // A joined device shows its own chosen playmat for its own seat (mats live on each device).
      let id = player?.matId;
      if (session?.role === 'client' && player?.playerId === session.viewerId()) { try { id = localStorage.getItem('cc-join-mat') || id; } catch { /* default */ } }
      return matStyle(playmatById(id) || DEFAULT_MAT);
    }

    // ── drawing ────────────────────────────────────────────────────────────────
    /** Screens this device can switch between. Only a room host gets the table and Judge mode. */
    function screensFor(view) {
      if (session?.role === 'host-device') return ['table', 'judge'];
      if (session?.role === 'host-player' && view.you) return ['player', 'table', 'judge'];
      return view.you ? [] : ['table'];   // a device that only watches sees the table
    }

    function legalityBadge(view) {
      const bad = view.legality?.illegal || 0;
      return bad ? html`<i class="legal-badge is-bad" title="${bad} illegal play${bad === 1 ? '' : 's'}">✕${bad}</i>` : html`<i class="legal-badge is-ok" title="All plays legal">✓</i>`;
    }

    function switchHtml(view, screens, screen) {
      const label = { player: 'Board', table: 'Table', judge: 'Judge' };
      return html`<div class="screen-switch" role="tablist" data-count="${screens.length}">${screens.map(k => html`
        <button type="button" role="tab" class="screen-switch__btn ${k === screen ? 'is-on' : ''}" aria-selected="${k === screen ? 'true' : 'false'}" data-act="screen" data-screen="${k}">
          <span>${label[k]}</span>${k === 'judge' ? legalityBadge(view) : ''}
        </button>`)}</div>`;
    }

    const VERDICT = { legal: ['✓', 'Legal'], illegal: ['✕', 'Illegal'], approved: ['✓', 'Table vote'], host: ['✎', 'Host change'] };
    function judgePanelHtml(view) {
      const plays = view.plays || [];
      const bad = view.legality?.illegal || 0;
      return html`<aside class="judge">
        <header class="judge__head">
          <h4>Judge${session?.net?.code ? html` <small class="judge__room">Room ${session.net.code}</small>` : ''}</h4>
          <button type="button" class="chip ${view.stack.length ? 'chip--gold' : 'chip--none'}" data-act="stack">Stack (${view.stack.length})</button>
        </header>
        <div class="judge__status ${bad ? 'is-bad' : 'is-ok'}">
          <b>${bad ? '✕' : '✓'}</b>
          <span>${bad ? `${bad} illegal play${bad === 1 ? '' : 's'} this game` : plays.length ? `All ${plays.length} plays legal` : 'No plays yet'}</span>
        </div>
        <ol class="judge__plays" data-keep-scroll="judge">${plays.length ? plays.map(p => html`
          <li class="jplay jplay--${p.verdict}">
            <i class="jplay__mark" title="${VERDICT[p.verdict]?.[1] || ''}">${VERDICT[p.verdict]?.[0] || '•'}</i>
            <span class="jplay__text"><b>${p.text}</b><small>T${p.turn} • ${p.phase}${p.verdict !== 'legal' ? ` • ${VERDICT[p.verdict]?.[1] || ''}` : ''}${p.reasons.length ? `: ${p.reasons[0]}` : ''}</small></span>
            <button type="button" class="jplay__undo" data-act="reverse" data-id="${p.id}" ${p.reversible ? "" : raw("disabled")}>Reverse</button>
          </li>`) : html`<li class="judge__empty">Plays appear here as they happen.</li>`}</ol>
        <footer class="judge__foot">
          <button type="button" class="btn btn--small" data-act="log">Full Log</button>
          <button type="button" class="btn btn--small" data-act="undo" ${view.canUndo ? '' : raw('disabled')}>Undo Last</button>
        </footer>
      </aside>`;
    }

    function render() {
      const view = session?.view();
      if (!view) {
        setHtml(root, html`<main class="game"><div class="game__loading">${session?.status?.() === 'lost' ? 'Connection lost. Trying to reconnect…' : 'Waiting for the host…'}<button class="btn" data-act="home" type="button">Leave</button></div></main>`);
        return;
      }
      const settings = loadSettings();
      // A host can switch between screens: their own board (if playing), the whole table, and Judge mode.
      const screens = screensFor(view);
      const screen = screens.includes(ui.screen) ? ui.screen : (screens[0] || 'player');
      const judge = screen !== 'player';
      const focus = view.players.find(p => p.playerId === (judge ? (ui.focusId || view.activePlayerId) : view.you)) || view.players[0];
      const others = judge ? view.players : view.players.filter(p => p.playerId !== focus.playerId);
      const coach = view.coach || {};
      const prompt = view.prompt;
      const myTurn = view.activePlayerId === focus.playerId;
      const cmd = focus.commanders[0];
      const cmdDef = cmd ? view.defs[cmd.def] : null;
      const cmdCard = cmd ? focus.command.find(c => c.def === cmd.def) : null;
      const scroll = Object.fromEntries([...root.querySelectorAll('[data-keep-scroll]')].map(el => [el.dataset.keepScroll, [el.scrollLeft, el.scrollTop]]));

      const perms = focus.battlefield.filter(c => !c.land);
      const lands = focus.battlefield.filter(c => c.land);
      const sorted = ui.sort === 'type'
        ? [...perms].sort((a, b) => Number(b.creature) - Number(a.creature) || a.name.localeCompare(b.name))
        : ui.sort === 'power' ? [...perms].sort((a, b) => Number(b.power ?? -1) - Number(a.power ?? -1)) : perms;
      const tokens = focus.battlefield.filter(c => c.token).length;
      const attached = focus.battlefield.filter(c => c.attachedTo).length;
      const respond = new Set([...(view.actions.respond?.cards || []), ...(view.actions.respond?.abilities || [])]);
      const glow = c => (ui.highlight.has(c.id) ? 'is-suggested' : '') + (respond.has(c.id) ? ' is-playable' : '');
      const advice = view.players.find(p => p.playerId === view.you)?.advice !== false;
      const showCoach = true;
      const jewel = coach.jewel;
      const chatNew = (view.chat?.length || 0) - ui.chatSeen;
      const endLabel = view.phase === 'postcombat-main';

      setHtml(root, html`
      <main class="game ${judge ? 'game--judge' : ''} ${screen === 'judge' ? 'game--judge-mode' : ''} ${myTurn ? 'is-my-turn' : ''}" data-mode="${view.mode}" data-guidance="${settings.guidance}">
        <header class="game__top">
          <div class="game__top-side">
            <button type="button" class="btn-art" data-act="home"><img src="assets/img/ui/home.png" alt="Home"></button>
            <button type="button" class="btn-pill" data-act="card-id"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10" cy="10" r="6.5" fill="none" stroke="currentColor" stroke-width="3"/><path d="M15 15l6.5 6.5" stroke="currentColor" stroke-width="3.4" stroke-linecap="round"/></svg><span>Card ID</span></button>
            <button type="button" class="btn-pill" data-act="chat"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 4h18v12H10l-5 4v-4H3z" fill="currentColor"/></svg><span>Chat</span>${chatNew > 0 ? html`<i class="dot">${chatNew}</i>` : ''}</button>
          </div>
          <img class="game__wordmark" src="assets/img/game/top-center.jpg" alt="Commander Companion">
          <div class="game__top-side game__top-side--end">
            <button type="button" class="btn-art" data-act="help"><img src="assets/img/ui/help.png" alt="Help"></button>
            <button type="button" class="btn-art" data-act="settings"><img src="assets/img/ui/settings.png" alt="Settings"></button>
            <button type="button" class="btn-art" data-act="profile"><img src="assets/img/ui/profile.png" alt="Profile"></button>
          </div>
        </header>

        ${judge ? '' : html`
        <div class="game__mat" style="${matFor(focus)}"></div>
        <aside class="game__left" style="${matFor(focus)}; --player:${focus.color}">
          <div class="rail-name">
            <i class="status-light ${focus.eliminated ? 'is-out' : myTurn ? 'is-active' : ''}"></i>
            <strong>${focus.name}</strong>
            ${judge ? html`<span class="chip chip--gold">HOST VIEW</span>` : view.mode === 'freeplay' ? html`<span class="chip">FREE PLAY</span>` : ''}
          </div>
          <div class="rail-cmd">
            <button type="button" class="rail-cmd__card ${cmdCard?.playable ? 'is-playable' : ''} ${cmdCard && ui.highlight.has(cmdCard.id) ? 'is-suggested' : ''}" data-act="commander" data-id="${cmdCard?.id || ''}">
              <img class="rail-cmd__art" src="${imageOf(cmdDef, null, 'art_crop') || 'assets/img/game/commander-fallback.png'}" alt="" onerror="this.onerror=null;this.src='assets/img/game/commander-fallback.png'">
              <span class="rail-cmd__name">${cmd?.name || 'Commander'}</span>
              <span class="rail-cmd__tax">TAX ${cmd?.tax || 0}</span>
              ${cmd && cmd.zone !== 'command' ? html`<span class="rail-cmd__zone">${cmd.zone === 'battlefield' ? 'IN PLAY' : cmd.zone.toUpperCase()}</span>` : ''}
            </button>
            <div class="rail-stats">
              <button type="button" class="rail-life" data-act="player-info" data-id="${focus.playerId}"><b class="rail-life__value" data-digits="${String(focus.life).length}">${focus.life}</b><small>LIFE</small></button>
              <div class="rail-pair"><span><b>${focus.handCount}</b><small>HAND</small></span><span><b>${focus.libraryCount}</b><small>LIBRARY</small></span></div>
              <div class="rail-chips">
                ${focus.poison ? html`<span class="chip chip--bad">☠ ${focus.poison}</span>` : ''}
                ${focus.statuses.slice(0, 2).map(s => html`<span class="chip chip--gold">${s}</span>`)}
                ${!focus.poison && !focus.statuses.length ? html`<span class="chip chip--none">No status</span>` : ''}
              </div>
            </div>
          </div>
          <div class="rail-mana">
            <h4>Available Mana <b>${focus.mana.total}</b></h4>
            ${manaPoolHtml(focus.mana)}
          </div>
          <div class="rail-zones">
            ${[['graveyard', focus.graveyard.length], ['exile', focus.exile.length], ['tokens', tokens], ['attachments', attached]].map(([z, n]) => html`
              <button type="button" class="rail-zone" data-act="zone" data-zone="${z}"><img src="assets/img/game/zone-${z}.png" alt="${z}"><i>${n}</i></button>`)}
          </div>
          ${screens.length > 1 ? html`<div class="rail-host">${switchHtml(view, screens, screen)}</div>` : ''}
          ${view.canEdit ? html`<button type="button" class="btn btn--small rail-tools" data-act="tools">${view.mode === 'freeplay' ? 'Edit Game' : 'Host Tools'}</button>` : ''}
        </aside>`}

        <section class="game__center">
          ${judge ? html`<div class="zone zone--table" data-keep-scroll="table">${tableHtml(view)}</div>` : html`
          <div class="zone zone--battle" data-mat="${playmatById(focus.matId).id === DEFAULT_MAT.id ? 'default' : 'custom'}" style="${matFor(focus)}">
            <header class="zone__head">
              <h3>${judge ? `${focus.name}'s Battlefield` : 'Your Battlefield'}</h3>
              <div class="zone__tools">
                <button type="button" class="link-btn" data-act="counters">Counters</button>
                <button type="button" class="link-btn" data-act="sort">Sort: ${ui.sort}</button>
                <button type="button" class="link-btn" data-act="table">View Full</button>
              </div>
            </header>
            <div class="zone__cards" data-keep-scroll="bf">
              ${sorted.length ? sorted.map(c => cardHtml(c, view.defs[c.def], { cls: glow(c), zone: 'battlefield', badge: c.attacking ? '⚔' : c.blocking ? '🛡' : c.sick ? '💤' : '' }))
                : html`<p class="zone__empty">Creatures, artifacts and enchantments you play appear here.</p>`}
            </div>
          </div>
          <div class="zone zone--lands">
            <header class="zone__head"><h3>${judge ? 'Lands' : 'Your Lands'} <small>${lands.length}${!judge && myTurn ? ` • land drop ${focus.landsPlayed ? 'used' : 'available'}` : ''}</small></h3></header>
            <div class="zone__cards" data-keep-scroll="lands">
              ${lands.length ? lands.map(c => cardHtml(c, view.defs[c.def], { cls: `card--land ${glow(c)}`, zone: 'battlefield' })) : html`<p class="zone__empty">No lands yet.</p>`}
            </div>
          </div>
          <div class="zone zone--hand">
            <header class="zone__head"><h3>${judge ? 'Hand' : 'Your Hand'} <small>${focus.handCount}</small></h3></header>
            <div class="zone__cards" data-keep-scroll="hand">
              ${focus.hand ? (focus.hand.length ? focus.hand.map(c => cardHtml(c, view.defs[c.def], { cls: `card--hand ${glow(c)}`, zone: 'hand' })) : html`<p class="zone__empty">Your hand is empty.</p>`)
                : html`<div class="hand-backs">${Array.from({ length: Math.min(focus.handCount, 12) }, () => cardBackHtml())}</div>`}
            </div>
          </div>
          <button type="button" class="tip ${showCoach ? '' : 'is-quiet'}" data-act="coach">
            <b>${coach.headline || ''}</b>
            ${advice ? html`<span>${coach.detail || ''}</span>` : ''}
          </button>`}
          <footer class="game__bar">
            <button type="button" class="phase-box" data-act="phase-info">
              <b>Turn ${view.turn} — ${view.phaseLabel}</b>
              <span class="phase-track">${PHASE_STEPS.map(([k, label]) => html`<i class="${phaseKey(view.phase) === k ? 'is-on' : ''}" title="${label}"></i>`)}</span>
            </button>
            ${judge ? html`
            ${screens.length > 1 ? switchHtml(view, screens, screen) : html`<span></span>`}
            ${view.canEdit ? html`<button type="button" class="btn" data-act="tools">Host Tools</button>` : html`<span></span>`}` : html`
            <button type="button" class="jewel ${jewel ? '' : 'is-idle'}" data-act="jewel" ${jewel ? '' : raw('disabled')}>
              <i class="jewel__gem"></i>
              <span>${jewel?.label || (prompt.kind === 'waiting' ? 'WAIT' : '•')}</span>
              <small data-timer></small>
            </button>
            <button type="button" class="btn-art game__next" data-act="${endLabel ? 'end-turn' : 'next-phase'}" ${view.actions.nextPhase ? '' : raw('disabled')}>
              <img src="assets/img/game/${endLabel ? 'end-turn' : 'next-phase'}.png" alt="${endLabel ? 'End Turn' : 'Next Phase'}">
            </button>`}
          </footer>
        </section>

        ${screen === 'judge' ? judgePanelHtml(view) : html`<aside class="game__right">
          <div class="opps">
            <h4>${judge ? 'Players' : 'Opponents'}</h4>
            <div class="opps__list">
              ${others.map(p => html`
                <button type="button" class="opp ${p.playerId === view.activePlayerId ? 'is-active' : ''} ${p.eliminated ? 'is-out' : ''} ${prompt.kind === 'waiting' && prompt.playerId === p.playerId ? 'is-waiting' : ''}" data-act="opponent" data-id="${p.playerId}" style="--player:${p.color}">
                  <span class="opp__name">${p.name}</span>
                  <b class="opp__life">${p.eliminated ? 'OUT' : p.life}</b>
                  <span class="opp__meta">✋${p.handCount} • ▤${p.libraryCount} • ⚔${p.battlefield.filter(c => c.creature).length}${p.poison ? ` • ☠${p.poison}` : ''}</span>
                  <span class="opp__mana">${['W', 'U', 'B', 'R', 'G', 'C'].filter(c => p.mana.fixed[c]).map(c => html`<i><img src="assets/img/mana/${c}.png" alt="${c}">${p.mana.fixed[c]}</i>`)}${p.mana.flex.length ? html`<i><img src="assets/img/mana/any.png" alt="any">${p.mana.flex.reduce((n, g) => n + g.count, 0)}</i>` : ''}</span>
                </button>`)}
            </div>
          </div>
          <div class="glog">
            <header><button type="button" class="link-btn glog__title" data-act="log">Game Log</button><button type="button" class="chip ${view.stack.length ? 'chip--gold' : 'chip--none'}" data-act="stack">Stack (${view.stack.length})</button></header>
            <ol class="glog__list">${view.log.slice(0, 14).map(e => html`<li class="glog__row glog__row--${e.type || 'plain'}">${e.text}</li>`)}</ol>
            <button type="button" class="btn-art glog__undo" data-act="undo" ${view.canUndo ? '' : raw('disabled')}><img src="assets/img/game/undo.png" alt="Undo"></button>
          </div>
        </aside>`}
        ${ui.curtainFor ? html`<button type="button" class="curtain" data-act="curtain"><img src="assets/img/ui/crest.png" alt=""><b>Pass the device to ${view.players.find(p => p.playerId === ui.curtainFor)?.name || 'the next player'}</b><em>Tap when ready</em></button>` : ''}
      </main>`);

      for (const el of root.querySelectorAll('[data-keep-scroll]')) {
        const s = scroll[el.dataset.keepScroll];
        if (s) { el.scrollLeft = s[0]; el.scrollTop = s[1]; }
      }
      startTimer(view);
    }

    function startTimer(view) {
      clearInterval(ui.timer);
      const deadline = view.prompt.kind === 'priority' ? view.prompt.deadline : null;
      const el = root.querySelector('[data-timer]');
      if (!deadline || !el) return;
      const tick = () => { el.textContent = `${Math.max(0, Math.ceil((deadline - Date.now()) / 1000))}s`; };
      tick();
      ui.timer = setInterval(tick, 500);
    }

    // ── prompts ────────────────────────────────────────────────────────────────
    function promptKeyOf(view) {
      const p = view.prompt;
      return [view.you, p.kind, p.decision?.key, p.stackId, p.need, p.mulligans, p.label, view.turn, p.rows?.length].join('|');
    }

    function closePrompt() {
      const close = ui.closePrompt;
      ui.closePrompt = null;
      close?.();
    }

    function openPrompt(view, { manual = false } = {}) {
      closePrompt();
      const p = view.prompt;
      const opened = close => { ui.closePrompt = close; };
      const minimize = () => { ui.minimized = true; closePrompt(); };
      switch (p.kind) {
        case 'opening': return opened(openOpeningHand(ctx));
        case 'decision': return opened(openDecision(ctx, p.decision, { minimize }));
        case 'blocks': return opened(openBlocks(ctx, p.rows, { minimize }));
        case 'discard': return opened(openDiscard(ctx, p.need, { minimize }));
        case 'vote': return opened(openVote(ctx));
        case 'guided': return manual ? opened(openGuided(ctx)) : null;
        case 'complete': return opened(openPostGame(ctx, leave));
        default: return null;
      }
    }

    function update() {
      const view = session?.view();
      if (!view) return render();
      const viewer = view.you;
      // Single device: hide the board while the device changes hands.
      if (session.role === 'local' && ui.lastViewer !== undefined && viewer !== ui.lastViewer && view.status !== 'complete' && loadSettings().handoff !== false && view.players.length > 1) {
        ui.curtainFor = viewer;
        closeAllModals();
        ui.closePrompt = null;
      }
      ui.lastViewer = viewer;
      ui.highlight = new Set();
      render();
      if (ui.curtainFor) return;
      const key = promptKeyOf(view);
      if (key !== ui.promptKey) {
        ui.promptKey = key;
        ui.minimized = false;
        openPrompt(view);
        if (view.prompt.kind === 'guided') toast(`${view.prompt.name}: resolve this card by hand, then press RESOLVE.`);
      }
      if (view.status === 'complete' && !ui.recorded) { ui.recorded = true; }
    }

    async function leave({ finished = false } = {}) {
      if (!finished && session && session.view()?.status !== 'complete') {
        const hosting = session.role !== 'client';
        const ok = await confirmDialog({
          title: 'Leave game', confirmLabel: 'Leave',
          message: hosting ? 'The game is saved on this device. You can pick it up again with Continue Game.' : 'You can rejoin with the same room code while the host keeps the game open.'
        });
        if (!ok) return;
      }
      endSession({ keepSave: !finished });
      go('landing');
    }

    // ── input ──────────────────────────────────────────────────────────────────
    function runOption(view, o) {
      switch (o.act) {
        case 'pass': return send({ type: 'pass' });
        case 'next-phase': return send({ type: 'next-phase' });
        case 'end-turn': return endTurn(view);
        case 'attack': return openAttack(ctx);
        case 'card': ui.highlight = new Set([o.id]); render(); return openCardDetail(ctx, o.id);
        default: return openPrompt(view, { manual: true });
      }
    }

    /** The jewel always lays out everything the player can do, with the suggestion first. */
    function doJewel(view) {
      const j = view.coach?.jewel;
      if (!j) return;
      const opts = view.coach.options || [];
      if (!opts.length) return runOption(view, { act: j.act });
      if (opts.length === 1) return runOption(view, opts[0]);
      if (j.ids) { ui.highlight = new Set(j.ids); render(); }
      openModal({
        title: 'What you can do now', size: 'small',
        body: html`<div class="option-list jewel-options">${opts.map((o, i) => html`<button type="button" class="option ${o.best ? 'is-on' : ''}" data-opt="${i}" data-opt-act="${o.act}"><span><strong>${o.label}${o.best ? html` <em class="option__best">Suggested</em>` : ''}</strong>${o.sub ? html`<small>${o.sub}</small>` : ''}</span></button>`)}</div>`,
        onMount(el, { close }) { on(el, 'click', '[data-opt]', (event, b) => { close(); runOption(view, opts[Number(b.dataset.opt)]); }); }
      });
    }

    async function endTurn(view) {
      if (view.rules.endTurnConfirm !== false && view.phase !== 'postcombat-main') {
        const ok = await confirmDialog({ title: 'End turn', message: 'End your turn now? You will skip any steps you have left.', confirmLabel: 'End turn' });
        if (!ok) return;
      }
      send({ type: 'end-turn' });
    }

    offs.push(on(root, 'click', '[data-act]', (event, el) => {
      const view = session?.view();
      const act = el.dataset.act;
      if (act === 'home') return leave();
      if (!view) return;
      const focusId = view.you || ui.focusId || view.activePlayerId;
      switch (act) {
        case 'curtain': ui.curtainFor = null; ui.promptKey = ''; return update();
        case 'card':
        case 'open-card': return openCardDetail(ctx, el.dataset.id);
        case 'commander': return el.dataset.id ? openCardDetail(ctx, el.dataset.id) : openPlayerInfo(ctx, focusId);
        case 'zone': return openZone(ctx, focusId, el.dataset.zone);
        case 'opponent': return openPlayerBoard(ctx, el.dataset.id, { onFocus: view.you ? null : id => { ui.focusId = id; render(); } });
        case 'player-info': return openPlayerInfo(ctx, el.dataset.id);
        case 'table': return openTable(ctx);
        case 'tools': return openHostTools(ctx);
        case 'screen': ui.screen = el.dataset.screen; return render();
        case 'reverse': {
          const play = (view.plays || []).find(p => p.id === el.dataset.id);
          if (!play) return;
          const later = view.plays.filter(p => p.seq > play.seq).length;
          return confirmDialog({ title: 'Reverse play', message: `Take back "${play.text}"${later ? ` and the ${later} play${later === 1 ? '' : 's'} after it` : ''}? The game goes back to just before it.`, confirmLabel: 'Reverse' })
            .then(ok => ok && send({ type: 'reverse', playId: play.id }));
        }
        case 'counters': return openPlayerInfo(ctx, focusId);
        case 'sort': ui.sort = ui.sort === 'played' ? 'type' : ui.sort === 'type' ? 'power' : 'played'; return render();
        case 'jewel': return doJewel(view);
        case 'coach': return view.coach?.tip && view.players.find(p => p.playerId === view.you)?.advice !== false ? toast(`Tip: ${view.coach.tip}`, { ms: 5200 }) : doJewel(view);
        case 'phase-info': return openJudge({ query: view.phaseLabel.toLowerCase().includes('main') ? 'main phase' : view.phaseLabel.toLowerCase() });
        case 'next-phase': return send({ type: 'next-phase' });
        case 'end-turn': return endTurn(view);
        case 'log': return openLog(ctx);
        case 'stack': return openStack(ctx);
        case 'undo': return confirmDialog({ title: 'Undo', message: 'Undo the last action for the whole table?', confirmLabel: 'Undo' }).then(ok => ok && send({ type: 'undo' }));
        case 'chat': ui.chatSeen = view.chat?.length || 0; return openChat(ctx);
        case 'card-id': return openCardId(ctx);
        case 'help': return openJudge();
        case 'settings': return openGameSettings(ctx, leave);
        case 'profile': return openPlayerInfo(ctx, focusId);
      }
    }));

    function boot() {
      offs.push(session.onChange(update));
      update();
    }

    if (session) boot();
    else if (params.resume) {
      const loading = text => { const el = root.querySelector('.game__loading'); if (el) el.textContent = text; };
      resumeSavedSession({ onStatus: loading }).then(s => {
        if (!s) { toast('No saved game was found.', { bad: true }); return go('landing'); }
        session = s;
        if (s.net) { window.__ccRoomCode = s.net.code; toast(`Room ${s.net.code} is open again. Players reconnect to their seats automatically.`, { ms: 5000 }); }
        boot();
      });
    } else { go('landing'); }

    return () => {
      clearInterval(ui.timer);
      closePrompt();
      for (const off of offs) off();
    };
  }
};
