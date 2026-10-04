// Join a room hosted on another device: enter the code, pick your deck, wait for the host.

import { html, setHtml, on, $ } from '../dom.js';
import { go } from '../../app/router.js';
import { toast } from '../toast.js';
import { accountSetupDefaults } from '../../data/profile.js';
import { emptySeat } from '../../app/seat-setup.js';
import { seatFormHtml, readSeatForm, handleSeatAction } from '../seat-form.js';
import { prepareSeats } from '../../app/start-game.js';
import { joinRoom, deviceClientId } from '../../net/room.js';
import { startClientSession } from '../../app/session.js';

export const joinScreen = {
  mount(root, params = {}) {
    const seat = params.seat || emptySeat(accountSetupDefaults().displayName || '');
    let lastRoom = '';
    try { lastRoom = localStorage.getItem('cc-last-room') || ''; } catch { /* optional */ }
    let code = params.code || lastRoom, link = null, busy = false, left = false;
    const offs = [];

    function draw() {
      const lobby = link?.lobby();
      setHtml(root, html`
        <main class="page page--setup">
          <header class="page__head">
            <button class="btn-back" type="button" data-act="back" aria-label="Back"><img src="assets/img/ui/back.png" alt="Back"></button>
            <h1 class="chrome-text">Join a Room</h1>
          </header>
          <div class="page__body setup">
            ${link ? html`
              <section class="panel lobby__code" style="grid-column:1 / -1">
                <small>Room ${code}</small><b class="chrome-text">${link.seated ? 'You are in' : 'Watching'}</b>
                <p class="muted">${link.reason || 'Waiting for the host to start the game…'}</p>
                <p>${(lobby?.players || []).map(p => p.name).join(' • ')}</p>
              </section>` : html`
              <nav class="setup__tabs">
                <label class="field">Room code<input class="input input--code" data-code maxlength="4" value="${code}" placeholder="ABCD" autocomplete="off" autocapitalize="characters"></label>
                <p class="muted">The host device shows the code. Choose your deck here — your hand stays on this device.</p>
                ${lastRoom ? html`<button type="button" class="btn btn--small btn--confirm" data-act="watch">Rejoin room ${lastRoom}</button>` : ''}
                <button type="button" class="btn btn--small" data-act="watch">Just watch</button>
              </nav>
              <section class="setup__form panel">${seatFormHtml(seat, 0)}</section>`}
          </div>
          <footer class="page__foot">${link ? '' : html`<button type="button" class="btn btn--confirm" data-act="join">Join</button>`}</footer>
        </main>`);
    }

    async function join(spectate) {
      if (busy) return;
      code = ($('[data-code]', root)?.value || code).trim().toUpperCase();
      if (!/^[A-Z]{4}$/.test(code)) return toast('Enter the four-letter room code.');
      busy = true;
      try {
        let prepared = null;
        if (!spectate) {
          const rows = await prepareSeats([seat], { mode: 'freeplay', rules: {} });
          if (!rows) return;
          prepared = rows[0].seat;
          try { localStorage.setItem('cc-join-mat', seat.matId || ''); } catch { /* optional */ }
        }
        toast('Connecting…');
        link = await joinRoom(code, { clientId: deviceClientId(), seat: prepared, name: seat.name || 'Spectator' });
        try { localStorage.setItem('cc-last-room', code); } catch { /* optional */ }
        if (left) return link.close();
        const enter = () => { startClientSession(link); go('game'); };
        if (link.lastView) return enter();
        offs.push(link.onView(() => { if (!left) { left = true; enter(); } }));
        offs.push(link.onLobby(draw));
        offs.push(link.onStatus(() => { if (link.status() === 'closed') { toast(link.reason || 'The room was closed.', { bad: true }); link = null; draw(); } }));
        draw();
      } catch (error) {
        toast(error.message || 'Could not join the room.', { bad: true, ms: 4500 });
      } finally { busy = false; }
    }

    draw();
    offs.push(on(root, 'click', '[data-act], [data-seat-act]', (event, el) => {
      if (!link) readSeatForm(root, seat);
      if ($('[data-code]', root)) code = $('[data-code]', root).value.trim().toUpperCase();
      if (el.dataset.seatAct) return handleSeatAction(el.dataset.seatAct, el, seat, draw);
      switch (el.dataset.act) {
        case 'back': if (link) { link.close(); link = null; } left = !link && false; return go('mode-select');
        case 'join': return join(false);
        case 'watch': return join(true);
      }
    }));
    return () => { const entered = left; left = true; for (const off of offs) off(); if (link && !entered) link.close(); };
  }
};
