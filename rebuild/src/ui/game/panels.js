// The remaining in-game popups: opening hand, cleanup discard, by-hand resolution, votes,
// game over, log, stack, chat, settings, card lookup and player details.

import { html, on, $, $$, setHtml } from '../dom.js';
import { openModal, confirmDialog } from '../modal.js';
import { toast } from '../toast.js';
import { cardHtml, cardDetailHtml, oracleHtml } from '../card-view.js';
import { loadSettings, saveSettings } from '../../data/store.js';
import { searchCards, resolveNamedCard } from '../../data/card-api.js';
import { prepareReader, readCardTitle } from '../../data/card-scan.js';
import { recordGame, loadProfile } from '../../data/profile.js';
import { earnedLabels } from '../../data/achievements.js';
import { openHostTools, openRulesEdit, openEndGame } from './host-tools.js';
import { rulesSummaryHtml } from '../rules-editor.js';
import { openCardDetail, openTable, pickNumber, pickText } from './card-modals.js';

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
// Short instruction, the chosen targets with the actions the card's words call for, and Done.
const ACTION_LABEL = {
  destroy: 'Destroy', exile: 'Exile', bounce: 'To hand', tap: 'Tap', untap: 'Untap', 'counter+': '+1/+1 counter', 'counter-': '−1/−1 counter',
  'counter-other': 'Other counter…', damage: 'Damage…', 'gain-control': 'Gain control', sacrifice: 'Sacrifice', 'return-hand': 'To hand',
  'return-battlefield': 'To battlefield', 'life-gain': 'Gain life…', 'life-loss': 'Lose life…', draw: 'Draw…', discard: 'Discard…', mill: 'Mill…',
  poison: 'Poison…', 'counter-spell': 'Counter it', pt: 'P/T change…', transform: 'Transform', shuffle: 'Shuffle', token: 'Create token…'
};
const FOR_KIND = {
  permanent: ['destroy', 'exile', 'bounce', 'sacrifice', 'tap', 'untap', 'counter+', 'counter-', 'counter-other', 'damage', 'pt', 'gain-control', 'transform'],
  player: ['damage', 'life-loss', 'life-gain', 'draw', 'discard', 'mill', 'poison'],
  stack: ['counter-spell'],
  card: ['return-hand', 'return-battlefield', 'exile']
};
const FOR_YOU = ['draw', 'life-gain', 'life-loss', 'mill', 'token', 'shuffle'];

export function openGuided(ctx) {
  const view = ctx.view, p = view.prompt;
  const top = view.stack.find(s => s.id === p.stackId);
  const def = top?.def ? view.defs[top.def] : null;
  const wanted = new Set(p.actions || []);
  const pick = (kind) => { const all = FOR_KIND[kind] || []; const hit = all.filter(a => wanted.has(a)); return hit.length ? hit : all; };
  const you = view.players.find(x => x.playerId === p.controllerId);
  const selfActions = FOR_YOU.filter(a => wanted.has(a));
  const steps = p.targets?.length ? 'Tap what the card does to each target, then Done.' : 'Do what the card says with the buttons or Host Tools, then Done.';
  const modal = openModal({
    title: `${p.name} — resolve by hand`, size: 'wide',
    body: html`
      ${def ? cardDetailHtml(def, top.face) : html`<p class="card-detail__oracle">${oracleHtml(p.text)}</p>`}
      <p class="guided__steps"><b>${steps}</b>${p.hint ? html` <span>${p.hint.name}: ${p.hint.steps}</span>` : ''}</p>
      ${(p.targets || []).map((t, i) => html`<div class="guided__target">
        <span class="guided__who"><small>${t.label}</small><b>${t.name}</b>${t.owner ? html`<small>${t.owner}</small>` : ''}</span>
        <span class="guided__acts">${t.kind === 'gone' ? html`<small class="muted">Left its zone — nothing to do to it.</small>` : pick(t.kind).map(a => html`<button type="button" class="btn btn--small" data-act-guided="${a}" data-t="${i}">${ACTION_LABEL[a] || a}</button>`)}</span>
      </div>`)}
      ${selfActions.length ? html`<div class="guided__target"><span class="guided__who"><small>You</small><b>${you?.name || 'You'}</b></span>
        <span class="guided__acts">${selfActions.map(a => html`<button type="button" class="btn btn--small" data-act-guided="${a}" data-t="you">${ACTION_LABEL[a]}</button>`)}</span></div>` : ''}`,
    actions: [
      { label: 'Host Tools', kind: 'plain', onClick: ({ close }) => { close(); openHostTools(ctx); } },
      { label: 'Done', kind: 'confirm', onClick: async ({ close }) => { const r = await ctx.send({ type: 'guided-done' }); if (r.ok) close(); } }
    ],
    onMount(el) {
      on(el, 'click', '[data-act-guided]', (event, b) => runGuidedAction(ctx, b.dataset.actGuided, b.dataset.t === 'you' ? { id: p.controllerId, kind: 'player' } : p.targets[Number(b.dataset.t)], p.controllerId));
    }
  });
  return modal.close;
}

