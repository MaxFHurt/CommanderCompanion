// Card rendering shared by the game screen, deck editor and pickers.
// A card is always drawn as readable text first; the Scryfall image loads on top when available,
// so the game stays playable offline or when an image fails.

import { html, raw, esc } from './dom.js';

export function faceOf(def, face) {
  const f = Number.isInteger(face) ? def?.cardFaces?.[face] : null;
  return f ? { ...def, ...f } : def;
}

export function imageOf(def, face = null, size = 'normal') {
  const d = faceOf(def, face);
  const uris = d?.imageUris || def?.imageUris || def?.cardFaces?.[0]?.imageUris;
  return uris?.[size] || uris?.normal || uris?.small || '';
}

const SYMBOL_FILES = new Set(['W', 'U', 'B', 'R', 'G', 'C']);

/** "{2}{G}{U}" → small mana symbols. */
export function manaCostHtml(cost = '') {
  const parts = [...String(cost || '').matchAll(/\{([^}]+)\}/g)].map(m => m[1].toUpperCase());
  if (!parts.length) return '';
  return raw(parts.map(s => {
    if (SYMBOL_FILES.has(s)) return `<img class="pip" src="assets/img/mana/${s}.png" alt="${s}">`;
    const hybrid = s.match(/^([WUBRGC])\/([WUBRGC])$/);
    if (hybrid) {
      const pair = [hybrid[1], hybrid[2]].sort().join('-');
      return `<img class="pip" src="assets/img/mana/split-${pair}.png" alt="${esc(s)}" onerror="this.outerHTML='<span class=&quot;pip pip--text&quot;>${esc(s)}</span>'">`;
    }
    return `<span class="pip pip--text">${esc(s)}</span>`;
  }).join(''));
}

/** Oracle text with mana symbols drawn inline. */
export function oracleHtml(text = '') {
  return raw(esc(text).replace(/\{([^}]+)\}/g, (_, s) => {
    const key = s.toUpperCase();
    if (SYMBOL_FILES.has(key)) return `<img class="pip pip--inline" src="assets/img/mana/${key}.png" alt="${key}">`;
    if (key === 'T') return '<span class="pip pip--text pip--inline" title="Tap">↷</span>';
    return `<span class="pip pip--text pip--inline">${esc(key)}</span>`;
  }).replace(/\n/g, '<br>'));
}

function countersHtml(counters = {}) {
  const rows = Object.entries(counters).filter(([, v]) => Number(v) > 0);
  if (!rows.length) return '';
  return html`<span class="card__counters">${rows.slice(0, 3).map(([k, v]) => html`<i>${k === '+1/+1' || k === '-1/-1' ? `${k} ×${v}` : `${v} ${k}`}</i>`)}</span>`;
}

/**
 * A card tile. `card` is a card view ({id, def, face, name, type, tapped, power, toughness, …}),
 * `def` its definition. Options: act (data-act value), classes, badge.
 */
export function cardHtml(card, def, { act = 'card', cls = '', badge = '', zone = '' } = {}) {
  const d = faceOf(def, card.face);
  const img = imageOf(def, card.face);
  const pt = card.power !== null && card.power !== undefined ? `${card.power}/${card.toughness}` : '';
  const flags = [
    card.tapped ? 'is-tapped' : '', card.playable ? 'is-playable' : '', card.sick ? 'is-sick' : '',
    card.attacking ? 'is-attacking' : '', card.blocking ? 'is-blocking' : '', card.token ? 'is-token' : '', cls
  ].filter(Boolean).join(' ');
  return html`<button type="button" class="card ${flags}" data-act="${act}" data-id="${card.id}" data-zone="${zone}" aria-label="${card.name}">
    <span class="card__text"><b>${d?.name || card.name}</b><small>${(d?.typeLine || card.type || '').replace(/^Legendary /, '')}</small></span>
    ${img ? html`<img class="card__img" src="${img}" alt="" loading="lazy" draggable="false">` : ''}
    ${pt ? html`<span class="card__pt ${card.damage ? 'is-hurt' : ''}">${pt}</span>` : ''}
    ${countersHtml(card.counters)}
    ${badge ? html`<span class="card__badge">${badge}</span>` : ''}
    ${card.attachments?.length ? html`<span class="card__clip">⛓${card.attachments.length}</span>` : ''}
  </button>`;
}

export function cardBackHtml(count = 1) {
  return html`<span class="card card--back" aria-hidden="true">${count > 1 ? html`<span class="card__badge">${count}</span>` : ''}</span>`;
}

/** Large card + rules text, used in detail popups. */
export function cardDetailHtml(def, face = null, extra = '') {
  const d = faceOf(def, face);
  if (!d) return html`<p class="muted">Card data is unavailable.</p>`;
  const img = imageOf(def, face);
  const other = (def.cardFaces || []).length > 1 ? def.cardFaces.filter((_, i) => i !== (face ?? 0)) : [];
  return html`<div class="card-detail">
    <div class="card-detail__art card">
      <span class="card__text"><b>${d.name}</b><small>${d.typeLine || ''}</small></span>
      ${img ? html`<img class="card__img" src="${img}" alt="${d.name}">` : ''}
    </div>
    <div class="card-detail__info">
      <h3>${d.name} <span class="card-detail__cost">${manaCostHtml(d.manaCost)}</span></h3>
      <p class="card-detail__type">${d.typeLine || ''}${d.power !== null && d.power !== undefined ? ` — ${d.power}/${d.toughness}` : ''}</p>
      <p class="card-detail__oracle">${oracleHtml(d.oracleText || '')}</p>
      ${other.map(f => html`<p class="card-detail__oracle card-detail__oracle--other"><b>Other face — ${f.name}</b> (${f.typeLine})<br>${oracleHtml(f.oracleText || '')}</p>`)}
      ${extra}
    </div>
  </div>`;
}

/** Hide images that fail to load so the text version shows. Call once per screen root. */
export function watchCardImages(root) {
  const handler = event => {
    const el = event.target;
    if (el instanceof HTMLImageElement && el.classList.contains('card__img')) el.remove();
  };
  root.addEventListener('error', handler, true);
  return () => root.removeEventListener('error', handler, true);
}

export function manaPoolHtml(mana, { compact = false } = {}) {
  const fixed = mana?.fixed || {};
  const flex = mana?.flex || [];
  return html`<div class="mana-pool ${compact ? 'mana-pool--compact' : ''}">
    ${['W', 'U', 'B', 'R', 'G', 'C'].map(c => html`<span class="mana-pool__cell ${Number(fixed[c] || 0) ? '' : 'is-zero'}"><b>${Number(fixed[c] || 0)}</b><img src="assets/img/mana/${c}.png" alt="${c}"></span>`)}
    ${flex.map(g => html`<span class="mana-pool__cell mana-pool__cell--flex" title="Any of ${g.colors.join(', ')}"><b>${g.count}</b>${g.colors.length === 2
      ? html`<img src="assets/img/mana/split-${[...g.colors].sort().join('-')}.png" alt="${g.colors.join('/')}" onerror="this.src='assets/img/mana/any.png'">`
      : html`<img src="assets/img/mana/any.png" alt="any">`}</span>`)}
  </div>`;
}
