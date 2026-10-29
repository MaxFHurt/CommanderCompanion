// Player Profile: name, avatar, stats, most played deck, achievements, playmats, table defaults.

import { html, setHtml, on, $, $$ } from '../dom.js';
import { go } from '../../app/router.js';
import { toast } from '../toast.js';
import { openModal, confirmDialog } from '../modal.js';
import { loadProfile, saveAccountProfile, recordDeckSelection, initProfileStore } from '../../data/profile.js';
import { listDecks, initDeckStore } from '../../data/deck-store.js';
import { openDeckBuilder, builderSummary } from '../../data/deck-builder.js';
import { saveProfileBackupFile, restoreProfileBackupFile } from '../../data/profile-backup.js';
import { onlineProfileLink, saveProfileOnline, loadProfileOnline, unlinkOnlineProfile, formatKey, cleanKey } from '../../app/online-profile.js';
import { ACHIEVEMENTS, earnedAchievements, matSlotPlan } from '../../data/achievements.js';
import { listPlaymats, savePlaymat, updatePlaymat, deletePlaymat, compressImageFile, initPlaymats, DEFAULT_MAT } from '../../data/playmats.js';
import { rulesEditorHtml, bindRulesEditor } from '../rules-editor.js';
import { DEFAULT_COMMANDER_RULES } from '../../engine/rules.js';

function mostPlayedDeck(profile) {
  const rows = Object.values(profile.players || {}).flatMap(player => Object.values(player.decks || {})).filter(d => d.id !== 'unspecified' && (d.name || d.commander1));
  return rows.sort((a, b) => Number(b.games || 0) - Number(a.games || 0) || Number(b.selections || 0) - Number(a.selections || 0))[0] || null;
}

/** The player's best three achievements: latest earned first, then awards by count. */
function topAchievements(profile) {
  const earned = earnedAchievements(profile).reverse().map(a => ({ label: a.label, detail: a.description }));
  const awards = Object.entries(profile.awards || {}).sort((a, b) => b[1] - a[1]).map(([label, count]) => ({ label, detail: `× ${count}` }));
  return [...earned, ...awards].slice(0, 3);
}

