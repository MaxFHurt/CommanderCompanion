"""Card ID camera scan, end to end: a fake camera shows a drawn card titled "Serra Angel" and the scan
must read that title. Needs internet (the text reader loads from jsDelivr). Run: python3 tests/scan_ui.py"""
from PIL import Image, ImageDraw, ImageFont
W, H = 1280, 720
img = Image.new('RGB', (W, H), (40, 40, 48))
ch = int(H * 0.9); cw = int(ch * 63 / 88)
x0, y0 = (W - cw) // 2, (H - ch) // 2
d = ImageDraw.Draw(img)
d.rounded_rectangle([x0, y0, x0 + cw, y0 + ch], 18, fill=(20, 20, 20))
# title bar
bx, by = x0 + int(cw * 0.04), y0 + int(ch * 0.035)
d.rounded_rectangle([bx, by, x0 + cw - int(cw * 0.04), by + int(ch * 0.075)], 8, fill=(232, 226, 210))
f = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf', int(ch * 0.042))
d.text((bx + int(cw * 0.03), by + int(ch * 0.013)), 'Serra Angel', font=f, fill=(15, 15, 15))
d.text((x0 + cw - int(cw * 0.2), by + int(ch * 0.013)), '3W', font=f, fill=(15, 15, 15))
d.rectangle([x0 + int(cw * 0.06), y0 + int(ch * 0.13), x0 + cw - int(cw * 0.06), y0 + int(ch * 0.55)], fill=(120, 150, 190))
img.save('/tmp/cc-scan-card.png')
# y4m (C420jpeg): Y, then U and V at quarter size
yuv = img.convert('YCbCr'); Y, Cb, Cr = yuv.split()
Cb = Cb.resize((W // 2, H // 2)); Cr = Cr.resize((W // 2, H // 2))
with open('/tmp/cc-scan-card.y4m', 'wb') as out:
    out.write(f'YUV4MPEG2 W{W} H{H} F30:1 Ip A1:1 C420jpeg\n'.encode())
    for _ in range(3):
        out.write(b'FRAME\n'); out.write(Y.tobytes()); out.write(Cb.tobytes()); out.write(Cr.tobytes())

import asyncio, os
from playwright.async_api import async_playwright
async def main():
    proxy = os.environ.get('HTTPS_PROXY') or os.environ.get('https_proxy')
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--use-file-for-fake-video-capture=/tmp/cc-scan-card.y4m'],
                                    proxy={'server': proxy, 'bypass': '127.0.0.1,localhost'} if proxy else None)
        ctx = await b.new_context(viewport={'width': 1180, 'height': 820}, ignore_https_errors=True, permissions=['camera'])
        page = await ctx.new_page()
        import mimetypes
        root = '/home/user/CommanderCompanion/rebuild'
        async def serve(route):
            path = route.request.url.split('127.0.0.1:4180', 1)[1].split('?')[0]
            f = root + (path if path != '/' else '/index.html')
            try:
                body = open(f, 'rb').read()
                ct = mimetypes.guess_type(f)[0] or 'application/octet-stream'
                if f.endswith('.js') or f.endswith('.mjs'): ct = 'text/javascript'
                await route.fulfill(status=200, body=body, content_type=ct)
            except FileNotFoundError:
                await route.fulfill(status=404, body=b'')
        await page.route('http://127.0.0.1:4180/**', serve)
        await page.route('https://api.scryfall.com/**', lambda r: r.abort())
        page.on('console', lambda m: print('console', m.type, m.text[:200]) if m.type in ('error', 'warning') else None)
        await page.goto('http://127.0.0.1:4180/index.html'); await page.wait_for_function('window.__ccReady === true')
        await page.evaluate("async () => { const m = await import('./src/ui/game/panels.js'); m.openCardId({}); }")
        await page.click('[data-scan]'); await page.wait_for_timeout(2500)
        await page.screenshot(path='/tmp/cc-scan-1.png')
        await page.click('[data-scan]')
        await page.wait_for_function("!/Reading/.test(document.querySelector('[data-hint]').textContent)", timeout=120000)
        hint = await page.text_content('[data-hint]'); print('hint:', hint); print('PASS' if 'Serra Angel' in hint else 'FAIL', 'scan reads the card title')
        await page.screenshot(path='/tmp/cc-scan-2.png')
        await b.close()
asyncio.run(main())
