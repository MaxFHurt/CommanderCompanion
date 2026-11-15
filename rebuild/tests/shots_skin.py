"""Visual rebuild screenshots for the owner: menu routes on iPhone and iPad (landscape, 2x), each beside the handoff's
reference (screens/<route>/<device>.jpg) when the handoff folder is given.

    python3 tests/shots_skin.py [out_dir] [handoff_dir]      (serve rebuild/ on :4180 first)
"""
import asyncio, os, sys
from playwright.async_api import async_playwright

URL = os.environ.get('CC_STATIC', 'http://127.0.0.1:4180') + '/index.html'
OUT = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else '../shots')
REF = sys.argv[2] if len(sys.argv) > 2 else '/home/user/vh'
DEVICES = {
    'iPhone': dict(viewport={'width': 844, 'height': 390}, device_scale_factor=2, is_mobile=True, has_touch=True),
    'iPad': dict(viewport={'width': 1180, 'height': 820}, device_scale_factor=2, is_mobile=True, has_touch=True),
}
SAVE = """async () => {
  const { saveRecord } = await import('./src/data/store.js');
  await saveRecord('cc-game-v1', { status: 'playing', savedAt: new Date().toISOString() });
}"""
errors = []


def pair(shot, route, device):
    ref = os.path.join(REF, 'screens', route, f'{device}.jpg')
    if not os.path.exists(ref):
        return
    from PIL import Image
    a = Image.open(shot).convert('RGB')
    b = Image.open(ref).convert('RGB')
    b = b.resize((round(b.width * a.height / b.height), a.height))
    out = Image.new('RGB', (a.width + b.width + 24, a.height), (255, 255, 255))
    out.paste(a, (0, 0)); out.paste(b, (a.width + 24, 0))
    out.save(shot.replace('.png', '-vs-reference.jpg'), quality=85)


async def snap(page, name, route, device):
    await page.wait_for_timeout(500)
    path = os.path.join(OUT, f'{device}-{name}.png')
    await page.screenshot(path=path)
    pair(path, route, device)


async def fresh(browser, device, welcome_done=True, palette=None):
    ctx = await browser.new_context(**DEVICES[device])
    if welcome_done:
        await ctx.add_init_script("localStorage.setItem('cc.welcome.done', '1')")
    page = await ctx.new_page()
    page.on('pageerror', lambda e: errors.append(f'{device}: {e}'))
    await page.goto(URL)
    await page.wait_for_function('window.__ccReady === true', timeout=15000)
    if palette:
        await page.evaluate(f"document.documentElement.dataset.palette = '{palette}'")
    return page


async def main():
    os.makedirs(OUT, exist_ok=True)
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        for device in DEVICES:
            page = await fresh(browser, device, welcome_done=False)
            await page.wait_for_selector('.welcome')
            await snap(page, 'welcome', 'welcome', device)
            await page.context.close()

            page = await fresh(browser, device)
            await page.wait_for_selector('.landing')
            await snap(page, 'landing', 'landing', device)
            await page.click('[data-act="start"]'); await page.wait_for_selector('.mode-select')
            await snap(page, 'mode-select', 'mode-select', device)
            await page.click('[data-act="back"]'); await page.wait_for_selector('.landing')
            await page.click('[data-act="profile"]'); await page.wait_for_selector('.profile')
            await snap(page, 'profile', 'profile', device)
            await page.click('[data-act="playmats"]'); await page.wait_for_selector('.mat-slots')
            await snap(page, 'playmats', 'playmats', device)
            await page.click('[data-modal-back]'); await page.click('[data-act="back"]'); await page.wait_for_selector('.landing')
            await page.click('[data-act="settings"]'); await page.wait_for_selector('#guidanceOptions')
            await snap(page, 'settings', 'settings', device)
            await page.click('[data-modal-back]')
            await page.click('[data-act="help"]'); await page.wait_for_selector('#judgeSearch')
            await snap(page, 'help', 'help', device)
            await page.click('[data-modal-back]')
            await page.evaluate(SAVE); await page.reload(); await page.wait_for_function('window.__ccReady === true')
            await page.wait_for_selector('.landing [data-act="continue"]:not([disabled])')
            await snap(page, 'landing-saved-game', 'landing', device)
            await page.context.close()

            for palette in ('ember', 'frost'):
                page = await fresh(browser, device, palette=palette)
                await page.wait_for_selector('.landing')
                await snap(page, f'landing-{palette}', 'landing', device)
                await page.context.close()
        await browser.close()
    print('page errors:', errors or 'none')


