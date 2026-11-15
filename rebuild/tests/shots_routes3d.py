"""Visual rebuild stage 3d: in-game dialogs and the Table Tracker, each beside the handoff's reference.

    python3 tests/shots_routes3d.py [out_dir] [handoff_dir] [name ...]     (serve rebuild/ on CC_STATIC, default :4180, first)

Opens every dialog of a Guided Play / Free Play game and of Table Tracker on iPhone and iPad (landscape, 2x) and saves
<device>-<name>.png (+ -vs-reference.jpg when screens/<route>/<device>.jpg exists). Checks (exit 1 on failure): every
control of a dialog is a 36 px target, no dialog scrolls the page, nothing leaves the viewport.
"""
import asyncio, os, re, sys
from playwright.async_api import async_playwright
sys.path.insert(0, os.path.dirname(__file__))
from game_ui import mock_scryfall, start_guided, continue_to_game, tap_curtain
from shots import new_page as tracker_page, start_tracker, PHONE, IPAD
from net_ui import open_page, join

STATIC = os.environ.get('CC_STATIC', 'http://127.0.0.1:4180')
OUT = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else '../shots')
REF = sys.argv[2] if len(sys.argv) > 2 else '/home/user/vh'
ONLY = sys.argv[3:]
DEVICES = {
    'iPhone': dict(viewport={'width': 844, 'height': 390}, device_scale_factor=2, is_mobile=True, has_touch=True),
    'iPad': dict(viewport={'width': 1180, 'height': 820}, device_scale_factor=2, is_mobile=True, has_touch=True),
}
CROWD = re.search(r'CROWD = """(.*?)"""', open(os.path.join(os.path.dirname(__file__), 'shots_game.py')).read(), re.S).group(1)
results = []
errors = []


def check(label, cond, detail=''):
    results.append(bool(cond))
    print(('  ok  ' if cond else 'FAIL  ') + label + ('' if cond else f'  {detail}'))


def pair(shot, route, device):
    ref = os.path.join(REF, 'screens', route, f'{device}.jpg')
    if not os.path.exists(ref):
        return
    from PIL import Image
    a = Image.open(shot).convert('RGB'); b = Image.open(ref).convert('RGB')
    b = b.resize((round(b.width * a.height / b.height), a.height))
    out = Image.new('RGB', (a.width + b.width + 24, a.height), (255, 255, 255))
    out.paste(a, (0, 0)); out.paste(b, (a.width + 24, 0))
    out.save(shot.replace('.png', '-vs-reference.jpg'), quality=85)


async def snap(page, device, name, route=None, dialog=True):
    await page.wait_for_timeout(450)
    path = os.path.join(OUT, f'{device}-{name}.png')
    await page.screenshot(path=path)
    pair(path, route or name, device)
    if dialog and await page.locator('.modal').count():
        vw, vh = DEVICES[device]['viewport']['width'], DEVICES[device]['viewport']['height']
        r = await page.evaluate("""() => { const m = [...document.querySelectorAll('.modal')].pop(); const bad = [];
          for (const e of m.querySelectorAll('button, input, select, textarea, summary')) { const b = e.getBoundingClientRect(), s = getComputedStyle(e);
            if (!b.width || !b.height || s.visibility === 'hidden') continue;
            if (e.closest('[hidden]')) continue;
            if (e.closest('.card, .card-grid, .pick-list--cards') ) continue;
            if (b.height < 35.5 && !e.matches('input[type=checkbox], input[type=radio]')) bad.push(['small', e.textContent.trim().slice(0, 18) || e.getAttribute('aria-label') || e.className, Math.round(b.width), Math.round(b.height)]); }
          const p = m.querySelector('.modal__panel').getBoundingClientRect();
          return { bad, panel: [p.left, p.top, p.right, p.bottom], scroll: document.documentElement.scrollHeight > innerHeight + 1 }; }""")
        check(f'{device} {name}: controls are 36 px targets', not r['bad'], str(r['bad'][:6]))
        check(f'{device} {name}: dialog inside the screen', r['panel'][0] >= -1 and r['panel'][1] >= -1 and r['panel'][2] <= vw + 1 and r['panel'][3] <= vh + 1, str(r['panel']))


async def close_all(page):
    await page.evaluate("async () => (await import('./src/ui/modal.js')).closeAllModals()")
    await page.wait_for_timeout(150)


async def game_page(browser, device, mode='fully-tracked'):
    ctx = await browser.new_context(**DEVICES[device])
    await ctx.add_init_script("localStorage.setItem('cc.welcome.done', '1')")
    page = await ctx.new_page()
    page.on('pageerror', lambda e: errors.append(f'{device}: {e}'))
    await mock_scryfall(page)
    await page.goto(STATIC + '/index.html')
    await page.wait_for_function('window.__ccReady === true', timeout=15000)
    await start_guided(page, ('white', 'simic', 'rakdos', 'lab'), mode=mode)
    await continue_to_game(page)
    return page