export const profileScreen = {
  mount(root) {
    let avatarImage = loadProfile().account?.avatarImage || '';

    function draw() {
      const profile = loadProfile();
      const account = profile.account || {};
      const winRate = profile.games ? Math.round((profile.wins / profile.games) * 100) : 0;
      const deck = mostPlayedDeck(profile);
      const top = topAchievements(profile);
      const builder = builderSummary();
      setHtml(root, html`
        <main class="page profile">
          <header class="page__head">
            <button class="btn-back" type="button" data-act="back" aria-label="Back"><img src="assets/img/ui/back.png" alt="Back"></button>
            <h1 class="chrome-text">Player Profile</h1>
          </header>
          <div class="page__body profile__body">
            <aside class="profile__left">
              <div class="profile__avatar">
                ${avatarImage ? html`<img src="${avatarImage}" alt="Player avatar">` : html`<img class="profile__avatar-default" src="assets/img/ui/crest.png" alt="">`}
                <label class="profile__upload" aria-label="Upload avatar">↥<input id="avatarFile" type="file" accept="image/*" hidden></label>
              </div>
              <section class="panel profile__deck">
                <h3>Most Played Deck</h3>
                ${deck ? html`<strong>${deck.name || 'Deck'}</strong>
                  ${deck.commander1 ? html`<span>${deck.commander1}${deck.commander2 ? ` + ${deck.commander2}` : ''}</span>` : ''}
                  <small>${Number(deck.games || 0)} game${Number(deck.games || 0) === 1 ? '' : 's'}${deck.selections ? ` • selected ${deck.selections} time${deck.selections === 1 ? '' : 's'}` : ''}</small>`
                  : html`<small class="muted">Play with a deck to establish your most played deck.</small>`}
              </section>
            </aside>
            <section class="profile__main">
              <div class="profile__name-row">
                <input class="input profile__name" id="profileName" maxlength="32" placeholder="Player name" aria-label="Player name" value="${account.displayName || ''}" autocomplete="off">
                <button type="button" class="btn" data-act="playmats">Playmats</button>
                <button type="button" class="btn" data-act="defaults">Table Defaults</button>
              </div>
              <div class="panel profile__stats">
                <div><b>${profile.games || 0}</b><span>Games</span></div>
                <div><b>${profile.wins || 0}</b><span>Wins</span></div>
                <div><b>${winRate}%</b><span>Win rate</span></div>
                <div title="${builder.collection} cards in your collection • ${builder.buyList} on buy lists"><b>${builder.decks}</b><span>Decks</span></div>
              </div>
              <button type="button" class="panel profile__achievements" data-act="achievements" aria-label="View all achievements">
                <h3>Achievements</h3>
                <div class="profile__achievement-row">
                  ${top.length ? top.map(a => html`<div class="achievement"><strong>${a.label}</strong><small>${a.detail}</small></div>`)
                    : html`<p class="muted">Play games to earn achievements.</p>`}
                </div>
              </button>
            </section>
          </div>
          <footer class="page__foot">
            <label class="btn">Load Profile<input id="profileFile" type="file" accept=".ccsave,application/json" hidden></label>
            <button type="button" class="btn" data-act="save">Save Profile</button>
            <button type="button" class="btn" data-act="online" title="Online Profile: load your profile on another device">Online</button>
            <button type="button" class="btn" data-act="history">Game History</button>
            <button type="button" class="btn" data-act="deck-builder">Deck Builder</button>
          </footer>
        </main>`);
    }

    async function persistName() {
      const displayName = $('#profileName', root)?.value.trim() || '';
      await saveAccountProfile({ displayName, avatarImage });
    }

    draw();

    const off = [
      on(root, 'click', '[data-act]', async (event, el) => {
        switch (el.dataset.act) {
          case 'back': await persistName(); return go('landing');
          case 'defaults': await persistName(); return openTableDefaults(draw);
          case 'playmats': return openPlaymats();
          case 'history': return openModal({
            title: 'Game history', size: 'wide',
            body: (loadProfile().history || []).length ? html`<div class="option-list">${loadProfile().history.map(h => html`<div class="option"><span>
              <strong>${h.winnerName ? `${h.winnerName} won` : 'No winner'} — ${h.mode === 'table-tracker' ? 'Table Tracker' : h.mode === 'freeplay' ? 'Free Play' : 'Guided Play'}</strong>
              <small>${new Date(h.at).toLocaleDateString()} • ${h.turnNumber} turns • ${(h.players || []).map(p => `${p.name}${p.commanders?.length ? ` (${p.commanders.join(' + ')})` : ''}`).join(', ')}</small></span></div>`)}</div>`
              : html`<p class="muted">Finished games will be listed here.</p>`
          });
          case 'achievements': return openAchievements();
          case 'online': await persistName(); return openOnlineProfile(async () => {
            await Promise.allSettled([initProfileStore(), initDeckStore(), initPlaymats()]);
            avatarImage = loadProfile().account?.avatarImage || '';
            draw();
          });
          case 'deck-builder': await persistName(); return openDeckBuilder({ screen: 'profile' });
          case 'save':
            try {
              await persistName();
              const name = await saveProfileBackupFile();
              toast(`Profile saved: ${name}`);
            } catch (error) {
              if (error?.name !== 'AbortError') toast(error.message || 'Profile could not be saved.', { bad: true });
            }
        }
      }),
      on(root, 'change', '#profileName', () => { persistName(); }),
      on(root, 'change', '#avatarFile', async (event, input) => {
        try {
          avatarImage = await compressImageFile(input.files?.[0]);
          await persistName();
          draw();
        } catch (error) {
          toast(error.message, { bad: true });
        }
      }),
      on(root, 'change', '#profileFile', async (event, input) => {
        const file = input.files?.[0];
        if (!file) return;
        const ok = await confirmDialog({ title: 'Load Profile', message: 'Replace the profile, saved decks and playmats on this device with the ones in this backup?', confirmLabel: 'Load Profile', danger: true });
        if (!ok) { input.value = ''; return; }
        try {
          await restoreProfileBackupFile(file);
          await Promise.allSettled([initProfileStore(), initDeckStore(), initPlaymats()]);
          avatarImage = loadProfile().account?.avatarImage || '';
          draw();
          toast('Profile loaded.');
        } catch (error) {
          toast(error.message, { bad: true });
        }
      })
    ];
    return () => off.forEach(fn => fn());
  }
};

