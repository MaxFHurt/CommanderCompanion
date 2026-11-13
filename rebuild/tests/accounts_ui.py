"""Accounts (owner, 13 Nov): first-launch welcome, sign up / sign in with an emailed code, the profile joined to the account,
and above all that no player loses data. Supabase Auth and the profile_recovery table are faked with page.route(); the
Worker runs locally (cloud/dev-server.mjs) like online_ui.py. Needs the static server (CC_STATIC, default port 4180)."""
import asyncio, json, os, subprocess, sys, time, urllib.request
from playwright.async_api import async_playwright
sys.path.insert(0, os.path.dirname(__file__))
from shots import PHONE, IPAD, OUT, URL
from game_ui import mock_scryfall, check, results

PORT = int(os.environ.get('CC_WORKER_PORT', '8796'))
Q = f'?online=http://127.0.0.1:{PORT}'
ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
SB = 'https://wdngytwilqxcdoqtefgg.supabase.co/**'
CODE = '123456'


def start_worker():
    proc = subprocess.Popen(['node', 'cloud/dev-server.mjs', str(PORT)], cwd=ROOT, stdout=subprocess.DEVNULL)
    for _ in range(50):
        try: urllib.request.urlopen(f'http://127.0.0.1:{PORT}/'); return proc
        except Exception: time.sleep(0.1)
    raise RuntimeError('test Worker did not start')


def online_copy(key):
    with urllib.request.urlopen(f'http://127.0.0.1:{PORT}/profiles/{key}') as r: return json.load(r)


class FakeSupabase:
    """Users are emails. Code 123456 always works. Tokens: access 'tok:<email>:<n>', refresh 'ref:<email>:<n>'."""
    def __init__(self): self.users = set(); self.rows = {}; self.otp = []; self.refreshed = []; self.logouts = []; self.n = 0

    def tokens(self, email):
        self.n += 1
        return {'access_token': f'tok:{email}:{self.n}', 'refresh_token': f'ref:{email}:{self.n}', 'expires_in': 3600,
                'token_type': 'bearer', 'user': {'id': email, 'email': email}}

    async def handle(self, route):
        req = route.request; url = req.url; m = req.method
        cors = {'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*'}
        def reply(status, body=None):
            return route.fulfill(status=status, content_type='application/json', body=json.dumps(body if body is not None else {}), headers=cors)
        if m == 'OPTIONS': return await route.fulfill(status=204, headers=cors)
        auth = req.headers.get('authorization', '').replace('Bearer ', '')
        uid = auth.split(':')[1] if auth.startswith('tok:') else None
        body = json.loads(req.post_data) if req.post_data else {}
        if '/auth/v1/otp' in url:
            self.otp.append(body)
            if body['email'] not in self.users:
                if not body.get('create_user'): return await reply(422, {'msg': 'Signups not allowed for otp', 'error_code': 'otp_disabled'})
                self.users.add(body['email'])
            return await reply(200)
        if '/auth/v1/verify' in url:
            if body.get('token') != CODE or body.get('type') != 'email' or body['email'] not in self.users:
                return await reply(403, {'msg': 'Token has expired or is invalid'})
            return await reply(200, self.tokens(body['email']))
        if '/auth/v1/token' in url:
            ref = body.get('refresh_token', ''); self.refreshed.append(ref)
            if not ref.startswith('ref:'): return await reply(400, {'msg': 'Invalid Refresh Token'})
            return await reply(200, self.tokens(ref.split(':')[1]))
        if '/auth/v1/logout' in url: self.logouts.append(uid); return await reply(204)
        if '/auth/v1/user' in url: return await reply(200, {'id': uid, 'email': uid}) if uid else await reply(401)
        if '/rest/v1/profile_recovery' in url:
            if not uid: return await reply(401, {'message': 'no token'})
            if m == 'POST':
                if any(k == body['profile_key'] and u != uid for u, k in self.rows.items()):
                    return await reply(409, {'code': '23505', 'message': 'duplicate key value violates unique constraint'})
                self.rows[body['user_id']] = body['profile_key']; return await reply(201)
            if m == 'GET': return await reply(200, [{'profile_key': self.rows[uid]}] if uid in self.rows else [])
        return await reply(404)


