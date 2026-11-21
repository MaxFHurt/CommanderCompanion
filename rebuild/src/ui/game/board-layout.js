// Gameplay placement from the visual handoff's maps (layout/iPhone.json, layout/iPad.json), in map units.
// The phone map is 1160 x 535 and runs full bleed (the edge chassis stretched to the screen); the iPad map is the
// 950 x 610 illustration before its contentTransform (x 0, y 1.158, scale 1.242): the stage is fitted inside the safe
// area once, which applies that transform (styles/game-board.css). No DOM here; game.js turns a rect into a style.
//
// A rect is [x, y, w, h]. Controls have a `face` (where the art and text sit, as in the map) and a `hit` (the touch
// target: at least 36 px where the map leaves room, never overlapping another target). Where a map face is smaller than
// a comfortable target the target grows into empty chassis around it; the face stays where the art is.
// Owner-facing gaps (the map leaves less than 36 px of height): phone zone keys, battlefield heading keys, coach line.

const PHONE = {
  vb: [1160, 535],
  // Nav faces: the recessed plates measured in the chassis art (the map's rects sit a few units off them).
  nav: {
    home: { face: [45.4, 4, 102.3, 21], hit: [40, 0, 113, 50] },
    'card-id': { face: [160.2, 4, 98.3, 21], hit: [153, 0, 110, 50] },
    chat: { face: [269.3, 4, 84, 21.6], hit: [263, 0, 97, 50] },
    help: { face: [827.1, 4, 80.1, 21], hit: [815, 0, 98, 50] },
    settings: { face: [918.6, 4, 90.3, 21.6], hit: [913, 0, 101.5, 50] },
    profile: { face: [1020.8, 4, 94.3, 21], hit: [1014.5, 0, 106, 50] },
    screen: { face: [366, 6, 86, 20], hit: [366, 0, 86, 50] }
  },
  wordmark: [440, 27, 280, 17],   // centred on the slot under the crest (y 31-40), on the screen's centre line
  seats: {
    // Phone: the status light sits just left of each die, inside the seat strip, so its 36 px target never meets
    // the log heading under the right seat (the map's lens spot, under the die, leaves no room there).
    left: { cluster: [58, 59, 226, 59], seat: [58, 59, 139, 59], portrait: [58, 60, 53, 57], id: [113, 60, 128, 53], idText: [117, 62, 78, 50], die: [247, 59, 37, 49], grave: [116, 100, 43, 13], exile: [162, 100, 43, 13], lens: [215, 94, 14, 14], light: [197, 59, 50, 59] },
    centre: { cluster: [360, 59, 413, 59], seat: [360, 59, 326, 59], portrait: [360, 60, 53, 57], id: [415, 60, 315, 53], idText: [419, 62, 265, 50], die: [736, 59, 37, 49], grave: [418, 100, 43, 13], exile: [464, 100, 43, 13], lens: [704, 94, 14, 14], light: [686, 59, 50, 59] },
    right: { cluster: [824, 59, 293, 59], seat: [824, 59, 206, 59], portrait: [824, 60, 53, 57], id: [879, 60, 195, 53], idText: [883, 62, 145, 50], die: [1080, 59, 37, 49], grave: [882, 100, 43, 13], exile: [928, 100, 43, 13], lens: [1048, 94, 14, 14], light: [1030, 59, 50, 59] }
  },
  opp: {
    title: [103, 136, 193, 14], labelY: 151,
    creatures: [119, 163, 158, 86], artifacts: [295.8, 162.7, 114.4, 94.6], enchantments: [464, 163, 105, 86],
    planeswalkers: [621, 163, 105, 86], lands: [769, 163, 195, 86]
  },
  heading: {
    phase: { face: [485, 250, 104, 14], hit: [485, 249.5, 104, 26] },
    counters: { face: [692, 250, 59, 14], hit: [687, 249.5, 69, 26] },
    sort: { face: [763, 250, 67, 14], hit: [758, 249.5, 77, 26] },
    view: { face: [852, 250, 66, 14], hit: [842, 249.5, 86, 26] }
  },
  mine: {
    title: [103, 250, 152, 14], chip: [262, 251, 64, 12], labelY: 263,
    creatures: [109.52, 275.64, 176.96, 96.32], artifacts: [297.88, 275.82, 110.24, 91.16], enchantments: [460.85, 275.82, 111.3, 91.16],
    planeswalkers: [617.85, 275.82, 111.3, 91.16], lands: [757.3, 275.64, 218.4, 96.32]
  },
  // Housings measured in the frame art (chassis/iPhone-*-edge.png): the log window (x 1014.6-1153, y 132.5-315.5) and one
  // pair of key housings under it (y 317.8-338.3): Board and Table sit on those. Stack / Undo and Host Tools have no
  // housing in the frame, so they keep the kit's utility key art, on the same columns, inside the window and below the pair.
  log: { cluster: [1016, 139, 132, 261], face: [1014.6, 139, 138.6, 26], hit: [1016, 139, 132, 50], rows: [1025, 169, 115, 65] },
  tools: {
    stack: { face: [1023.7, 257.75, 55.6, 20.5], hit: [1016, 244, 68.7, 50.7], art: true },
    undo: { face: [1090.1, 257.75, 56.3, 20.5], hit: [1084.7, 244, 63.3, 50.7], art: true },
    board: { face: [1023.7, 317.8, 55.6, 20.5], hit: [1016, 294.7, 68.7, 52.7] },
    table: { face: [1090.1, 317.8, 56.3, 20.5], hit: [1084.7, 294.7, 63.3, 52.7] },
    host: { face: [1023.7, 358, 122.7, 20.5], hit: [1016, 347.4, 132, 52.6], art: true }
  },
  // Jewels: hit = the map's control rect; art = where the jewel art lines up with the chassis housing (matched against
  // the art); centre = the gem's centre in the chassis, where the label sits.
  jewels: {
    context: { hit: [929, 409, 93, 114], art: [914, 404, 119.4, 114.8], centre: [973.7, 462] },
    phase: { hit: [1025, 403, 116, 123], art: [1006, 384.3, 153.2, 148.5], centre: [1083, 456] }
  },
  local: {
    portrait: [36, 355, 68, 83], commander: [36, 355, 73, 83], id: [101, 372, 110, 77],
    name: [107, 376, 102, 14], sub: [107, 390, 102, 12], die: [109, 404, 50, 44],
    lens: [160, 416, 14, 14], light: [159, 405, 52, 52], lib: [160, 430, 50, 12],
    zones: {
      // Two bars in the frame (x 97.7-198.8; y 466.5-487.5 and 492-514.2), each holding two keys side by side.
      graveyard: { face: [97.7, 466.5, 50.55, 21], hit: [36, 440, 112.25, 49.75] },
      exile: { face: [97.7, 492, 50.55, 22.2], hit: [36, 489.75, 112.25, 45.25] },
      tokens: { face: [148.25, 466.5, 50.55, 21], hit: [148.25, 457, 96.75, 32.75] },
      attachments: { face: [148.25, 492, 50.55, 22.2], hit: [148.25, 489.75, 96.75, 45.25] }
    }
  },
  // The two bars above the hand trough: the left one is the mana well, the right one the tips pane; the hand title
  // sits at the top of the trough's window (x 252.2-890.2, y 412.2-524.2).
  mana: { well: [314.1, 369.6, 186.4, 29.5] },
  tip: [634, 372, 182.3, 26.5],   // bar y 369-398.5; the target starts below the battlefield band (372)
  hand: { title: [511.2, 413, 120, 10], cards: [262, 425, 600, 98] }
};

