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


asyncio.run(main())
