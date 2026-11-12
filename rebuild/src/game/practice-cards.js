// The Deck Builder's compact card rows (deck/engine/library.js fromScryfall: n, m, t, o, ci, cmc, pt, id, fc …) turned back
// into the Scryfall shape the game side reads (scryfallToDefinition), for real practice games (roadmap 5.3).
// The compact rows keep each face's name, cost, type and power/toughness; the faces' rules text is joined with " // ".

const BASIC_COLOR = { Plains: 'W', Island: 'U', Swamp: 'B', Mountain: 'R', Forest: 'G', Wastes: null };

function splitPt(pt) {
  const m = String(pt || '').match(/^([^/]+)\/(.+)$/);
  if (m) return { power: m[1], toughness: m[2] };
  const l = String(pt || '').match(/^Loyalty (.+)$/);
  if (l) return { loyalty: l[1] };
  const d = String(pt || '').match(/^Defense (.+)$/);
  return d ? { defense: d[1] } : {};
}
const colorsOf = cost => [...new Set(String(cost || '').match(/[WUBRG]/g) || [])];

/** One compact row → a Scryfall-shaped card. */
export function scryfallFromCompact(c) {
  if (!c) return null;
  const id = c.id || `dc-${String(c.n).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  const base = {
    object: 'card', id, oracle_id: c.oid || '', name: c.n, mana_cost: c.m || '', type_line: c.t || '', oracle_text: c.o || '',
    color_identity: c.ci || [], colors: colorsOf(c.m), cmc: Number(c.cmc || 0), keywords: [], set: c.sc || '', set_name: c.set || '',
    collector_number: c.cn || '', rarity: c.rar || '', lang: 'en', layout: 'normal', legalities: { commander: c.cmd ? 'legal' : 'not_legal' },
    ...splitPt(c.pt)
  };
  // Two named halves: faces (transform, modal double-faced, split, adventure, flip).
  if (/ \/\/ /.test(c.n)) {
    const names = c.n.split(' // ');
    const texts = String(c.o || '').split(' // '), costs = String(c.m || '').split(' // '), types = String(c.t || '').split(' // ');
    const faces = names.map((n, k) => {
      const f = (c.fc && c.fc[k]) || {};
      const cost = f.m ?? costs[k] ?? '';
      return { object: 'card_face', name: f.n || n, mana_cost: cost || '', type_line: f.t || types[k] || '', oracle_text: texts[k] ?? '', colors: colorsOf(cost), ...splitPt(f.pt || (k === 0 ? c.pt : '')) };
    });
    // split and adventure cards keep both costs on the card; the faces' type lines decide which kind it is
    const tl = String(c.t || '');
    base.layout = c.df ? (/\bLand\b/.test(faces[1]?.type_line || '') || faces[1]?.mana_cost ? 'modal_dfc' : 'transform') : /Adventure/.test(faces[1]?.type_line || '') ? 'adventure' : / \/\/ /.test(tl) ? 'split' : 'normal';
    base.card_faces = faces;
    if (c.df) { delete base.oracle_text; base.mana_cost = faces[0].mana_cost; base.type_line = faces[0].type_line; }
  }
  return base;
}

/** A basic land in the Scryfall shape, for decks whose basics are not in the card data. */
export function basicLand(name) {
  const col = BASIC_COLOR[name];
  return { object: 'card', id: `basic-${name.toLowerCase()}`, name, mana_cost: '', type_line: `Basic Land — ${name}`, oracle_text: col ? `({T}: Add {${col}}.)` : '{T}: Add {C}.', color_identity: col ? [col] : [], colors: [], cmc: 0, keywords: [], layout: 'normal', lang: 'en', legalities: { commander: 'legal' } };
}
export const BASICS = Object.keys(BASIC_COLOR);