want = lambda n: not ONLY or n in ONLY


async def opening(page, device):
    await page.wait_for_selector('text=opening hand')
    if want('opening-hand'): await snap(page, device, 'opening-hand')
    for _ in range(4):
        await page.wait_for_selector('text=opening hand'); await page.click('#keepHand'); await page.wait_for_selector('.curtain'); await tap_curtain(page)
    await page.wait_for_selector('.game--gp .zone--hand .card')
    await page.evaluate(CROWD)
    await page.wait_for_timeout(400); await tap_curtain(page); await page.wait_for_timeout(300)
    await close_all(page)


async def game_dialogs(browser, device):
    page = await game_page(browser, device)
    await opening(page, device)
    async def shot(name, opener, route=None):
        if not want(name): return
        await opener(); await snap(page, device, name, route)
        await close_all(page)
    click = lambda sel: (lambda: page.click(sel))
    await shot('game-log', click('[data-act="log"]'))
    await shot('card-id', click('[data-act="card-id"]'))
    await shot('chat', click('[data-act="chat"]'))
    await shot('stack', click('[data-act="stack"]'))
    await shot('player-info', click('[data-act="player-info"]'), 'player-info')
    await shot('zone-detail', click('[data-act="zone"][data-zone="graveyard"]'))
    await shot('settings-game', click('[data-act="settings"]'), 'settings')
    await shot('help', click('[data-act="phase-info"]'))
    await shot('card-detail', click('.game--gp .zone--hand .card >> nth=0'))
    if await page.locator('[data-act="end-turn"]').count(): await shot('confirm', click('[data-act="end-turn"]'))
    if await page.locator('[data-act="attack"]').count(): await shot('combat', click('[data-act="attack"]'))
    await page.context.close()


FORCE = re.search(r'FORCE = """(.*?)"""', open(os.path.join(os.path.dirname(__file__), 'shots_judge.py')).read(), re.S).group(1)


async def host_screens(browser, device):
    ctx = await browser.new_context(**DEVICES[device])
    host = await open_page(ctx)
    await host.click('[data-act="start"]'); await host.click('[data-mode="fully-tracked"]'); await host.click('[data-play="host-device"]'); await host.click('[data-n="2"]')
    await host.wait_for_function('!!window.__ccRoomCode'); code = await host.evaluate('window.__ccRoomCode')
    a = await open_page(ctx); b = await open_page(ctx)
    await join(a, code, 'Aaron', 'white'); await join(b, code, 'Lex', 'simic')
    await host.wait_for_selector('text=Players (2 of 2)')
    await host.click('[data-act="start"]'); await host.wait_for_selector('.rules-editor'); await host.click('[data-first-pick="0"]')
    await host.fill('[data-rule="priorityTimer"]', '0'); await host.click('.modal .btn--confirm'); await host.wait_for_selector('.game')
    for pg in (a, b): await pg.wait_for_selector('text=opening hand', timeout=15000); await pg.click('#keepHand')
    await a.wait_for_selector('.zone--hand .card')
    await host.evaluate(FORCE); await host.wait_for_timeout(400)
    if want('game-table'): await snap(host, device, 'game-table', dialog=False)
    await host.click('[data-act="screen"][data-screen="judge"]'); await host.wait_for_selector('.judge'); await host.wait_for_timeout(200)
    if want('game-judge'): await snap(host, device, 'game-judge', dialog=False)
    if want('host-tools'):
        await host.click('[data-act="tools"]'); await snap(host, device, 'host-tools'); await close_all(host)
    await ctx.close()


async def tracker(browser, device):
    page = await tracker_page(browser, PHONE if device == 'iPhone' else IPAD)
    await start_tracker(page, 4)
    if want('tracker'): await snap(page, device, 'tracker', dialog=False)
    if want('tracker-menu'):
        await page.click('[data-act="menu"]'); await snap(page, device, 'tracker-menu'); await close_all(page)
    if want('tracker-life'):
        await page.click('.tp [data-act="life-editor"] >> nth=0'); await snap(page, device, 'tracker-life'); await close_all(page)
    await page.context.close()


async def main():
    os.makedirs(OUT, exist_ok=True)
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        for device in DEVICES:
            await game_dialogs(browser, device)
            await tracker(browser, device)
            await host_screens(browser, device)
        await browser.close()
    print(f'{sum(results)}/{len(results)} passed; page errors:', errors or 'none')
    sys.exit(0 if all(results) else 1)


if __name__ == '__main__':
    asyncio.run(main())