function openAchievements() {
  const profile = loadProfile();
  const earned = new Set(earnedAchievements(profile).map(a => a.id));
  const awards = Object.entries(profile.awards || {}).sort((a, b) => b[1] - a[1]);
  openModal({
    title: 'Achievements',
    size: 'wide',
    body: html`
      <div class="grid-2">
        ${ACHIEVEMENTS.map(a => html`
          <div class="achievement achievement--full ${earned.has(a.id) ? 'is-earned' : 'is-locked'}">
            <strong>${a.label}</strong><small>${a.description}</small>
            ${a.reward?.matSlot ? html`<span class="chip ${earned.has(a.id) ? 'chip--good' : ''}">${earned.has(a.id) ? 'Unlocked' : 'Unlocks'} a playmat slot</span>` : ''}
          </div>`)}
      </div>
      ${awards.length ? html`<h3 class="section-title">Game awards</h3>
        <div class="grid-3">${awards.map(([label, count]) => html`<div class="achievement is-earned"><strong>${label}</strong><small>× ${count}</small></div>`)}</div>` : ''}`
  });
}

function openPlaymats() {
  openModal({
    title: 'Playmats',
    size: 'wide',
    body: html`<div data-mats></div><input id="matFile" type="file" accept="image/*" hidden>`,
    actions: [{ label: 'Done', kind: 'confirm' }],
    onMount(el) {
      const host = $('[data-mats]', el);
      const fileInput = $('#matFile', el);
      let targetSlot = 0;
      const draw = () => {
        const plan = matSlotPlan(loadProfile());
        const mats = listPlaymats();
        setHtml(host, html`
          <p class="muted">A playmat is the background of your player card; the controls float over it. Everyone has the default mat. Earn achievements to unlock more slots.</p>
          <div class="mat-slots">
            <div class="mat-slot"><div class="mat-slot__preview" style="background-image:url('${DEFAULT_MAT.image}')"></div><strong>Default</strong><small class="muted">Always available</small></div>
            ${plan.map(slot => {
              const mat = mats.find(m => m.slot === slot.index);
              if (!slot.unlocked) return html`<div class="mat-slot is-locked"><div class="mat-slot__preview">🔒</div><strong>Slot ${slot.index + 1}</strong><small class="muted">${slot.via.label}: ${slot.via.description}</small></div>`;
              return html`
                <div class="mat-slot" data-slot="${slot.index}">
                  <div class="mat-slot__preview" style="${mat ? `background-image:linear-gradient(rgba(6,4,12,${mat.dim}),rgba(6,4,12,${mat.dim})),url('${mat.image}')` : ''}">${mat ? '' : '+'}</div>
                  <strong>Slot ${slot.index + 1}</strong>
                  <div class="row">
                    <button type="button" class="chip" data-mat="upload" data-slot="${slot.index}">${mat ? 'Replace' : 'Upload image'}</button>
                    ${mat ? html`<button type="button" class="chip" data-mat="dim" data-id="${mat.id}">Tint ${Math.round(mat.dim * 100)}%</button>
                      <button type="button" class="chip chip--bad" data-mat="delete" data-id="${mat.id}">Delete</button>` : ''}
                  </div>
                </div>`;
            })}
          </div>`);
      };
      draw();
      on(el, 'click', '[data-mat]', async (event, button) => {
        const mats = listPlaymats();
        if (button.dataset.mat === 'upload') { targetSlot = Number(button.dataset.slot); fileInput.value = ''; fileInput.click(); }
        if (button.dataset.mat === 'dim') {
          // Cycle the dark tint that keeps text readable over the picture.
          const mat = mats.find(m => m.id === button.dataset.id);
          const steps = [0.15, 0.35, 0.55, 0.7];
          const next = steps[(steps.findIndex(v => Math.abs(v - mat.dim) < 0.01) + 1) % steps.length];
          await updatePlaymat(mat.id, { dim: next });
          draw();
        }
        if (button.dataset.mat === 'delete') {
          if (await confirmDialog({ title: 'Delete Playmat', message: 'Remove this playmat from the slot?', confirmLabel: 'Delete', danger: true })) {
            await deletePlaymat(button.dataset.id);
            draw();
          }
        }
      });
      fileInput.addEventListener('change', async () => {
        try {
          const image = await compressImageFile(fileInput.files?.[0]);
          await savePlaymat({ slot: targetSlot, image });
          draw();
          toast('Playmat saved.');
        } catch (error) {
          toast(error.message, { bad: true });
        }
      });
    }
  });
}