const TABLET = {
  vb: [950, 610],
  nav: {
    home: { face: [44.3, 4, 84.1, 21], hit: [40, 0, 94, 31] },
    'card-id': { face: [138.6, 4, 81.3, 21], hit: [134, 0, 90, 31] },
    chat: { face: [229, 4, 69.3, 21.6], hit: [224, 0, 80, 31] },
    help: { face: [651.1, 4, 69.9, 21], hit: [641, 0, 85, 31] },
    settings: { face: [731.2, 4, 80.2, 21], hit: [726, 0, 90, 31] },
    profile: { face: [822.2, 4, 83.5, 21], hit: [816, 0, 95, 31] },
    screen: { face: [312, 5, 64, 22], hit: [310, 0, 68, 31] }
  },
  wordmark: [355, 27, 240, 17],
  seats: {
    left: { cluster: [54, 59, 191, 74], seat: [54, 59, 160, 59], portrait: [54, 60, 53, 57], id: [109, 60, 93, 53], idText: [113, 62, 97, 50], die: [208, 59, 37, 49], grave: [112, 100, 43, 13], exile: [158, 100, 43, 13], lens: [221, 103, 14, 14], light: [214, 104, 29, 29] },
    centre: { cluster: [286, 59, 317, 74], seat: [286, 59, 283, 59], portrait: [286, 60, 53, 57], id: [341, 60, 217, 53], idText: [345, 62, 220, 50], die: [564, 59, 37, 49], grave: [344, 100, 43, 13], exile: [390, 100, 43, 13], lens: [576, 103, 14, 14], light: [569, 104, 29, 29] },
    right: { cluster: [647, 59, 263, 74], seat: [647, 59, 229, 59], portrait: [647, 60, 53, 57], id: [702, 60, 163, 53], idText: [706, 62, 166, 50], die: [871, 59, 37, 49], grave: [705, 100, 43, 13], exile: [751, 100, 43, 13], lens: [883, 103, 14, 14], light: [876, 104, 29, 29] }
  },
  opp: {
    title: [83, 136, 190, 13], labelY: 150,
    creatures: [82, 163, 158, 122], artifacts: [244, 163, 104, 122], enchantments: [351, 163, 105, 122],
    planeswalkers: [462, 163, 105, 122], lands: [571, 163, 195, 122]
  },
  heading: {
    phase: { face: [372, 294, 104, 14], hit: [372, 286, 104, 33] },
    counters: { face: [555, 294, 59, 14], hit: [553, 286, 63, 33] },
    sort: { face: [620, 294, 67, 14], hit: [618, 286, 71, 33] },
    view: { face: [699, 294, 66, 14], hit: [697, 286, 70, 33] }
  },
  mine: {
    title: [83, 294, 150, 14], chip: [238, 295, 56, 12], labelY: 307,
    creatures: [82, 320, 158, 116], artifacts: [244, 320, 104, 116], enchantments: [351, 320, 105, 116],
    planeswalkers: [462, 320, 105, 116], lands: [571, 320, 195, 116]
  },
  // Frame (chassis/iPad-*.png): log window x 785.8-942, y 132.5-388.9; key housings y 392.8-413.3 (Board, Table).
  log: { cluster: [792, 137, 126, 315], face: [785.8, 137, 156.2, 25], hit: [792, 137, 126, 29], rows: [800, 167, 112, 183] },
  tools: {
    stack: { face: [796, 358, 63.1, 20.5], hit: [790, 350, 75, 35.5], art: true },
    undo: { face: [871, 358, 63.7, 20.5], hit: [865, 350, 75, 35.5], art: true },
    board: { face: [796, 392.8, 63.1, 20.5], hit: [790, 385.5, 75, 34] },
    table: { face: [871, 392.8, 63.7, 20.5], hit: [865, 385.5, 75, 34] },
    host: { face: [796, 426, 138.7, 20.5], hit: [790, 419.5, 150, 32.5], art: true }
  },
  jewels: {
    context: { hit: [719, 484, 93, 114], art: [704, 479, 119.4, 114.8], centre: [763.7, 537] },
    phase: { hit: [815, 478, 116, 123], art: [796, 459.3, 153.2, 148.5], centre: [873, 531] }
  },
  local: {
    portrait: [36, 430, 68, 83], commander: [36, 437, 68, 76], id: [101, 447, 110, 77],
    name: [107, 451, 102, 14], sub: [107, 465, 102, 12], die: [109, 479, 50, 44],
    lens: [160, 491, 14, 14], light: [159, 480, 52, 36], lib: [160, 505, 50, 12],
    zones: {
      graveyard: { face: [97.7, 541.5, 50.55, 21], hit: [36, 520, 112.25, 44.75] },
      exile: { face: [97.7, 567, 50.55, 22.2], hit: [36, 564.75, 112.25, 39.25] },
      tokens: { face: [148.25, 541.5, 50.55, 21], hit: [148.25, 520, 96.75, 44.75] },
      attachments: { face: [148.25, 567, 50.55, 22.2], hit: [148.25, 564.75, 96.75, 39.25] }
    }
  },
  mana: { well: [285.8, 444.6, 129, 29.5] },
  tip: [508, 444, 126.7, 29.6],
  hand: { title: [404.5, 488, 120, 10], cards: [252, 500, 425, 99] }
};

