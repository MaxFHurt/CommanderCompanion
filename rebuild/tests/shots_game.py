"""Visual rebuild stage 2: gameplay screenshots for the owner, beside the handoff's masters, and the gameplay layout checks.

    python3 tests/shots_game.py [out_dir] [handoff_dir]     (serve rebuild/ on CC_STATIC, default :4180, first)

A four-player Guided Play game mid-turn (combat) with a crowded board, then a creature-heavy board, a board with no
artifacts or planeswalkers and a land-heavy board (owner, 15 Nov: zones favour creatures, lands pile, empty zones
collapse, no zone labels). The base board has (every permanent type, tokens, counters, tapped
cards, an attachment, poison and a temporary status, floating and flexible mana). Shots at 2x: iPhone 844 x 390 and
iPad 1180 x 820 in Amethyst, Ember and Frost, each beside masters/<device>-<Palette>.jpg; iPhone with the notch on the
left and on the right (safe areas simulated: 47 px sides, 21 px bottom). Checks (exit 1 on failure):
the phone stage fills the screen edge to edge; every control is a 36 px target (the map's dense readout keys at least
36 px wide) and no two targets overlap; the life text sits on its die; the mana cells show the live pool; the status
lights show green / yellow / red; with simulated safe areas no control or text leaves the safe rect; on every board the
creatures area is the widest with the biggest cards, empty zones take no room, lands are piled by name with the right
counts; each jewel label sits within 2 px of its gem's centre and each header label within 2 px of its plate's centre.
"""
import asyncio, os, sys
from playwright.async_api import async_playwright
sys.path.insert(0, os.path.dirname(__file__))
from game_ui import mock_scryfall, start_guided, continue_to_game, tap_curtain

STATIC = os.environ.get('CC_STATIC', 'http://127.0.0.1:4180')
OUT = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else '../shots')
REF = sys.argv[2] if len(sys.argv) > 2 else '/home/user/vh'
DEVICES = {
    'iPhone': dict(viewport={'width': 844, 'height': 390}, device_scale_factor=2, is_mobile=True, has_touch=True),
    'iPad': dict(viewport={'width': 1180, 'height': 820}, device_scale_factor=2, is_mobile=True, has_touch=True),
}
PALETTE = {'amethyst': 'Amethyst', 'ember': 'Ember', 'frost': 'Frost'}

CROWD = """async () => {
  const { getSession } = await import('./src/app/session.js');
  const s = getSession(), g = s.game, host = { playerId: null, isHost: true };
  const dm = g.deviceMode; g.deviceMode = 'multi-device';
  const ed = edit => s.controller.dispatch({ type: 'edit', edit }, host);
  const def = c => g.cardDefinitions[c.definitionId] || {};
  g.players.forEach((p, i) => {
    const lib = [...p.deck.remainingLibrary];
    const lands = lib.filter(c => /Land/.test(def(c).typeLine || '')).slice(0, i === 0 ? 7 : 4);
    const others = lib.filter(c => !/Land/.test(def(c).typeLine || '')).slice(0, i === 0 ? 9 : 6);
    for (const c of [...lands, ...others]) ed({ kind: 'move', instanceId: c.instanceId, to: 'battlefield' });
    ed({ kind: 'token', playerId: p.playerId, name: 'Soldier', power: 1, toughness: 1, count: i === 0 ? 2 : 1, colors: ['W'] });
    ed({ kind: 'token', playerId: p.playerId, name: 'Treasure', typeLine: 'Token Artifact — Treasure' });
  });
  for (const p of g.players) for (const c of p.deck.battlefield) { c.enteredTurn = 0; c.controlSinceTurn = 0; }
  const me = g.players[0], bf = me.deck.battlefield;
  const creature = bf.find(c => /Creature/.test(def(c).typeLine || ''));
  const other = bf.find(c => /Artifact|Enchantment/.test(def(c).typeLine || '') && !c.token);
  if (creature) { ed({ kind: 'card-counter', instanceId: creature.instanceId, counter: '+1/+1', delta: 2 }); }
  if (creature && other) ed({ kind: 'attach', instanceId: other.instanceId, targetId: creature.instanceId });
  bf.filter(c => /Land/.test(def(c).typeLine || '')).slice(0, 3).forEach(c => ed({ kind: 'tap', instanceId: c.instanceId, tapped: true }));
  g.players[2].deck.battlefield.filter(c => /Land/.test(def(c).typeLine || '')).slice(0, 2).forEach(c => ed({ kind: 'tap', instanceId: c.instanceId, tapped: true }));
  for (const [color, n] of [['W', 2], ['U', 1], ['R', 1], ['G', 1], ['C', 1]]) ed({ kind: 'mana', playerId: me.playerId, color, delta: n });
  ed({ kind: 'poison', playerId: g.players[2].playerId, delta: 3 });
  g.players[0].noLandPlayTurn = g.turnNumber;
  ed({ kind: 'life', playerId: g.players[1].playerId, delta: -8 });
  ed({ kind: 'life', playerId: me.playerId, delta: -6 });
  for (let k = 0; k < 4; k++) ed({ kind: 'draw', playerId: me.playerId, count: 1 });
  ed({ kind: 'phase', phase: 'combat' });
  g.deviceMode = dm; s.actAs(s.actingAs());
}"""

