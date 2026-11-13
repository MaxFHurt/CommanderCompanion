"""Recovery email for the online profile key (roadmap 7b.3): email link flow: link, recover on a second device, unlink, expired link, 429.
Supabase auth and rest endpoints are faked with page.route(); the Worker runs locally like online_ui.py.
Needs the static server (port 4180, or CC_STATIC=http://127.0.0.1:PORT); this test starts the Worker on port 8788."""
import asyncio, json, os, subprocess, sys, time, urllib.parse, urllib.request
from playwright.async_api import async_playwright
sys.path.insert(0, os.path.dirname(__file__))
from shots import PHONE, IPAD, OUT
from game_ui import new_page, check, results, URL

PORT = 8788
Q = f'?online=http://127.0.0.1:{PORT}'
ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
SB = 'https://wdngytwilqxcdoqtefgg.supabase.co/**'


def start_worker():
    proc = subprocess.Popen(['node', 'cloud/dev-server.mjs', str(PORT)], cwd=ROOT, stdout=subprocess.DEVNULL)
    for _ in range(50):
        try: urllib.request.urlopen(f'http://127.0.0.1:{PORT}/'); return proc
        except Exception: time.sleep(0.1)
    raise RuntimeError('test Worker did not start')


class FakeSupabase:
    """Auth: any email; the link's token is 'tok:<email>' (user id = the email). Rest: one profile_recovery row per user."""
    def __init__(self): self.rows = {}; self.sent = []; self.deleted = []; self.rate_limit = False

    async def handle(self, route):
        req = route.request; url = req.url; m = req.method
        cors = {'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*'}
        def reply(status, body=None):
            return route.fulfill(status=status, content_type='application/json', body=json.dumps(body if body is not None else {}), headers=cors)
        if m == 'OPTIONS': return await route.fulfill(status=204, headers=cors)
        auth = req.headers.get('authorization', '')
        if '/auth/v1/otp' in url:
            if self.rate_limit: return await reply(429, {'msg': 'email rate limit exceeded'})
            d = json.loads(req.post_data); qs = urllib.parse.parse_qs(urllib.parse.urlparse(url).query)
            self.sent.append((d['email'], d.get('create_user'), qs.get('redirect_to', [''])[0]))
            return await reply(200)
        if '/auth/v1/user' in url:
            uid = auth.replace('Bearer tok:', ''); return await reply(200, {'id': uid, 'email': uid})
        if '/rest/v1/profile_recovery' in url:
            if not auth.startswith('Bearer tok:'): return await reply(401, {'message': 'no token'})
            uid = auth.replace('Bearer tok:', '')
            if m == 'POST':
                d = json.loads(req.post_data); self.rows[d['user_id']] = d['profile_key']; return await reply(201)
            if m == 'DELETE': self.deleted.append(uid); self.rows.pop(uid, None); return await reply(204)
            if m == 'GET': return await reply(200, [{'profile_key': self.rows[uid]}] if uid in self.rows else [])
        return await reply(404)


async def open_modal(page):
    await page.click('[data-act="settings"]'); await page.click('[data-backup="online"]')


def tap(intent, email='max@example.com'):
    """What the browser opens when the emailed link is tapped."""
    return f'{URL}{Q}&recovery={intent}#access_token=tok:{email}&token_type=bearer&type=magiclink'


async def tapped(page, url):
    await page.goto(url); await page.wait_for_function('window.__ccReady === true', timeout=15000)
    check('address is clean after the link opened', await page.evaluate("!location.hash && !location.search.includes('recovery') && !location.href.includes('access_token')"), page.url)


async def toast_text(page, part):
    await page.wait_for_function("t => document.getElementById('toast')?.textContent.includes(t)", arg=part, timeout=8000)


