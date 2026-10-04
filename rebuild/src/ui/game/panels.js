// The remaining in-game popups: opening hand, cleanup discard, by-hand resolution, votes,
// game over, log, stack, chat, settings, card lookup and player details.

import { html, on, $, $$, setHtml } from '../dom.js';
import { openModal, confirmDialog } from '../modal.js';
import { toast } from '../toast.js';
import { cardHtml, cardDetailHtml, oracleHtml } from '../card-view.js';
import { loadSettings, saveSettings } from '../../data/store.js';
import { searchCards } from '../../data/card-api.js';
import { recordGame, loadProfile } from '../../data/profile.js';
import { earnedLabels } from '../../data/achievements.js';
import { openHostTools, openRulesEdit, openEndGame } from './host-tools.js';
import { openCardDetail, openTable } from './card-modals.js';

const me = view => view.players.find(p => p.playerId === view.you);

// ── Opening hand ────────────────────────────────────────────────────────────────
export function openOpeningHand(ctx) {
  const view = ctx.view, p = me(view), prompt = view.prompt;
  const picked = new Set();
  const lands = p.hand.filter(c => c.land).length;
  const advice = lands < 2 ? 'Only a few lands — a mulligan is reasonable.' : lands > 5 ? 'Mostly lands — a mulligan is reasonable.' : 'A playable mix of lands and spells.';
  const modal = openModal({
    title: `${p.name} — opening hand`, size: 'full', dismissible: false,
    body: html`<div class="decision">
      <p class="decision__prompt">${prompt.rule}. Mulligans so far: ${prompt.mulligans}.
        ${prompt.bottom ? html`<b>To keep, tap ${prompt.bottom} card${prompt.bottom === 1 ? '' : 's'} to put on the bottom of your library.</b>` : ''}</p>
      ${loadSettings().guidance !== 'rules' ? html`<p class="muted">${lands} land${lands === 1 ? '' : 's'} in hand. ${advice}</p>` : ''}
      <div class="card-grid card-grid--hand">${p.hand.map(c => cardHtml(c, view.defs[c.def], { act: 'pick-bottom' }))}</div>
      <p class="decision__count" data-count></p></div>`,
    actions: [
      { label: 'Mulligan', kind: 'cancel', disabled: !prompt.canMulligan, onClick: async () => { await ctx.send({ type: 'mulligan' }); } },
      { label: 'Keep hand', kind: 'confirm', id: 'keepHand', onClick: async () => { await ctx.send({ type: 'keep', bottom: [...picked] }); } }
    ],
    onMount(el) {
      const sync = () => {
        $('[data-count]', el).textContent = prompt.bottom ? `Bottom: ${picked.size} of ${prompt.bottom}` : 'Tap and hold nothing — just choose Keep or Mulligan.';
        if (!prompt.bottom) $('[data-count]', el).textContent = '';
        $('#keepHand', el).disabled = picked.size !== prompt.bottom;
      };
      on(el, 'click', '[data-act="pick-bottom"]', (event, b) => {
        if (!prompt.bottom) return openCardDetail(ctx, b.dataset.id);
        const id = b.dataset.id;
        if (picked.has(id)) picked.delete(id); else if (picked.size < prompt.bottom) picked.add(id);
        b.classList.toggle('is-picked', picked.has(id));
        sync();
      });
      sync();
    }
  });
  return modal.close;
}

// ── Cleanup discard ─────────────────────────────────────────────────────────────
export function openDiscard(ctx, need, { minimize } = {}) {
  const view = ctx.view, p = me(view);
  const picked = new Set();
  const modal = openModal({
    title: `Discard ${need}`, size: 'full', dismissible: false,
    body: html`<div class="decision"><p class="decision__prompt">Your hand can hold seven cards at the end of your turn. Choose ${need} to discard.</p>
      <div class="card-grid card-grid--hand">${p.hand.map(c => cardHtml(c, view.defs[c.def], { act: 'pick' }))}</div><p class="decision__count" data-count></p></div>`,
    actions: [
      ...(minimize ? [{ label: 'View board', kind: 'plain', onClick: () => minimize() }] : []),
      { label: 'Discard', kind: 'confirm', id: 'discardConfirm', onClick: async () => { await ctx.send({ type: 'discard', ids: [...picked] }); } }
    ],
    onMount(el) {
      const sync = () => { $('[data-count]', el).textContent = `Selected ${picked.size} of ${need}`; $('#discardConfirm', el).disabled = picked.size !== need; };
      on(el, 'click', '[data-act="pick"]', (event, b) => {
        const id = b.dataset.id;
        if (picked.has(id)) picked.delete(id); else if (picked.size < need) picked.add(id);
        b.classList.toggle('is-picked', picked.has(id));
        sync();
      });
      sync();
    }
  });
  return modal.close;
}

