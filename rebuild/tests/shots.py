"""Screenshot helper: python3 tests/shots.py <flow>

Drives the app with Playwright at iPhone-landscape and iPad-landscape sizes and saves
screenshots for visual checking. Needs a static server on port 4180:
    python3 -m http.server 4180 --bind 127.0.0.1
"""
import asyncio
import os
import sys
from playwright.async_api import async_playwright

PHONE = dict(viewport={'width': 844, 'height': 390}, device_scale_factor=2, is_mobile=True, has_touch=True)
IPAD = dict(viewport={'width': 1180, 'height': 820}, device_scale_factor=1.5, is_mobile=True, has_touch=True)
OUT = os.environ.get('SHOTS_DIR', '/home/claude/shots/')
URL = 'http://127.0.0.1:4180/index.html'
NAMES = ['Aaron', 'Lex', 'Charlie', 'Diana', 'Evan', 'Faye']


async def new_page(browser, device):
    ctx = await browser.new_context(**device)
    page = await ctx.new_page()
    page.errors = []
    page.on('console', lambda m: page.errors.append(m.text) if m.type == 'error' else None)
    page.on('pageerror', lambda e: page.errors.append('PAGEERROR ' + str(e)))
    # Card lookups are not reachable from the test environment.
    await page.route('https://api.scryfall.com/**', lambda r: r.abort())
    await page.goto(URL)
    await page.wait_for_function('window.__ccReady === true', timeout=15000)
    return page


async def start_tracker(page, players=4):
    await page.click('[data-act="start"]')
    await page.wait_for_selector('.mode-select')
    await page.click('[data-mode="table-tracker"]')
    await page.wait_for_selector('.setup-players')
    for _ in range(players - 2):
        await page.click('[data-act="add"]')
    for i in range(players):
        await page.fill(f'.setup-player[data-seat="{i}"] [data-field="name"]', NAMES[i])
    await page.click('[data-act="start"]')
    await page.wait_for_selector('.tracker .tp')


async def tap(page, selector, times=1):
    for _ in range(times):
        await page.click(selector)


async def tracker_flow(browser, device, tag, players=4):
    page = await new_page(browser, device)
    await page.screenshot(path=f'{OUT}{tag}-landing.png')
    await page.click('[data-act="start"]')
    await page.wait_for_selector('.mode-select')
    await page.screenshot(path=f'{OUT}{tag}-mode.png')
    await page.click('[data-act="back"]')
    await start_tracker(page, players)
    card = lambda i, sel: f'.tp:nth-of-type({i + 1}) {sel}'
    await tap(page, card(2, '[data-act="life"][data-delta="-1"]'), 3)
    if players > 3:
        await tap(page, card(3, '[data-act="life"][data-delta="-1"]'), 12)
    await tap(page, card(0, '[data-act="mana"][data-color="U"]'), 2)
    await tap(page, card(0, '[data-act="mana"][data-color="G"]'), 1)
    return page


async def main():
    which = sys.argv[1] if len(sys.argv) > 1 else 'tracker'
    players = int(sys.argv[2]) if len(sys.argv) > 2 else 4
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        if which == 'tracker':
            for device, tag in ((PHONE, 'phone'), (IPAD, 'ipad')):
                page = await tracker_flow(browser, device, tag, players)
                await page.wait_for_timeout(1300)
                await page.screenshot(path=f'{OUT}{tag}-tracker{players}.png')
                print(tag, 'errors:', page.errors[:8])
        await browser.close()


if __name__ == '__main__':
    asyncio.run(main())
