"""Visual rebuild stage 2: gameplay screenshots for the owner, beside the handoff's masters, and the gameplay layout checks.

    python3 tests/shots_game.py [out_dir] [handoff_dir]     (serve rebuild/ on CC_STATIC, default :4180, first)

A four-player Guided Play game mid-turn (combat) with a crowded board (every permanent type, tokens, counters, tapped
cards, an attachment, poison and a temporary status, floating and flexible mana). Shots at 2x: iPhone 844 x 390 and
iPad 1180 x 820 in Amethyst, Ember and Frost, each beside masters/<device>-<Palette>.jpg; iPhone with the notch on the
left and on the right (safe areas simulated: 47 px sides, 21 px bottom). Checks (exit 1 on failure):
the phone stage fills the screen edge to edge; every control is a 36 px target (the map's dense readout keys at least
36 px wide) and no two targets overlap; the life text sits on its die; the mana cells show the live pool; the status
lights show green / yellow / red; with simulated safe areas no control or text leaves the safe rect.
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
    ok = len(mana['cells']) == 7 and all(c[1] == int(c[2]) for c in mana['cells']) and all(c[1] == int(fixed.get(c[0], 0) or 0) for c in mana['cells'][:6]) and mana['shown'] == str(mana['total'])
    check(f'{device}: mana well shows 7 live cells and the total', ok, str(mana))
    lights = await page.evaluate("""() => [...document.querySelectorAll('.game--gp .life-light')].map(e => [e.dataset.light, getComputedStyle(e.querySelector('.gp-lens')).backgroundImage.split('/').pop()])""")
    levels = sorted(l[0] for l in lights)
    check(f'{device}: status lights green / yellow / red with matching lens art', levels == ['green', 'green', 'red', 'yellow'] and all(l[1].startswith('status-' + l[0]) for l in lights), str(lights))


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
            await page.evaluate("document.documentElement.dataset.palette = 'amethyst'; document.documentElement.dataset.dice = 'amethyst'")
            if device == 'iPhone':
                for side in ('left', 'right'):
                    await safe_checks(page, device, side)
                    await page.evaluate(NOTCH, side)
                    await page.wait_for_timeout(300)
                    await page.screenshot(path=os.path.join(OUT, f'iPhone-game-notch-{side}.png'))
                    await page.evaluate("document.querySelectorAll('#sim-notch, body > div[style*=\"bottom:8px\"]').forEach(e => e.remove())")
            check(f'{device}: no page errors', not page.errors, str(page.errors[:3]))
            await page.context.close()
        await browser.close()
    print(f'{sum(results)}/{len(results)} passed')
    sys.exit(0 if all(results) else 1)


asyncio.run(main())