/** Usual table: who sits where, their preferred decks, and the rules new games start with. */
function openTableDefaults(onSaved) {
  const profile = loadProfile();
  const account = profile.account || {};
  const decks = listDecks();
  const names = [account.displayName || '', ...(account.preferredPlayerNames || []).filter(n => n && n !== account.displayName)].slice(0, 6);
  while (names.length < 6) names.push('');
  const preferredDeck = name => {
    const row = profile.players?.[String(name || '').trim().toLowerCase()];
    const linked = Object.values(row?.decks || {}).sort((a, b) => Number(b.selections || 0) - Number(a.selections || 0))[0];
    return linked?.id || '';
  };
  let readRules = null;
  openModal({
    title: 'Table Defaults',
    size: 'wide',
    body: html`
      <p class="muted">Set your usual table once. These defaults automatically set table rules for each new game, and the Rules page can still be changed for that game.</p>
      <h3 class="section-title">Players</h3>
      <div class="grid-2" id="defaultPlayers">
        ${names.map((name, i) => html`
          <div class="row" data-default-player="${i}">
            <input class="input" maxlength="32" placeholder="Player ${i + 1} name" value="${name}" autocomplete="off">
            <select class="input" aria-label="Preferred deck">
              <option value="">No preferred deck</option>
              ${decks.map(d => html`<option value="${d.id}" ${(i === 0 ? (account.favoriteDeckId || preferredDeck(name)) : preferredDeck(name)) === d.id ? 'selected' : ''}>${d.name}</option>`)}
            </select>
          </div>`)}
      </div>
      <h3 class="section-title">Your house rules</h3>
      <p class="muted">These start every game you set up. Anything that differs from standard Commander rules is marked <i class="chip chip--house">House rule</i> so the table can see it before agreeing.</p>
      <div id="defaultRules">${rulesEditorHtml(account.tableRuleDefaults || DEFAULT_COMMANDER_RULES)}</div>`,
    onMount(el) {
      readRules = bindRulesEditor($('#defaultRules', el), account.tableRuleDefaults || DEFAULT_COMMANDER_RULES);
    },
    actions: [
      { label: 'Cancel', kind: 'cancel' },
      {
        label: 'Save Defaults', kind: 'confirm',
        async onClick({ close, el }) {
          const rows = $$('[data-default-player]', el).map(row => ({ name: $('input', row).value.trim(), deckId: $('select', row).value }));
          const owner = rows[0];
          const entries = rows.filter(r => r.name);
          try {
            await saveAccountProfile({
              displayName: owner.name || account.displayName || '',
              preferredPlayerNames: entries.map(r => r.name),
              favoriteDeckId: owner.deckId || '',
              tableRuleDefaults: readRules()
            });
            for (const entry of entries) {
              const deck = decks.find(d => d.id === entry.deckId);
              if (deck) await recordDeckSelection({ playerName: entry.name, deckId: deck.id, deckName: deck.name, commander1: deck.commander1 || '', commander2: deck.commander2 || '', source: 'table-default' });
            }
            close();
            toast('Table defaults saved.');
            onSaved?.();
          } catch (error) {
            toast(error.message, { bad: true });
          }
        }
      }
    ]
  });
}