function runGuidedAction(ctx, action, target, controllerId) {
  const edit = e => ctx.send({ type: 'edit', edit: e }).then(r => { if (r.ok) toast(`${ACTION_LABEL[action] || action} — done.`); return r; });
  const n = (title, fn, start = 1) => pickNumber(title, start, fn, { min: 0, max: 999 });
  const id = target?.id;
  switch (action) {
    case 'destroy': case 'sacrifice': return edit({ kind: 'move', instanceId: id, to: 'graveyard' });
    case 'exile': return edit({ kind: 'move', instanceId: id, to: 'exile' });
    case 'bounce': case 'return-hand': return edit({ kind: 'move', instanceId: id, to: 'hand' });
    case 'return-battlefield': return edit({ kind: 'move', instanceId: id, to: 'battlefield', controllerId });
    case 'tap': return edit({ kind: 'tap', instanceId: id, tapped: true });
    case 'untap': return edit({ kind: 'tap', instanceId: id, tapped: false });
    case 'counter+': return edit({ kind: 'card-counter', instanceId: id, counter: '+1/+1', delta: 1 });
    case 'counter-': return edit({ kind: 'card-counter', instanceId: id, counter: '-1/-1', delta: 1 });
    case 'counter-other': return pickText('Counter name', 'loyalty, charge, shield, stun…', name => n(`${name} counters to add (negative removes)`, v => edit({ kind: 'card-counter', instanceId: id, counter: name, delta: v })));
    case 'damage': return n('How much damage?', v => edit({ kind: 'damage', targetId: id, amount: v }), 2);
    case 'pt': return pickText('Power/toughness change', '+2/+2 or -3/-0', v => { const m = String(v).match(/([+-]?\d+)\s*\/\s*([+-]?\d+)/); if (!m) return toast('Write it like +2/+2.'); edit({ kind: 'pt', instanceId: id, power: Number(m[1]), toughness: Number(m[2]) }); });
    case 'gain-control': return edit({ kind: 'control', instanceId: id, playerId: controllerId });
    case 'transform': return edit({ kind: 'transform', instanceId: id });
    case 'life-gain': return n('Gain how much life?', v => edit({ kind: 'life', playerId: id, delta: v }), 1);
    case 'life-loss': return n('Lose how much life?', v => edit({ kind: 'life', playerId: id, delta: -v }), 1);
    case 'draw': return n('Draw how many?', v => v && edit({ kind: 'draw', playerId: id, count: v }), 1);
    case 'mill': return n('Mill how many?', v => v && edit({ kind: 'mill', playerId: id, count: v }), 1);
    case 'poison': return n('Poison counters to add', v => edit({ kind: 'poison', playerId: id, delta: v }), 1);
    case 'discard': return toast(`${ctx.view.players.find(x => x.playerId === id)?.name || 'That player'} chooses the card to discard — use their hand in Host Tools.`);
    case 'counter-spell': return edit({ kind: 'counter-stack', stackId: id });
    case 'shuffle': return edit({ kind: 'shuffle', playerId: id });
    case 'token': return openHostTools(ctx);
    default: return openHostTools(ctx);
  }
}

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

