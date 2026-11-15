// The gameplay screen from the visual handoff's maps (board-layout.js): one stage per device with the chassis art,
// and every live value drawn in its recess. Class names the tests and other code rely on are kept (seat--centre,
// zone--battle/lands/hand, game__left/right, glog, play-btn, life-light, rail-name, rail-life__value, tip, phase-box),
// mostly on display:contents wrappers so each piece can sit at its own place on the stage.

import { html, raw } from '../dom.js';
import { cardHtml, cardBackHtml, imageOf } from '../card-view.js';
import { statusLight, playControls, seatLayout, opponentsInOrder, logLength } from './play-state.js';
import { BOARD, rectStyle, areaOf, AREAS, AREA_LABEL, manaCells, zoneLayout, pilesOf } from './board-layout.js';

const LIGHT_TEXT = { green: 'healthy', yellow: 'temporary status', red: 'poison or a harmful lasting effect' };
const FALLBACK = 'assets/img/game/commander-fallback.png';

/** Element attributes for a rect on the stage: class list + inline style. */
function at(rect, cls = '', opts = {}) {
  return raw(`class="gp-r ${cls}" style="${rectStyle(rect, opts)}${opts.extra || ''}"`);
}

function commanderArt(view, p) {
  const cmd = p.commanders?.[0];
  const def = cmd ? view.defs[cmd.def] : null;
  return imageOf(def, null, 'art_crop') || FALLBACK;
}

function lightHtml(p, rect, lens, cluster) {
  const { level, reasons } = statusLight(p);
  return html`<button type="button" ${at(rect, `life-light is-${level} is-clamp`, { face: lens, cluster })} data-act="player-info" data-id="${p.playerId}" data-light="${level}" aria-label="${p.name}: ${LIGHT_TEXT[level]}${reasons.length ? ` (${reasons.join(', ')})` : ''}" title="${reasons.join(', ') || 'Healthy'}"><i class="gp-face gp-lens"></i></button>`;
}

function seatCls(view, p) {
  return `${p.playerId === view.activePlayerId ? 'is-active' : ''} ${p.eliminated ? 'is-out' : ''} ${view.prompt.kind === 'waiting' && view.prompt.playerId === p.playerId ? 'is-waiting' : ''}`;
}

/** Split a seat slot's rects across several players sharing one side (5–6 player games): side by side, compact. */
function split(slot, n, i) {
  if (n <= 1) return { ...slot, compact: false };
  const [cx, cy, cw, ch] = slot.cluster;
  const w = cw / n, x = cx + w * i, lw = Math.min(50, w * 0.45);
  return {
    compact: true, cluster: [x, cy, w, ch], seat: [x, cy, w - lw, ch], id: [x + 1, cy + 1, w - lw - 2, ch - 6],
    idText: [x + 4, cy + 3, w - lw - 8, ch - 8], light: [x + w - lw, cy, lw, ch], lens: [x + w - lw / 2 - 7, cy + ch - 20, 14, 14]
  };
}