# ── Stage 3a routes: setup, rooms, online, tracker entry, accounts ──────────────────────────────────────
# python3 tests/shots_skin.py out_dir handoff_dir routes      (also needs `node cloud/dev-server.mjs 8787` for online-room)
SEED = """() => {
  localStorage.setItem('cc.deckProfile', JSON.stringify({ decks: [
    { id: 'd1', format: 'commander', name: 'Breed Lethality', commander: 'Atraxa, Praetors\u2019 Voice', cards: [{ n: 'Sol Ring', q: 1 }], player: 'Aaron' },
    { id: 'd2', format: 'commander', name: 'Token Triumph', commander: 'Pantlaza, Sun-Favored', cards: [{ n: 'Sol Ring', q: 1 }], player: 'Heather' }] }));
  localStorage.setItem('cc-online-games', JSON.stringify([{ code: 'F7KQAB', clientId: 'x', name: 'Aaron', names: ['Aaron', 'Heather'], mode: 'fully-tracked', server: true, at: Date.now() }]));
}"""
PRECONS = [{'name': 'Breed Lethality', 'fileName': 'BreedLethality_C21', 'type': 'Commander Deck', 'releaseDate': '2021-04-23'},
           {'name': 'Token Triumph', 'fileName': 'TokenTriumph_C22', 'type': 'Commander Deck', 'releaseDate': '2022-04-08'}]