/** A request to the table (undo, challenge, correction, rule change): accept or decline. */
export function openProposal(ctx) {
  const p = ctx.view.prompt;
  const what = { undo: 'Undo request', challenge: 'Challenge', correction: 'Proposed correction', rules: 'Rule change' }[p.proposalKind] || 'Request';
  const modal = openModal({
    title: what, size: p.rules ? 'wide' : 'small', dismissible: false,
    body: html`<p class="modal__message"><b>${p.requester}</b>: ${p.label}</p>
      ${p.detail ? html`<p class="muted">${p.detail}</p>` : ''}
      ${p.rules ? rulesSummaryHtml(p.rules) : ''}
      <p class="muted">Everyone still in the game must accept. If anyone declines, the play stands.</p>`,
    actions: [
      { label: 'Decline', kind: 'cancel', onClick: () => ctx.send({ type: 'answer-proposal', id: p.id, accept: false }) },
      { label: 'Accept', kind: 'confirm', onClick: () => ctx.send({ type: 'answer-proposal', id: p.id, accept: true }) }
    ]
  });
  return modal.close;
}

/** The challenger's options while their challenge is accepted. */
export function openCorrection(ctx) {
  const c = ctx.view.correction;
  openModal({
    title: 'Your correction', size: 'small',
    body: html`<p class="modal__message">Correcting: <b>${c?.playText || 'the last play'}</b></p>
      <p class="muted">1. Make the change with Host Tools. 2. Propose it. Everyone must accept, or the play stands.</p>`,
    actions: [
      { label: 'Withdraw', kind: 'cancel', onClick: ({ close }) => { close(); ctx.send({ type: 'cancel-correction' }); } },
      { label: 'Host Tools', kind: 'plain', onClick: ({ close }) => { close(); openHostTools(ctx); } },
      { label: 'Propose', kind: 'confirm', onClick: async ({ close }) => { close(); const r = await ctx.send({ type: 'propose-correction' }); if (r.ok) toast('Sent to the table.'); } }
    ]
  });
}

