// Join a Table Tracker room: enter the code, then pick which seat at the table is yours.

import { html, setHtml, on, $ } from '../dom.js';
import { go } from '../../app/router.js';
import { toast } from '../toast.js';
import { accountSetupDefaults } from '../../data/profile.js';
import { joinTrackerRoom } from '../../net/tracker-room.js';
import { deviceClientId } from '../../net/room.js';
import { routeScreen, routePanel } from '../route-kit.js';
import { scanJoinCode, goToJoin } from '../share-code.js';

export const trackerJoinScreen = {
  mount(root, params = {}) {
    let lastRoom = '';
    try { lastRoom = localStorage.getItem('cc-last-room') || ''; } catch { /* optional */ }
    let code = params.code || lastRoom, name = params.name || accountSetupDefaults().displayName || '';
    let link = null, busy = false, entered = false;
    const offs = [];

    function draw() {
      const msg = link?.lastState;
      const seats = msg?.seats || {};
      setHtml(root, routeScreen({
        cls: 'route--tracker-join', w: msg ? 900 : 1160, h: 423, ph: 224,
        title: 'Join a Table',
        panels: msg ? routePanel(`Room ${code} — which seat is yours?`, html`
                  ${msg.state.players.map(p => {
                    const s = seats[p.id];
                    const taken = s && (s.host || s.online) && s.clientId !== link.clientId;
                    return html`<button type="button" class="option ${taken ? '' : 'is-on'}" data-seat="${p.id}" ${taken ? html`disabled` : ''} style="border-left:0.4rem solid ${p.color}">
                      <span><strong>${p.name}</strong><small>${taken ? `Taken by ${s.host ? 'the host' : s.name}` : `Life ${p.life}${p.commander.name ? ` • ${p.commander.name}` : ''}`}</small></span></button>`;
                  })}
                  <button type="button" class="option" data-seat=""><span><strong>Just watch</strong><small>See the table without changing it</small></span></button>`, 'tjoin') : [
          routePanel('Room', html`
              <label class="field">Room code<input class="input input--code" data-code maxlength="4" value="${code}" placeholder="ABCD" autocomplete="off" autocapitalize="characters"></label>
              <label class="field">Your name<input class="input" data-name maxlength="24" value="${name}" placeholder="Name" autocomplete="off"></label>
              <button type="button" class="btn" data-act="scan">Scan QR</button>`, 'tjoin'),
          routePanel('Choose your seat', html`<p class="route-note">The host device shows the code at the top of the Table Tracker; its "Devices in this room" menu shows a QR code. The seats at the table appear here once you join.</p>`)],
        actions: html`
          <button class="btn" type="button" data-act="back" aria-label="Back">Back</button>
          ${msg ? '' : html`<button type="button" class="btn btn--confirm" data-act="join">Join</button>`}`
      }));
    }

    async function join() {
      if (busy) return;
      code = ($('[data-code]', root)?.value || code).trim().toUpperCase();
      name = ($('[data-name]', root)?.value || name).trim();
      if (!/^[A-Z]{4}$/.test(code)) return toast('Enter the four-letter room code.');
      busy = true;
      try {
        toast('Connecting…');
        link = await joinTrackerRoom(code, { clientId: deviceClientId(), name: name || 'Player' });
        if (link.kind !== 'tracker') { link.close(); link = null; toast('That room is a game, not a Table Tracker. Use Join a room from Guided or Free Play.', { bad: true, ms: 4500 }); return draw(); }
        try { localStorage.setItem('cc-last-room', code); } catch { /* optional */ }
        offs.push(link.onState(() => { if (!entered) draw(); }));
        offs.push(link.onStatus(() => { if (link?.status() === 'closed' && !entered) { toast(link.reason || 'The room was closed.', { bad: true }); link = null; draw(); } }));
        // Back in a room this device already sat in: go straight to the table.
        if (link.lastState?.you?.seatId) return enter();
        draw();
      } catch (error) {
        toast(error.message || 'Could not join the room.', { bad: true, ms: 4500 });
      } finally { busy = false; }
    }

    async function claim(seatId) {
      const result = await link.claim(seatId || null);
      if (!result.ok) return toast(result.error, { bad: true });
      enter();
    }

    function enter() { entered = true; go('tracker', { client: link }); }

    draw();
    offs.push(on(root, 'click', '[data-act], [data-seat]', (event, el) => {
      if (el.dataset.seat !== undefined) return claim(el.dataset.seat);
      switch (el.dataset.act) {
        case 'back': link?.close(); link = null; return go('mode-select');
        case 'join': return join();
        case 'scan': return scanJoinCode().then(found => {
          if (!found) return;
          if (found.kind !== 'table') return goToJoin(found, go);
          code = found.code; name = ($('[data-name]', root)?.value || name).trim(); join();
        });
      }
    }));
    return () => { for (const off of offs) off(); if (link && !entered) link.close(); };
  }
};
