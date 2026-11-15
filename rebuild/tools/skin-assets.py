#!/usr/bin/env python3
"""Copies the visual-handoff art the game app uses into assets/skin/, as WebP, sized for an iPad at 2x at most.

    python3 -I tools/skin-assets.py /path/to/extracted/handoff [--sizes]   (about 2 minutes)
    python3 -I tools/skin-assets.py --dice [life-dice folder]               (reward dice art -> assets/skin/dice/)
    python3 -I tools/skin-assets.py --mats [playmats folder]                (reward playmats -> assets/skin/mats/, prints palette picks)
    python3 -I tools/skin-assets.py --css                                  (only rewrite styles/skin-palettes.css)

Layout written (ids are the app's lower-case playmat ids, data/playmats.js):
  assets/skin/shared/      crest, inset readout, one small thumbnail per playmat      (precached)
  assets/skin/amethyst/    the free palette's controls, header plate and playmat      (precached)
  assets/skin/<other>/     the other seven palettes: tools/stamp.mjs leaves them out of precache.json; the browser
                           fetches them when that playmat is chosen and the service worker keeps them (sw.js SKIN cache).
Only what styles/skin.css uses is copied. Masters, previews, SVG wrappers and the ZIPs stay out of assets/.
The lit palette variants in the handoff are its neutral art with the light masks already tinted in the palette's primary
and secondary colours, so the app uses those directly (one palette's files download, not neutral art plus two masks).
"""
import json
import os
import sys
from PIL import Image

PALETTES = ['Amethyst', 'Dark-Alley', 'Night-Flight', 'Ember', 'Frost', 'Gold', 'Forge', 'Emerald']
# family dir in handoff -> (output name, states, (max_w, max_h) or None for native size)
FAMILIES = [
    ('nav', 'nav', ['normal', 'pressed', 'disabled'], (None, 128)),
    ('tab-key', 'tab', ['on', 'off', 'disabled'], (None, 128)),
    ('dialog', 'dialog', ['normal'], None),
    ('screen-header', 'header', ['normal'], None),          # also the Landing header (Landing-Header.png is Amethyst's plate)
    ('input-well', 'input-well', ['normal'], None),
    ('separator', 'separator', ['normal'], None),
    ('switch', 'switch', ['on', 'off', 'disabled'], (None, 72)),
    ('check', 'check', ['checked', 'unchecked', 'disabled'], (None, 96)),
    ('radio', 'radio', ['selected', 'unselected', 'disabled'], (None, 96)),
    ('slider-rail', 'slider-rail', ['normal'], None),
    ('toggle-thumb', 'thumb', ['normal', 'pressed', 'disabled'], (None, 96)),
    ('attack', 'start', ['normal', 'pressed', 'disabled'], (None, 360)),
    ('phase', 'continue', ['normal', 'pressed', 'disabled'], (None, 360)),
    ('utility', 'utility', ['normal', 'pressed', 'disabled'], (None, 120)),   # game: Stack / Undo / Board / Table / Host Tools
]
# Gameplay (stage 2): one-piece chassis per device (the housings are baked in) and the life die, per palette.
# (handoff path with {p} for the palette, output name, (max_w, max_h) or None)
GAME = [
    ('art/chassis/iPhone-{p}-edge.png', 'chassis-phone', (1800, None)),   # full-bleed iPhone foreground, 1160 x 535 map
    ('art/chassis/iPad-{p}.png', 'chassis-tablet', None),                 # iPad foreground, 950 x 610 illustration
    ('life-dice/{p}.png', 'die', (None, 200)),                            # the life die (chosen independently: data-dice)
]
# The player status light (art/status, amber in the handoff) tinted per state (owner, 15 Nov: green / yellow / red).
STATUS_TINTS = {'green': 105, 'yellow': 18, 'red': -32}   # hue shift in degrees from the amber lens
QUALITY = 82


def pid(name):
    return name.lower()