# Later boards: each runs on the board before it, for every player.
SCENARIOS = {
    'creature-heavy': """() => { const v = window.__ccEd; v.each((p, g, ed) => ed({ kind: 'token', playerId: p.playerId, name: 'Spirit', power: 1, toughness: 1, count: 6, colors: ['W'] })); }""",
    'no-artifacts': """() => { const v = window.__ccEd; v.each((p, g, ed, def) => { for (const c of [...p.deck.battlefield]) if (/Artifact|Planeswalker/.test(def(c).typeLine || '') && !/Creature/.test(def(c).typeLine || '')) ed({ kind: 'move', instanceId: c.instanceId, to: 'graveyard' }); }); }""",
    'land-heavy': """() => { const v = window.__ccEd; v.each((p, g, ed, def) => {
      for (const c of [...p.deck.battlefield]) if (!/Land/.test(def(c).typeLine || '')) ed({ kind: 'move', instanceId: c.instanceId, to: 'graveyard' });
      for (const c of [...p.deck.remainingLibrary].filter(c => /Land/.test(def(c).typeLine || '')).slice(0, 14)) ed({ kind: 'move', instanceId: c.instanceId, to: 'battlefield' });
      ed({ kind: 'token', playerId: p.playerId, name: 'Bear', power: 2, toughness: 2, count: 1, colors: ['G'] }); }); }"""
}
EDITOR = """async () => {
  const { getSession } = await import('./src/app/session.js');
  window.__ccEd = { each(fn) {
    const s = getSession(), g = s.game, host = { playerId: null, isHost: true }, dm = g.deviceMode; g.deviceMode = 'multi-device';
    const ed = edit => s.controller.dispatch({ type: 'edit', edit }, host), def = c => g.cardDefinitions[c.definitionId] || {};
    for (const p of g.players) fn(p, g, ed, def);
    for (const p of g.players) for (const c of p.deck.battlefield) { c.enteredTurn = 0; c.controlSinceTurn = 0; }
    g.deviceMode = dm; s.actAs(s.actingAs());
  } };
}"""