export const BOARD = { phone: PHONE, tablet: TABLET };

/** Inline style for a rect: --x --y --w --h, plus an optional face (--fx …) and a cluster that moves as one (--cl …). */
export function rectStyle(r, { face = null, cluster = null } = {}) {
  const [x, y, w, h] = r.map(n => Math.round(n * 100) / 100);
  let s = `--x:${x};--y:${y};--w:${w};--h:${h};`;
  if (face) s += `--fx:${face[0]};--fy:${face[1]};--fw:${face[2]};--fh:${face[3]};`;
  if (cluster) s += `--cl:${cluster[0]};--ct:${cluster[1]};--cr:${cluster[0] + cluster[2]};--cb:${cluster[1] + cluster[3]};`;
  return s;
}

/** A battlefield permanent's area on the map: creatures, artifacts, enchantments, planeswalkers (and battles) or lands. */
export function areaOf(card) {
  const t = card.type || '';
  if (card.land && !card.creature) return 'lands';
  if (card.creature) return 'creatures';
  if (/\b(Planeswalker|Battle)\b/.test(t)) return 'planeswalkers';
  if (/\bEnchantment\b/.test(t)) return 'enchantments';
  if (/\bArtifact\b/.test(t)) return 'artifacts';
  return card.land ? 'lands' : 'enchantments';
}