// ── Resolve a card by hand ──────────────────────────────────────────────────────
export function openGuided(ctx) {
  const view = ctx.view, p = view.prompt;
  const top = view.stack.find(s => s.id === p.stackId);
  const def = top?.def ? view.defs[top.def] : null;
  const modal = openModal({
    title: `${p.name} — resolve by hand`, size: 'wide',
    body: html`
      ${def ? cardDetailHtml(def, top.face) : html`<p class="card-detail__oracle">${oracleHtml(p.text)}</p>`}
      <p class="card-detail__why"><b>This effect is not automated.</b> Do what the card says using the tools (life, counters, moving cards, tokens), then press Effect resolved.</p>
      ${p.notes?.length ? html`<p class="muted">Needs doing by hand: ${p.notes.join(' • ')}</p>` : ''}`,
    actions: [
      { label: 'Open tools', kind: 'plain', onClick: ({ close }) => { close(); openHostTools(ctx); } },
      { label: 'Effect resolved', kind: 'confirm', onClick: async ({ close }) => { const r = await ctx.send({ type: 'guided-done' }); if (r.ok) close(); } }
    ]
  });
  return modal.close;
}

// ── Table vote ──────────────────────────────────────────────────────────────────
export function openVote(ctx) {
  const view = ctx.view, p = view.prompt;
  const who = view.players.find(x => x.playerId === p.requesterId)?.name || 'A player';
  const actions = [];
  if (p.canVote) actions.push({ label: 'Do not allow', kind: 'cancel', onClick: () => ctx.send({ type: 'vote', approve: false }) }, { label: 'Allow', kind: 'confirm', onClick: () => ctx.send({ type: 'vote', approve: true }) });
  if (p.canDecide) actions.push({ label: 'Host: refuse', kind: 'danger', onClick: () => ctx.send({ type: 'vote', decide: false }) }, { label: 'Host: allow', kind: 'plain', onClick: () => ctx.send({ type: 'vote', decide: true }) });
  const modal = openModal({
    title: 'Table vote', size: 'small', dismissible: false,
    body: html`<p class="modal__message"><b>${who}</b> asks the table to allow <b>${p.label}</b>.</p>
      ${p.reason ? html`<p class="muted">The rules say: ${p.reason}</p>` : ''}
      ${!p.canVote && !p.canDecide ? html`<p class="muted">${p.voted === undefined ? 'Waiting for the other players to vote.' : 'Your vote is in. Waiting for the others.'}</p>` : ''}`,
    actions
  });
  return modal.close;
}

// ── Game over ───────────────────────────────────────────────────────────────────
export function openPostGame(ctx, leave) {
  const view = ctx.view;
  const winner = view.players.find(p => p.playerId === view.winner);
  const body = unlocked => html`
    <p class="modal__message postgame__winner">${winner ? html`<b>${winner.name}</b> wins` : 'The game is over'} after ${view.turn} turn${view.turn === 1 ? '' : 's'}.</p>
    <div class="postgame">${view.players.map(p => html`<div class="postgame__row ${p.playerId === view.winner ? 'is-winner' : ''}" style="--player:${p.color}">
      <strong>${p.name}</strong><span>${p.commanders.map(c => c.name).join(' + ')}</span><b>${p.eliminated ? (p.eliminationReason || 'out') : `${p.life} life`}</b></div>`)}</div>
    ${unlocked?.length ? html`<p class="modal__message">Achievement unlocked: <b>${unlocked.join(', ')}</b></p>` : ''}`;
  const modal = openModal({
    title: 'Game complete', dismissible: false, body: body(null),
    actions: [
      { label: 'Game log', kind: 'plain', onClick: () => openLog(ctx) },
      { label: 'View table', kind: 'plain', onClick: () => openTable(ctx) },
      { label: 'Finish', kind: 'confirm', onClick: ({ close }) => { close(); leave({ finished: true }); } }
    ]
  });
  // Record once per game on this device (the profile ignores a repeated completion id).
  (async () => {
    try {
      const before = earnedLabels(loadProfile());
      const profileName = String(loadProfile().account?.name || '').trim().toLowerCase();
      const mine = view.you || view.players.find(p => p.name.trim().toLowerCase() === profileName)?.playerId || view.players[0]?.playerId;
      const profile = await recordGame({
        completionId: view.gameId, winner: view.winner, result: view.result, turnNumber: view.turn, mode: view.mode,
        players: view.players.map(p => ({ playerId: p.playerId, displayName: p.name, life: p.life, commanders: p.commanders.map(c => ({ card: { name: c.name } })), deck: { sourceName: p.deckName } }))
      }, mine);
      const unlocked = earnedLabels(profile).filter(l => !before.includes(l));
      if (unlocked.length) setHtml($('.modal__body', modal.el), body(unlocked));
    } catch { /* stats are optional */ }
  })();
  return modal.close;
}

