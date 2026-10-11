const TYPE_KEYS = ['Creature', 'Artifact', 'Enchantment', 'Instant', 'Sorcery', 'Planeswalker', 'Battle', 'Land'];
const COLOR_KEYS = ['W', 'U', 'B', 'R', 'G'];
function quantityOf(entry) { const q = Number(entry?.quantity ?? entry?.qty ?? 1); return Number.isFinite(q) && q > 0 ? q : 0; }
function definitionMap(definitions = []) { return definitions instanceof Map ? definitions : new Map((definitions || []).filter(Boolean).map(d => [d.definitionId, d])); }
export function manaValueFromCost(cost = '') {
  const symbols = [...String(cost || '').matchAll(/\{([^}]+)\}/g)].map(m => String(m[1] || '').toUpperCase());
  let mv = 0;
  for (const s of symbols) {
    if (/^\d+$/.test(s)) {
      mv += Number(s);
      continue;
    }
    if (s === 'X' || s === 'Y' || s === 'Z')
      continue;
    if (s.includes('/')) {
      mv += 1;
      continue;
    }
    if (/^[WUBRGCS]$/.test(s)) {
      mv += 1;
      continue;
    }
  }
  return mv;
}
// What a card does in a deck, read from its rules text (a card can fill several roles).
const ROLES = {
  ramp: /\bAdd \{|\badd (?:one|two|three) mana\b|search your library for (?:a|an|up to \w+) (?:basic )?land cards?|put (?:a|that|those) land cards? onto the battlefield|create (?:a|an|\w+) Treasure tokens?/i,
  draw: /\bdraws? (?:a|an|one|two|three|four|five|X|\w+) cards?\b|draw cards equal|\binvestigate\b|create (?:a|an|\w+) Clue tokens?/i,
  removal: /\b(?:destroy|exile) target (?:creature|permanent|artifact|enchantment|planeswalker|nonland|attacking|tapped)|deals? (?:\d+|X) damage to (?:any target|target creature|target creature or planeswalker)|return target (?:creature|nonland permanent|permanent) to its owner|target (?:player|opponent) sacrifices|fights? target creature/i,
  wipe: /\b(?:destroy|exile) (?:all|each) (?:other )?(?:creatures|nonland permanents|permanents|artifacts|enchantments)|return (?:all|each) (?:nonland )?(?:creatures|permanents)[^.]* to (?:their|its) owner|deals? (?:\d+|X) damage to each creature|each player sacrifices (?:all|each)|all creatures get -\d+\/-\d+/i,
  counter: /\bcounter target (?:spell|activated|triggered|noncreature|creature|instant)/i,
  tutor: /search your library for (?:a|an|up to \w+) (?!basic land)(?!land)(?![A-Za-z]+ land)(?:[A-Za-z, -]+ )?cards?/i
};
const ROLE_LABEL = { ramp: 'Ramp', draw: 'Card draw', removal: 'Removal', wipe: 'Board wipes', counter: 'Counterspells', tutor: 'Tutors' };

function landColors(d) {
  const text = String(d?.oracleText || ''), type = String(d?.typeLine || '');
  const out = new Set();
  for (const [word, c] of [['Plains', 'W'], ['Island', 'U'], ['Swamp', 'B'], ['Mountain', 'R'], ['Forest', 'G']]) if (new RegExp(`\\b${word}\\b`).test(type)) out.add(c);
  for (const m of text.matchAll(/\{([WUBRG])\}/g)) if (/Add\b/i.test(text)) out.add(m[1]);
  if (/mana of any color|any type|commander's color identity/i.test(text)) COLOR_KEYS.forEach(c => out.add(c));
  return out;
}

export function analyzeDeck({ manifest = [], definitions = [] } = {}) {
  const defs = definitionMap(definitions);
  const typeCounts = Object.fromEntries(TYPE_KEYS.map(k => [k, 0]));
  const colorIdentityCounts = Object.fromEntries(COLOR_KEYS.map(k => [k, 0]));
  const curve = { '0-1': 0, '2': 0, '3': 0, '4': 0, '5': 0, '6': 0, '7+': 0 };
  const roles = Object.fromEntries(Object.keys(ROLES).map(k => [k, 0]));
  const pips = Object.fromEntries(COLOR_KEYS.map(k => [k, 0]));
  const sources = Object.fromEntries(COLOR_KEYS.map(k => [k, 0]));
  const identity = new Set();
  let total = 0, lands = 0, nonlands = 0, nonlandManaTotal = 0, unresolved = 0;
  for (const entry of manifest || []) {
    const qty = quantityOf(entry);
    if (!qty)
      continue;
    total += qty;
    const d = defs.get(entry.definitionId);
    if (!d) {
      unresolved += qty;
      continue;
    }
    const type = String(d.typeLine || ''), text = String(d.oracleText || '').replace(/\([^()]*\)/g, '');
    for (const k of TYPE_KEYS)
      if (new RegExp(`\\b${k}\\b`, 'i').test(type))
        typeCounts[k] += qty;
    const isLand = /\bLand\b/i.test(type);
    if (isLand) {
      lands += qty;
      for (const c of landColors(d)) sources[c] += qty;
    }
    else {
      nonlands += qty;
      const mv = manaValueFromCost(d.manaCost || '');
      nonlandManaTotal += mv * qty;
      const bucket = mv <= 1 ? '0-1' : mv >= 7 ? '7+' : String(mv);
      curve[bucket] += qty;
      for (const m of String(d.manaCost || '').matchAll(/\{([^}]+)\}/g)) for (const c of COLOR_KEYS) if (m[1].includes(c)) pips[c] += qty;
      for (const [role, re] of Object.entries(ROLES)) if (re.test(text)) roles[role] += qty;
      // Mana rocks and dorks count as ramp and as colored sources.
      if (/\bAdd \{/i.test(text) || /mana of any color/i.test(text)) for (const c of landColors(d)) sources[c] += qty;
    }
    const ci = Array.isArray(d.colorIdentity) ? d.colorIdentity : [];
    for (const c of COLOR_KEYS)
      if (ci.includes(c)) {
        colorIdentityCounts[c] += qty;
        identity.add(c);
      }
  }
  // "Any color" sources only matter for the deck's own colors.
  if (identity.size) for (const c of COLOR_KEYS) if (!identity.has(c)) sources[c] = 0;
  const averageNonlandManaValue = nonlands ? Number((nonlandManaTotal / nonlands).toFixed(2)) : 0;
  const tips = [];
  if (total >= 90) {
    if (lands < 33) tips.push(`Only ${lands} lands — most Commander decks play 35–38 (fewer with lots of ramp).`);
    else if (lands > 40) tips.push(`${lands} lands is a lot — 35–38 is usual; you may flood.`);
    if (roles.ramp < 8) tips.push(`${roles.ramp} ramp cards — 10 or so helps you cast your commander on time.`);
    if (roles.draw < 8) tips.push(`${roles.draw} card draw sources — around 10 keeps your hand full.`);
    if (roles.removal < 6) tips.push(`${roles.removal} targeted removal — 8 or more answers threats at the table.`);
    if (!roles.wipe) tips.push('No board wipes — 1 to 3 help you recover when you fall behind.');
    if (averageNonlandManaValue > 3.8) tips.push(`Average mana value ${averageNonlandManaValue} is high — expect slow starts without extra ramp.`);
    const pipTotal = COLOR_KEYS.reduce((n, c) => n + pips[c], 0);
    for (const c of COLOR_KEYS) {
      if (!pips[c] || !pipTotal) continue;
      const share = pips[c] / pipTotal, sourceShare = lands ? sources[c] / Math.max(1, lands) : 0;
      if (share > 0.25 && sourceShare < share * 0.6) tips.push(`${COLOR_NAME[c]} is ${Math.round(share * 100)}% of your colored symbols but only ${sources[c]} sources make it.`);
    }
  }
  return {
    total, lands, nonlands, unresolved, typeCounts, colorIdentityCounts, curve, roles, pips, sources, tips,
    averageNonlandManaValue,
    landPercent: total ? Number(((lands / total) * 100).toFixed(1)) : 0
  };
}
const COLOR_NAME = { W: 'White', U: 'Blue', B: 'Black', R: 'Red', G: 'Green' };
export function deckAnalyticsHtml(a = {}) {
  const t = a.typeCounts || {}, c = a.curve || {}, ci = a.colorIdentityCounts || {}, roles = a.roles || {}, pips = a.pips || {}, sources = a.sources || {};
  const esc = v => String(v).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const typeRows = ['Creature', 'Artifact', 'Enchantment', 'Instant', 'Sorcery', 'Planeswalker', 'Battle'].filter(k => Number(t[k] || 0) > 0).map(k => `<span><b>${k}</b> ${Number(t[k] || 0)}</span>`).join('');
  const peak = Math.max(1, ...Object.values(c).map(Number));
  const curveRows = ['0-1', '2', '3', '4', '5', '6', '7+'].map(k => `<span class="deck-curve__bar" style="--h:${Math.round(Number(c[k] || 0) / peak * 100)}%"><i></i><b>${Number(c[k] || 0)}</b><small>${k}</small></span>`).join('');
  const colorRows = ['W', 'U', 'B', 'R', 'G'].filter(k => Number(ci[k] || 0) > 0 || Number(pips[k] || 0) > 0).map(k => `<span><b>${COLOR_NAME[k]}</b> ${Number(pips[k] || 0)} symbols · ${Number(sources[k] || 0)} sources</span>`).join('') || '<span><b>Colorless</b></span>';
  const roleRows = Object.keys(ROLE_LABEL).map(k => `<span><b>${ROLE_LABEL[k]}</b> ${Number(roles[k] || 0)}</span>`).join('');
  return `<div class="deck-analytics-panel"><div class="deck-analytics-summary"><span><b>Cards</b> ${Number(a.total || 0)}</span><span><b>Lands</b> ${Number(a.lands || 0)} (${Number(a.landPercent || 0)}%)</span><span><b>Avg. nonland MV</b> ${Number(a.averageNonlandManaValue || 0).toFixed(2)}</span></div><div class="deck-analytics-block"><strong>TYPE COUNTS</strong><div class="deck-analytics-row">${typeRows || '<span>No resolved card types yet.</span>'}</div></div><div class="deck-analytics-block"><strong>MANA CURVE — NONLAND CARDS</strong><div class="deck-analytics-row deck-curve">${curveRows}</div></div>${a.roles ? `<div class="deck-analytics-block"><strong>WHAT THE DECK DOES</strong><div class="deck-analytics-row">${roleRows}</div></div>` : ''}<div class="deck-analytics-block"><strong>COLORS — MANA SYMBOLS AND SOURCES</strong><div class="deck-analytics-row">${colorRows}</div></div>${(a.tips || []).length ? `<div class="deck-analytics-block"><strong>SUGGESTIONS</strong><ul class="deck-tips">${a.tips.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}${a.unresolved ? `<div class="bad">${Number(a.unresolved)} unresolved card${Number(a.unresolved) === 1 ? '' : 's'} excluded from analytics.</div>` : ''}</div>`;
}
