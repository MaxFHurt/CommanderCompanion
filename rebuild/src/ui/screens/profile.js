// Player Profile: name, avatar, stats, most played deck, achievements, playmats, table defaults.

import { html, setHtml, on, $, $$ } from '../dom.js';
import { go } from '../../app/router.js';
import { toast } from '../toast.js';
import { openModal, confirmDialog } from '../modal.js';
import { routeScreen, routePanel, routePanels, routeRow } from '../route-kit.js';
import { loadProfile, saveAccountProfile, recordDeckSelection, nextRewardText } from '../../data/profile.js';
import { listDecks } from '../../data/deck-store.js';
import { builderSummary } from '../../data/deck-builder.js';
import { ACHIEVEMENTS, earnedAchievements, achievementLevel } from '../../data/achievements.js';
import { nextAchievementKind } from '../../data/rewards.js';
import { MATS } from '../../data/playmats.js';
import { matUnlockPlan, playmatById, selectedMat, compressImageFile } from '../../data/playmats.js';
import { DICE, dieBackground, diceUnlockPlan, MATCH_PLAYMAT, diceChoice, activeDie } from '../../data/dice.js';
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
  mount(root, params = {}) {
    let avatarImage = loadProfile().account?.avatarImage || '';

    function draw() {
      const profile = loadProfile();
      const account = profile.account || {};
      const winRate = profile.games ? Math.round((profile.wins / profile.games) * 100) : 0;
      const deck = mostPlayedDeck(profile);
      const top = topAchievements(profile);
      const builder = builderSummary();
      const games = Number(deck?.games || 0);
      setHtml(root, routeScreen({
        cls: 'profile route--profile', title: 'Player Profile', label: 'Player Profile',
        panels: [
          routePanel('Your profile', html`
            <div class="profile__who">
              <div class="profile__avatar">
                ${avatarImage ? html`<img src="${avatarImage}" alt="Player avatar">` : html`<img class="profile__avatar-default" src="assets/img/ui/crest.png" alt="">`}
                <label class="profile__upload" aria-label="Upload avatar">↥<input id="avatarFile" type="file" accept="image/*" hidden></label>
              </div>
              <input class="input profile__name" id="profileName" maxlength="32" placeholder="Player name" aria-label="Player name" value="${account.displayName || ''}" autocomplete="off">
            </div>
            <section class="readout profile__deck" aria-label="Most Played Deck">
              <h3>Most Played Deck</h3>
              ${deck ? html`<strong title="${deck.name || 'Deck'}">${deck.name || 'Deck'}</strong>
                ${deck.commander1 ? html`<span>${deck.commander1}${deck.commander2 ? ` + ${deck.commander2}` : ''}</span>` : ''}
                <small>${games} game${games === 1 ? '' : 's'}${deck.selections ? ` • selected ${deck.selections} time${deck.selections === 1 ? '' : 's'}` : ''}</small>`
                : html`<small class="muted">Play with a deck to establish your most played deck.</small>`}
            </section>
            ${routeRow(html`<button type="button" class="btn profile__achievements" data-act="achievements" aria-label="View all achievements">Achievements</button>`,
              top.length ? top.map(a => a.label).join(' · ') : 'Play games to earn achievements.')}
            <button type="button" class="btn" data-act="history">Game History</button>`),
          routePanel('Profile tools', html`
            <div class="readout profile__stats">
              <div><b>${profile.games || 0}</b><span>Games</span></div>
              <div><b>${profile.wins || 0}</b><span>Wins</span></div>
              <div><b>${winRate}%</b><span>Win rate</span></div>
              <div title="${builder.collection} cards in your collection • ${builder.buyList} on buy lists"><b>${builder.decks}</b><span>Decks</span></div>
            </div>
            <button type="button" class="btn" data-act="playmats">Playmats and Dice</button>
            <button type="button" class="btn" data-act="defaults">Table Defaults</button>`)
        ],
        actions: html`<button class="btn" type="button" data-act="back" aria-label="Back">Back</button>`
      }));
    }

    async function persistName() {
      const displayName = $('#profileName', root)?.value.trim() || '';
      await saveAccountProfile({ displayName, avatarImage });
    }

    draw();
    if (params?.open === 'playmats') openPlaymats();

    const off = [
      on(root, 'click', '[data-act]', async (event, el) => {
        switch (el.dataset.act) {
          case 'back': await persistName(); return go('landing');
          case 'defaults': await persistName(); return openTableDefaults(draw);
          case 'playmats': return openPlaymats();
          case 'history': return openHistory();
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

/** What the next achievement earns: "a playmat" / "a die" (alternating), or null once every playmat and die is unlocked. */
export function nextAchievementReward(profile, level) {
  const left = { mat: matUnlockPlan(profile).some(r => !r.unlocked), die: diceUnlockPlan(profile).some(r => !r.unlocked) };
  const kind = nextAchievementKind(level), other = kind === 'mat' ? 'die' : 'mat';
  const pick = left[kind] ? kind : left[other] ? other : null;
  return pick ? (pick === 'mat' ? 'a playmat' : 'a die') : null;
}

/** The rewards the achievements have drawn so far, in order: [{ n: 1, label: "Ember playmat" } …]. */
export function achievementDraws(profile) {
  return (profile.rewardDraws || []).filter(d => /^a\d+$/.test(d.slot)).map(d => {
    const [kind, id] = d.id.split(':'), row = (kind === 'mat' ? MATS : DICE).find(x => x.id === id);
    return { n: Number(d.slot.slice(1)), label: row ? `${row.name} ${kind === 'mat' ? 'playmat' : 'die'}` : d.id };
  }).sort((x, y) => x.n - y.n);
}

function openHistory() {
  const history = loadProfile().history || [];
  openModal({
    title: 'Game history', route: { w: 900, h: 475, ph: 276, cls: 'modal--history' },
    body: routePanels(routePanel('Recent games', history.length
      ? history.map(h => html`<div class="readout history-row">
          <strong>${h.winnerName ? `${h.winnerName} won` : 'No winner'} — ${h.mode === 'table-tracker' ? 'Table Tracker' : h.mode === 'freeplay' ? 'Free Play' : 'Guided Play'}</strong>
          <small>${new Date(h.at).toLocaleDateString()} • ${h.turnNumber} turns • ${(h.players || []).map(p => `${p.name}${p.commanders?.length ? ` (${p.commanders.join(' + ')})` : ''}`).join(', ')}</small></div>`)
      : html`<p class="route-note">Finished games will be listed here.</p>`, 'route-panel--list')),
    actions: [{ label: 'Close', kind: 'cancel' }]
  });
}

function openAchievements() {
  const profile = loadProfile();
  const earned = new Set(earnedAchievements(profile).map(a => a.id));
  const awards = Object.entries(profile.awards || {}).sort((a, b) => b[1] - a[1]);
  const next = nextAchievementReward(profile, earned.size), drawn = achievementDraws(profile);
  openModal({
    title: 'Achievements', route: { w: 1160, h: 515, ph: 343, cls: 'modal--achievements' },
    body: routePanels([
      routePanel('Level', html`
        <div class="level-bar readout" data-level>
          <strong>Level ${earned.size}</strong> <span class="muted">of ${ACHIEVEMENTS.length}</span>
          <progress max="${ACHIEVEMENTS.length}" value="${earned.size}"></progress>
          ${next ? html`<small class="muted" data-next-reward>Next achievement: ${next}</small>` : html`<small class="muted" data-next-reward>Every playmat and die is unlocked.</small>`}
          <small class="muted">Each achievement earns a random reward: a playmat, then a die, then a playmat …</small>
          ${nextRewardText(profile) ? html`<small class="muted" data-next-games>${nextRewardText(profile)}</small>` : ''}
        </div>
        ${drawn.length ? html`<div class="draw-chips" data-drawn>${drawn.map(d => html`<small class="chip chip--good" data-draw="${d.n}">Achievement ${d.n}: ${d.label}</small> `)}</div>` : ''}
        ${awards.length ? html`<h3 class="section-title">Game awards</h3>
          ${awards.map(([label, count]) => html`<div class="achievement readout is-earned"><strong>${label}</strong><small>× ${count}</small></div>`)}` : ''}`, 'route-panel--list'),
      routePanel('All achievements', ACHIEVEMENTS.map(a => html`
        <div class="achievement achievement--full readout ${earned.has(a.id) ? 'is-earned' : 'is-locked'}">
          <span><strong>${a.label}</strong><small>${a.description}</small></span>
          <span class="chip ${earned.has(a.id) ? 'chip--good' : ''}">${earned.has(a.id) ? 'Earned' : 'Not yet'}</span>
        </div>`), 'route-panel--list')
    ]),
    actions: [{ label: 'Close', kind: 'cancel' }]
  });
}

function openPlaymats() {
  openModal({
    title: 'Playmats and Dice', route: { w: 1160, h: 515, ph: 343, back: false, cls: 'modal--mats' },
    body: html`<div class="route__panels" data-mats></div>`,
    actions: [{ label: 'Done', kind: 'confirm' }],
    onMount(el) {
      const host = $('[data-mats]', el);
      const draw = () => {
        const profile = loadProfile();
        const current = selectedMat(profile).id;
        const choice = diceChoice(profile);
        const active = activeDie(profile);
        setHtml(host, html`${[
          routePanel('Playmats', html`
            <div class="mat-slots">
              ${matUnlockPlan(profile).map(({ mat, via, unlocked }) => unlocked
                ? html`<div class="mat-slot ${mat.id === current ? 'is-on' : ''}">
                    <button type="button" class="mat-slot__preview" data-mat-pick="${mat.id}" style="background-image:url('${mat.thumb || mat.image}')" aria-pressed="${mat.id === current}" aria-label="${mat.name}"></button>
                    <strong>${mat.name}</strong><small class="muted">${mat.id === current ? 'In use' : via ? 'Unlocked' : 'Always available'}</small></div>`
                : html`<div class="mat-slot is-locked" data-locked="${mat.id}"><div class="mat-slot__preview" style="background-image:url('${mat.thumb || mat.image}')">🔒</div><strong>${mat.name}</strong><small class="muted">${via ? via.description : 'Locked'}</small></div>`)}
            </div>
            <p class="route-note">Your playmat sets the colours of the whole app. Amethyst is free; new playmats and dice are earned at random: one for every achievement (a playmat, then a die, then a playmat …), and others as you play games and win them (a playmat every 3 games and a die every 2 wins).</p>
            ${nextRewardText(profile) ? html`<p class="route-note" data-next-games>${nextRewardText(profile)}</p>` : ''}`, 'route-panel--mats'),
          routePanel('Life dice', html`
            <div class="mat-slots mat-slots--dice">
              <div class="mat-slot ${choice === MATCH_PLAYMAT ? 'is-on' : ''}">
                <button type="button" class="mat-slot__preview" data-die-pick="${MATCH_PLAYMAT}" style="background:${dieBackground(active)}" aria-pressed="${choice === MATCH_PLAYMAT}" aria-label="Match playmat"></button>
                <strong>Match playmat</strong><small class="muted">${choice === MATCH_PLAYMAT ? 'In use' : 'Default'}</small></div>
              ${diceUnlockPlan(profile).map(({ die: d, via, unlocked }) => unlocked
                ? html`<div class="mat-slot ${choice === d.id ? 'is-on' : ''}">
                    <button type="button" class="mat-slot__preview" data-die-pick="${d.id}" style="background:${dieBackground(d)}" aria-pressed="${choice === d.id}" aria-label="${d.name} die"></button>
                    <strong>${d.name}</strong><small class="muted">${choice === d.id ? 'In use' : via ? 'Unlocked' : 'Always available'}</small></div>`
                : html`<div class="mat-slot is-locked" data-die-locked="${d.id}"><div class="mat-slot__preview" style="background:${dieBackground(d)}">🔒</div><strong>${d.name}</strong><small class="muted">${via ? via.description : 'Locked'}</small></div>`)}
            </div>
            <p class="route-note">Pick a die for your life total, or let it match your playmat (now ${active.name}).</p>`, 'route-panel--mats')
        ]}`);
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
    title: 'Table Defaults', route: { w: 1160, h: 515, ph: 343, cls: 'modal--defaults' },
    body: routePanels([
      routePanel('Players', html`
        <p class="route-note">Set your usual table once. These defaults automatically set table rules for each new game, and the Rules page can still be changed for that game.</p>
        <div class="defaults-players" id="defaultPlayers">
          ${names.map((name, i) => html`
            <div class="row" data-default-player="${i}">
              <input class="input" maxlength="32" placeholder="Player ${i + 1} name" value="${name}" autocomplete="off">
              <select class="input" aria-label="Preferred deck">
                <option value="">No preferred deck</option>
                ${decks.map(d => html`<option value="${d.id}" ${(i === 0 ? (account.favoriteDeckId || preferredDeck(name)) : preferredDeck(name)) === d.id ? 'selected' : ''}>${d.name}</option>`)}
              </select>
            </div>`)}
        </div>`, 'route-panel--form'),
      routePanel('Your house rules', html`
        <p class="route-note">These start every game you set up. Anything that differs from standard Commander rules is marked <i class="chip chip--house">House rule</i> so the table can see it before agreeing.</p>
        <div id="defaultRules">${rulesEditorHtml(account.tableRuleDefaults || DEFAULT_COMMANDER_RULES, { inline: true })}</div>`, 'route-panel--list')
    ]),
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