async def routes(browser, only=None):
    from game_ui import FIX, mock_scryfall
    for device in DEVICES:
        ctx = await browser.new_context(**DEVICES[device])
        await ctx.add_init_script("localStorage.setItem('cc.welcome.done', '1')")
        page = await ctx.new_page()
        page.on('pageerror', lambda e: errors.append(f'{device}: {e}'))
        await mock_scryfall(page)
        await page.route('https://mtgjson.com/**', lambda r: r.fulfill(json={'data': PRECONS}))
        await page.goto(URL + '?online=http://127.0.0.1:8787')
        await page.wait_for_function('window.__ccReady === true', timeout=15000)
        await page.evaluate(SEED)
        await page.reload(); await page.wait_for_function('window.__ccReady === true')
        shot = lambda name: snap(page, name, name, device)
        want = lambda name: not only or name in only
        go = lambda name, params='{}': page.evaluate(f"async () => {{ const {{ go }} = await import('./src/app/router.js'); go('{name}', {params}); }}")
        back = lambda: page.click('.modal [data-modal-back]')

        await page.click('[data-act="start"]'); await page.wait_for_selector('.mode-select')
        for mode, name in (('fully-tracked', 'play-options'), ('freeplay', 'free-play-options')):
            await page.click(f'[data-mode="{mode}"]'); await page.wait_for_selector('[data-play="local"]')
            if want(name): await shot(name)
            await back()
        await page.click('[data-mode="table-tracker"]'); await page.wait_for_selector('[data-track="local"]')
        if want('tracker-options'): await shot('tracker-options')
        await page.click('[data-track="local"]'); await page.wait_for_selector('.setup-players')
        if want('tracker-setup'): await shot('tracker-setup')
        await go('tracker-join', "{ code: 'F7KQ', name: 'Aaron' }"); await page.wait_for_selector('[data-code]')
        if want('tracker-join'): await shot('tracker-join')

        await go('mode-select'); await page.click('[data-mode="fully-tracked"]'); await page.click('[data-play="local"]'); await page.wait_for_selector('.setup')
        await page.fill('[data-field="name"]', 'Aaron')
        if want('player-setup'): await shot('player-setup')
        await page.click('[data-seat-act="saved"]'); await page.wait_for_selector('[data-deck]')
        if want('saved-decks'): await shot('saved-decks')
        await page.click('[data-deck="0"]')
        await page.click('[data-seat-act="precon"]'); await page.wait_for_selector('[data-file]')
        if want('precon-catalog'): await shot('precon-catalog')
        await back()
        await page.click('[data-seat-act="paste"]'); await page.wait_for_selector('[data-list]')
        await page.fill('[data-list]', '1 Atraxa, Praetors\u2019 Voice\n1 Sol Ring')
        if want('import-deck'): await shot('import-deck')
        await back()

        names = "[{ name: 'Aaron', commanderNames: ['Atraxa, Praetors\u2019 Voice'] }]"
        await go('lobby', f"{{ mode: 'fully-tracked', hostDevice: false, localSeats: {names}, remoteSeats: 3 }}"); await page.wait_for_selector('.lobby__code b:not(:has-text("····"))')
        if want('host-room'): await shot('host-room')
        await go('lobby', "{ mode: 'fully-tracked', hostDevice: true, localSeats: [], remoteSeats: 4 }"); await page.wait_for_selector('.lobby__code b:not(:has-text("····"))')
        if want('host-device'): await shot('host-device')
        await go('join'); await page.wait_for_selector('[data-code]')
        if want('join-room'): await shot('join-room')
        await go('online', "{ mode: 'fully-tracked' }"); await page.wait_for_selector('[data-act="new"]'); await page.wait_for_timeout(800)
        if want('online-games'): await shot('online-games')

        await page.evaluate("async () => { const { openSignIn } = await import('./src/ui/account-ui.js'); openSignIn('signin'); }"); await page.wait_for_selector('[data-auth-email]')
        if want('sign-in'): await shot('sign-in')
        await back()
        await page.evaluate("async () => { const { openSignIn } = await import('./src/ui/account-ui.js'); openSignIn('signup'); }"); await page.wait_for_selector('[data-auth-email]')
        if want('create-account'): await shot('create-account')
        await ctx.close()

        # online-room: a real waiting room on the local test Worker
        if want('online-room'):
            from game_ui import fill_seat
            ctx = await browser.new_context(**DEVICES['iPad'])
            await ctx.add_init_script("localStorage.setItem('cc.welcome.done', '1')")
            a = await ctx.new_page(); await mock_scryfall(a)
            await a.goto(URL + '?online=http://127.0.0.1:8787'); await a.wait_for_function('window.__ccReady === true')
            await a.click('[data-act="start"]'); await a.click('[data-mode="fully-tracked"]'); await a.click('[data-play="online"]')
            await a.click('[data-act="new"]'); await a.wait_for_selector('.setup')
            await fill_seat(a, 'Aaron', 'white')
            await a.click('[data-act="start"]'); await a.wait_for_selector('text=Setup check', timeout=15000); await a.click('.modal .btn--confirm')
            await a.wait_for_selector('.rules-editor'); await a.click('[data-first-pick="0"]'); await a.click('.modal .btn--confirm')
            try: await a.wait_for_selector('[data-online-code]', timeout=15000)
            except Exception: await a.screenshot(path=os.path.join(OUT, 'online-room-debug.png')); raise
            await a.set_viewport_size(DEVICES[device]['viewport'])
            await snap(a, 'online-room', 'online-room', device)
            await ctx.close()


async def routes_main(only=None):
    os.makedirs(OUT, exist_ok=True)
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        await routes(browser, only)
        await browser.close()
    print('page errors:', errors or 'none')