// ── Game over ───────────────────────────────────────────────────────────────────
export function openPostGame(ctx, leave) {
  const view = ctx.view;
  const winner = view.players.find(p => p.playerId === view.winner);
  const body = unlocked => html`
    <p class="modal__message postgame__winner">${winner ? html`<b>${winner.name}</b> wins` : 'The game is over'} after ${view.turn} turn${view.turn === 1 ? '' : 's'}.</p>
    <div class="postgame">${view.players.map(p => html`<div class="postgame__row ${p.playerId === view.winner ? 'is-winner' : ''}" style="--player:${p.color}">
      <strong>${p.name}</strong><span>${p.commanders.map(c => c.name).join(' + ')}</span><b>${p.eliminated ? (p.eliminationReason || 'out') : `${p.life} life`}</b></div>`)}</div>
    ${(view.awards || []).length ? html`<h4 class="section-title">Awards</h4><div class="postgame-awards">${view.awards.map(a => {
      const p = view.players.find(x => x.playerId === a.playerId);
      return html`<div class="postgame-award" style="--player:${p?.color || 'var(--accent)'}"><strong>${a.label}</strong><span>${p?.name || ''}</span><small>${a.detail}</small></div>`;
    })}</div>` : ''}
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
        completionId: view.gameId, winner: view.winner, result: view.result, turnNumber: view.turn, mode: view.mode, awards: view.awards || [],
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
        ${view.isJudge ? html`<span class="option__end"><button type="button" class="btn btn--small btn--danger" data-veto="${s.id}">Veto</button></span>` : ''}</div>`)}</div>`
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
  const mine = view.players.find(p => p.playerId === view.you);
  openModal({
    title: 'Game settings',
    body: html`
      <h4 class="section-title">Guidance on this device</h4>
      <div class="grid-3">${GUIDANCE.map(([id, label, text]) => html`<button type="button" class="option ${s.guidance === id ? 'is-on' : ''}" data-guidance="${id}"><span><strong>${label}</strong><small>${text}</small></span></button>`)}</div>
      <div class="option-list">
        ${mine ? html`<button type="button" class="option ${mine.advice !== false ? 'is-on' : ''}" data-advice="${mine.advice !== false ? '' : '1'}"><span><strong>Advice for ${mine.name}</strong><small>The tip bar always suggests a move and explains why</small></span><span class="option__end">${mine.advice !== false ? 'On' : 'Off'}</span></button>` : ''}
        ${local ? html`<button type="button" class="option ${s.handoff !== false ? 'is-on' : ''}" data-toggle="handoff"><span><strong>Hide hands when passing the device</strong><small>Shows a cover screen before the next player's hand appears</small></span><span class="option__end">${s.handoff !== false ? 'On' : 'Off'}</span></button>` : ''}
      </div>
      <h4 class="section-title">This game</h4>
      <div class="option-list">
        <button type="button" class="option" data-do="rules"><span><strong>Table rules</strong><small>${view.isJudge || view.mode === 'freeplay' ? 'Change rules for this game' : view.you ? 'Propose a change — everyone must agree' : 'Only the host can change rules'} • undo ${view.rules.undo ? 'allowed' : 'off'} • response timer ${view.rules.priorityTimer ? `${view.rules.priorityTimer}s` : 'off'}</small></span></button>
        ${view.canEdit ? html`<button type="button" class="option" data-do="tools"><span><strong>${view.mode === 'freeplay' ? 'Edit game' : 'Host tools'}</strong><small>Adjust life, cards, phases, the stack</small></span></button>` : ''}
        ${view.you && view.status !== 'complete' ? html`<button type="button" class="option" data-do="concede"><span><strong>Concede</strong><small>Leave this game as a loss</small></span></button>` : ''}
        ${view.isJudge || view.mode === 'freeplay' ? html`<button type="button" class="option" data-do="end"><span><strong>End game</strong><small>Stop the game for everyone</small></span></button>` : ''}
        <button type="button" class="option" data-do="leave"><span><strong>Leave to main menu</strong><small>${ctx.session.role === 'client' ? 'You can rejoin with the room code' : 'The game stays saved on this device'}</small></span></button>
      </div>`,
    onMount(el, { close }) {
      const again = () => { close(); ctx.refresh(); openGameSettings(ctx, leave); };
      on(el, 'click', '[data-guidance]', (e, b) => { saveSettings({ guidance: b.dataset.guidance }); again(); });
      on(el, 'click', '[data-advice]', async (e, b) => { await ctx.send({ type: 'set-advice', on: !!b.dataset.advice }); again(); });
      on(el, 'click', '[data-toggle]', (e, b) => { const k = b.dataset.toggle; saveSettings({ [k]: loadSettings()[k] === false }); again(); });
      on(el, 'click', '[data-do]', async (e, b) => {
        const what = b.dataset.do;
        if (what === 'rules') return view.isJudge || view.mode === 'freeplay' ? openRulesEdit(ctx, close) : view.you ? openRulesEdit(ctx, close, { propose: true }) : toast('Only the host can change the rules.');
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
  let results = [], stream = null, frame = null, busy = false;
  const stop = () => { stream?.getTracks().forEach(t => t.stop()); stream = null; };
  openModal({
    title: 'Card ID', size: 'wide', onClose: stop,
    body: html`<div class="row"><input class="input" data-q type="search" placeholder="Card name" autocomplete="off"><button type="button" class="btn" data-go>Search</button><button type="button" class="btn" data-scan>Scan</button></div>
      <div class="scanner" data-scanner hidden>
        <video data-video playsinline muted></video>
        <div class="scanner__guide" data-guide><i class="scanner__title"></i></div>
        <p class="scanner__hint" data-hint>Fit the card inside the frame, title at the top, then press Read Title.</p>
      </div>
      <div data-results><p class="muted">Look up any card by name, or press Scan and hold the card up to the camera.</p></div>`,
    actions: [{ label: 'Close', kind: 'cancel', onClick: ({ close }) => { stop(); close(); } }],
    onMount(el) {
      const out = $('[data-results]', el);
      const show = defs => {
        results = defs;
        if (results.length === 1) return setHtml(out, cardDetailHtml(results[0]));
        setHtml(out, results.length ? html`<div class="option-list">${results.slice(0, 40).map((d, i) => html`<button type="button" class="option" data-show="${i}"><span><strong>${d.name}</strong><small>${d.typeLine}</small></span></button>`)}</div>` : html`<p class="muted">No cards found.</p>`);
      };
      const run = async () => {
        const q = $('[data-q]', el).value.trim();
        if (q.length < 2) return toast('Type at least two letters.');
        setHtml(out, html`<p class="muted">Searching…</p>`);
        const local = Object.values(ctx.view?.defs || {}).filter(d => d.name.toLowerCase().includes(q.toLowerCase()));
        let found;
        try { found = await searchCards(q, { allPrintings: false }); } catch { found = local; if (!local.length) return setHtml(out, html`<p class="muted">The card catalog could not be reached, and no card in this game matches.</p>`); }
        show(found.length ? found : local);
      };
      on(el, 'click', '[data-go]', run);
      $('[data-q]', el).addEventListener('keydown', e => { if (e.key === 'Enter') run(); });
      on(el, 'click', '[data-show]', (e, b) => setHtml(out, cardDetailHtml(results[Number(b.dataset.show)])));

      const video = $('[data-video]', el), guide = $('[data-guide]', el), hint = $('[data-hint]', el), scanBtn = $('[data-scan]', el);
      /** Place the card-shaped guide (63×88) in the middle of the picture and remember where it is. */
      const placeGuide = () => {
        const vw = video.videoWidth || 16, vh = video.videoHeight || 9;
        // Same shape as the camera picture, so the guide maps exactly onto the picture.
        const box = $('[data-scanner]', el), room = box.parentElement.clientWidth, maxH = Math.min(innerHeight * 0.55, 520);
        const width = Math.min(room, maxH * vw / vh);
        Object.assign(box.style, { width: `${Math.round(width)}px`, height: `${Math.round(width * vh / vw)}px` });
        const h = 0.9, w = Math.min(0.9, h * (vh * 63 / 88) / vw);
        frame = { x: (1 - w) / 2, y: (1 - h) / 2, w, h };
        Object.assign(guide.style, { left: `${frame.x * 100}%`, top: `${frame.y * 100}%`, width: `${frame.w * 100}%`, height: `${frame.h * 100}%` });
      };
      on(el, 'click', '[data-scan]', async () => {
        if (busy) return;
        try {
          if (!stream) {
            stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } } });
            video.srcObject = stream; $('[data-scanner]', el).hidden = false;
            await video.play(); placeGuide();
            video.addEventListener('loadedmetadata', placeGuide);
            scanBtn.textContent = 'Read Title';
            prepareReader().catch(() => {});   // start downloading the reader while the card is lined up
            return;
          }
          busy = true; scanBtn.disabled = true;
          hint.textContent = 'Reading the title…';
          const title = await readCardTitle(video, frame);
          if (title.length < 3) { hint.textContent = 'No title could be read. Move closer, avoid glare, and try again.'; return; }
          hint.textContent = `Read: “${title}”. Looking it up…`;
          $('[data-q]', el).value = title;
          try {
            // A fuzzy lookup forgives a misread letter or two.
            const def = await resolveNamedCard(title);
            show([def]); hint.textContent = `Found ${def.name}. Hold up another card and press Read Title.`;
          } catch { hint.textContent = `No exact match for “${title}” — showing the closest names.`; await run(); }
        } catch (error) {
          toast(stream ? (error.message || 'The title could not be read.') : 'The camera could not be opened. Check camera permission for this site.', { bad: true });
        } finally { busy = false; scanBtn.disabled = false; }
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