# Gem centres of the two jewel housings and the nav plates' centres, measured in the chassis art (map units).
GEMS = {'iPhone': {'context': (973.7, 462), 'phase': (1083, 456)}, 'iPad': {'context': (763.7, 537), 'phase': (873, 531)}}
PLATES = {
    'iPhone': {'home': (96.55, 14.5), 'card-id': (209.35, 14.5), 'chat': (311.3, 14.8), 'help': (867.15, 14.5), 'settings': (963.75, 14.8), 'profile': (1067.95, 14.5), 'wordmark': (580, 35.5)},
    'iPad': {'home': (86.35, 14.5), 'card-id': (179.25, 14.5), 'chat': (263.65, 14.8), 'help': (686.05, 14.5), 'settings': (771.3, 14.5), 'profile': (863.95, 14.5), 'wordmark': (475, 35.5)},
}
VB = {'iPhone': (1160, 535), 'iPad': (950, 610)}
# Bottom chassis housings measured in the frame art (map units): the two zone bars (two keys each), the Board / Table key
# housings under the log, the mana well and tips pane bars above the hand, the hand window's centre line.
HOUSINGS = {
    'iPhone': {'graveyard': (97.7, 466.5, 148.25, 487.5), 'tokens': (148.25, 466.5, 198.8, 487.5), 'exile': (97.7, 492, 148.25, 514.2), 'attachments': (148.25, 492, 198.8, 514.2),
               'board': (1023.7, 317.8, 1079.3, 338.3), 'table': (1090.1, 317.8, 1146.4, 338.3), 'mana': (314.1, 369.6, 500.5, 399.1), 'tip': (634, 369, 816.3, 398.5), 'hand': (252.2, 413, 890.2, 423)},
    'iPad': {'graveyard': (97.7, 541.5, 148.25, 562.5), 'tokens': (148.25, 541.5, 198.8, 562.5), 'exile': (97.7, 567, 148.25, 589.2), 'attachments': (148.25, 567, 198.8, 589.2),
             'board': (796, 392.8, 859.1, 413.3), 'table': (871, 392.8, 934.7, 413.3), 'mana': (285.8, 444.6, 414.8, 474.1), 'tip': (508, 444, 634.7, 473.6), 'hand': (242.6, 488, 686.4, 498)},
}
# The seat windows of the top bar in the frame art (map units): text on a seat must stay inside its window.
SEAT_WINDOWS = {'iPhone': {'left': (46, 60, 306, 120), 'centre': (337, 52, 789, 124), 'right': (818, 60, 1115, 119)},
                'iPad': {'left': (44, 60, 261, 120), 'centre': (284, 52, 617, 123), 'right': (643, 60, 905, 119)}}

# Every visible control on the stage: [name, kind, left, top, right, bottom]. Cards are their own targets (sized by the
# card) and sit inside scrolling areas, so they are left out of the size check but kept in the overlap check.
TARGETS = """() => [...document.querySelectorAll('.game--gp button:not(.card), .game--gp .gp-cards')].filter(e => {
  const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden';
}).map(e => { const r = e.getBoundingClientRect();
  return [e.dataset.act ? e.dataset.act + (e.dataset.zone ? ':' + e.dataset.zone : '') + (e.dataset.id ? ':' + e.dataset.id.slice(-4) : '') : e.className.split(' ').slice(0, 3).join('.'),
    e.classList.contains('gp-cards') ? 'area' : (e.matches('.gp-readout, .gp-zone, .tip') ? 'dense' : 'main'), r.left, r.top, r.right, r.bottom]; })"""

TEXTS = """() => [...document.querySelectorAll('.game--gp .gp-face, .game--gp .seat__life, .game--gp .rail-life__value, .game--gp .gp-title, .game--gp .gp-label, .game--gp .gp-manacell, .game--gp .gp-manatotal, .game--gp .gp-manalabel, .game--gp .glog__row, .game--gp .gp-lib, .game--gp .gp-sub, .game--gp .gp-name, .game--gp .tip b, .game--gp .gp-wordmark')]
  .filter(e => e.textContent.trim() && getComputedStyle(e).visibility !== 'hidden').map(e => { const r = e.getBoundingClientRect(); return [e.textContent.trim().slice(0, 24), r.left, r.top, r.right, r.bottom]; })"""

results = []
def check(label, cond, detail=''):
    results.append(bool(cond))
    print(('  ok  ' if cond else 'FAIL  ') + label + ('' if cond else f'  {detail}'))


def pair(shot, device, palette):
    ref = os.path.join(REF, 'masters', f'{device}-{PALETTE[palette]}.jpg')
    if not os.path.exists(ref):
        return
    from PIL import Image
    a = Image.open(shot).convert('RGB')
    b = Image.open(ref).convert('RGB')
    b = b.resize((round(b.width * a.height / b.height), a.height))
    out = Image.new('RGB', (a.width + b.width + 24, a.height), (255, 255, 255))
    out.paste(a, (0, 0)); out.paste(b, (a.width + 24, 0))
    out.save(shot.replace('.png', '-vs-master.jpg'), quality=85)