# ── Stage 3b: profile, playmats and dice, history, achievements, settings, rules, help ──────────────────
# python3 tests/shots_skin.py out_dir handoff_dir routes3b [names...]
SEED3B = """async () => {
  const { saveAccountProfile } = await import('./src/data/profile.js');
  await saveAccountProfile({ displayName: 'Aaron' });
  const raw = JSON.parse(localStorage.getItem('ccv07-profile'));
  raw.games = 12; raw.wins = 5; raw.awards = { 'Most commander damage': 2, 'Comeback': 1 };
  raw.history = [
    { at: '2026-11-10T20:00:00Z', mode: 'fully-tracked', winnerName: 'Aaron', turnNumber: 9, players: [{ name: 'Aaron', commanders: ['Atraxa'] }, { name: 'Heather', commanders: [] }, { name: 'Sam', commanders: [] }, { name: 'Lee', commanders: [] }] },
    { at: '2026-11-08T20:00:00Z', mode: 'freeplay', winnerName: '', turnNumber: 6, players: [{ name: 'Aaron', commanders: [] }, { name: 'Heather', commanders: [] }] }];
  raw.rewardDraws = [{ id: 'mat:ember', slot: 'a1', at: '2026-11-15T00:00:00Z' }, { id: 'die:ember', slot: 'a2', at: '2026-11-15T00:00:00Z' }];
  raw.rewardsShown = ['mat:ember', 'die:ember'];
  raw.milestones = ['first-game', 'first-win'];
  raw.token.updatedAt = new Date().toISOString();
  localStorage.setItem('ccv07-profile', JSON.stringify(raw));
  const { durableSet } = await import('./src/data/userdata-db.js'); await durableSet('profile', raw);
}"""


async def routes3b(browser, only=None):
    for device in DEVICES:
        ctx = await browser.new_context(**DEVICES[device])
        await ctx.add_init_script("localStorage.setItem('cc.welcome.done', '1')")
        page = await ctx.new_page()
        page.on('pageerror', lambda e: errors.append(f'{device}: {e}'))
        await page.goto(URL)
        await page.wait_for_function('window.__ccReady === true', timeout=15000)
        await page.evaluate(SEED3B)
        await page.reload(); await page.wait_for_function('window.__ccReady === true')
        shot = lambda name, route=None: snap(page, name, route or name, device)
        want = lambda name: not only or name in only
        back = lambda: page.click('.modal [data-modal-back]')
        await page.wait_for_timeout(800)
        if await page.locator('.modal--small .btn').count(): await page.click('.modal--small .btn >> nth=0'); await page.wait_for_timeout(300)
        await page.click('[data-act="profile"]'); await page.wait_for_selector('.profile')
        if want('profile'): await shot('profile')
        await page.click('[data-act="playmats"]'); await page.wait_for_selector('.mat-slots')
        if want('playmats'): await shot('playmats')
        await page.click('.modal .btn--confirm')
        await page.click('[data-act="history"]'); await page.wait_for_selector('.history-row')
        if want('profile-history'): await shot('profile-history')
        await back()
        await page.click('[data-act="achievements"]'); await page.wait_for_selector('[data-level]')
        if want('achievements'): await shot('achievements')
        await back()
        await page.click('[data-act="defaults"]'); await page.wait_for_selector('#defaultRules')
        if want('table-defaults'): await shot('table-defaults', 'rules')
        await back()
        await page.click('[data-act="back"]'); await page.wait_for_selector('.landing')
        await page.click('[data-act="settings"]'); await page.wait_for_selector('#guidanceOptions')
        if want('settings'): await shot('settings')
        await back()
        await page.click('[data-act="help"]'); await page.wait_for_selector('#judgeSearch')
        await page.fill('#judgeSearch', 'commander damage')
        if want('help'): await shot('help')
        await ctx.close()


async def routes3b_main(only=None):
    os.makedirs(OUT, exist_ok=True)
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        await routes3b(browser, only)
        await browser.close()
    print('page errors:', errors or 'none')

if __name__ == '__main__':
    if 'routes3b' in sys.argv[3:]:
        asyncio.run(routes3b_main([a for a in sys.argv[4:]] or None))
    elif 'routes' in sys.argv[3:]:
        asyncio.run(routes_main([a for a in sys.argv[4:]] or None))
    else:
        asyncio.run(main())
