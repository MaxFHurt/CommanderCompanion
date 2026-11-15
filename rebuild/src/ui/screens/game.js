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

/** The commanders' combined color identity, or null (show every color) when it is unknown. */
function identityOf(view, player) {
  const defs = (player?.commanders || []).map(c => view.defs[c.def]).filter(Boolean);
  if (!defs.length) return null;
  return [...new Set(defs.flatMap(d => d.colorIdentity || []))];
}
import { openJudge } from '../judge-modal.js';
import { openDecision } from '../game/decision.js';
import { openAttack, openBlocks } from '../game/combat-ui.js';
import { openCardDetail, openZone, openPlayerBoard, openTable, tableHtml, openPile } from '../game/card-modals.js';
import { openHostTools } from '../game/host-tools.js';
import { boardHtml } from '../game/board-view.js';
import { statusLight, playControls, seatLayout, rotateTo, opponentsInOrder, PHONE_QUERY, logLength } from '../game/play-state.js';
import { openOpeningHand, openDiscard, openGuided, openVote, openProposal, openCorrection, openPostGame, openLog, openStack, openChat, openGameSettings, openCardId, openPlayerInfo } from '../game/panels.js';

const PHASE_STEPS = [['untap', 'Untap'], ['upkeep', 'Upkeep'], ['draw', 'Draw'], ['precombat-main', 'Main 1'], ['combat', 'Combat'], ['postcombat-main', 'Main 2'], ['end-step', 'End']];
const COMBAT = ['combat', 'begin-combat', 'declare-attackers', 'declare-blockers', 'combat-damage', 'end-combat'];

function phaseKey(phase) { return COMBAT.includes(phase) ? 'combat' : phase === 'cleanup' ? 'end-step' : phase; }