async def game_page(browser, device):
    ctx = await browser.new_context(**DEVICES[device])
    await ctx.add_init_script("localStorage.setItem('cc.welcome.done', '1')")
    page = await ctx.new_page()
    page.errors = []
    page.on('pageerror', lambda e: page.errors.append(str(e)))
    await mock_scryfall(page)
    await page.goto(STATIC + '/index.html')
    await page.wait_for_function('window.__ccReady === true', timeout=15000)
    await start_guided(page, ('white', 'simic', 'rakdos', 'lab'))
    await continue_to_game(page)
    for _ in range(4):
        await page.wait_for_selector('text=opening hand'); await page.click('#keepHand'); await page.wait_for_selector('.curtain'); await tap_curtain(page)
    await page.wait_for_selector('.game--gp .zone--hand .card')
    await page.evaluate(CROWD)
    await page.wait_for_timeout(400); await tap_curtain(page); await page.wait_for_timeout(300)
    return page


def overlaps(a, b):
    return min(a[4], b[4]) - max(a[2], b[2]) > 0.5 and min(a[5], b[5]) - max(a[3], b[3]) > 0.5


async def layout_checks(page, device):
    vw, vh = DEVICES[device]['viewport']['width'], DEVICES[device]['viewport']['height']
    if device == 'iPhone':
        st = await page.evaluate("(() => { const r = document.querySelector('.gp-stage').getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; })()")
        check(f'{device}: stage and chassis fill the screen edge to edge', st == [0, 0, vw, vh], str(st))
        bg = await page.evaluate("getComputedStyle(document.querySelector('.gp-chassis')).backgroundImage")
        check(f'{device}: iPhone edge chassis', 'chassis-phone' in bg, bg)
    t = await page.evaluate(TARGETS)
    small = [x for x in t if x[1] == 'main' and (x[4] - x[2] < 35.5 or x[5] - x[3] < 35.5)]
    small += [x for x in t if x[1] == 'dense' and (x[4] - x[2] < 35.5 or x[5] - x[3] < 18)]
    check(f'{device}: controls are 36 px targets (dense readout keys 36 px wide)', not small, str([(x[0], round(x[4] - x[2]), round(x[5] - x[3])) for x in small][:8]))
    bad = [(a[0], b[0]) for i, a in enumerate(t) for b in t[i + 1:] if overlaps(a, b)]
    check(f'{device}: no two targets overlap', not bad, str(bad[:6]))
    cards = await page.evaluate("""() => [...document.querySelectorAll('.game--gp .card')].map(c => { const r = c.getBoundingClientRect(), a = c.closest('.gp-cards').getBoundingClientRect();
      return r.top >= a.top - 1 && r.bottom <= a.bottom + 1; })""")
    check(f'{device}: every card fits its area height ({len(cards)} cards)', cards and all(cards))
    die = await page.evaluate("""() => [...document.querySelectorAll('.game--gp .gp-die')].map(d => { const b = d.querySelector('b'), r = d.getBoundingClientRect(), q = b.getBoundingClientRect();
      const cx = (q.left + q.right) / 2, cy = (q.top + q.bottom) / 2;
      return [b.textContent, cx > r.left && cx < r.right && cy > r.top && cy < r.bottom && q.width < r.width, getComputedStyle(d).backgroundImage.includes('die.webp')]; })""")
    lives = await page.evaluate("async () => (await import('./src/app/session.js')).getSession().view().players.map(p => String(p.life))")
    check(f'{device}: life drawn as live text on each die', len(die) == 4 and all(d[1] and d[2] for d in die) and sorted(d[0] for d in die) == sorted(lives), f'{die} {lives}')
    mana = await page.evaluate("""async () => { const v = (await import('./src/app/session.js')).getSession().view(), me = v.players.find(p => p.playerId === v.you);
      const cells = [...document.querySelectorAll('.gp-manacell')].map(c => [c.dataset.mana, Number(c.dataset.count), c.querySelector('b').textContent]);
      return { cells, fixed: me.mana.fixed, total: me.mana.total, shown: document.querySelector('.gp-manatotal b').textContent }; }""")
    fixed = mana['fixed']
    want = {k: int(v) for k, v in fixed.items() if int(v or 0) > 0}
    got = {c[0]: c[1] for c in mana['cells'] if c[0] != 'flex'}
    ok = got == want and all(c[1] == int(c[2]) and c[1] > 0 for c in mana['cells']) and mana['shown'] == str(mana['total'])
    check(f'{device}: mana well shows the live pool (like mana together, empty colours hidden) and the total', ok, str(mana))
    lights = await page.evaluate("""() => [...document.querySelectorAll('.game--gp .life-light')].map(e => [e.dataset.light, getComputedStyle(e.querySelector('.gp-lens')).backgroundImage.split('/').pop()])""")
    levels = sorted(l[0] for l in lights)
    check(f'{device}: status lights green / yellow / red with matching lens art', levels == ['green', 'green', 'red', 'yellow'] and all(l[1].startswith('status-' + l[0]) for l in lights), str(lights))