def fit(im, box):
    if not box:
        return im
    mw, mh = box
    scale = min((mw / im.width) if mw else 1, (mh / im.height) if mh else 1, 1)
    if scale >= 1:
        return im
    return im.resize((round(im.width * scale), round(im.height * scale)), Image.LANCZOS)


def save(im, out, lossless=False):
    os.makedirs(os.path.dirname(out), exist_ok=True)
    if im.mode not in ('RGB', 'RGBA'):
        im = im.convert('RGBA')
    im.save(out, 'WEBP', quality=QUALITY, method=6, lossless=lossless)
    return os.path.getsize(out)


def hue_shift(im, degrees):
    """Rotate the hue of the coloured (lit) pixels; the steel rim (grey) keeps its look."""
    import colorsys
    px = im.load()
    out = im.copy()
    po = out.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if not a:
                continue
            h, l, s = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
            if s < 0.25:
                continue
            r2, g2, b2 = colorsys.hls_to_rgb((h + degrees / 360) % 1, l, s)
            po[x, y] = (round(r2 * 255), round(g2 * 255), round(b2 * 255), a)
    return out


def write_css(root):
    """styles/skin-palettes.css: one block of --sk-* image variables per palette. A palette's images download only once
    its block applies, i.e. when that playmat is chosen. Both this file and skin.css live in styles/, so the relative
    url()s resolve the same wherever the variables are used."""
    lines = ['/* Generated by tools/skin-assets.py (do not edit): the art for each palette, as --sk-* variables used by',
             ' * styles/skin.css. :root (no data-palette yet) is Amethyst. */']
    for p in PALETTES:
        sel = ':root, :root[data-palette="amethyst"]' if p == 'Amethyst' else f':root[data-palette="{pid(p)}"]'
        decl = [f'--sk-playmat: url("../assets/skin/{pid(p)}/playmat.webp")']
        for fam, name, states, box in FAMILIES:
            for st in states:
                var = f'--sk-{name}' if states == ['normal'] else f'--sk-{name}-{st}'
                file = f'{name}.webp' if states == ['normal'] else f'{name}-{st}.webp'
                decl.append(f'{var}: url("../assets/skin/{pid(p)}/{file}")')
        for _, name, _ in GAME:
            if name != 'die':
                decl.append(f'--sk-{name}: url("../assets/skin/{pid(p)}/{name}.webp")')
        lines.append(sel + ' {\n  ' + ';\n  '.join(decl) + ';\n}')
    # The life die follows data-dice (data/dice.js: chosen on its own, default the playmat's die), not the palette.
    for p in PALETTES:
        sel = ':root, :root[data-dice="amethyst"]' if p == 'Amethyst' else f':root[data-dice="{pid(p)}"]'
        lines.append(f'{sel} {{ --sk-die: url("../assets/skin/{pid(p)}/die.webp"); }}')
    with open(os.path.join(root, 'styles', 'skin-palettes.css'), 'w') as f:
        f.write('\n'.join(lines) + '\n')


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    src = os.path.abspath(args[0] if args else '/home/user/vh')
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    dest = os.path.join(root, 'assets', 'skin')
    write_css(root)
    if '--css' in sys.argv:
        return
    if '--mats' in sys.argv:   # reward playmats -> assets/skin/mats/<id>/{phone,pad,thumb}.webp (lazy); prints the nearest palette
        d = args[0] if args else os.path.join(root, 'roadmap', 'visual-handoff', 'rewards', 'playmats')
        pal = json.load(open(os.path.join(root, 'roadmap', 'visual-handoff', 'layout-reference', 'palettes.json')))
        hexrgb = lambda h: tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))
        for m in json.load(open(os.path.join(d, 'manifest.json')))['playmats']:
            out = os.path.join(dest, 'mats', m['id'])
            pad = Image.open(os.path.join(d, m['images']['iPad']['path'])).convert('RGB')
            save(fit(pad, (1640, None)), os.path.join(out, 'pad.webp'))
            save(Image.open(os.path.join(d, m['images']['iPhone']['path'])).convert('RGB'), os.path.join(out, 'phone.webp'))
            save(fit(pad, (320, None)), os.path.join(out, 'thumb.webp'))
            # dominant hue: circular mean of the pixel hues weighted by saturation x brightness, then the palette primary with the closest hue
            import colorsys, math
            x = y = 0.0
            for (R, G, B) in pad.resize((64, 40)).get_flattened_data() if hasattr(pad, 'get_flattened_data') else pad.resize((64, 40)).getdata():
                h, sat, v = colorsys.rgb_to_hsv(R / 255, G / 255, B / 255)
                k = sat * v * v
                x += k * math.cos(h * 2 * math.pi); y += k * math.sin(h * 2 * math.pi)
            hue = (math.atan2(y, x) / (2 * math.pi)) % 1
            dist = lambda n: min(abs(hue - colorsys.rgb_to_hsv(*[c / 255 for c in hexrgb(pal[n]['primary'])])[0]) % 1, 1 - abs(hue - colorsys.rgb_to_hsv(*[c / 255 for c in hexrgb(pal[n]['primary'])])[0]) % 1)
            best = min(pal, key=dist)
            c = (round(hue * 360), 0, 0)
            print(f"{m['id']}\t{best.lower()}\thue {c[0]}")
        return
    if '--dice' in sys.argv:   # reward dice art (lazy: assets/skin/dice/ is not precached); args[0] = the life-dice folder
        d = args[0] if args else os.path.join(root, 'roadmap', 'visual-handoff', 'rewards', 'life-dice')
        for o in json.load(open(os.path.join(d, 'options-additions.json')))['options']:
            im = Image.open(os.path.join(d, o['art'])).convert('RGBA')
            n = save(fit(im, (None, 256)), os.path.join(dest, 'dice', o['id'].lower() + '.webp'))
            print(f"dice/{o['id'].lower()}.webp {n:,d} bytes")
        return
    totals = {}
    sizes = {}

    def put(rel_src, rel_out, box=None, lossless=False):
        im = Image.open(os.path.join(src, rel_src))
        im.load()
        im = fit(im.convert('RGBA') if 'A' in im.getbands() or im.mode == 'P' else im.convert('RGB'), box)
        n = save(im, os.path.join(dest, rel_out), lossless)
        group = rel_out.split('/')[0]
        totals[group] = totals.get(group, 0) + n
        sizes[rel_out] = [im.width, im.height, n]

    put('art/identity/Commander-Companion-Crest.png', 'shared/crest.webp', (None, 220))
    put('art/status/inset-readout.png', 'shared/inset-readout.webp', None, lossless=True)
    light = Image.open(os.path.join(src, 'art/status/player-status-light.png')).convert('RGBA').resize((96, 96), Image.LANCZOS)
    for state, shift in STATUS_TINTS.items():
        n = save(hue_shift(light, shift), os.path.join(dest, f'shared/status-{state}.webp'))
        totals['shared'] = totals.get('shared', 0) + n
    for p in PALETTES:
        put(f'playmats/{p}.jpg', f'shared/thumb-{pid(p)}.webp', (320, 180))
        put(f'playmats/{p}.jpg', f'{pid(p)}/playmat.webp', (2360, 1640))
        for fam, name, states, box in FAMILIES:
            for s in states:
                out = f'{pid(p)}/{name}.webp' if states == ['normal'] else f'{pid(p)}/{name}-{s}.webp'
                put(f'art/{fam}/{p}-{s}.png', out, box)
        for path, name, box in GAME:
            put(path.format(p=p), f'{pid(p)}/{name}.webp', box)

    if '--sizes' in sys.argv:
        print(json.dumps({k: v for k, v in sizes.items() if k.startswith(('shared/', 'amethyst/'))}, indent=0))
    for k in sorted(totals):
        print(f'{k:14s} {totals[k]:>9,d} bytes')
    print(f'{"all":14s} {sum(totals.values()):>9,d} bytes; precached (shared + amethyst): '
          f'{totals.get("shared", 0) + totals.get("amethyst", 0):,d}')


if __name__ == '__main__':
    main()
