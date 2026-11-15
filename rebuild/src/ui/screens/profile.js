// Player Profile: name, avatar, stats, most played deck, achievements, playmats, table defaults.

import { html, setHtml, on, $, $$ } from '../dom.js';
import { go } from '../../app/router.js';
import { toast } from '../toast.js';
import { openModal, confirmDialog } from '../modal.js';
import { loadProfile, saveAccountProfile, recordDeckSelection } from '../../data/profile.js';
import { listDecks } from '../../data/deck-store.js';
import { builderSummary } from '../../data/deck-builder.js';
import { ACHIEVEMENTS, earnedAchievements } from '../../data/achievements.js';
import { matUnlockPlan, playmatById, selectedMat, compressImageFile } from '../../data/playmats.js';
import { DICE, diceUnlockPlan, MATCH_PLAYMAT, diceChoice, activeDie } from '../../data/dice.js';
import { applyPalette } from '../../app/theme.js';
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
                <button type="button" class="btn" data-act="playmats">Playmats and Dice</button>
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
            <button type="button" class="btn" data-act="history">Game History</button>
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
      })
    ];
    return () => off.forEach(fn => fn());
  }
};

/** "Night Flight playmat" / "Ember die" for an achievement's reward, or '' when it has none. */
function rewardName(a) {
  if (a.reward?.mat) return `${playmatById(a.reward.mat).name} playmat`;
  if (a.reward?.die) return `${DICE.find(d => d.id === a.reward.die)?.name || ''} die`;
  return '';
}

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
            ${rewardName(a) ? html`<span class="chip ${earned.has(a.id) ? 'chip--good' : ''}">${earned.has(a.id) ? 'Unlocked' : 'Unlocks'} ${rewardName(a)}</span>` : ''}
          </div>`)}
      </div>
      ${awards.length ? html`<h3 class="section-title">Game awards</h3>
        <div class="grid-3">${awards.map(([label, count]) => html`<div class="achievement is-earned"><strong>${label}</strong><small>× ${count}</small></div>`)}</div>` : ''}`
  });
}

function openPlaymats() {
  openModal({
    title: 'Playmats and Dice',
    size: 'wide',
    body: html`<div data-mats></div>`,
    actions: [{ label: 'Done', kind: 'confirm' }],
    onMount(el) {
      const host = $('[data-mats]', el);
      const draw = () => {
        const profile = loadProfile();
        const current = selectedMat(profile).id;
        const choice = diceChoice(profile);
        const active = activeDie(profile);
        setHtml(host, html`
          <p class="muted">Your playmat sets the colours of the whole app. Amethyst is free; earn achievements to unlock the others (mats and dice alternate).</p>
          <div class="mat-slots">
            ${matUnlockPlan(profile).map(({ mat, via, unlocked }) => unlocked
              ? html`<div class="mat-slot ${mat.id === current ? 'is-on' : ''}">
                  <button type="button" class="mat-slot__preview" data-mat-pick="${mat.id}" style="background-image:url('${mat.image}')" aria-pressed="${mat.id === current}" aria-label="${mat.name}"></button>
                  <strong>${mat.name}</strong><small class="muted">${mat.id === current ? 'In use' : via ? 'Unlocked' : 'Always available'}</small></div>`
              : html`<div class="mat-slot is-locked" data-locked="${mat.id}"><div class="mat-slot__preview" style="background-image:url('${mat.image}')">🔒</div><strong>${mat.name}</strong><small class="muted">${via ? `${via.label}: ${via.description}` : 'Locked'}</small></div>`)}
          </div>
          <h3 class="profile-section-title">Life dice</h3>
          <p class="muted">Pick a die for your life total, or let it match your playmat (now ${active.name}).</p>
          <div class="mat-slots mat-slots--dice">
            <div class="mat-slot ${choice === MATCH_PLAYMAT ? 'is-on' : ''}">
              <button type="button" class="mat-slot__preview" data-die-pick="${MATCH_PLAYMAT}" style="background-image:radial-gradient(circle at 35% 30%, ${active.secondary}, ${active.primary} 70%)" aria-pressed="${choice === MATCH_PLAYMAT}" aria-label="Match playmat"></button>
              <strong>Match playmat</strong><small class="muted">${choice === MATCH_PLAYMAT ? 'In use' : 'Default'}</small></div>
            ${diceUnlockPlan(profile).map(({ die: d, via, unlocked }) => unlocked
              ? html`<div class="mat-slot ${choice === d.id ? 'is-on' : ''}">
                  <button type="button" class="mat-slot__preview" data-die-pick="${d.id}" style="background-image:radial-gradient(circle at 35% 30%, ${d.secondary}, ${d.primary} 70%)" aria-pressed="${choice === d.id}" aria-label="${d.name} die"></button>
                  <strong>${d.name}</strong><small class="muted">${choice === d.id ? 'In use' : via ? 'Unlocked' : 'Always available'}</small></div>`
              : html`<div class="mat-slot is-locked" data-die-locked="${d.id}"><div class="mat-slot__preview" style="background-image:radial-gradient(circle at 35% 30%, ${d.secondary}, ${d.primary} 70%)">🔒</div><strong>${d.name}</strong><small class="muted">${via ? `${via.label}: ${via.description}` : 'Locked'}</small></div>`)}
          </div>`);
      };
      draw();
      on(el, 'click', '[data-mat-pick]', async (event, button) => {
        await saveAccountProfile({ matId: button.dataset.matPick });
        applyPalette();
        draw();
      });
      on(el, 'click', '[data-die-pick]', async (event, button) => {
        await saveAccountProfile({ diceId: button.dataset.diePick });
        applyPalette();
        draw();
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