async def board_checks(page, device, name):
    """Owner, 15 Nov: creatures widest with the biggest cards; empty zones collapse; lands piled by name; no zone labels."""
    r = await page.evaluate("""async () => {
      const v = (await import('./src/app/session.js')).getSession().view(), me = v.players.find(p => p.playerId === v.you);
      const centre = document.querySelector('.seat--centre').dataset.id, opp = v.players.find(p => p.playerId === centre);
      const side = sel => [...document.querySelectorAll(sel)].map(a => ({ area: a.dataset.area, w: a.getBoundingClientRect().width, n: a.children.length,
        h: Math.max(0, ...[...a.querySelectorAll('.card')].map(c => c.getBoundingClientRect().height)),
        piles: a.dataset.area === 'lands' ? [...a.querySelectorAll('.card')].map(c => [c.getAttribute('aria-label'), Number(c.dataset.count)]) : null }));
      const lands = p => { const m = {}; for (const c of p.battlefield.filter(c => c.land && !c.creature)) m[c.name] = (m[c.name] || 0) + 1; return m; };
      return { mine: side('.zone--battle .gp-cards, .zone--lands .gp-cards'), opp: side('.seat--centre .gp-cards'), myLands: lands(me), oppLands: lands(opp),
        labels: document.querySelectorAll('.game--gp .gp-label').length };
    }""")
    for who in ('mine', 'opp'):
        areas = r[who]
        cre = [a for a in areas if a['area'] == 'creatures']
        others = [a for a in areas if a['area'] != 'creatures']
        if cre:
            ok = all(cre[0]['w'] >= a['w'] - 0.5 for a in others) and all(cre[0]['h'] >= a['h'] - 0.5 for a in others)
            check(f'{device} {name} {who}: creatures area is the widest, with the biggest cards', ok, str([(a['area'], round(a['w']), round(a['h'])) for a in areas]))
        check(f'{device} {name} {who}: empty zones collapsed', all(a['n'] > 0 for a in areas), str([(a['area'], a['n']) for a in areas]))
        want = r['myLands' if who == 'mine' else 'oppLands']
        got = {}
        for a in areas:
            for nm, n in a['piles'] or []:
                got[nm] = got.get(nm, 0) + n
        piles = [p for a in areas for p in (a['piles'] or [])]
        check(f'{device} {name} {who}: lands piled by name with the right counts', got == want and len(piles) == len(want), f'{got} vs {want}')
    check(f'{device} {name}: no zone labels on the battlefield', r['labels'] == 0, str(r['labels']))


