// Host lobby: shows the room code and who has joined, then starts the game.

import { html, setHtml, on } from '../dom.js';
import { go } from '../../app/router.js';
import { toast } from '../toast.js';
import { confirmDialog } from '../modal.js';
import { hostRoom } from '../../net/room.js';
import { newRoomCode } from '../../net/transport.js';
import { chooseRules, buildGame } from '../../app/start-game.js';
import { startHostSession } from '../../app/session.js';

export const lobbyScreen = {
  mount(root, params = {}) {
    const { mode = 'fully-tracked', hostDevice = false, localSeats = [], remoteSeats = 2 } = params;
    let room = null, closed = false, started = false, offLobby = null;

    function draw(error = '') {
      const state = room?.lobby();
      const joined = state?.players || [];
      const ready = joined.length >= 1 && localSeats.length + joined.length >= 2;
      setHtml(root, html`
        <main class="page">
          <header class="page__head">
            <button class="btn-back" type="button" data-act="back" aria-label="Back"><img src="assets/img/ui/back.png" alt="Back"></button>
            <h1 class="chrome-text">${hostDevice ? 'Host Device' : 'Host Room'}</h1>
          </header>
          <div class="page__body lobby">
            <section class="panel lobby__code">
              <small>Room code</small>
              <b class="chrome-text">${room ? room.code : '····'}</b>
              <p class="muted">${error || (room ? 'On each other device: Start Game → choose a mode → Join a room, then enter this code.' : 'Opening the room…')}</p>
              ${room?.kind === 'loopback' ? html`<p class="warn">Same-browser room: the online connection service could not be reached, so only tabs of this browser can join.</p>` : ''}
            </section>
            <section class="panel lobby__seats">
              <h3 class="section-title">Players (${localSeats.length + joined.length} of ${localSeats.length + remoteSeats})</h3>
              <div class="option-list">
                ${localSeats.map(s => html`<div class="option is-on"><span><strong>${s.name}</strong><small>This device • ${s.commanderNames.join(' + ')}</small></span></div>`)}
                ${joined.map(p => html`<div class="option is-on"><span><strong>${p.name}</strong><small>${p.online ? 'Joined' : 'Disconnected'} • ${p.deckName}</small></span><span class="option__end"><button type="button" class="chip chip--bad" data-act="kick" data-id="${p.clientId}">Remove</button></span></div>`)}
                ${Array.from({ length: Math.max(0, remoteSeats - joined.length) }, () => html`<div class="option"><span><strong class="muted">Open seat</strong><small>Waiting for a player to join…</small></span></div>`)}
              </div>
              ${hostDevice ? html`<p class="muted">This device shows the table for everyone and has the host tools. It does not see any hand.</p>` : ''}
            </section>
          </div>
          <footer class="page__foot">
            <span class="muted">${state?.spectators ? `${state.spectators} watching` : ''}</span>
            <button type="button" class="btn btn--confirm" data-act="start" ${ready ? '' : html`disabled`}>Start game</button>
          </footer>
        </main>`);
    }

    async function open() {
      for (let attempt = 0; attempt < 3 && !room && !closed; attempt++) {
        try { room = await hostRoom(newRoomCode(), { remoteSeats }); } catch (error) { if (attempt === 2) return draw(error.message); }
      }
      if (closed) return room?.close();
      window.__ccRoomCode = room.code;
      offLobby = room.onLobby(() => draw());
      draw();
    }

    async function start() {
      const seats = [...localSeats, ...room.seats()];
      if (seats.length < 2) return toast('At least two players are needed.');
      if (room.lobby().players.length < remoteSeats) {
        const ok = await confirmDialog({ title: 'Start now?', message: 'Some seats are still open. Start with the players who have joined?', confirmLabel: 'Start' });
        if (!ok) return;
      }
      const choice = await chooseRules({ mode, names: seats.map(s => s.name) });
      if (!choice) return;
      try {
        const game = buildGame({ mode, deviceMode: 'multi-device', rules: choice.rules, firstPlayer: choice.firstPlayer, seats });
        started = true;
        const seatId = hostDevice ? null : game.players[0].playerId;
        startHostSession(game, { seatId, net: room });
        go('game');
      } catch (error) { console.error(error); toast(error.message || 'The game could not be started.', { bad: true }); }
    }

    draw();
    open();
    const off = on(root, 'click', '[data-act]', (event, el) => {
      switch (el.dataset.act) {
        case 'back': return go(hostDevice ? 'mode-select' : 'player-setup', { mode, play: 'host-player', seats: params.setupSeats, remoteSeats });
        case 'kick': return room?.kick(el.dataset.id);
        case 'start': return start();
      }
    });
    return () => { closed = true; off(); offLobby?.(); if (!started) room?.close(); };
  }
};
