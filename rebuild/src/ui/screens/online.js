// Online games ("play over time"): the games this device plays, joining with a code, the waiting
// room until every seat is filled, and picking your seat when you open a game on a new device.

import { html, setHtml, on, $ } from '../dom.js';
import { go } from '../../app/router.js';
import { toast } from '../toast.js';
import { confirmDialog } from '../modal.js';
import { accountSetupDefaults } from '../../data/profile.js';
import { emptySeat } from '../../app/seat-setup.js';
import { seatFormHtml, readSeatForm, handleSeatAction } from '../seat-form.js';
import { prepareSeats, buildGame } from '../../app/start-game.js';
import { rulesSummaryHtml } from '../rules-editor.js';
import { deviceClientId } from '../../net/room.js';
import { fetchOnlineGame, takeOnlineSeat, saveOnlineGame, onlineSummary, onlineSeat, newCodeOk } from '../../net/online.js';
import { listOnlineGames, rememberOnlineGame, forgetOnlineGame } from '../../app/online-games.js';
import { openOnlineGame } from '../../app/online-session.js';
import { useSession } from '../../app/session.js';
import { settle } from '../../game/flow.js';
import { actorId } from '../../game/view.js';

const WAIT_POLL = 4000;

export const onlineScreen = {
  mount(root, params = {}) {
    const clientId = deviceClientId();
    const mode = params.mode || 'fully-tracked';
    let stage = 'list', code = '', lobby = null, rev = 0, busy = false, left = false, timer = null;
    let seat = emptySeat(accountSetupDefaults().displayName || '');
    const summaries = new Map();   // code → summary from the server

    const statusText = (row, s) => {
      if (!s) return 'Checking…';
      if (s.error) return s.error;
      if (s.status === 'lobby') return `Waiting for players (${s.names?.length || 1} of ${s.seatsWanted})`;
      if (s.status === 'complete') return 'Finished';
      if (s.waitingClientId ? s.waitingClientId === row.clientId : s.waitingOn === row.name) return 'Your move';
      return `Waiting for ${s.waitingOn || 'the other players'}`;
    };

    function draw() {
      const body = stage === 'list' ? listHtml() : stage === 'join' ? joinHtml() : stage === 'wait' ? waitHtml() : seatPickHtml();
      setHtml(root, html`
        <main class="page ${stage === 'join' ? 'page--setup' : ''}">
          <header class="page__head">
            <button class="btn-back" type="button" data-act="back" aria-label="Back"><img src="assets/img/ui/back.png" alt="Back"></button>
            <h1 class="chrome-text">${stage === 'list' ? 'Online Games' : `Online Game ${code}`}</h1>
          </header>
          ${body}
        </main>`);
    }

    function listHtml() {
      const rows = listOnlineGames();
      return html`
        <div class="page__body lobby">
          <section class="panel lobby__seats">
            <h3 class="section-title">Your online games</h3>
            <div class="option-list">
              ${rows.length ? rows.map(r => {
                const s = summaries.get(r.code), text = statusText(r, s);
                return html`<button type="button" class="option ${text === 'Your move' ? 'is-on' : ''}" data-act="open" data-code="${r.code}"><span><strong>${(s?.names || r.names || [r.name]).join(' vs ')}</strong><small>${r.code} • ${text}${s?.turn ? ` • Turn ${s.turn}` : ''}</small></span><span class="option__end"><span class="chip chip--bad" data-act="forget" data-code="${r.code}">Remove</span></span></button>`;
              }) : html`<p class="muted">No online games yet. Start one, or join with the code a friend sent you.</p>`}
            </div>
          </section>
          <section class="panel lobby__code">
            <small>Play over time</small>
            <p class="muted">Each player plays on their own device, whenever they have time. The game is saved online after every move, and you see the others' moves when you open it.</p>
            <button type="button" class="btn btn--confirm" data-act="new">New online game</button>
            <label class="field">Game code<input class="input input--code" data-code maxlength="6" value="${code}" placeholder="ABCDEF" autocomplete="off" autocapitalize="characters"></label>
            <button type="button" class="btn" data-act="join-code">Join with this code</button>
          </section>
        </div>`;
    }

    function joinHtml() {
      return html`
        <div class="page__body setup">
          <nav class="setup__tabs">
            <p><strong>${lobby.seats.map(s => s.name).join(', ')}</strong> invited you.</p>
            <p class="muted">${lobby.mode === 'freeplay' ? 'Free Play' : 'Guided Play'} • ${lobby.seats.length} of ${lobby.seatsWanted} players. Choose your deck; joining means you accept these rules.</p>
            ${rulesSummaryHtml(lobby.rules || {})}
          </nav>
          <section class="setup__form panel">${seatFormHtml(seat, lobby.seats.length)}</section>
        </div>
        <footer class="page__foot"><button type="button" class="btn btn--confirm" data-act="take-seat">Join game</button></footer>`;
    }

    function waitHtml() {
      const open = Math.max(0, (lobby?.seatsWanted || 2) - (lobby?.seats.length || 0));
      return html`
        <div class="page__body lobby">
          <section class="panel lobby__code">
            <small>Game code</small>
            <b class="chrome-text" data-online-code>${code}</b>
            <p class="muted">Send this code to the other players. They open Start Game → Online games, enter it and choose their deck. The game starts when every seat is filled — you can close the app meanwhile.</p>
            <button type="button" class="btn btn--small" data-act="share">Share code</button>
          </section>
          <section class="panel lobby__seats">
            <h3 class="section-title">Players (${lobby?.seats.length || 0} of ${lobby?.seatsWanted || 2})</h3>
            <div class="option-list">
              ${(lobby?.seats || []).map(s => html`<div class="option is-on"><span><strong>${s.name}</strong><small>${s.clientId === clientId ? 'This device' : 'Joined'} • ${s.deckName || ''}</small></span></div>`)}
              ${Array.from({ length: open }, () => html`<div class="option"><span><strong class="muted">Open seat</strong><small>Waiting for a player to join…</small></span></div>`)}
            </div>
          </section>
        </div>`;
    }

    function seatPickHtml() {
      return html`
        <div class="page__body lobby">
          <section class="panel lobby__seats" style="grid-column:1 / -1">
            <h3 class="section-title">Which player are you?</h3>
            <p class="muted">This device has not played in this game before. Pick your seat to carry on here.</p>
            <div class="option-list">${(params.chooseSeat || []).map(p => html`<button type="button" class="option" data-act="pick-seat" data-player="${p.playerId}"><span><strong>${p.name}</strong></span></button>`)}</div>
          </section>
        </div>`;
    }

    async function refreshSummaries() {
      for (const r of listOnlineGames()) {
        try { summaries.set(r.code, (await onlineSummary(r.code)).summary); }
        catch (error) { summaries.set(r.code, { error: error.status === 404 ? 'No longer online' : 'Offline' }); }
        if (left) return;
        if (stage === 'list') draw();
      }
    }

    /** Open a game: play it, wait in its lobby, join it, or pick a seat. */
    async function open(target, playerId = null) {
      if (busy) return;
      code = String(target || '').trim().toUpperCase();
      if (!newCodeOk(code)) return toast('Enter the six-letter game code.');
      busy = true;
      try {
        const result = await openOnlineGame(code, { clientId, playerId });
        if (left) return result.session?.close();
        if (result.session) { useSession(result.session); left = true; return go('game'); }
        if (result.chooseSeat) { params.chooseSeat = result.chooseSeat; stage = 'seat'; return draw(); }
        lobby = result.lobby.lobby; rev = result.lobby.rev;
        if (lobby.seats.some(s => s.clientId === clientId)) { stage = 'wait'; draw(); return waitLoop(); }
        if (lobby.seats.length >= lobby.seatsWanted) return toast('All seats in this game are taken.', { bad: true });
        stage = 'join'; draw();
      } catch (error) {
        toast(error.message || 'Could not open that game.', { bad: true, ms: 4500 });
        if (error.status === 404 && listOnlineGames().some(r => r.code === code)) summaries.set(code, { error: 'No longer online' });
        if (stage === 'list') draw();
      } finally { busy = false; }
    }

    async function takeSeat() {
      if (busy) return;
      busy = true;
      try {
        const rows = await prepareSeats([seat], { mode: lobby.mode, rules: lobby.rules || {} });
        if (!rows || left) return;
        const done = await takeOnlineSeat(code, onlineSeat(rows[0].seat, clientId));
        rememberOnlineGame({ code, clientId, name: seat.name.trim(), names: [...lobby.seats.map(s => s.name), seat.name.trim()], mode: lobby.mode });
        rev = done.rev;
        busy = false;
        await open(code);
      } catch (error) {
        toast(error.message || 'Could not join the game.', { bad: true, ms: 4500 });
      } finally { busy = false; }
    }

    /** Waiting room: check for new players; once every seat is filled, start the game (any device may). */
    async function waitLoop() {
      clearTimeout(timer);
      if (left || stage !== 'wait') return;
      try {
        const latest = await fetchOnlineGame(code, rev);
        if (left) return;
        if (latest?.game) return open(code);
        if (latest) { lobby = latest.lobby; rev = latest.rev; draw(); }
        if (lobby.seats.length >= lobby.seatsWanted) return startGame();
      } catch { /* try again */ }
      timer = setTimeout(waitLoop, WAIT_POLL);
    }

    async function startGame() {
      try {
        const game = buildGame({ mode: lobby.mode, deviceMode: 'multi-device', rules: { ...lobby.rules, priorityTimer: 0 }, firstPlayer: lobby.firstPlayer ?? 'random', seats: lobby.seats });
        game.hasJudge = false;
        game.online = { code };
        settle(game);   // deal and settle once here, so every device starts from the same table
        const waiting = game.players.find(p => p.playerId === actorId(game));
        await saveOnlineGame(code, rev, game, { status: 'playing', names: game.players.map(p => p.displayName), waitingOn: waiting?.displayName || '', waitingClientId: waiting?.ownership?.clientId || '', turn: game.turnNumber || 0 });
      } catch (error) {
        if (error.status !== 409) { toast(error.message || 'The game could not be started.', { bad: true }); timer = setTimeout(waitLoop, WAIT_POLL); return; }
      }
      if (!left) open(code);   // started here or by another device: either way, play it
    }

    draw();
    if (params.code) open(params.code); else refreshSummaries();
    const off = on(root, 'click', '[data-act], [data-seat-act]', (event, el) => {
      if (stage === 'join') readSeatForm(root, seat);
      if (stage === 'list' && $('[data-code]', root)) code = $('[data-code]', root).value.trim().toUpperCase();
      if (el.dataset.seatAct) return handleSeatAction(el.dataset.seatAct, el, seat, draw);
      switch (el.dataset.act) {
        case 'back':
          if (stage === 'list') return go('mode-select');
          clearTimeout(timer); stage = 'list'; draw(); return refreshSummaries();
        case 'new': return go('player-setup', { mode, play: 'online' });
        case 'join-code': return open(code);
        case 'open': return open(el.dataset.code);
        case 'forget':
          event.stopPropagation();
          return confirmDialog({ title: 'Remove game', message: `Remove ${el.dataset.code} from this device's list? The game stays online; you can open it again with its code.`, confirmLabel: 'Remove' })
            .then(ok => { if (ok) { forgetOnlineGame(el.dataset.code); draw(); } });
        case 'take-seat': return takeSeat();
        case 'pick-seat': return open(code, el.dataset.player);
        case 'share': {
          const text = `Join my Commander Companion game: Start Game → Online games → code ${code}`;
          if (navigator.share) return navigator.share({ text }).catch(() => {});
          return navigator.clipboard?.writeText(text).then(() => toast('Copied.'), () => toast(`Code: ${code}`));
        }
      }
    });
    return () => { left = true; clearTimeout(timer); off(); };
  }
};

