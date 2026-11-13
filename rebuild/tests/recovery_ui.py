"""Recovery email for the online profile key (roadmap 7b.3): link, recover on a second device, wrong code, 429.
Supabase auth and rest endpoints are faked with page.route(); the Worker runs locally like online_ui.py.
Needs the static server (port 4180, or CC_STATIC=http://127.0.0.1:PORT); this test starts the Worker on port 8788."""
import asyncio, json, os, subprocess, sys, time, urllib.request
from playwright.async_api import async_playwright
sys.path.insert(0, os.path.dirname(__file__))
from shots import PHONE, IPAD, OUT
from game_ui import new_page, check, results

PORT = 8788
Q = f'?online=http://127.0.0.1:{PORT}'
ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
SB = 'https://wdngytwilqxcdoqtefgg.supabase.co/**'
CODE = '12345678'   # the live project sends 8 digits


def start_worker():
    proc = subprocess.Popen(['node', 'cloud/dev-server.mjs', str(PORT)], cwd=ROOT, stdout=subprocess.DEVNULL)
    for _ in range(50):
        try: urllib.request.urlopen(f'http://127.0.0.1:{PORT}/'); return proc
        except Exception: time.sleep(0.1)
    raise RuntimeError('test Worker did not start')


class FakeSupabase:
    """Auth: any email, code 12345678. Rest: one profile_recovery row per user (user id = the email)."""
    def __init__(self): self.rows = {}; self.sent = []; self.deleted = []; self.rate_limit = False; self.tokens = []

    async def handle(self, route):
        req = route.request; url = req.url; m = req.method
        def reply(status, body=None):
            return route.fulfill(status=status, content_type='application/json', body=json.dumps(body if body is not None else {}),
                                 headers={'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*'})
        if m == 'OPTIONS': return await route.fulfill(status=204, headers={'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*'})
        auth = req.headers.get('authorization', '')
        if '/auth/v1/otp' in url:
            if self.rate_limit: return await reply(429, {'msg': 'email rate limit exceeded'})
            self.sent.append(json.loads(req.post_data)['email']); return await reply(200)
        if '/auth/v1/verify' in url:
            d = json.loads(req.post_data)
            if d.get('type') != 'email' or d.get('token') != CODE: return await reply(403, {'msg': 'Token has expired or is invalid'})
            return await reply(200, {'access_token': 'tok:' + d['email']})
        if '/auth/v1/user' in url: return await reply(200, {'id': auth.replace('Bearer tok:', '')})
        if '/rest/v1/profile_recovery' in url:
            if not auth.startswith('Bearer tok:'): return await reply(401, {'message': 'no token'})
            self.tokens.append(auth); uid = auth.replace('Bearer tok:', '')
            if m == 'POST':
                d = json.loads(req.post_data); self.rows[d['user_id']] = d['profile_key']; return await reply(201)
            if m == 'DELETE': self.deleted.append(uid); self.rows.pop(uid, None); return await reply(204)
            if m == 'GET': return await reply(200, [{'profile_key': self.rows[uid]}] if uid in self.rows else [])
        return await reply(404)


async def open_modal(page):
    await page.click('[data-act="settings"]'); await page.click('[data-backup="online"]')


