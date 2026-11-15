// Deck Builder V3 skin: the cut-steel SVGs are drawn in amethyst; one recoloured copy per other palette is written to
// deck/v3-deck-art/<palette>/ (colours with real saturation get the palette's hue; the steel greys stay).
// Run from rebuild/deck: node tools/v3-palette-art.mjs   (primary colours = styles/skin-palettes.css / cc-theme.css section 1)
import fs from 'fs';
const PAL = {'dark-alley': '#ae64f2', 'night-flight': '#8664f7', ember: '#ff555c', frost: '#a28af7', gold: '#ffcf32', forge: '#ff7928', emerald: '#2cd88e'};
const BASE_HUE = 268; // amethyst #a052ff
const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
const hue = h => { const [r, g, b] = rgb(h), mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; if (!d) return 0;
  const k = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return k * 60; };
function shift(hex, dh) {
  let [r, g, b] = rgb(hex); const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  const s = d ? d / (1 - Math.abs(2 * l - 1)) : 0; if (s < 0.18) return hex;
  const h = ((hue(hex) + dh) % 360 + 360) % 360, c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2;
  const [R, G, B] = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][Math.floor(h / 60) % 6];
  return '#' + [R, G, B].map(v => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('');
}
for (const [p, prim] of Object.entries(PAL)) {
  const dh = hue(prim) - BASE_HUE; fs.mkdirSync('v3-deck-art/' + p, {recursive: true});
  for (const f of fs.readdirSync('v3-deck-art').filter(f => f.endsWith('.svg')))
    fs.writeFileSync(`v3-deck-art/${p}/${f}`, fs.readFileSync('v3-deck-art/' + f, 'utf8').replace(/#[0-9a-fA-F]{6}\b/g, c => shift(c, dh)));
}
