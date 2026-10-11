"""Pixel check for stylesheet changes.

    python3 tests/style_diff.py capture <dir>     # screenshots of a fixed set of screens
    python3 tests/style_diff.py compare <a> <b>   # report every screen whose pixels differ

Randomness is seeded and animations are switched off, so two captures of the same code are
identical. Capture before a CSS change, capture after, then compare. Needs the static server
on port 4180 (python3 -m http.server 4180 --bind 127.0.0.1).
"""
import asyncio, os, sys
from playwright.async_api import async_playwright
sys.path.insert(0, os.path.dirname(__file__))
from shots import PHONE, IPAD, URL, NAMES
from game_ui import mock_scryfall, start_guided, continue_to_game, tap_curtain

SEED = """(() => {
  let s = 0x2545F491;
  Math.random = () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const fixed = new Date('2026-10-11T12:00:00Z').getTime(); const start = Date.now();
  const RealDate = Date;
  globalThis.Date = class extends RealDate { constructor(...a) { super(...(a.length ? a : [fixed + (RealDate.now() - start)])); } static now() { return fixed + (RealDate.now() - start); } };
  document.addEventListener('DOMContentLoaded', () => {
    const st = document.createElement('style');
    st.textContent = '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}';
    document.head.appendChild(st);
  });
})();"""


async def page_for(browser, device):
    ctx = await browser.new_context(**device)
    await ctx.add_init_script(SEED)
    page = await ctx.new_page()
    await mock_scryfall(page)
    await page.goto(URL)
    await page.wait_for_function('window.__ccReady === true', timeout=15000)
    await page.evaluate('localStorage.clear()')
    await page.goto(URL)
    await page.wait_for_function('window.__ccReady === true', timeout=15000)
    return page


async def shot(page, out, name):
    await page.wait_for_timeout(350)
    await page.screenshot(path=os.path.join(out, f'{name}.png'))


async def back(page):
    if await page.locator('.modal [data-modal-back]').count():
        await page.click('.modal [data-modal-back]')
    elif await page.locator('.modal .btn--cancel').count():
        await page.click('.modal .btn--cancel')
    await page.wait_for_timeout(200)


async def capture_device(browser, device, tag, out):
    page = await page_for(browser, device)
    await shot(page, out, f'{tag}-landing')
    await page.click('[data-act="start"]'); await page.wait_for_timeout(300)
    await shot(page, out, f'{tag}-modes')
    # Table Tracker with 2, 4 and 6 players.
    for n in (2, 4, 6):
        await page.goto(URL); await page.wait_for_function('window.__ccReady === true')
        await page.click('[data-act="start"]'); await page.wait_for_selector('.mode-select')
        await page.click('[data-mode="table-tracker"]'); await page.click('[data-track="local"]')
        await page.wait_for_selector('.setup-players')
        for _ in range(n - 2): await page.click('[data-act="add"]')
        for i in range(n): await page.fill(f'.setup-player[data-seat="{i}"] [data-field="name"]', NAMES[i])
        if n == 4: await shot(page, out, f'{tag}-tracker-setup')
        await page.click('[data-act="start"]'); await page.wait_for_selector('.tracker .tp')
        await page.click('.tp:nth-of-type(2) [data-act="life"][data-delta="-1"]')
        await shot(page, out, f'{tag}-tracker-{n}')
    # Guided game on one device.
    await page.goto(URL); await page.wait_for_function('window.__ccReady === true')
    await start_guided(page, ('simic', 'rakdos'))
    await shot(page, out, f'{tag}-setup')
    await continue_to_game(page)
    await page.wait_for_selector('text=opening hand')
    await shot(page, out, f'{tag}-opening')
    for _ in range(2):
        await page.click('#keepHand'); await page.wait_for_selector('.curtain'); await tap_curtain(page)
        if _ == 0: await page.wait_for_selector('text=opening hand')
    await page.wait_for_selector('.zone--hand .card')
    await shot(page, out, f'{tag}-game')
    await page.locator('.zone--hand .card').first.click(); await page.wait_for_selector('.card-detail')
    await shot(page, out, f'{tag}-card-detail')
    await page.click('.modal .btn--cancel')
    for act in ('log', 'stack', 'help', 'settings', 'profile', 'tools'):
        btn = page.locator(f'[data-act="{act}"]')
        if not await btn.count(): continue
        await btn.first.click(); await page.wait_for_timeout(300)
        await shot(page, out, f'{tag}-{act}')
        await back(page)
        while await page.locator('.modal').count():
            await back(page)
            if await page.locator('.modal').count(): await page.keyboard.press('Escape')
            break
    await page.context.close()


async def capture(out):
    os.makedirs(out, exist_ok=True)
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        await capture_device(browser, PHONE, 'phone', out)
        await capture_device(browser, IPAD, 'ipad', out)
        await browser.close()
    print(f'captured {len(os.listdir(out))} screens in {out}')


def compare(a, b):
    from PIL import Image, ImageChops
    names = sorted(set(os.listdir(a)) | set(os.listdir(b)))
    bad = 0
    for n in names:
        pa, pb = os.path.join(a, n), os.path.join(b, n)
        if not (os.path.exists(pa) and os.path.exists(pb)):
            print(f'MISSING {n}'); bad += 1; continue
        ia, ib = Image.open(pa).convert('RGB'), Image.open(pb).convert('RGB')
        if ia.size != ib.size:
            print(f'SIZE    {n} {ia.size} vs {ib.size}'); bad += 1; continue
        box = ImageChops.difference(ia, ib).getbbox()
        if box:
            print(f'DIFF    {n} in {box}'); bad += 1
        else:
            print(f'same    {n}')
    print(f'\n{len(names) - bad}/{len(names)} identical')
    return bad


if __name__ == '__main__':
    if sys.argv[1] == 'capture':
        asyncio.run(capture(sys.argv[2]))
    else:
        sys.exit(1 if compare(sys.argv[2], sys.argv[3]) else 0)