export const gameScreen = {
  mount(root, params = {}) {
    let session = getSession();
    const offs = [];
    const ui = { screen: null, seenNotices: new Set(), promptKey: '', closePrompt: null, minimized: false, curtainFor: null, lastViewer: undefined, focusId: null, sort: 'played', highlight: new Set(), timer: null, recorded: false, chatSeen: 0, seats: null };
    const phoneMq = typeof matchMedia === 'function' ? matchMedia(PHONE_QUERY) : null;
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
      // A playing host has no judge powers: their own board and the table only.
      if (session?.role === 'host-player' && view.you) return ['player', 'table'];
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

    const LIGHT_TEXT = { green: 'healthy', yellow: 'temporary status', red: 'poison or a harmful lasting effect' };
    /** The status light beside a player's life: its own button, opening that player's details (never rotates seats). */
    function lightHtml(p) {
      const { level, reasons } = statusLight(p);
      return html`<button type="button" class="life-light is-${level}" data-act="player-info" data-id="${p.playerId}" data-light="${level}" aria-label="${p.name}: ${LIGHT_TEXT[level]}${reasons.length ? ` (${reasons.join(', ')})` : ''}" title="${reasons.join(', ') || 'Healthy'}"><i></i></button>`;
    }

    function seatMeta(p) {
      return html`<span class="seat__meta">✋${p.handCount} • ▤${p.libraryCount} • ⚔${p.battlefield.filter(c => c.creature).length}${p.poison ? ` • ☠${p.poison}` : ''}</span>`;
    }

    function seatCls(view, p) {
      return `${p.playerId === view.activePlayerId ? 'is-active' : ''} ${p.eliminated ? 'is-out' : ''} ${view.prompt.kind === 'waiting' && view.prompt.playerId === p.playerId ? 'is-waiting' : ''}`;
    }

    /** A compact left/right seat: tapping it brings that opponent to the centre. */
    function sideSeatHtml(view, p, side) {
      return html`<div class="seat seat--side ${seatCls(view, p)}" data-side="${side}" data-id="${p.playerId}" style="--player:${p.color}">
        <button type="button" class="seat__main" data-act="seat" data-id="${p.playerId}" aria-label="Show ${p.name} in the centre">
          <span class="seat__name"><i class="status-light ${p.eliminated ? 'is-out' : p.playerId === view.activePlayerId ? 'is-active' : ''}"></i>${p.name}</span>
          <b class="seat__life">${p.eliminated ? 'OUT' : p.life}</b>
          ${seatMeta(p)}
        </button>
        ${lightHtml(p)}
      </div>`;
    }

    /** The centre opponent: seat (tap opens their board) and their whole battlefield. Hand count only. */
    function centreSeatHtml(view, p) {
      const cards = [...p.battlefield.filter(c => !c.land), ...p.battlefield.filter(c => c.land)];
      return html`<div class="zone zone--opp seat seat--centre ${seatCls(view, p)}" data-id="${p.playerId}" style="--player:${p.color}; ${matFor(p)}">
        <header class="seat__head">
          <button type="button" class="seat__main" data-act="opponent" data-id="${p.playerId}" aria-label="Open ${p.name}'s board">
            <span class="seat__name"><i class="status-light ${p.eliminated ? 'is-out' : p.playerId === view.activePlayerId ? 'is-active' : ''}"></i>${p.name}</span>
            ${seatMeta(p)}
            <b class="seat__life">${p.eliminated ? 'OUT' : p.life}</b>
          </button>
          ${lightHtml(p)}
        </header>
        <div class="zone__cards" data-keep-scroll="opp-${p.playerId}">
          ${cards.length ? cards.map(c => cardHtml(c, view.defs[c.def], { cls: c.land ? 'card--land' : '', zone: 'battlefield', badge: c.attacking ? '⚔' : c.blocking ? '🛡' : '' }))
            : html`<p class="zone__empty">No permanents.</p>`}
        </div>
      </div>`;
    }

    function oppRowHtml(view, me) {
      const opps = opponentsInOrder(view.players, me.playerId);
      ui.seats = seatLayout(opps.map(p => p.playerId), ui.seats);
      if (!ui.seats.centre) return '';
      const byId = id => view.players.find(p => p.playerId === id);
      return html`<div class="opp-row" data-count="${opps.length}">
        <div class="opp-side opp-side--left">${ui.seats.left.map(id => sideSeatHtml(view, byId(id), 'left'))}</div>
        ${centreSeatHtml(view, byId(ui.seats.centre))}
        <div class="opp-side opp-side--right">${ui.seats.right.map(id => sideSeatHtml(view, byId(id), 'right'))}</div>
      </div>`;
    }

    /** Draw / Attack / Next Phase / End Turn (and Pass or a reopened prompt), each only when it is legal now. */
    function controlsHtml(view) {
      const list = playControls(view);
      return html`<div class="play-controls" data-count="${list.length}">${list.map(c => html`
        <button type="button" class="jewel play-btn play-btn--${c.act}" data-act="${c.act}" data-label="${c.label}">
          <i class="jewel__gem"></i><span>${c.label}</span>${c.act === 'pass' ? html`<small data-timer></small>` : ''}
        </button>`)}</div>`;
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
      const chatNew = (view.chat?.length || 0) - ui.chatSeen;
      const phone = !!phoneMq?.matches;

      if (!judge) {
        // The seat's own board: the handoff's gameplay layout (board-view.js). The host's table and Judge screens below keep
        // the earlier layout for now.
        setHtml(root, html`
        <main class="game game--gp ${phone ? 'gp--phone' : 'gp--tablet'} ${myTurn ? 'is-my-turn' : ''}" data-mode="${view.mode}" data-guidance="${settings.guidance}">
          ${boardHtml({ view, focus, ui, phone, screens, screen, sorted, glow, chatNew })}
          ${ui.curtainFor ? html`<button type="button" class="curtain" data-act="curtain"><img src="assets/img/ui/crest.png" alt=""><b>Pass the device to ${view.players.find(p => p.playerId === ui.curtainFor)?.name || 'the next player'}</b><em>Tap when ready</em></button>` : ''}
        </main>`);
        for (const el of root.querySelectorAll('[data-keep-scroll]')) {
          const s = scroll[el.dataset.keepScroll];
          if (s) { el.scrollLeft = s[0]; el.scrollTop = s[1]; }
        }
        startTimer(view);
        return;
      }

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
                ${lightHtml(focus)}
                ${focus.poison ? html`<span class="chip chip--bad">☠ ${focus.poison}</span>` : ''}
                ${focus.statuses.slice(0, 2).map(s => html`<span class="chip chip--gold">${s}</span>`)}
              </div>
            </div>
          </div>
          <div class="rail-mana">
            <h4>Available Mana <b>${focus.mana.total}</b></h4>
            ${manaPoolHtml(focus.mana, { identity: identityOf(view, focus) })}
          </div>
          <div class="rail-zones">
            ${[['graveyard', focus.graveyard.length], ['exile', focus.exile.length], ['tokens', tokens], ['attachments', attached]].map(([z, n]) => html`
              <button type="button" class="rail-zone ${(focus[z] || []).some?.(c => c.playable) ? 'is-playable' : ''}" data-act="zone" data-zone="${z}"><img src="assets/img/game/zone-${z}.png" alt="${z}"><i>${n}</i></button>`)}
          </div>
          ${screens.length > 1 ? html`<div class="rail-host">${switchHtml(view, screens, screen)}</div>` : ''}
        </aside>`}

        <section class="game__center">
          ${judge ? html`<div class="zone zone--table" data-keep-scroll="table">${tableHtml(view)}</div>` : html`
          ${oppRowHtml(view, focus)}
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
          `}
          <footer class="game__bar">
            <button type="button" class="phase-box" data-act="phase-info">
              <b>Turn ${view.turn} — ${view.phaseLabel}${view.dayNight ? ` · ${view.dayNight === 'night' ? 'Night' : 'Day'}` : ''}</b>
              <span class="phase-track">${PHASE_STEPS.map(([k, label]) => html`<i class="${phaseKey(view.phase) === k ? 'is-on' : ''}" title="${label}"></i>`)}</span>
            </button>
            ${judge ? html`
            ${screens.length > 1 ? switchHtml(view, screens, screen) : html`<span></span>`}
            ${view.canEdit ? html`<button type="button" class="btn" data-act="tools">Host Tools</button>` : html`<span></span>`}` : html`
            <button type="button" class="tip ${showCoach ? '' : 'is-quiet'}" data-act="coach">
              <b>${coach.headline || ''}</b>
              ${advice ? html`<span>${coach.detail || ''}</span>` : ''}
            </button>
            ${controlsHtml(view)}`}
          </footer>
        </section>

        ${screen === 'judge' ? judgePanelHtml(view) : html`<aside class="game__right">
          ${judge ? html`<div class="opps">
            <h4>Players</h4>
            <div class="opps__list">
              ${others.map(p => html`
                <div class="seat seat--side ${seatCls(view, p)}" data-id="${p.playerId}" style="--player:${p.color}">
                  <button type="button" class="seat__main" data-act="opponent" data-id="${p.playerId}">
                    <span class="seat__name"><i class="status-light ${p.eliminated ? 'is-out' : p.playerId === view.activePlayerId ? 'is-active' : ''}"></i>${p.name}</span>
                    <b class="seat__life">${p.eliminated ? 'OUT' : p.life}</b>
                    ${seatMeta(p)}
                  </button>
                  ${lightHtml(p)}
                </div>`)}
            </div>
          </div>` : ''}
          <div class="glog ${phone ? 'glog--phone' : ''}">
            <header><button type="button" class="link-btn glog__title" data-act="log">Game Log</button></header>
            <ol class="glog__list">${view.log.slice(0, logLength(phone)).map(e => html`<li class="glog__row glog__row--${e.type || 'plain'}">${e.text}</li>`)}</ol>
          </div>
          <div class="game-tools">
            <button type="button" class="chip ${view.stack.length ? 'chip--gold' : 'chip--none'}" data-act="stack">Stack (${view.stack.length})</button>
            <button type="button" class="btn-art glog__undo" data-act="undo" ${view.canUndo || (view.canAskUndo && view.undoRule) ? '' : raw('disabled')}><img src="assets/img/game/undo.png" alt="Undo"></button>
            ${judge ? '' : html`<button type="button" class="chip" data-act="board">Board</button>`}
            <button type="button" class="chip" data-act="table">Table</button>
            ${view.correction?.mine ? html`<button type="button" class="chip chip--gold rail-tools" data-act="correction">Correcting…</button>`
              : view.canEdit ? html`<button type="button" class="chip rail-tools" data-act="tools">${view.mode === 'freeplay' ? 'Edit Game' : 'Host Tools'}</button>`
              : view.canChallenge ? html`<button type="button" class="chip rail-tools" data-act="challenge">Challenge</button>` : ''}
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
      return [view.you, p.kind, p.id, p.decision?.key, p.stackId, p.need, p.mulligans, p.label, view.turn, p.rows?.length].join('|');
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
        case 'proposal': return opened(openProposal(ctx));
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
      // One-off messages for this player (for example "Correction rejected").
      for (const n of view.notices || []) {
        if (ui.seenNotices.has(n.id)) continue;
        ui.seenNotices.add(n.id);
        toast(n.text, { bad: /rejected|declined/i.test(n.text), ms: 4500 });
        send({ type: 'seen-notice', id: n.id }, { quiet: true });
      }
    }

    async function leave({ finished = false } = {}) {
      if (!finished && session && session.view()?.status !== 'complete') {
        const hosting = session.role !== 'client';
        const ok = await confirmDialog({
          title: 'Leave game', confirmLabel: 'Leave',
          message: session.role === 'online' ? `The game is saved online. Open it again any time from Start Game → Online games (code ${session.code}).` : hosting ? 'The game is saved on this device. You can pick it up again with Continue Game.' : 'You can rejoin with the same room code while the host keeps the game open.'
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
        case 'pile': return openPile(ctx, (el.dataset.ids || '').split(',').filter(Boolean));
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
        case 'seat': ui.seats = rotateTo(ui.seats, el.dataset.id); return render();
        case 'board': return openPlayerBoard(ctx, focusId);
        case 'pass': return send({ type: 'pass' });
        case 'attack': return openAttack(ctx);
        case 'prompt': ui.minimized = false; return openPrompt(view, { manual: true });
        case 'coach': return view.coach?.tip && view.players.find(p => p.playerId === view.you)?.advice !== false ? toast(`Tip: ${view.coach.tip}`, { ms: 5200 }) : doJewel(view);
        case 'phase-info': return openJudge({ query: view.phaseLabel.toLowerCase().includes('main') ? 'main phase' : view.phaseLabel.toLowerCase() });
        case 'next-phase': return send({ type: 'next-phase' });
        case 'end-turn': return endTurn(view);
        case 'log': return openLog(ctx);
        case 'stack': return openStack(ctx);
        case 'undo':
          if (view.canUndo) return confirmDialog({ title: 'Undo', message: 'Undo the last action for the whole table?', confirmLabel: 'Undo' }).then(ok => ok && send({ type: 'undo' }));
          if (!view.undoRule) return toast('Undo is off for this game. It is chosen in the table rules before the game starts.');
          return confirmDialog({ title: 'Ask to undo', message: `Ask the other players to undo ${view.lastPlay ? `"${view.lastPlay.text}"` : 'the last play'}? Everyone still in the game must accept.`, confirmLabel: 'Ask' })
            .then(async ok => { if (ok && (await send({ type: 'ask-undo' })).ok) toast('Waiting for the other players.'); });
        case 'challenge': {
          return confirmDialog({ title: 'Challenge', message: `Challenge ${view.lastPlay ? `"${view.lastPlay.text}"` : 'the last play'}? If everyone agrees, you propose the correction.`, confirmLabel: 'Challenge' })
            .then(async ok => { if (ok && (await send({ type: 'challenge' })).ok) toast('Waiting for the other players.'); });
        }
        case 'correction': return openCorrection(ctx);
        case 'chat': ui.chatSeen = view.chat?.length || 0; return openChat(ctx);
        case 'card-id': return openCardId(ctx);
        case 'help': return openJudge();
        case 'settings': return openGameSettings(ctx, leave);
        case 'profile': return openPlayerInfo(ctx, focusId);
      }
    }));

    function boot() {
      offs.push(session.onChange(update));
      // The log length follows the screen size (phone: three entries), so a rotation or resize redraws.
      if (phoneMq?.addEventListener) { const redraw = () => render(); phoneMq.addEventListener('change', redraw); offs.push(() => phoneMq.removeEventListener('change', redraw)); }
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