async def align_checks(page, device):
    """Jewel labels on their gem centres, header labels on their plates' centres (within 2 px)."""
    r = await page.evaluate("""() => {
      const st = document.querySelector('.gp-stage').getBoundingClientRect();
      const mid = el => { const g = document.createRange(); g.selectNodeContents(el); const b = g.getBoundingClientRect(); return [(b.left + b.right) / 2, (b.top + b.bottom) / 2]; };
      const nav = {};
      for (const a of ['home', 'card-id', 'chat', 'help', 'settings', 'profile']) nav[a] = mid(document.querySelector(`.game--gp [data-act="${a}"] .gp-face`));
      nav.wordmark = mid(document.querySelector('.gp-wordmark'));
      const jewels = [...document.querySelectorAll('.gp-jewel')].map(b => [b.className.match(/gp-jewel--([a-z-]+)/)[1], ...(() => { const q = b.querySelector('.gp-jewel__label').getBoundingClientRect(); return [(q.left + q.right) / 2, (q.top + q.bottom) / 2]; })()]);
      return { st: [st.left, st.top, st.width, st.height], nav, jewels };
    }""")
    sx, sy = r['st'][2] / VB[device][0], r['st'][3] / VB[device][1]
    px = lambda c: (r['st'][0] + c[0] * sx, r['st'][1] + c[1] * sy)
    off = {k: (round(v[0] - px(PLATES[device][k])[0], 1), round(v[1] - px(PLATES[device][k])[1], 1)) for k, v in r['nav'].items()}
    check(f'{device}: header labels centred in their plates (2 px)', all(abs(a) <= 2 and abs(b) <= 2 for a, b in off.values()), str(off))
    joff = []
    for slot, x, y in r['jewels']:
        if slot in ('context', 'phase'):
            gx, gy = px(GEMS[device][slot]); joff.append((slot, round(x - gx, 1), round(y - gy, 1)))
    check(f'{device}: jewel labels on their gem centres (2 px)', joff and all(abs(a) <= 2 and abs(b) <= 2 for _, a, b in joff), str(joff))
    art = await page.evaluate("""() => [...document.querySelectorAll('.gp-jewel > .gp-face, .gp-jewel-off, .gp-jewel-art')].map(e => { const b = e.getBoundingClientRect(); return [b.left, b.top, b.width, b.height]; })""")
    check(f'{device}: jewel art boxes drawn', len(art) >= 2 and all(a[2] > 40 for a in art), str(art))