export const AREAS = ['creatures', 'artifacts', 'enchantments', 'planeswalkers', 'lands'];
export const AREA_LABEL = { creatures: 'Creatures', artifacts: 'Artifacts', enchantments: 'Enchantments', planeswalkers: 'Planeswalkers', lands: 'Lands' };

/**
 * The mana cells of the well: W U B R G C and one flexible cell (the first flexible group, or "any" with the sum
 * of all groups when there are several; the full pool stays in the player board). Each: { key, count, icon, title }.
 */
export function manaCells(mana) {
  const fixed = mana?.fixed || {};
  const cells = ['W', 'U', 'B', 'R', 'G', 'C'].map(c => ({ key: c, count: Number(fixed[c] || 0), icon: `assets/img/mana/${c}.png`, title: c }));
  const flex = mana?.flex || [];
  const sum = flex.reduce((n, g) => n + Number(g.count || 0), 0);
  const one = flex.length === 1 ? flex[0] : null;
  cells.push({
    key: 'flex', count: sum,
    icon: one && one.colors.length === 2 ? `assets/img/mana/split-${[...one.colors].sort().join('-')}.png` : 'assets/img/mana/any.png',
    title: flex.length ? flex.map(g => `${g.count} of ${g.colors.join('/')}`).join(', ') : 'Flexible mana'
  });
  return cells;
}

// ── Battlefield zones (owner, 15 Nov: "the proportions of battlefield zones need to always favor creatures") ──────────
// Each side's battlefield is one band across the recess; the zones share it by content instead of the map's fixed boxes:
// - creatures: full cards at the band's full height (the biggest cards), and always the widest zone while it has cards;
// - planeswalkers (and battles): full cards at 85% height (loyalty readable);
// - artifacts, lands and (when creatures would be short of room) enchantments: compact preview tiles (art strip, name,
//   counters, tapped), in columns of 2 (phone) or 3 (iPad); lands and identical tokens pile by name ("Forest ×6");
// - an empty zone collapses to nothing and its room goes to the others, creatures first;
// - no zone labels on the battlefield (owner, 15 Nov): zones are told apart by place and card size (aria-label only),
//   so the centre opponent's band also takes the old label row.
// Caps while creatures have cards (share of the band): planeswalkers 20%, artifacts 18%, enchantments 18%, lands 24%;
// any room creatures do not need goes back to the others, but no other zone ends wider than creatures.
export const BANDS = {
  phone: { x0: 104, x1: 1002, gap: 8, rows: 2, tile: 74, opp: { y: 152, h: 97 }, mine: { x0: 110, y: 275.6, h: 96.4 } },   // mine starts right of the commander's target
  tablet: { x0: 82, x1: 768, gap: 7, rows: 3, tile: 80, opp: { y: 151, h: 134 }, mine: { y: 320, h: 116 } }
};
const CAP = { planeswalkers: 0.2, artifacts: 0.18, enchantments: 0.18, lands: 0.24 };
const GIVE = ['lands', 'artifacts', 'enchantments', 'planeswalkers'];   // who gets spare room first (after creatures)
export const CARD_RATIO = 0.716;