function seatHtml(view, p, slotName, L, i = 0, n = 1, extra = '') {
  const s = split(L.seats[slotName], n, i);
  const c = s.cluster;
  const centre = slotName === 'centre';
  const cmd = p.commanders?.[0];
  const life = p.eliminated ? 'OUT' : p.life;
  const act = centre ? 'opponent' : 'seat';
  const label = centre ? `Open ${p.name}'s board` : `Show ${p.name} in the centre`;
  const meta = `Hand ${p.handCount} · Tax ${cmd?.tax || 0} · Lib ${p.libraryCount}`;
  return html`<div class="seat ${centre ? 'seat--centre' : 'seat--side'} gp-contents ${seatCls(view, p)}" data-side="${slotName}" data-id="${p.playerId}" style="--player:${p.color}">
    ${s.compact ? '' : html`<img ${at(s.portrait, 'gp-portrait is-clamp', { cluster: c })} src="${commanderArt(view, p)}" alt="" onerror="this.onerror=null;this.src='${FALLBACK}'">`}
    <span ${at(s.id, 'gp-inset gp-id', { cluster: c })}></span>
    <button type="button" ${at(s.seat, 'seat__main gp-seat is-clamp', { face: s.idText, cluster: c })} data-act="${act}" data-id="${p.playerId}" aria-label="${label}">
      <span class="gp-face gp-idtext">
        <span class="seat__name">${p.name}</span>
        ${s.compact ? html`<b class="seat__life gp-mini-life">${life}</b>` : html`<small class="gp-cmd">${cmd?.name || ''}</small>`}
        <small class="seat__meta">${s.compact ? `H${p.handCount} · L${p.libraryCount}` : meta}${p.poison ? ` · ☠${p.poison}` : ''}</small>
        ${s.compact ? '' : html`<small class="gp-zonesline"><span>Grave ${p.graveyard.length}</span><span>Exile ${p.exile.length}</span>${centre ? html`<em>Focused</em>` : ''}</small>`}
      </span>
    </button>
    ${s.compact ? '' : html`<span ${at(s.die, 'gp-die', { cluster: c })}><b class="seat__life" data-digits="${String(life).length}">${life}</b></span>`}
    ${lightHtml(p, s.light, s.lens, c)}
    ${extra}
  </div>`;
}

/** A compact preview tile for one card or a pile of like cards (lands by name, identical tokens). */
function tileHtml(view, pile, opts) {
  const cards = pile.cards, c = cards[0], n = cards.length;
  const def = view.defs[c.def];
  const art = imageOf(def, c.face, 'art_crop');
  const tapped = cards.filter(x => x.tapped).length;
  const counters = {};
  for (const x of cards) for (const [k, v] of Object.entries(x.counters || {})) if (Number(v) > 0) counters[k] = (counters[k] || 0) + Number(v);
  const clips = cards.reduce((m, x) => m + (x.attachments?.length || 0), 0);
  const o = opts(c);
  const one = n === 1;
  const flags = [one && c.tapped ? 'is-turned' : '', tapped === n ? 'is-all-tapped' : '', c.token ? 'is-token' : '', cards.some(x => x.playable) ? 'is-playable' : '',
    cards.some(x => x.attacking) ? 'is-attacking' : '', cards.some(x => x.blocking) ? 'is-blocking' : '', o.cls || ''].filter(Boolean).join(' ');
  const meta = one ? (c.tapped ? 'Tapped' : (c.power !== null && c.power !== undefined ? `${c.power}/${c.toughness}` : '')) : `${n - tapped} ready${tapped ? ` · ${tapped} tapped` : ''}`;
  return html`<button type="button" class="card gp-tile ${flags}" data-act="${one ? 'card' : 'pile'}" data-id="${c.id}" data-ids="${cards.map(x => x.id).join(',')}" data-count="${n}" data-zone="battlefield" aria-label="${c.name}" title="${c.name}${one ? '' : ` ×${n}`}${tapped ? ` (${tapped} tapped)` : ''}">
    <span class="gp-tile__art"${art ? raw(` style="background-image:url('${art.replace(/'/g, '%27')}')"`) : ''}></span>
    <b class="gp-tile__name">${c.name}</b>
    ${n > 1 ? html`<i class="gp-tile__count">×${n}</i>` : ''}
    <small class="gp-tile__meta">${meta}</small>
    ${Object.keys(counters).length ? html`<span class="gp-tile__ctr">${Object.entries(counters).slice(0, 2).map(([k, v]) => html`<i>${k === '+1/+1' || k === '-1/-1' ? `${k}×${v}` : `${v} ${k}`}</i>`)}</span>` : ''}
    ${clips ? html`<span class="gp-tile__clip">⛓${clips}</span>` : ''}
    ${tapped ? html`<span class="gp-tile__tap" aria-hidden="true">↷</span>` : ''}
  </button>`;
}