async def main():
    worker = start_worker(); sb = FakeSupabase()
    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch()
            a = await new_page(browser, IPAD, Q)
            b = await new_page(browser, PHONE, Q)
            for pg in (a, b): await pg.context.route(SB, sb.handle)

            # Device A: save online, then link an email.
            await open_modal(a); await a.click('[data-online="save"]'); await a.wait_for_selector('[data-profile-key]')
            key = (await a.locator('[data-profile-key]').text_content()).strip().replace('-', '')
            check('modal offers a recovery email row once a key exists', await a.locator('text=Add recovery email').count() == 1)
            await a.click('[data-rec="start"]'); await a.fill('[data-rec-input]', 'not-an-email'); await a.click('[data-rec="send"]')
            check('bad email is refused in one line', 'valid email' in (await a.locator('[data-rec-error]').text_content()))
            await a.fill('[data-rec-input]', 'max@example.com'); await a.click('[data-rec="send"]')
            await a.wait_for_selector('text=We sent a code to max@example.com')
            await a.fill('[data-rec-input]', '000000'); await a.click('[data-rec="verify"]')
            await a.wait_for_function("document.querySelector('[data-rec-error]')?.textContent.includes('Wrong')")
            check('wrong code says so and nothing is linked', not sb.rows)
            await a.fill('[data-rec-input]', CODE); await a.click('[data-rec="verify"]')
            await a.wait_for_selector('[data-rec-email]')
            check('code request went to the email', sb.sent == ['max@example.com'], str(sb.sent))
            check('key stored under the email user', sb.rows.get('max@example.com') == key, str(sb.rows))
            check('modal shows the linked email', (await a.locator('[data-rec-email]').text_content()) == 'max@example.com')
            stored = await a.evaluate("JSON.stringify(Object.assign({}, localStorage))")
            check('only the email is stored locally, no token', 'tok:' not in stored and 'max@example.com' in stored)
            await a.screenshot(path=f'{OUT}recovery-linked.png')

            # Device B: no key, recover by email.
            await open_modal(b)
            check('no-key view offers recovery', await b.locator('text=Lost your key?').count() == 1)
            await b.click('[data-rec="start"]'); await b.fill('[data-rec-input]', 'max@example.com'); await b.click('[data-rec="send"]')
            await b.wait_for_selector('[data-rec="verify"]')
            await b.fill('[data-rec-input]', CODE); await b.click('[data-rec="verify"]')
            await b.click('.modal .btn--danger:text-is("Load Profile")')
            await b.wait_for_function("localStorage.getItem('cc-online-profile')", timeout=10000)
            got = await b.evaluate("JSON.parse(localStorage.getItem('cc-online-profile')).key")
            check('recovering by email loads and links the same key', got == key, got)

            # Unknown email: nothing linked.
            c = await new_page(browser, PHONE, Q); await c.context.route(SB, sb.handle)
            await open_modal(c); await c.click('[data-rec="start"]'); await c.fill('[data-rec-input]', 'nobody@example.com'); await c.click('[data-rec="send"]')
            await c.wait_for_selector('[data-rec="verify"]'); await c.fill('[data-rec-input]', CODE); await c.click('[data-rec="verify"]')
            await c.wait_for_function("document.querySelector('[data-rec-error]')?.textContent.includes('No profile')")
            check('an email with no profile says so', True)

            # 429 on sending.
            sb.rate_limit = True
            await c.click('[data-rec="cancel"]'); await c.click('[data-rec="start"]'); await c.fill('[data-rec-input]', 'max@example.com'); await c.click('[data-rec="send"]')
            await c.wait_for_function("document.querySelector('[data-rec-error]')?.textContent.includes('few minutes')")
            check('429 says try again in a few minutes', True)
            sb.rate_limit = False

            # Remove from device A (asks for a code first).
            await a.click('[data-rec="remove"]'); await a.click('.modal .btn--confirm:text-is("Send code")')
            await a.wait_for_selector('[data-rec="verify-remove"]'); await a.fill('[data-rec-input]', CODE); await a.click('[data-rec="verify-remove"]')
            await a.wait_for_selector('text=Add recovery email')
            check('remove deletes the row and the local email', not sb.rows and await a.evaluate("!localStorage.getItem('cc-recovery-email')"))

            for pg in (a, b, c):
                errs = [e for e in pg.errors if 'status of 403' not in e and 'status of 429' not in e]  # the faked failures
                check('no page errors', not errs, str(errs))
            await browser.close()
    finally:
        worker.terminate()
    bad = results.count(False)
    print(f'{len(results) - bad}/{len(results)} passed')
    sys.exit(1 if bad else 0)

os.makedirs(OUT, exist_ok=True)
asyncio.run(main())