async def chassis_checks(page, device):
    """Owner, 21 Nov: bottom controls centred in their frame housings (2 px); top-bar text never crosses its zone; the tips
    pane's lines always fit (shrunk if needed, never cut) inside the pane."""
    r = await page.evaluate("""() => {
      const st = document.querySelector('.gp-stage').getBoundingClientRect();
      const text = el => { const g = document.createRange(); g.selectNodeContents(el); const b = g.getBoundingClientRect(); return [b.left, b.top, b.right, b.bottom]; };
      const box = el => { const b = el.getBoundingClientRect(); return [b.left, b.top, b.right, b.bottom]; };
      const ctl = {};
      for (const z of ['graveyard', 'tokens', 'exile', 'attachments']) ctl[z] = text(document.querySelector(`.gp-zone[data-zone="${z}"] .gp-fit`));
      for (const a of ['board', 'table']) ctl[a] = text(document.querySelector(`.gp-tool[data-act="${a}"] .gp-fit`));
      ctl.mana = box(document.querySelector('.gp-mana'));
      ctl.hand = text(document.querySelector('.gp-handtitle'));
      const tip = document.querySelector('.game--gp .tip');
      const lines = [...tip.querySelectorAll('[data-fit]')].map(e => ({ t: e.textContent, cut: e.scrollWidth > e.clientWidth + 0.5, r: text(e), fs: parseFloat(getComputedStyle(e).fontSize) }));
      const seats = [...document.querySelectorAll('.game--gp .seat')].map(s => ({ side: s.dataset.side, lines: [...s.querySelectorAll('.gp-idtext [data-fit]')].map(e => ({ t: e.textContent.trim(),
        b: box(e), cut: e.scrollWidth > e.clientWidth + 0.5, clip: getComputedStyle(e).overflow === 'hidden' && getComputedStyle(e).textOverflow === 'ellipsis', title: !!e.title })) }));
      const boxes = document.querySelectorAll('.game--gp .gp-inset.gp-id, .game--gp .gp-idtext .gp-inset').length;
      const nav = ['home', 'card-id', 'chat', 'help', 'settings', 'profile'].map(a => { const e = document.querySelector(`.game--gp [data-act="${a}"] .gp-fit`), f = e.parentElement;
        return [a, e.scrollWidth > e.clientWidth + 0.5, ...box(e), ...box(f)]; });
      return { st: [st.left, st.top, st.width, st.height], ctl, tip: [box(tip), lines], seats, boxes, nav };
    }""")
    sx, sy = r['st'][2] / VB[device][0], r['st'][3] / VB[device][1]
    px = lambda x, y: (r['st'][0] + x * sx, r['st'][1] + y * sy)
    H = HOUSINGS[device]
    off = {}
    for k, b in r['ctl'].items():
        x0, y0, x1, y1 = H['tip' if k == 'tip' else k]
        cx, cy = px((x0 + x1) / 2, (y0 + y1) / 2)
        off[k] = (round((b[0] + b[2]) / 2 - cx, 1), round((b[1] + b[3]) / 2 - cy, 1))
    bad = {k: v for k, v in off.items() if abs(v[0]) > 2 or abs(v[1]) > 2}
    check(f'{device}: bottom controls centred in their frame housings (2 px)', not bad, str(bad))
    tipbox, lines = r['tip']
    tx0, ty0, tx1, ty1 = H['tip']; (a0, b0), (a1, b1) = px(tx0, ty0), px(tx1, ty1)
    inside = all(l['r'][0] >= a0 - 0.5 and l['r'][2] <= a1 + 0.5 and l['r'][1] >= b0 - 0.5 and l['r'][3] <= b1 + 0.5 for l in lines)
    check(f'{device}: tips pane lines fit the pane, uncut ({len(lines)} lines)', lines and len(lines) <= 2 and inside and not any(l['cut'] for l in lines), str(lines))
    W = SEAT_WINDOWS[device]
    out = []
    for seat in r['seats']:
        w = W.get(seat['side'])
        if not w:
            continue
        (wx0, wy0), (wx1, wy1) = px(w[0], w[1]), px(w[2], w[3])
        for l in seat['lines']:
            b = l['b']
            if b[0] < wx0 - 0.5 or b[2] > wx1 + 0.5 or b[1] < wy0 - 0.5 or b[3] > wy1 + 0.5 or (l['cut'] and not (l['clip'] and l['title'])):
                out.append((seat['side'], l['t'], [round(v) for v in b]))
    check(f'{device}: top-bar seat text stays inside its window (shrunk, then "…" with the full value in its title)', not out, str(out[:6]))
    navbad = [n[0] for n in r['nav'] if n[1] or n[2] < n[6] - 0.5 or n[4] > n[8] + 0.5]
    check(f'{device}: nav labels fit their plates', not navbad, str(navbad))
    check(f'{device}: no drawn boxes behind seat readouts', r['boxes'] == 0, str(r['boxes']))


async def safe_checks(page, device, side):
    """Simulated iPhone safe area (env() is 0 in Chromium): nothing to tap or read may leave the safe rect."""
    await page.evaluate("""() => { const s = document.documentElement.style; s.setProperty('--safe-l', '47px'); s.setProperty('--safe-r', '47px'); s.setProperty('--safe-b', '21px'); }""")
    await page.wait_for_timeout(200)
    vw, vh = DEVICES[device]['viewport']['width'], DEVICES[device]['viewport']['height']
    t = await page.evaluate(TARGETS)
    out = [x[0] for x in t if x[2] < 46.5 or x[4] > vw - 46.5 or x[5] > vh - 20.5]
    check(f'{device} {side}: every target inside the safe area', not out, str(out[:8]))
    txt = await page.evaluate(TEXTS)
    out = [x[0] for x in txt if (x[1] + x[3]) / 2 < 47 or (x[1] + x[3]) / 2 > vw - 47 or (x[2] + x[4]) / 2 > vh - 21]
    check(f"{device} {side}: text centred inside the safe area", not out, str([x for x in txt if x[0] in out][:8]))
    bad = [(a[0], b[0]) for i, a in enumerate(t) for b in t[i + 1:] if overlaps(a, b)]
    check(f'{device} {side}: no two targets overlap with the safe area applied', not bad, str(bad[:6]))
    st = await page.evaluate("(() => { const r = document.querySelector('.gp-chassis').getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; })()")
    check(f'{device} {side}: chassis still full bleed', st == [0, 0, vw, vh], str(st))


