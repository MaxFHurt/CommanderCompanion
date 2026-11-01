"""Offline after the first launch: the service worker precaches every app file (precache.json), so a reload, the Deck
Builder and screens never opened before all work with the network off. Needs the static server on port 4180."""
import asyncio, os, sys, json
from playwright.async_api import async_playwright
sys.path.insert(0, os.path.dirname(__file__))
from shots import URL

PASS, FAIL = [], []
def check(name, ok, info=''):
    (PASS if ok else FAIL).append(name)
    print(('  ok  ' if ok else 'FAIL  ') + name + ('' if ok else f'  [{info}]'))

async def main():
    root = os.path.join(os.path.dirname(__file__), '..')
    want = len(json.load(open(os.path.join(root, 'precache.json'))))
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        ctx = await browser.new_context()
        page = await ctx.new_page()
        await page.goto(URL)
        await page.wait_for_function('window.__ccReady === true', timeout=20000)
        await page.evaluate('navigator.serviceWorker.ready')
        # The install precaches every file; wait for it.
        n = 0
        for _ in range(60):
            n = await page.evaluate("caches.keys().then(ks => Promise.all(ks.filter(k => !/assets|data/.test(k)).map(k => caches.open(k).then(c => c.keys())))).then(a => a.flat().length)")
            if n >= want: break
            await page.wait_for_timeout(500)
        check(f'the first launch caches every app file ({want})', n >= want, n)
        await ctx.set_offline(True)
        await page.reload()
        await page.wait_for_function('window.__ccReady === true', timeout=20000)
        check('offline: the app reloads', True)
        ok = await page.evaluate("import('./src/ui/screens/tracker.js').then(() => true, () => false)")
        check('offline: a screen never opened before still loads', ok)
        await page.goto(URL.replace('index.html', 'deck/index.html'))
        title = await page.title()
        check('offline: the Deck Builder opens', bool(title), title)
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        await page.goto(URL)
        await page.wait_for_function('window.__ccReady === true', timeout=20000)
        check('offline: no page errors', not errors, errors[:2])
        await browser.close()
    print(f'\n{len(PASS)}/{len(PASS) + len(FAIL)} passed')
    sys.exit(1 if FAIL else 0)

asyncio.run(main())