// ── Log, stack, chat ────────────────────────────────────────────────────────────
export function openLog(ctx) {
  const view = ctx.view;
  let lastTurn = null;
  openModal({
    title: 'Game log', size: 'wide',
    body: html`<ol class="glog__list glog__list--full">${view.log.map(e => {
      const head = e.turn !== lastTurn ? html`<li class="glog__turn">Turn ${e.turn}</li>` : '';
      lastTurn = e.turn;
      return html`${head}<li class="glog__row glog__row--${e.type || 'plain'}">${e.text}</li>`;
    })}</ol>`
  });
}

export function openStack(ctx) {
  const view = ctx.view;
  const name = id => view.players.find(p => p.playerId === id)?.name || '';
  openModal({
    title: `Stack (${view.stack.length})`,
    body: view.stack.length ? html`<p class="muted">The top item resolves first.</p><div class="option-list">${[...view.stack].reverse().map((s, i) => html`
      <div class="option ${i === 0 ? 'is-on' : ''}"><span><strong>${s.name}</strong><small>${name(s.controllerId)} • ${s.kind}${s.guided ? ' • resolve by hand' : ''}</small><small>${oracleHtml(s.text)}</small></span>
        ${view.isHost ? html`<span class="option__end"><button type="button" class="btn btn--small btn--danger" data-veto="${s.id}">Veto</button></span>` : ''}</div>`)}</div>`
      : html`<p class="muted">The stack is empty. Spells and abilities wait here until everyone has had a chance to respond.</p>`,
    onMount(el, { close }) {
      on(el, 'click', '[data-veto]', async (event, b) => {
        const ok = await confirmDialog({ title: 'Veto', message: 'Take this play back? The game returns to just before it was made.', confirmLabel: 'Veto', danger: true });
        if (ok) { close(); ctx.send({ type: 'veto', stackId: b.dataset.veto }); }
      });
    }
  });
}

export function openChat(ctx) {
  const draw = el => {
    const view = ctx.view;
    setHtml($('[data-chat]', el), view.chat?.length ? view.chat.map(m => html`<p class="chat__row"><b>${m.from}</b> ${m.text}</p>`) : html`<p class="muted">No messages yet.</p>`);
    const box = $('[data-chat]', el);
    box.scrollTop = box.scrollHeight;
  };
  let off = null;
  openModal({
    title: 'Game chat',
    body: html`<div class="chat" data-chat></div><div class="row"><input class="input" data-msg maxlength="240" placeholder="Message the table" autocomplete="off"><button type="button" class="btn" data-send>Send</button></div>`,
    onClose: () => off?.(),
    onMount(el) {
      draw(el);
      off = ctx.session.onChange(() => { if (el.isConnected) { draw(el); ctx.ui.chatSeen = ctx.view.chat?.length || 0; } else off?.(); });
      const sendMsg = async () => { const input = $('[data-msg]', el); const text = input.value.trim(); if (!text) return; input.value = ''; await ctx.send({ type: 'chat', text }); };
      on(el, 'click', '[data-send]', sendMsg);
      $('[data-msg]', el).addEventListener('keydown', e => { if (e.key === 'Enter') sendMsg(); });
    }
  });
}

// ── Settings ────────────────────────────────────────────────────────────────────
const GUIDANCE = [['coach', 'Coach', 'Explains each step and suggests a move'], ['assist', 'Assist', 'Highlights legal plays, short hints'], ['rules', 'Rules only', 'Just blocks illegal plays']];