NOTCH = """(side) => { const d = document.createElement('div'); d.id = 'sim-notch';
  d.style.cssText = 'position:fixed;z-index:9999;pointer-events:none;top:50%;transform:translateY(-50%);width:32px;height:162px;background:#000;border-radius:' + (side === 'left' ? '0 20px 20px 0;left:0' : '20px 0 0 20px;right:0');
  const h = document.createElement('div'); h.style.cssText = 'position:fixed;z-index:9999;pointer-events:none;left:50%;bottom:8px;width:200px;height:5px;margin-left:-100px;border-radius:3px;background:rgba(255,255,255,.85)';
  document.body.append(d, h); document.body.style.borderRadius = '0'; }"""


async def main():
    os.makedirs(OUT, exist_ok=True)
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        for device in DEVICES:
            page = await game_page(browser, device)
            for palette in PALETTE:
                await page.evaluate(f"document.documentElement.dataset.palette = '{palette}'; document.documentElement.dataset.dice = '{palette}'")
                await page.wait_for_timeout(700)
                shot = os.path.join(OUT, f'{device}-game-{palette}.png')
                await page.screenshot(path=shot)
                pair(shot, device, palette)
                if palette == 'amethyst':
                    await layout_checks(page, device)
                    await board_checks(page, device, 'crowded')
                    await align_checks(page, device)
                    await chassis_checks(page, device)
            await page.evaluate("document.documentElement.dataset.palette = 'amethyst'; document.documentElement.dataset.dice = 'amethyst'")
            if device == 'iPhone':
                for side in ('left', 'right'):
                    await safe_checks(page, device, side)
                    await page.evaluate(NOTCH, side)
                    await page.wait_for_timeout(300)
                    await page.screenshot(path=os.path.join(OUT, f'iPhone-game-notch-{side}.png'))
                    await page.evaluate("document.querySelectorAll('#sim-notch, body > div[style*=\"bottom:8px\"]').forEach(e => e.remove())")
                await page.evaluate("() => { const s = document.documentElement.style; for (const k of ['--safe-l', '--safe-r', '--safe-b']) s.removeProperty(k); }")
            await page.evaluate(EDITOR)
            for name, js in SCENARIOS.items():
                await page.evaluate(js)
                await page.wait_for_timeout(400); await tap_curtain(page); await page.wait_for_timeout(300)
                await page.screenshot(path=os.path.join(OUT, f'{device}-game-{name}.png'))
                await board_checks(page, device, name)
                await chassis_checks(page, device)
            # a game prompt may be up after the edits: put it aside (it reopens from its jewel)
            await page.evaluate("async () => (await import('./src/ui/modal.js')).closeAllModals()"); await page.wait_for_timeout(200)
            pile = page.locator('.zone--lands .card[data-act="pile"]').first
            n = int(await pile.get_attribute('data-count'))
            await pile.click(); await page.wait_for_selector('.modal .card')
            shown = await page.locator('.modal .card').count()
            await page.locator('.modal .card').first.click(); await page.wait_for_selector('.card-detail')
            check(f'{device}: a land pile opens its {n} cards, each opening its detail and actions', shown == n and await page.locator('.modal .btn, .modal button').count() > 1, f'{shown} vs {n}')
            await page.click('.modal [data-modal-back]'); await page.wait_for_timeout(200)
            check(f'{device}: no page errors', not page.errors, str(page.errors[:3]))
            await page.context.close()
        await browser.close()
    print(f'{sum(results)}/{len(results)} passed')
    sys.exit(0 if all(results) else 1)


asyncio.run(main())