/** One side's battlefield (owner, 15 Nov): zones share the band by content, creatures first (board-layout.js zoneLayout). */
function bandHtml(view, phone, side, groups, keyBase, opts, only = null) {
  const zones = zoneLayout(groups, phone ? 'phone' : 'tablet', side);
  return Object.entries(zones).filter(([area]) => !only || only.includes(area)).map(([area, z]) => {
    const cards = groups[area];
    const body = z.mode === 'compact'
      ? pilesOf(cards, area).map(p => tileHtml(view, p, opts))
      : cards.map(c => cardHtml(c, view.defs[c.def], opts(c)));
    return html`<div ${at(z.rect, `gp-cards gp-cards--${area} gp-cards--${z.mode}`)} role="group" aria-label="${AREA_LABEL[area]} (${cards.length})" data-keep-scroll="${keyBase}-${area}" data-area="${area}" data-mode="${z.mode}">${body}</div>`;
  });
}

function byArea(cards) {
  const out = Object.fromEntries(AREAS.map(a => [a, []]));
  for (const c of cards) out[areaOf(c)].push(c);
  return out;
}

function oppHtml(view, me, ui, L) {
  const opps = opponentsInOrder(view.players, me.playerId);
  ui.seats = seatLayout(opps.map(p => p.playerId), ui.seats);
  if (!ui.seats.centre) return '';
  const byId = id => view.players.find(p => p.playerId === id);
  const centre = byId(ui.seats.centre);
  const groups = byArea(centre.battlefield);
  const opts = c => ({ cls: c.land ? 'card--land' : '', zone: 'battlefield', badge: c.attacking ? '⚔' : c.blocking ? '🛡' : '' });
  return html`
    ${ui.seats.left.map((id, i) => seatHtml(view, byId(id), 'left', L, i, ui.seats.left.length))}
    ${ui.seats.right.map((id, i) => seatHtml(view, byId(id), 'right', L, i, ui.seats.right.length))}
    ${seatHtml(view, centre, 'centre', L, 0, 1, html`
      <span ${at(L.opp.title, 'gp-inset gp-title')}>${centre.name}'s Battlefield</span>
      ${bandHtml(view, L === BOARD.phone, 'opp', groups, `opp-${centre.playerId}`, opts)}`)}`;
}

const BOARD_EMPTY = [[104, 312, 898], [82, 368, 686]];
const SLOTS = { 1: ['phase'], 2: ['context', 'phase'], 3: ['context-top', 'phase', 'context-bottom'] };
const GLYPH = { attack: '⚔', 'next-phase': '»', 'end-turn': '⏭', pass: '✓', prompt: '◆' };

/** Draw / Attack / Next Phase / End Turn (and Pass or a reopened prompt), each only when legal, on the two jewels.
 * The jewel art sits exactly on the chassis housing and the label on the gem's centre (board-layout.js jewels). */