async def device(browser, sb, dev=IPAD, welcome=True, query=Q):
    ctx = await browser.new_context(**dev, welcome=welcome, accept_downloads=True)
    await ctx.route(SB, sb.handle)
    page = await ctx.new_page(); page.errors = []
    page.on('pageerror', lambda e: page.errors.append('PAGEERROR ' + str(e)))
    page.on('console', lambda m: page.errors.append(m.text) if m.type == 'error' and 'status of 4' not in m.text and 'ERR_' not in m.text else None)
    await mock_scryfall(page)
    await page.goto(URL + query); await page.wait_for_function('window.__ccReady === true', timeout=15000)
    return page


async def set_name(page, name):
    await page.evaluate("async n => { const m = await import('./src/data/profile.js'); await m.saveAccountProfile({ displayName: n }); }", name)


async def name_of(page):
    return await page.evaluate("async () => { const m = await import('./src/data/profile.js'); await m.initProfileStore(); return m.loadProfile().account?.displayName || ''; }")


def ls(page, key):
    return page.evaluate(f"JSON.parse(localStorage.getItem('{key}') || 'null')")


async def toast_has(page, part, timeout=10000):
    await page.wait_for_function("t => document.getElementById('toast')?.textContent.includes(t)", arg=part, timeout=timeout)


async def enter(page, email, sb, mode='signup'):
    """The email + code form, wherever it is drawn."""
    await page.fill('[data-auth-email]', email); await page.click('[data-auth="send"]')
    await page.wait_for_selector('[data-auth-code]')
    check(f'{mode}: the code request says create_user={mode == "signup"}', sb.otp[-1] == {'email': email, 'create_user': mode == 'signup'}, str(sb.otp[-1]))
    await page.fill('[data-auth-code]', CODE); await page.click('[data-auth="verify"]')


async def from_settings(page, act):
    await page.click('[data-act="settings"]'); await page.click(f'[data-account="{act}"]')
    await page.wait_for_selector('[data-auth-email]')