export function openGameSettings(ctx, leave) {
  const view = ctx.view, s = loadSettings();
  const local = ctx.session.role === 'local';
  openModal({
    title: 'Game settings',
    body: html`
      <h4 class="section-title">Guidance on this device</h4>
      <div class="grid-3">${GUIDANCE.map(([id, label, text]) => html`<button type="button" class="option ${s.guidance === id ? 'is-on' : ''}" data-guidance="${id}"><span><strong>${label}</strong><small>${text}</small></span></button>`)}</div>
      <div class="option-list">
        <button type="button" class="option ${s.tips !== false ? 'is-on' : ''}" data-toggle="tips"><span><strong>Learning tips</strong><small>Tap the hint bar for a tip about the current step</small></span><span class="option__end">${s.tips !== false ? 'On' : 'Off'}</span></button>
        ${local ? html`<button type="button" class="option ${s.handoff !== false ? 'is-on' : ''}" data-toggle="handoff"><span><strong>Hide hands when passing the device</strong><small>Shows a cover screen before the next player's hand appears</small></span><span class="option__end">${s.handoff !== false ? 'On' : 'Off'}</span></button>` : ''}
      </div>
      <h4 class="section-title">This game</h4>
      <div class="option-list">
        <button type="button" class="option" data-do="rules"><span><strong>Table rules</strong><small>${view.isHost || view.mode === 'freeplay' ? 'Change rules for this game' : 'Only the host can change rules'} • response timer ${view.rules.priorityTimer ? `${view.rules.priorityTimer}s` : 'off'}</small></span></button>
        ${view.canEdit ? html`<button type="button" class="option" data-do="tools"><span><strong>${view.mode === 'freeplay' ? 'Edit game' : 'Host tools'}</strong><small>Adjust life, cards, phases, the stack</small></span></button>` : ''}
        ${view.you && view.status !== 'complete' ? html`<button type="button" class="option" data-do="concede"><span><strong>Concede</strong><small>Leave this game as a loss</small></span></button>` : ''}
        ${view.isHost || view.mode === 'freeplay' ? html`<button type="button" class="option" data-do="end"><span><strong>End game</strong><small>Stop the game for everyone</small></span></button>` : ''}
        <button type="button" class="option" data-do="leave"><span><strong>Leave to main menu</strong><small>${ctx.session.role === 'client' ? 'You can rejoin with the room code' : 'The game stays saved on this device'}</small></span></button>
      </div>`,
    onMount(el, { close }) {
      const again = () => { close(); ctx.refresh(); openGameSettings(ctx, leave); };
      on(el, 'click', '[data-guidance]', (e, b) => { saveSettings({ guidance: b.dataset.guidance }); again(); });
      on(el, 'click', '[data-toggle]', (e, b) => { const k = b.dataset.toggle; saveSettings({ [k]: loadSettings()[k] === false }); again(); });
      on(el, 'click', '[data-do]', async (e, b) => {
        const what = b.dataset.do;
        if (what === 'rules') return view.isHost || view.mode === 'freeplay' ? openRulesEdit(ctx, close) : toast('Only the host can change the rules.');
        if (what === 'tools') { close(); return openHostTools(ctx); }
        if (what === 'end') { close(); return openEndGame(ctx); }
        if (what === 'leave') { close(); return leave(); }
        if (what === 'concede') {
          const ok = await confirmDialog({ title: 'Concede', message: `${me(view)?.name || 'This player'} concedes the game?`, confirmLabel: 'Concede', danger: true });
          if (ok) { close(); ctx.send({ type: 'concede' }); }
        }
      });
    }
  });
}

// ── Card ID (lookup + camera) ───────────────────────────────────────────────────
export function openCardId(ctx) {
  let results = [], stream = null;
  const stop = () => { stream?.getTracks().forEach(t => t.stop()); stream = null; };
  openModal({
    title: 'Card ID', size: 'wide', onClose: stop,
    body: html`<div class="row"><input class="input" data-q type="search" placeholder="Card name" autocomplete="off"><button type="button" class="btn" data-go>Search</button><button type="button" class="btn" data-scan>Scan</button></div>
      <video class="scanner" data-video playsinline muted hidden></video>
      <div data-results><p class="muted">Look up any card by name, or point the camera at a card's title and press Scan.</p></div>`,
    actions: [{ label: 'Close', kind: 'cancel', onClick: ({ close }) => { stop(); close(); } }],
    onMount(el) {
      const out = $('[data-results]', el);
      const run = async () => {
        const q = $('[data-q]', el).value.trim();
        if (q.length < 2) return toast('Type at least two letters.');
        setHtml(out, html`<p class="muted">Searching…</p>`);
        const local = Object.values(ctx.view?.defs || {}).filter(d => d.name.toLowerCase().includes(q.toLowerCase()));
        try { results = await searchCards(q, { allPrintings: false }); } catch { results = local; if (!local.length) return setHtml(out, html`<p class="muted">The card catalog could not be reached, and no card in this game matches.</p>`); }
        if (!results.length) results = local;
        if (results.length === 1) return setHtml(out, cardDetailHtml(results[0]));
        setHtml(out, results.length ? html`<div class="option-list">${results.slice(0, 40).map((d, i) => html`<button type="button" class="option" data-show="${i}"><span><strong>${d.name}</strong><small>${d.typeLine}</small></span></button>`)}</div>` : html`<p class="muted">No cards found.</p>`);
      };
      on(el, 'click', '[data-go]', run);
      $('[data-q]', el).addEventListener('keydown', e => { if (e.key === 'Enter') run(); });
      on(el, 'click', '[data-show]', (e, b) => setHtml(out, cardDetailHtml(results[Number(b.dataset.show)])));
      on(el, 'click', '[data-scan]', async () => {
        const video = $('[data-video]', el);
        try {
          if (!stream) {
            stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
            video.srcObject = stream; video.hidden = false; await video.play();
            if (!('TextDetector' in window)) return toast('Camera is on. This browser cannot read text from the camera, so type the name you see.');
            return toast('Hold the card title in view, then press Scan again.');
          }
          if (!('TextDetector' in window)) return toast('Type the card name shown in the camera.');
          const blocks = await new window.TextDetector().detect(video);
          const best = blocks.map(b => b.rawValue.trim()).filter(t => /^[A-Za-z][A-Za-z ,'\-]{2,40}$/.test(t)).sort((a, b) => b.length - a.length)[0];
          if (!best) return toast('No card title was readable. Move closer and try again.');
          $('[data-q]', el).value = best;
          run();
        } catch { toast('The camera could not be opened. Check camera permission for this site.', { bad: true }); }
      });
    }
  });
}

// ── Player details ──────────────────────────────────────────────────────────────
export function openPlayerInfo(ctx, playerId) {
  const view = ctx.view, p = view.players.find(x => x.playerId === playerId);
  if (!p) return;
  const sources = view.players.flatMap(o => o.commanders.map(c => ({ ...c, owner: o.name }))).filter(c => p.commanderDamage[c.id]);
  openModal({
    title: p.name,
    body: html`
      <div class="grid-3">
        <div class="stat"><b>${p.life}</b><small>Life</small></div><div class="stat"><b>${p.poison}</b><small>Poison</small></div><div class="stat"><b>${p.handCount}</b><small>Cards in hand</small></div>
      </div>
      <h4 class="section-title">Commander</h4>
      ${p.commanders.map(c => html`<p>${c.name} — ${c.zone === 'command' ? 'in the command zone' : `in ${c.zone}`}, tax ${c.tax}</p>`)}
      <h4 class="section-title">Commander damage taken</h4>
      ${sources.length ? sources.map(c => html`<p>${p.commanderDamage[c.id]} from ${c.name} (${c.owner})${p.commanderDamage[c.id] >= (view.rules.commanderDamageThreshold || 21) ? ' — lethal' : ''}</p>`) : html`<p class="muted">None.</p>`}
      <h4 class="section-title">Counters and status</h4>
      <p>${[...Object.entries(p.counters).map(([k, v]) => `${k}: ${v}`), ...p.statuses].join(' • ') || 'None'}</p>
      <p class="muted">Deck: ${p.deckName || 'Unknown'} • Library ${p.libraryCount} • Graveyard ${p.graveyard.length} • Exile ${p.exile.length}</p>`,
    actions: [{ label: 'Close', kind: 'cancel' }, ...(view.canEdit ? [{ label: view.mode === 'freeplay' ? 'Edit game' : 'Host tools', kind: 'plain', onClick: ({ close }) => { close(); openHostTools(ctx); } }] : [])]
  });
}