/** Online Profile: keep this profile online under a private key and load it on another device. */
function openOnlineProfile(onLoaded) {
  const link = onlineProfileLink();
  const when = iso => iso ? new Date(iso).toLocaleString() : '';
  openModal({
    title: 'Online Profile', size: 'wide',
    body: link ? html`
      <p class="modal__message">This profile is saved online. Its key:</p>
      <p class="lobby__code"><b class="chrome-text" data-profile-key style="font-size:3.2rem;letter-spacing:.12em;white-space:nowrap">${formatKey(link.key)}</b></p>
      <p class="muted">Keep this key private — anyone with it can load your profile. On another device: Profile → Online → enter the key. Last saved ${when(link.savedAt)}. It saves again by itself after changes, whenever you return to the start screen.</p>
      <div class="row row--wrap">
        <button type="button" class="btn btn--confirm" data-online="save">Save now</button>
        <button type="button" class="btn" data-online="load">Load the online copy</button>
        <button type="button" class="btn" data-online="copy">Copy key</button>
        <button type="button" class="btn" data-online="unlink">Stop saving online</button>
      </div>` : html`
      <p class="modal__message">Save your profile, decks, playmats and stats online, then load them on another iPad or phone.</p>
      <div class="row row--wrap"><button type="button" class="btn btn--confirm" data-online="save">Save my profile online</button></div>
      <h4 class="section-title">Already saved it on another device?</h4>
      <label class="field">Profile key<input class="input input--code" data-key maxlength="14" placeholder="ABCD-EFGH-JKLM" autocomplete="off" autocapitalize="characters"></label>
      <div class="row row--wrap"><button type="button" class="btn" data-online="load-key">Load profile</button></div>`,
    actions: [{ label: 'Close', kind: 'cancel' }],
    onMount(el, { close }) {
      on(el, 'click', '[data-online]', async (event, b) => {
        const act = b.dataset.online;
        try {
          if (act === 'save') {
            try { await saveProfileOnline(); }
            catch (error) {
              if (error.status !== 409) throw error;
              const ok = await confirmDialog({ title: 'Saved from another device', message: 'This profile was saved online from another device since this one last saved. Replace the online copy with this device\'s profile? (Or choose Load the online copy instead.)', confirmLabel: 'Replace online copy', danger: true });
              if (!ok) return;
              await saveProfileOnline({ force: true });
            }
            close(); toast('Profile saved online.'); return openOnlineProfile(onLoaded);
          }
          if (act === 'load' || act === 'load-key') {
            const key = act === 'load' ? link.key : cleanKey($('[data-key]', el)?.value);
            if (!/^[A-Z]{12}$/.test(key)) return toast('Enter the 12-letter profile key.');
            const ok = await confirmDialog({ title: 'Load Profile', message: 'Replace the profile, saved decks and playmats on this device with the online copy?', confirmLabel: 'Load Profile', danger: true });
            if (!ok) return;
            await loadProfileOnline(key);
            close(); await onLoaded(); return toast('Profile loaded.');
          }
          if (act === 'copy') return navigator.clipboard?.writeText(formatKey(link.key)).then(() => toast('Key copied.'), () => toast(formatKey(link.key)));
          if (act === 'unlink') {
            const ok = await confirmDialog({ title: 'Stop saving online', message: 'This device stops saving to the online copy. The online copy stays; you can load it again with the key.', confirmLabel: 'Stop' });
            if (ok) { unlinkOnlineProfile(); close(); toast('This device no longer saves online.'); }
          }
        } catch (error) {
          toast(error.message || 'That did not work.', { bad: true, ms: 4500 });
        }
      });
    }
  });
}