async def main():
    worker = start_worker(); sb = FakeSupabase()
    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch()
            a = await new_page(browser, IPAD, Q)
            b = await new_page(browser, PHONE, Q)
            for pg in (a, b): await pg.context.route(SB, sb.handle)

            # Device A: save online, then ask for a link for the email.
            await open_modal(a); await a.click('[data-online="save"]'); await a.wait_for_selector('[data-profile-key]')
            key = (await a.locator('[data-profile-key]').text_content()).strip().replace('-', '')
            check('modal offers a recovery email row once a key exists', await a.locator('text=Add recovery email').count() == 1)
            await a.click('[data-rec="start"]'); await a.fill('[data-rec-input]', 'not-an-email'); await a.click('[data-rec="send"]')
            check('bad email is refused in one line', 'valid email' in (await a.locator('[data-rec-error]').text_content()))
            check('there is no code input', await a.locator('[data-rec="verify"], input[inputmode="numeric"]').count() == 0)
            await a.fill('[data-rec-input]', 'max@example.com'); await a.click('[data-rec="send"]')
            await a.wait_for_selector('[data-rec-sent]')
            check('message says to tap the link', 'tap the link' in await a.locator('[data-rec-sent]').text_content())
            email, create, redirect = sb.sent[-1]
            check('link request: email, create_user, redirect to the app with ?recovery=link', email == 'max@example.com' and create is True and redirect == URL + '?recovery=link', str(sb.sent))
            check('redirect carries no key', key not in redirect)
            pend = json.loads(await a.evaluate("localStorage.getItem('cc.recovery.pending')"))
            check('pending intent remembered', pend['intent'] == 'link' and pend['email'] == 'max@example.com')
            check('nothing linked before the link is tapped', not sb.rows)

            # Tap the link on A.
            await tapped(a, tap('link'))
            await toast_text(a, 'Recovery email linked: max@example.com')
            check('key stored under the email user', sb.rows.get('max@example.com') == key, str(sb.rows))
            check('pending entry cleared', await a.evaluate("localStorage.getItem('cc.recovery.pending') === null"))
            await open_modal(a); await a.wait_for_selector('[data-rec-email]')
            check('modal shows the linked email', (await a.locator('[data-rec-email]').text_content()) == 'max@example.com')
            stored = await a.evaluate("JSON.stringify(Object.assign({}, localStorage))")
            check('only the email is stored locally, no token', 'tok:' not in stored and 'max@example.com' in stored)
            await a.screenshot(path=f'{OUT}recovery-linked.png')

            # Device B: no key, recover by email.
            await open_modal(b)
            check('no-key view offers recovery', await b.locator('text=Lost your key?').count() == 1)
            await b.click('[data-rec="start"]'); await b.fill('[data-rec-input]', 'max@example.com'); await b.click('[data-rec="send"]')
            await b.wait_for_selector('[data-rec-sent]')
            check('recover request does not create accounts', sb.sent[-1][1] is False and sb.sent[-1][2].endswith('?recovery=recover'), str(sb.sent[-1]))
            await tapped(b, tap('recover'))
            await b.wait_for_selector('[data-rec-load]')
            shown = (await b.locator('[data-profile-key]').text_content()).strip().replace('-', '')
            check('recovered key is shown', shown == key, shown)
            check('copy button is there', await b.locator('[data-rec-copy]').count() == 1)
            await b.click('[data-rec-load]'); await b.click('.modal .btn--danger:text-is("Load Profile")')
            await b.wait_for_function("localStorage.getItem('cc-online-profile')", timeout=10000)
            got = await b.evaluate("JSON.parse(localStorage.getItem('cc-online-profile')).key")
            check('recovering by email loads and links the same key', got == key, got)

            # Unknown email: nothing linked.
            c = await new_page(browser, PHONE, Q); await c.context.route(SB, sb.handle)
            await tapped(c, tap('recover', 'nobody@example.com'))
            await toast_text(c, 'No profile is linked to this email')
            check('an email with no profile says so', True)

            # Link tapped on a device with no key: enter the key to link it.
            await tapped(c, tap('link'))
            await c.wait_for_selector('[data-link-note]')
            check('no-key device gets the one-line note', 'device that has your profile' in await c.locator('[data-link-note]').text_content())
            sb.rows.pop('max@example.com')
            await c.fill('[data-key]', key[:4] + '-' + key[4:8] + '-' + key[8:]); await c.click('[data-link-key]')
            await toast_text(c, 'Recovery email linked: max@example.com')
            check('entering the key links it', sb.rows.get('max@example.com') == key)

            # Expired or used link.
            await tapped(c, f'{URL}{Q}#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired')
            await toast_text(c, 'expired or was used')
            check('expired link says so', True)

            # 429 on sending.
            sb.rate_limit = True
            await a.click('[data-rec="start"]'); await a.fill('[data-rec-input]', 'max@example.com'); await a.click('[data-rec="send"]')
            await a.wait_for_function("document.querySelector('[data-rec-error]')?.textContent.includes('few minutes')")
            check('429 says try again in a few minutes', True)
            sb.rate_limit = False

            # Remove from device A: link email, then tap.
            await a.click('[data-rec="cancel"]'); await a.click('[data-rec="remove"]'); await a.click('.modal .btn--confirm:text-is("Send link")')
            await a.wait_for_selector('[data-rec-sent]')
            check('unlink request sent with ?recovery=unlink', sb.sent[-1][2].endswith('?recovery=unlink'))
            await tapped(a, tap('unlink'))
            await toast_text(a, 'Recovery email removed')
            check('remove deletes the row and the local email', not sb.rows and await a.evaluate("!localStorage.getItem('cc-recovery-email')"))

            for pg in (a, b, c):
                errs = [e for e in pg.errors if 'status of 429' not in e]  # the faked failure
                check('no page errors', not errs, str(errs))
            await browser.close()
    finally:
        worker.terminate()
    bad = results.count(False)
    print(f'{len(results) - bad}/{len(results)} passed')
    sys.exit(1 if bad else 0)

os.makedirs(OUT, exist_ok=True)
asyncio.run(main())