function controlsHtml(view, L) {
  const list = playControls(view).slice(0, 3);
  const slots = SLOTS[list.length] || [];
  const J = L.jewels;
  const split = slots.includes('context-top');
  const hit = slot => {
    const [x, y, w, h] = J[slot.startsWith('context') ? 'context' : 'phase'].hit;
    if (slot === 'context-top') return [x, y, w, h / 2];
    if (slot === 'context-bottom') return [x, y + h / 2, w, h / 2];
    return [x, y, w, h];
  };
  const labelAt = slot => {
    const j = J[slot.startsWith('context') ? 'context' : 'phase'];
    const [ax, ay, aw, ah] = j.art, dy = slot === 'context-top' ? -17 : slot === 'context-bottom' ? 17 : 0;
    return `--lx:${((j.centre[0] - ax) / aw * 100).toFixed(2)}%;--ly:${((j.centre[1] + dy - ay) / ah * 100).toFixed(2)}%;`;
  };
  const used = new Set(slots.map(s => (s.startsWith('context') ? 'context' : 'phase')));
  return html`${['context', 'phase'].filter(s => !used.has(s)).map(s => html`<span ${at(J[s].art, `gp-jewel-off gp-jewel--${s}`)} aria-hidden="true"></span>`)}
  ${split ? html`<span ${at(J.context.art, 'gp-jewel-art')} aria-hidden="true"></span>` : ''}
  <div class="play-controls gp-contents" data-count="${list.length}">${list.map((c, i) => html`
    <button type="button" ${at(hit(slots[i]), `jewel play-btn play-btn--${c.act} gp-jewel gp-jewel--${slots[i]} is-clamp`, { face: J[slots[i].startsWith('context') ? 'context' : 'phase'].art, extra: labelAt(slots[i]) })} data-act="${c.act}" data-label="${c.label}">
      <span class="gp-face${split && slots[i] !== 'phase' ? ' gp-face--noart' : ''}"><span class="gp-jewel__label"><i class="gp-glyph" aria-hidden="true">${GLYPH[c.act] || '◆'}</i><span>${c.label}</span></span>${c.act === 'pass' ? html`<small data-timer></small>` : ''}</span>
    </button>`)}</div>`;
}

function key(L, rect, act, label, cls = '', attrs = '') {
  return html`<button type="button" ${at(rect.hit, `gp-key ${cls} is-clamp`, { face: rect.face })} data-act="${act}" ${raw(attrs)}><span class="gp-face">${label}</span></button>`;
}

/**
 * The whole gameplay screen for a seat's own view. `o` carries what game.js already worked out:
 * { view, focus, ui, phone, screens, screen, sorted, glow, chatNew, matStyle }.
 */