async def main():
    worker = start_worker(); sb = FakeSupabase()
    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch()

            # 1. A new player: the welcome screen, sign up, a key made and kept by the account, never shown.
            a = await device(browser, sb)
            check('first launch shows the welcome screen', await a.locator('.welcome').count() == 1 and await a.locator('.landing').count() == 0)
            check('welcome offers Sign up, Sign in and Skip', await a.locator('[data-welcome]').count() == 3)
            await a.screenshot(path=f'{OUT}accounts-welcome.png')
            await a.click('[data-welcome="signup"]')
            await a.fill('[data-auth-email]', 'nope'); await a.click('[data-auth="send"]')
            check('a bad email is refused', 'valid email' in await a.locator('[data-auth-error]').text_content())
            await a.fill('[data-auth-email]', 'new@example.com'); await a.click('[data-auth="send"]')
            await a.wait_for_selector('[data-auth-code]')
            await a.fill('[data-auth-code]', '999999'); await a.click('[data-auth="verify"]')
            await a.wait_for_function("document.querySelector('[data-auth-error]')?.textContent.includes('wrong')")
            check('a wrong code says so', True)
            await a.fill('[data-auth-code]', '12345'); await a.click('[data-auth="verify"]')
            check('a 5-digit code is refused before sending', '6 to 8' in await a.locator('[data-auth-error]').text_content())
            await a.screenshot(path=f'{OUT}accounts-code.png')
            await a.fill('[data-auth-code]', CODE); await a.click('[data-auth="verify"]')
            await a.wait_for_selector('.landing', timeout=15000)
            key_a = sb.rows.get('new@example.com')
            link = await ls(a, 'cc-online-profile')
            check('sign-up made a key, kept by the account and this device', bool(key_a) and link and link['key'] == key_a, f'{sb.rows} {link}')
            check('the profile is online under it', online_copy(key_a)['rev'] >= 1)
            auth = await ls(a, 'cc.auth')
            check('the session is kept on the device (refresh token)', auth and auth['refresh'].startswith('ref:new@example.com') and auth['email'] == 'new@example.com', str(auth))
            await a.click('[data-act="settings"]')
            check('Settings shows the account email', (await a.locator('[data-account-email]').text_content()) == 'new@example.com')
            check('no key is shown in Settings', key_a not in await a.locator('.modal').inner_text())
            await a.screenshot(path=f'{OUT}accounts-settings.png')
            await a.click('[data-modal-back]')

            # 2. Refresh token kept across a reload.
            before = len(sb.refreshed)
            await a.reload(); await a.wait_for_function('window.__ccReady === true')
            await a.wait_for_function(f"JSON.parse(localStorage.getItem('cc.auth')).refresh !== '{auth['refresh']}'", timeout=10000)
            check('after a reload: no welcome, the session is refreshed with the stored token', await a.locator('.welcome').count() == 0 and sb.refreshed[before:] == [auth['refresh']], str(sb.refreshed))

            # 3. Skip, play a while, sign up later: everything stays and goes online.
            s = await device(browser, sb, PHONE)
            await s.click('[data-welcome="skip"]'); await s.wait_for_selector('.landing')
            check('skip goes to the start screen and is remembered', bool(await s.evaluate("localStorage.getItem('cc.welcome.done')")))
            await set_name(s, 'Skipper')
            await s.reload(); await s.wait_for_function('window.__ccReady === true')
            check('skipped once: no welcome again', await s.locator('.welcome').count() == 0)
            await from_settings(s, 'signup'); await enter(s, 'skip@example.com', sb)
            await toast_has(s, 'saves to your account')
            k = sb.rows.get('skip@example.com')
            check('skip then sign up: the local profile stays', await name_of(s) == 'Skipper')
            check('skip then sign up: the profile went online under the account key', k and online_copy(k)['backup']['profile']['account']['displayName'] == 'Skipper')

            # 4. An established player: profile and an online key on this device, then the welcome screen once.
            e = await device(browser, sb)
            await e.evaluate("localStorage.setItem('cc.welcome.done', 'x')")
            await set_name(e, 'Max')
            key_e = await e.evaluate("async () => (await (await import('./src/app/online-profile.js')).saveProfileOnline()).key")
            await e.evaluate("localStorage.removeItem('cc.welcome.done')")
            await e.reload(); await e.wait_for_function('window.__ccReady === true')
            check('an existing install with a profile sees the welcome screen once', await e.locator('.welcome').count() == 1)
            await e.click('[data-welcome="signup"]'); await enter(e, 'max@example.com', sb)
            await e.wait_for_selector('.landing', timeout=15000)
            check('established player: the same key is kept by the account', sb.rows.get('max@example.com') == key_e, f'{sb.rows} {key_e}')
            check('established player: the device keeps its key and profile', (await ls(e, 'cc-online-profile'))['key'] == key_e and await name_of(e) == 'Max')
            check('established player: online copy intact', online_copy(key_e)['backup']['profile']['account']['displayName'] == 'Max')

            # 5. Device B (nothing on it) signs in: gets A's profile; an unknown email cannot sign in.
            b = await device(browser, sb, PHONE)
            await b.click('[data-welcome="signin"]')
            await b.fill('[data-auth-email]', 'nobody@example.com'); await b.click('[data-auth="send"]')
            await b.wait_for_function("document.querySelector('[data-auth-error]')?.textContent.includes('Sign up')")
            check('sign in with an unknown email says to sign up, creates nothing', 'nobody@example.com' not in sb.users)
            await enter(b, 'max@example.com', sb, 'signin')
            await b.wait_for_selector('.landing', timeout=15000)
            check('device B gets the account profile', await name_of(b) == 'Max')
            check('device B is linked to the same key with no key typed', (await ls(b, 'cc-online-profile'))['key'] == key_e)
            check('device B was not asked which profile to keep', await b.locator('[data-keep]').count() == 0)

            # 6. A device with its own different profile signs in: backup first, then one question. Keep this device's.
            c = await device(browser, sb, welcome=False)
            await set_name(c, 'Other')
            await from_settings(c, 'signin'); await enter(c, 'max@example.com', sb, 'signin')
            await c.wait_for_selector('[data-keep="account"]', timeout=15000)
            copies = await ls(c, 'cc.backups')
            check('before asking, this device\'s profile is kept as a backup copy', copies and copies[0]['name'] == 'Other', str(copies))
            stored = await c.evaluate("async id => (await (await import('./src/app/online-profile.js')).readBackupCopy(id))?.profile?.account?.displayName", copies[0]['id'])
            check('the backup copy holds the device profile (IndexedDB)', stored == 'Other', stored)
            check('nothing replaced while the question is open', await name_of(c) == 'Other' and online_copy(key_e)['backup']['profile']['account']['displayName'] == 'Max')
            await c.screenshot(path=f'{OUT}accounts-choose.png')
            async with c.expect_download() as dl:
                await c.click('[data-keep-file]')
            check('"Save a backup file first" saves a .ccsave file', (await dl.value).suggested_filename.endswith('.ccsave'))
            await c.click('[data-keep="device"]')
            await toast_has(c, "This device's profile is now")
            check('keep this device: the device profile stays', await name_of(c) == 'Other')
            check('keep this device: it is now the account profile online', online_copy(key_e)['backup']['profile']['account']['displayName'] == 'Other')
            names = [r['name'] for r in await ls(c, 'cc.backups')]
            check('keep this device: the account\'s old profile is kept as a backup copy', 'Max' in names, str(names))

            # 7. Another device with its own profile keeps the account's: its own stays as a backup and can be restored.
            d = await device(browser, sb, welcome=False)
            await set_name(d, 'Delta')
            await from_settings(d, 'signin'); await enter(d, 'max@example.com', sb, 'signin')
            await d.wait_for_selector('[data-keep="account"]', timeout=15000)
            await d.click('[data-keep="account"]')
            await toast_has(d, "account's profile is on this device")
            check('keep the account: the account profile is loaded', await name_of(d) == 'Other')
            rows = await ls(d, 'cc.backups')
            check('keep the account: this device\'s profile stays as a backup copy', rows[0]['name'] == 'Delta', str(rows))
            await d.click('[data-act="settings"]'); await d.click('[data-backup="advanced"]')
            check('Advanced shows the key (support only) and the backup copies', await d.locator('[data-profile-key]').count() == 1 and await d.locator('[data-copies] [data-online="restore"]').count() >= 1)
            await d.click(f'[data-online="restore"][data-id="{rows[0]["id"]}"]'); await d.click('.modal .btn--danger:text-is("Restore")')
            await toast_has(d, 'Backup copy restored')
            check('a backup copy can be restored', await name_of(d) == 'Delta')

            # 8. Decide later: nothing changes, Settings offers the choice again.
            f = await device(browser, sb, welcome=False)
            await set_name(f, 'Later')
            await from_settings(f, 'signin'); await enter(f, 'max@example.com', sb, 'signin')
            await f.wait_for_selector('[data-keep="later"]', timeout=15000); await f.click('[data-keep="later"]')
            await toast_has(f, 'Choose which profile to keep')
            check('decide later: nothing replaced, not linked', await name_of(f) == 'Later' and await ls(f, 'cc-online-profile') is None)
            await f.click('[data-act="settings"]')
            check('decide later: Settings offers the choice', await f.locator('[data-account="connect"]').count() == 1)
            await f.click('[data-modal-back]')

            # 9. The email held a link instead of a code: tapping it still signs in (fallback).
            g = await device(browser, sb, PHONE)
            await g.goto(f'{URL}{Q}&auth=1#access_token=tok:max@example.com:900&refresh_token=ref:max@example.com:900&expires_in=3600&token_type=bearer&type=magiclink')
            await g.wait_for_function('window.__ccReady === true')
            await toast_has(g, 'Signed in')
            check('link fallback: address cleaned, session kept, no welcome', await g.evaluate("!location.hash && !location.search.includes('auth')") and (await ls(g, 'cc.auth'))['email'] == 'max@example.com' and await g.locator('.welcome').count() == 0)
            want = online_copy(key_e)['backup']['profile']['account']['displayName']   # 'Delta': the restore on D was saved online
            await g.wait_for_function("n => JSON.parse(localStorage.getItem('ccv07-profile') || '{}').account?.displayName === n", arg=want, timeout=10000)
            check('link fallback: the account profile is loaded', await name_of(g) == want, want)

            # 10. Sign out: session gone, device stops saving online, its profile stays.
            await e.click('[data-act="settings"]'); await e.click('[data-account="signout"]'); await e.click('.modal .btn--confirm:text-is("Sign out")')
            await toast_has(e, 'Signed out')
            check('sign out clears the session and the online link', await ls(e, 'cc.auth') is None and await ls(e, 'cc-online-profile') is None)
            check('sign out keeps the profile on the device', await name_of(e) == 'Max')
            check('Settings offers Sign up again', await e.locator('[data-account="signup"]').count() == 1)
            await e.reload(); await e.wait_for_function('window.__ccReady === true')
            check('signed out: no welcome screen again', await e.locator('.welcome').count() == 0)

            for pg in (a, s, e, b, c, d, f, g):
                check('no page errors', not pg.errors, str(pg.errors))
            await browser.close()
    finally:
        worker.terminate()
    bad = results.count(False)
    print(f'{len(results) - bad}/{len(results)} passed')
    sys.exit(1 if bad else 0)

os.makedirs(OUT, exist_ok=True)
asyncio.run(main())