/** Group compact items into piles: lands by name, identical tokens by name; everything else stays single. */
export function pilesOf(cards, area) {
  const out = [], byKey = new Map();
  for (const c of cards) {
    const pile = area === 'lands' || (c.token && !c.attachments?.length && !c.attachedTo);
    const k = pile ? `${c.name}|${c.token ? 't' : ''}|${c.def}` : `#${c.id}`;
    if (!byKey.has(k)) { const p = { key: k, cards: [] }; byKey.set(k, p); out.push(p); }
    byKey.get(k).cards.push(c);
  }
  return out;
}

/**
 * The zones of one side: { area: { rect: [x, y, w, h], mode: 'full' | 'compact', count } } for the
 * zones with cards, in left-to-right order creatures, planeswalkers, enchantments, artifacts, lands. `groups` is
 * { area: [cards] }; `side` is 'opp' or 'mine'.
 */
export function zoneLayout(groups, device, side) {
  const B = BANDS[device], S = B[side], X0 = S.x0 ?? B.x0;
  const order = ['creatures', 'planeswalkers', 'enchantments', 'artifacts', 'lands'].filter(a => groups[a]?.length);
  if (!order.length) return {};
  const h = S.h, cw = h * CARD_RATIO, ph = h * 0.85;
  const colW = B.tile + 4;
  const need = (a, mode) => {
    const cards = groups[a];
    if (mode === 'compact') return Math.ceil(pilesOf(cards, a).length / B.rows) * colW + 4;
    const hh = a === 'creatures' ? h : ph;
    return cards.reduce((n, c) => n + (c.tapped ? hh : hh * CARD_RATIO) + 4, 4);
  };
  const minOf = (a, mode) => (mode === 'compact' ? colW + 4 : (a === 'creatures' ? cw : ph * CARD_RATIO) + 8);
  const avail = B.x1 - X0 - B.gap * (order.length - 1);
  const mode = { creatures: 'full', planeswalkers: 'full', enchantments: 'full', artifacts: 'compact', lands: 'compact' };
  const hasC = order.includes('creatures');
  let w;
  const plan = () => {
    w = {};
    const others = order.filter(a => a !== 'creatures');
    if (!hasC) {
      // No creatures: the others share the band by what they hold.
      const total = others.reduce((n, a) => n + need(a, mode[a]), 0);
      for (const a of others) w[a] = Math.max(minOf(a, mode[a]), avail * need(a, mode[a]) / total);
      const over = others.reduce((n, a) => n + w[a], 0) - avail;
      if (over > 0) { const big = others.reduce((m, a) => (w[a] > w[m] ? a : m), others[0]); w[big] -= over; }
      return;
    }
    for (const a of others) w[a] = Math.max(minOf(a, mode[a]), Math.min(need(a, mode[a]), CAP[a] * avail));
    w.creatures = avail - others.reduce((n, a) => n + w[a], 0);
    const wantC = need('creatures', 'full');
    let spare = w.creatures - Math.max(wantC, minOf('creatures', 'full'));
    for (const a of GIVE) {
      if (spare <= 0 || !(a in w)) continue;
      const more = Math.min(spare, need(a, mode[a]) - w[a]);
      if (more > 0) { w[a] += more; spare -= more; w.creatures -= more; }
    }
    // Creatures stay the widest zone.
    for (let i = 0; i < 4; i++) {
      const big = others.reduce((m, a) => (w[a] > (w[m] ?? -1) ? a : m), others[0]);
      if (!big || w[big] <= w.creatures) break;
      const d = (w[big] - w.creatures) / 2;
      w[big] -= d; w.creatures += d;
    }
  };
  plan();
  if (hasC && groups.enchantments?.length && w.creatures < need('creatures', 'full')) { mode.enchantments = 'compact'; plan(); }
  const out = {};
  let x = X0;
  for (const a of order) {
    const ww = Math.max(0, w[a]);
    out[a] = { rect: [x, S.y, ww, h], mode: mode[a], count: groups[a].length };
    x += ww + B.gap;
  }
  return out;
}