export function boardHtml(o) {
  const { view, focus, ui, phone, screens } = o;
  const L = phone ? BOARD.phone : BOARD.tablet;
  const cmd = focus.commanders[0];
  const cmdDef = cmd ? view.defs[cmd.def] : null;
  const cmdCard = cmd ? focus.command.find(c => c.def === cmd.def) : null;
  const tokens = focus.battlefield.filter(c => c.token).length;
  const attached = focus.battlefield.filter(c => c.attachedTo).length;
  const groups = byArea(o.sorted.concat(focus.battlefield.filter(c => c.land)));
  const battleOpts = c => ({ cls: o.glow(c) + (c.land ? ' card--land' : ''), zone: 'battlefield', badge: c.attacking ? '⚔' : c.blocking ? '🛡' : c.sick ? '💤' : '' });
  const myTurn = view.activePlayerId === focus.playerId;
  const life = focus.eliminated ? 'OUT' : focus.life;
  const nav = L.nav;
  const advice = view.players.find(p => p.playerId === view.you)?.advice !== false;
  const coach = view.coach || {};
  const cells = manaCells(focus.mana);
  const T = L.tools;
  const rail = L.log.cluster;
  const tool = (r, act, label, cls = '', attrs = '') => html`<button type="button" ${at(r.hit, `gp-key gp-tool ${cls} is-clamp`, { face: r.face, cluster: rail })} data-act="${act}" ${raw(attrs)}><span class="gp-face">${label}</span></button>`;
  const undoOk = view.canUndo || (view.canAskUndo && view.undoRule);
  const other = screens.find(s => s !== 'player');

  return html`
    <div class="gp-mat"></div>
    <div class="gp-stage"><div class="gp-layer">
      <div class="gp-chassis"></div>

      ${key(L, nav.home, 'home', 'Home')}
      ${key(L, nav['card-id'], 'card-id', 'Card ID')}
      ${key(L, nav.chat, 'chat', html`Chat${o.chatNew > 0 ? html`<i class="dot">${o.chatNew}</i>` : ''}`)}
      ${key(L, nav.help, 'help', 'Help')}
      ${key(L, nav.settings, 'settings', 'Settings')}
      ${key(L, nav.profile, 'profile', 'Profile')}
      ${screens.length > 1 && other ? key(L, nav.screen, 'screen', other === 'table' ? 'Table view' : 'Judge', 'screen-switch__btn', `data-screen="${other}"`) : ''}
      <h1 ${at(L.wordmark, 'gp-wordmark')}>Commander Companion</h1>

      ${oppHtml(view, focus, ui, L)}

      <span ${at(L.mine.title, 'gp-inset gp-title')}>Your Battlefield</span>
      ${view.mode === 'freeplay' ? html`<span ${at(L.mine.chip, 'gp-chip')}><span class="chip">FREE PLAY</span></span>` : ''}
      <button type="button" ${at(L.heading.phase.hit, 'gp-key gp-readout phase-box is-clamp', { face: L.heading.phase.face })} data-act="phase-info"><span class="gp-face"><b>Turn ${view.turn} · ${view.phaseLabel}${view.dayNight ? ` · ${view.dayNight === 'night' ? 'Night' : 'Day'}` : ''}</b></span></button>
      ${key(L, L.heading.counters, 'counters', 'Counters', 'gp-readout')}
      ${key(L, L.heading.sort, 'sort', `Sort: ${ui.sort === 'played' ? 'Played' : ui.sort === 'type' ? 'Type' : 'Power'}`, 'gp-readout')}
      ${key(L, L.heading.view, 'table', 'View Full', 'gp-readout', 'data-view-full="1"')}
      <div class="zone zone--battle gp-contents">
        ${bandHtml(view, phone, 'mine', groups, 'bf', battleOpts, ['creatures', 'planeswalkers', 'enchantments', 'artifacts'])}
        ${focus.battlefield.length ? '' : html`<p ${at([BOARD_EMPTY[phone ? 0 : 1][0], BOARD_EMPTY[phone ? 0 : 1][1], BOARD_EMPTY[phone ? 0 : 1][2], 20], 'zone__empty gp-empty')}>Creatures, artifacts, enchantments and lands you play appear here.</p>`}
      </div>
      <div class="zone zone--lands gp-contents">
        ${bandHtml(view, phone, 'mine', groups, 'bf', battleOpts, ['lands'])}
      </div>

      <div class="game__right gp-contents">
        <div class="glog gp-contents ${phone ? 'glog--phone' : ''}">
          <button type="button" ${at(L.log.hit, 'gp-key gp-logtitle link-btn glog__title is-clamp', { face: L.log.face, cluster: rail })} data-act="log"><span class="gp-face">Game Log</span></button>
          <ol ${at(L.log.rows, 'glog__list gp-logrows', { cluster: rail })}>${view.log.slice(0, logLength(phone)).map(e => html`<li class="glog__row glog__row--${e.type || 'plain'}">${e.text}</li>`)}</ol>
        </div>
        <div class="game-tools gp-contents">
          ${tool(T.stack, 'stack', `Stack ${view.stack.length}`, view.stack.length ? 'is-hot' : '')}
          ${tool(T.undo, 'undo', 'Undo', 'glog__undo', undoOk ? '' : 'disabled')}
          ${tool(T.board, 'board', 'Board')}
          ${tool(T.table, 'table', 'Table')}
          ${view.correction?.mine ? tool(T.host, 'correction', 'Correcting…', 'rail-tools is-hot')
            : view.canEdit ? tool(T.host, 'tools', view.mode === 'freeplay' ? 'Edit Game' : 'Host Tools', 'rail-tools')
            : view.canChallenge ? tool(T.host, 'challenge', 'Challenge', 'rail-tools') : ''}
        </div>
      </div>

      ${controlsHtml(view, L)}

      <div class="game__left gp-contents" style="--player:${focus.color}">
        <img ${at(L.local.portrait, 'gp-portrait is-clamp')} src="${imageOf(cmdDef, null, 'art_crop') || FALLBACK}" alt="" onerror="this.onerror=null;this.src='${FALLBACK}'">
        <button type="button" ${at(L.local.commander, `rail-cmd__card gp-cmdbtn is-clamp ${cmdCard?.playable ? 'is-playable' : ''} ${cmdCard && ui.highlight.has(cmdCard.id) ? 'is-suggested' : ''}`)} data-act="commander" data-id="${cmdCard?.id || ''}" aria-label="Commander: ${cmd?.name || 'none'}">
          ${cmd && cmd.zone !== 'command' ? html`<span class="rail-cmd__zone">${cmd.zone === 'battlefield' ? 'IN PLAY' : cmd.zone.toUpperCase()}</span>` : ''}
        </button>
        <span ${at(L.local.id, 'gp-inset gp-id')}></span>
        <div ${at(L.local.name, 'rail-name gp-name')}><i class="status-light ${focus.eliminated ? 'is-out' : myTurn ? 'is-active' : ''}"></i><strong>${focus.name}</strong></div>
        <div ${at(L.local.sub, 'gp-sub')}>${cmd?.name || 'No commander'} · Tax ${cmd?.tax || 0}</div>
        <span ${at(L.local.die, 'gp-die gp-die--local')}><b class="rail-life__value" data-digits="${String(life).length}">${life}</b></span>
        ${lightHtml(focus, L.local.light, L.local.lens)}
        <span ${at(L.local.lib, 'gp-lib')}>Lib ${focus.libraryCount}</span>
        ${[['graveyard', 'Grave', focus.graveyard.length], ['exile', 'Exile', focus.exile.length], ['tokens', 'Tokens', tokens], ['attachments', 'Attach.', attached]].map(([z, label, n]) => html`
          <button type="button" ${at(L.local.zones[z].hit, `gp-key gp-zone rail-zone is-clamp ${(focus[z] || []).some?.(c => c.playable) ? 'is-playable' : ''}`, { face: L.local.zones[z].face })} data-act="zone" data-zone="${z}" aria-label="${label} ${n}"><span class="gp-face gp-inset">${label} ${n}</span></button>`)}
      </div>

      <div ${at(L.mana.well, 'gp-inset gp-mana')} data-total="${focus.mana.total}" aria-label="Available mana ${focus.mana.total}">
      </div>
      <span ${at(L.mana.label, 'gp-manalabel')}>Mana</span>
      ${cells.map((c, i) => html`<span ${at([L.mana.cell0[0] + L.mana.pitch * i, ...L.mana.cell0.slice(1)], `gp-manacell ${c.count ? '' : 'is-zero'}`)} data-mana="${c.key}" data-count="${c.count}" title="${c.title}"><img src="${c.icon}" alt="${c.key}"><b>${c.count}</b></span>`)}
      <span ${at(L.mana.total, 'gp-manatotal')}><b>${focus.mana.total}</b> Available</span>

      <button type="button" ${at(L.tip, `gp-key tip is-clamp ${coach.headline ? '' : 'is-quiet'}`)} data-act="coach"><b>${coach.headline || ''}</b>${advice && coach.detail ? html` <span>${coach.detail}</span>` : ''}</button>

      <span ${at(L.hand.title, 'gp-inset gp-title gp-handtitle')}>Your Hand · ${focus.handCount}</span>
      <div class="zone zone--hand gp-contents">
        <div ${at(L.hand.cards, 'gp-cards gp-hand is-clamp')} data-keep-scroll="hand">
          ${focus.hand ? (focus.hand.length ? focus.hand.map(c => cardHtml(c, view.defs[c.def], { cls: `card--hand ${o.glow(c)}`, zone: 'hand' })) : html`<p class="zone__empty">Your hand is empty.</p>`)
            : html`<div class="hand-backs">${Array.from({ length: Math.min(focus.handCount, 12) }, () => cardBackHtml())}</div>`}
        </div>
      </div>
    </div></div>`;
}
