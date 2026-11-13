"""Real-device layout checks by emulation: every main screen on Playwright's iPhone 15 Pro / iPad Pro 11 profiles.

Run from rebuild/:  PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers python3 tests/devices_ui.py [shots-dir]
Env: CC_STATIC (default http://127.0.0.1:4196, serve rebuild/ with `python3 -m http.server 4196 --bind 127.0.0.1`),
     DC_PROTO (a Deck Builder test-data folder holding snapshot/ and data2/; default: newest /home/user/dc-runs/*/proto),
     DEVICES_WEBKIT=1 to use WebKit when installed (this machine has Chromium only: Chromium with the profile's viewport, UA, touch, scale).

Safe areas cannot be set (env(safe-area-inset-*) is 0 here), so instead no button/text may sit in the outer band an iPhone
reserves: 44 px top / 34 px bottom held upright, 47 px left and right sideways. The game app is landscape-only (rotate gate in
portrait): in portrait it is checked on the landing page (gate shown, gate fits), all other game screens run sideways.
The Deck Builder runs in both orientations. The suite only reports; it never fixes app code (exit 1 when any check fails).
"""
import asyncio, glob, gzip, json, os, re, sys
from playwright.async_api import async_playwright
sys.path.insert(0, os.path.dirname(__file__))
from game_ui import mock_scryfall, start_guided, continue_to_game, tap_curtain, FIX
from shots import start_tracker

STATIC = os.environ.get('CC_STATIC', 'http://127.0.0.1:4196')
OUT = (sys.argv[1] if len(sys.argv) > 1 else os.environ.get('SHOTS_DIR', '/tmp/devices')).rstrip('/') + '/'
os.makedirs(OUT, exist_ok=True)
PROTO = os.environ.get('DC_PROTO') or (sorted(glob.glob('/home/user/dc-runs/*/proto'), key=os.path.getmtime) or [''])[-1]
DEVICES = ['iPhone 15 Pro', 'iPhone 15 Pro landscape', 'iPad Pro 11', 'iPad Pro 11 landscape']
SLUG = lambda d: d.lower().replace(' ', '-')

INSET = None
results = []   # (device, screen, check, ok, detail)
problems = []
def check(dev, screen, name, ok, detail=''):
    results.append((dev, screen, name, bool(ok), detail))
    if not ok:
        print(f'FAIL [{dev}] {screen}: {name} {detail}')
        problems.append((dev, screen, name, detail))

# ---------------------------------------------------------------- in-page audit
AUDIT = """(opt) => {
  const vw = document.documentElement.clientWidth, vh = window.innerHeight;
  const vis = e => { const s = getComputedStyle(e); if (s.visibility === 'hidden' || s.display === 'none' || +s.opacity === 0) return false;
    const r = e.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return false;
    for (let p = e; p; p = p.parentElement) { const ps = getComputedStyle(p); if (ps.display === 'none' || ps.visibility === 'hidden') return false; if (p.hidden) return false; }
    return true; };
  const name = e => (e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\\s+/).slice(0, 2).join('.') : '') +
    (e.dataset && e.dataset.act ? '[' + e.dataset.act + ']' : '') + ' "' + ((e.getAttribute('aria-label') || e.innerText || e.alt || e.value || '').trim().replace(/\\s+/g, ' ').slice(0, 24)) + '"');
  const scrollX = e => { for (let p = e.parentElement; p; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if ((o === 'auto' || o === 'scroll') && p.scrollWidth > p.clientWidth + 1) return p; } return null; };
  const scrollAny = e => { for (let p = e.parentElement; p; p = p.parentElement) { const s = getComputedStyle(p); if (/(auto|scroll)/.test(s.overflowX + s.overflowY)) return p; } return null; };
  const fixedAnc = e => { for (let p = e; p; p = p.parentElement) if (/(fixed|sticky)/.test(getComputedStyle(p).position)) return true; return false; };
  const root = opt.root ? document.querySelector(opt.root) : document.body;
  const out = {};
  out.hscroll = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) > vw + 1 ? [document.documentElement.scrollWidth, document.body.scrollWidth, vw] : null;
  const ctl = [...root.querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea, [role=button], [data-act]')].filter(vis)
    .filter(e => !e.closest('.rotate-gate') || opt.gate);
  const leaf = [...root.querySelectorAll('*')].filter(e => vis(e) && [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && !/^(SCRIPT|STYLE|OPTION)$/.test(e.tagName));
  const all = [...new Set([...ctl, ...leaf])].filter(e => !e.closest('.rotate-gate') || opt.gate);
  // outside the viewport / cut off by a clipping ancestor
  out.outside = []; out.clipped = [];
  for (const e of all) {
    const r = e.getBoundingClientRect(); if (scrollX(e)) continue;
    if (r.left < -1 || r.right > vw + 1) { out.outside.push(name(e) + ' x ' + Math.round(r.left) + '..' + Math.round(r.right) + ' of ' + vw); continue; }
    if (fixedAnc(e) && !scrollAny(e) && (r.top < -1 || r.bottom > vh + 1)) { out.outside.push(name(e) + ' y ' + Math.round(r.top) + '..' + Math.round(r.bottom) + ' of ' + vh); continue; }
    for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) {
      const s = getComputedStyle(p); if (s.overflowX === 'visible' && s.overflowY === 'visible') continue;
      if (/(auto|scroll)/.test(s.overflowX) && p.scrollWidth > p.clientWidth + 1) break;   // horizontally scrollable: fine
      const pr = p.getBoundingClientRect();
      const hOut = r.left < pr.left - 2 || r.right > pr.right + 2;
      const sc = scrollAny(e), scIn = sc && sc !== p && p.contains(sc);
      const vOut = !scIn && !/(auto|scroll)/.test(s.overflowY) && (r.top < pr.top - 2 || r.bottom > pr.bottom + 2);
      if (hOut || vOut) { out.clipped.push(name(e) + ' by ' + name(p)); break; }
    }
    // text cut off by its own box (no ellipsis)
    if (leaf.includes(e) && e.scrollWidth > e.clientWidth + 2 && /(hidden|clip)/.test(getComputedStyle(e).overflowX) && getComputedStyle(e).textOverflow !== 'ellipsis' && e.clientWidth > 0) out.clipped.push(name(e) + ' text ' + e.scrollWidth + '>' + e.clientWidth);
  }
  // safe-area bands (only content: controls and text)
  const sa = opt.safe || {}; out.safe = [];
  if (sa.top || sa.bottom || sa.side) {
    const pageScrolls = document.documentElement.scrollHeight > vh + 2;
    for (const e of all) {
      const r = e.getBoundingClientRect(), fx = fixedAnc(e), sc = scrollAny(e);
      if (sa.top && r.top < sa.top && r.bottom > 0 && (fx || window.scrollY === 0)) out.safe.push('top ' + name(e) + ' y=' + Math.round(r.top));
      else if (sa.bottom && r.bottom > vh - sa.bottom && r.top < vh && (fx || !pageScrolls) && !sc) out.safe.push('bottom ' + name(e) + ' y=' + Math.round(r.bottom));
      else if (sa.side && (r.left < sa.side || r.right > vw - sa.side) && r.right > 0 && r.left < vw) out.safe.push('side ' + name(e) + ' x=' + Math.round(r.left) + '..' + Math.round(r.right));
    }
  }
  // buttons in one row: same height
  out.rows = []; const bt = ctl.filter(e => /^(BUTTON|A)$/.test(e.tagName) && !e.closest('button, a') || (e.tagName === 'BUTTON'));
  const byParent = new Map(); for (const b of bt) { const k = b.parentElement; (byParent.get(k) || byParent.set(k, []).get(k)).push(b); }
  for (const [p, list] of byParent) {
    const rows = []; for (const b of list) { const r = b.getBoundingClientRect(), cy = r.top + r.height / 2; let row = rows.find(x => Math.abs(x.cy - cy) < Math.min(6, r.height / 3)); if (!row) rows.push(row = { cy, items: [] }); row.items.push([b, r]); }
    for (const row of rows) if (row.items.length > 1) { const hs = row.items.map(([, r]) => r.height), mn = Math.min(...hs), mx = Math.max(...hs); if (mx - mn > 2) out.rows.push(row.items.map(([b, r]) => name(b) + ' h=' + Math.round(r.height)).join(' | ')); }
  }
  // tap targets
  out.small = []; const seen = new Set();
  for (const e of ctl) { if (!/^(BUTTON|A|INPUT|SELECT|TEXTAREA)$/.test(e.tagName) && !e.matches('[role=button]')) continue; if (e.closest('button') && e.tagName !== 'BUTTON') continue;
    if (e.tagName === 'INPUT' && /(checkbox|radio)/.test(e.type) && e.closest('label')) continue;
    const r = e.getBoundingClientRect(); if (r.left < -1 || r.right > vw + 1) continue;
    if (Math.min(r.width, r.height) < 36) { const k = name(e); if (!seen.has(k)) { seen.add(k); out.small.push(k + ' ' + Math.round(r.width) + 'x' + Math.round(r.height)); } } }
  return out;
}"""

async def audit(page, dev, screen, *, safe=None, root=None, gate=False, tap=True, rows=True, note=''):
    """Run every per-screen check and a screenshot. `safe` = dict(top, bottom, side) bands."""
    await page.wait_for_timeout(250)
    r = await page.evaluate(AUDIT, dict(safe=safe or {}, root=root, gate=gate))
    shot = f'{OUT}{SLUG(dev)}__{screen}.png'
    await page.screenshot(path=shot)
    check(dev, screen, 'no horizontal page scroll', not r['hscroll'], str(r['hscroll']) + ' ' + shot)
    check(dev, screen, 'nothing outside the viewport', not r['outside'], '; '.join(r['outside'][:4]) + f' ({len(r["outside"])}) ' + shot)
    check(dev, screen, 'nothing cut off', not r['clipped'], '; '.join(r['clipped'][:4]) + f' ({len(r["clipped"])}) ' + shot)
    if safe: check(dev, screen, 'outside the safe-area bands', not r['safe'], '; '.join(r['safe'][:4]) + f' ({len(r["safe"])}) ' + shot)
    if rows: check(dev, screen, 'buttons in a row are the same height', not r['rows'], '; '.join(r['rows'][:3]) + f' ({len(r["rows"])}) ' + shot)
    if tap: check(dev, screen, 'tap targets >= 36 px', not r['small'], '; '.join(r['small'][:6]) + f' ({len(r["small"])}) ' + shot)
    return r

def bands(name):
    phone = 'iPhone' in name
    land = 'landscape' in name
    if not phone: return None
    return dict(top=0, bottom=0, side=47) if land else dict(top=44, bottom=34, side=0)

# ---------------------------------------------------------------- simulated safe area
# env(safe-area-inset-*) cannot be set in a browser, so every css/html/js response from the static server gets the env() calls
# replaced by an iPhone 15 Pro's real insets (upright 59 top / 34 bottom; sideways 59 left and right / 21 bottom). iPads: 0 (Safari tab).
def insets(dev):
    if 'iPhone' not in dev: return dict(top=0, bottom=0, left=0, right=0)
    return dict(top=0, bottom=21, left=59, right=59) if 'landscape' in dev else dict(top=59, bottom=34, left=0, right=0)

def inset_route(dev):
    ins = insets(dev)
    async def handler(route):
        url = route.request.url
        if not re.search(r'\.(css|html|js)(\?|$)|/$', url): return await route.continue_()
        resp = await route.fetch(); body = await resp.text()
        body = re.sub(r'env\(\s*safe-area-inset-(top|bottom|left|right)\s*(?:,\s*[^)]*)?\)', lambda m: f'{ins[m[1]]}px', body)
        await route.fulfill(response=resp, body=body)
    return handler

# ---------------------------------------------------------------- game app
async def new_game_page(browser, p, dev):
    ctx = await browser.new_context(**p.devices[dev])
    page = await ctx.new_page(); page.errors = []
    page.on('console', lambda m: page.errors.append(m.text) if m.type == 'error' and not re.search('ERR_FAILED|fixture://|ERR_UNKNOWN_URL_SCHEME|ERR_BLOCKED|ERR_INTERNET', m.text) else None)
    page.on('pageerror', lambda e: page.errors.append('PAGEERROR ' + str(e)))
    await mock_scryfall(page)
    await page.route(re.compile(r'http://127\.0\.0\.1:\d+/.*'), inset_route(dev))
    await page.goto(STATIC + '/index.html')
    await page.wait_for_function('window.__ccReady === true', timeout=15000)
    return page

async def gate_shown(page):
    return await page.evaluate("(() => { const g = document.querySelector('.rotate-gate'); return !!g && getComputedStyle(g).display !== 'none'; })()")

async def game_app(browser, p, dev):
    upright = p.devices[dev]['viewport']['height'] > p.devices[dev]['viewport']['width']
    sa = bands(dev)
    page = await new_game_page(browser, p, dev)
    gate = await gate_shown(page)
    if upright:
        check(dev, 'landing', 'portrait shows the rotate gate (expected: game app is landscape-only)', gate)
        await audit(page, dev, 'landing-rotate-gate', safe=sa, gate=True, rows=False)
        # the gate covers the whole screen: nothing behind it can be reached, so the other game screens are checked sideways only
        check(dev, 'game-app', 'console errors', not page.errors, str(page.errors[:3]))
        await page.context.close(); return
    check(dev, 'landing', 'landscape shows no rotate gate', not gate)
    await audit(page, dev, 'landing', safe=sa)
    # mode select
    await page.click('[data-act="start"]'); await page.wait_for_selector('.mode-select')
    await audit(page, dev, 'mode-select', safe=sa)
    await page.click('[data-act="back"]'); await page.wait_for_selector('[data-act="settings"]')
    # settings + backup
    await page.click('[data-act="settings"]'); await page.wait_for_selector('.modal')
    await audit(page, dev, 'settings', safe=sa, root='.modal')
    back = page.locator('.modal :text("Backup")').first
    if await back.count():
        await back.scroll_into_view_if_needed()
        await audit(page, dev, 'settings-backup', safe=sa, root='.modal')
    else:
        check(dev, 'settings-backup', 'Backup section found in Settings', False)
    await page.click('.modal [data-modal-back]'); await page.wait_for_selector('.modal', state='detached')
    # profile
    await page.wait_for_timeout(150)
    await page.click('[data-act="profile"]'); await page.wait_for_selector('.profile, [data-screen="profile"], .btn-back')
    await audit(page, dev, 'profile', safe=sa)
    await page.click('[data-act="back"]'); await page.wait_for_selector('[data-act="start"]')
    # Table Tracker
    await start_tracker(page, 4)
    await audit(page, dev, 'table-tracker', safe=sa)
    await page.context.close()
    # Guided game with the fixture decks (the mock card data the other suites use)
    page = await new_game_page(browser, p, dev)
    await start_guided(page, ('simic', 'rakdos'))
    await audit(page, dev, 'guided-setup', safe=sa)
    await continue_to_game(page)
    await page.wait_for_selector('text=opening hand')
    await audit(page, dev, 'guided-opening-hand', safe=sa)
    await page.click('#keepHand'); await page.wait_for_selector('.curtain'); await tap_curtain(page)
    await page.wait_for_selector('text=opening hand'); await page.click('#keepHand')
    await page.wait_for_selector('.curtain'); await tap_curtain(page); await page.wait_for_selector('.zone--hand')
    # put cards on the battlefield and lands so all three rows have cards (test setup only, as flows_ui.py does)
    await page.evaluate("""async () => {
      const { getSession } = await import('./src/app/session.js'); const s = getSession(), g = s.game, dm = g.deviceMode; g.deviceMode = 'multi-device';
      const p = g.players[0]; const pick = f => [...p.deck.remainingLibrary, ...p.deck.hand].find(c => !c.__used && f(g.cardDefinitions[c.definitionId]));
      for (const f of [d => /Land/.test(d.type_line), d => /Land/.test(d.type_line), d => /Creature/.test(d.type_line), d => /Creature/.test(d.type_line)]) { const c = pick(f); if (!c) continue; c.__used = true; s.controller.dispatch({ type: 'edit', edit: { kind: 'move', instanceId: c.instanceId, to: 'battlefield' } }, { playerId: null, isHost: true }); }
      g.deviceMode = dm; s.actAs(s.actingAs()); }""")
    await page.wait_for_timeout(300)
    r = await audit(page, dev, 'guided-game', safe=sa)
    sizes = await page.evaluate("""() => { const z = s => [...document.querySelectorAll(s)].filter(e => e.getBoundingClientRect().width > 0).map(e => { const r = e.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; });
      return { hand: z('.zone--hand .card'), bf: z('.zone--battlefield .card'), lands: z('.zone--lands .card') }; }""")
    mx = lambda a, i: max([x[i] for x in a] or [0])
    ok = bool(sizes['hand']) and (not sizes['bf'] or (mx(sizes['hand'], 0) <= mx(sizes['bf'], 0) + 1)) and (not sizes['lands'] or (mx(sizes['hand'], 0) <= mx(sizes['lands'], 0) + 1))
    check(dev, 'guided-game', 'hand cards not larger than battlefield/land cards', ok, json.dumps({k: (mx(v, 0), mx(v, 1), len(v)) for k, v in sizes.items()}) + ' (w,h,count)')
    # the jewel / decision modal
    await page.click('.jewel'); await page.wait_for_timeout(300)
    await audit(page, dev, 'guided-jewel-options', safe=sa)
    check(dev, 'game-app', 'console errors', not page.errors, str(page.errors[:3]))
    await page.context.close()

# ---------------------------------------------------------------- Deck Builder
def deck_route(proto):
    snap, d2 = proto + '/snapshot', proto + '/data2'
    cards = gzip.open(snap + '/cards.json.gz').read().decode(); raw = json.loads(cards); tags = open(snap + '/tags.json').read()
    def rd(f, mode='rb'): return open(f, mode).read()
    async def handler(route):
        u = route.request.url
        if u.startswith('http://127.0.0.1'): return await INSET(route)
        m = re.search(r'json\.edhrec\.com/pages/precon/([a-z0-9-]+)\.json', u)
        if m and os.path.exists(f'{snap}/precon/{m[1]}.json'): return await route.fulfill(status=200, content_type='application/json', body=rd(f'{snap}/precon/{m[1]}.json'))
        m = re.search(r'json\.edhrec\.com/pages/commanders/([a-z0-9-]+)/([a-z0-9-]+)\.json', u)
        if m:
            f = f'{d2}/themes/{m[1]}__{m[2]}.json'
            return await route.fulfill(status=200, content_type='application/json', body=rd(f)) if os.path.exists(f) else await route.fulfill(status=404, body='')
        m = re.search(r'json\.edhrec\.com/pages/commanders/([a-z0-9-]+)\.json', u)
        if m and os.path.exists(f'{snap}/edhrec/{m[1]}.json'): return await route.fulfill(status=200, content_type='application/json', body=rd(f'{snap}/edhrec/{m[1]}.json'))
        if 'api.scryfall.com/sets' in u and '/cards' not in u:
            return await route.fulfill(status=200, content_type='application/json', body=json.dumps({'data': []}))
        if re.search(r'api\.scryfall\.com/cards/search\?q=', u):
            from urllib.parse import unquote
            q = unquote(re.search(r'q=([^&]+)', u)[1]); mm = re.search(r'\be:([a-z0-9]+)', q)
            if mm: return await route.fulfill(status=200, content_type='application/json', body=json.dumps({'object': 'list', 'has_more': False, 'data': [dict(o, object='card') for o in raw if o.get('set') == mm[1]]}))
        if re.search(r'raw\.githubusercontent\.com/MaxFHurt/Deck-Companion/card-data/combos\.json\.gz', u) and os.path.exists(f'{d2}/spellbook/combos.json.gz'):
            return await route.fulfill(status=200, content_type='application/octet-stream', body=rd(f'{d2}/spellbook/combos.json.gz'))
        if re.search(r'fonts\.(googleapis|gstatic)\.com', u): return await route.fulfill(status=200, content_type='text/css', body='')
        return await route.abort()
    return handler, cards, tags

async def nav_check(page, dev, screen):
    """Top bar fits (fitNav): the header and its buttons are inside the viewport, not wider than it."""
    r = await page.evaluate("""() => { const top = document.querySelector('header.top'); if (!top) return { none: true }; const vw = document.documentElement.clientWidth, t = top.getBoundingClientRect();
      const bs = [...top.querySelectorAll('button')].filter(b => b.getBoundingClientRect().width).map(b => b.getBoundingClientRect());
      return { cls: top.className, scroll: top.scrollWidth - top.clientWidth, right: Math.round(t.right), vw, bad: bs.filter(q => q.right > vw + 1 || q.left < -1 || q.right > t.right + 1).length, rows: new Set(bs.map(q => Math.round(q.top / 6))).size }; }""")
    check(dev, screen, 'top bar fits (fitNav)', not r.get('none') and r['scroll'] <= 1 and r['right'] <= r['vw'] + 1 and r['bad'] == 0, json.dumps(r))
    ov = await page.evaluate("""() => { const top = document.querySelector('header.top'); if (!top) return []; const el = [...top.querySelectorAll('button, img, .brand, h1, [class*=logo]')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 4 && r.height > 4 && getComputedStyle(e).visibility !== 'hidden' && !e.closest('button') || e.tagName === 'BUTTON' && e.getBoundingClientRect().width > 4; });
      const out = []; for (let i = 0; i < el.length; i++) for (let j = i + 1; j < el.length; j++) { if (el[i].contains(el[j]) || el[j].contains(el[i])) continue; const a = el[i].getBoundingClientRect(), b = el[j].getBoundingClientRect(), w = Math.min(a.right, b.right) - Math.max(a.left, b.left), h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top); if (w > 3 && h > 3) out.push((el[i].dataset.v || el[i].className || el[i].tagName) + ' x ' + (el[j].dataset.v || el[j].className || el[j].tagName)); }
      return out; }""")
    check(dev, screen, 'top bar items do not overlap each other', not ov, '; '.join(ov[:4]))

async def deck_builder(browser, p, dev):
    if not PROTO or not os.path.exists(PROTO + '/snapshot/cards.json.gz'):
        check(dev, 'deck-builder', 'test data found (DC_PROTO)', False, PROTO); return
    handler, cards, tags = deck_route(PROTO)
    global INSET; INSET = inset_route(dev)
    ctx = await browser.new_context(**p.devices[dev])
    page = await ctx.new_page(); page.errors = []
    page.on('pageerror', lambda e: page.errors.append('pageerror: ' + e.message))
    page.on('console', lambda m: page.errors.append(m.text) if m.type == 'error' and not re.search('ERR_FAILED|ERR_BLOCKED|ERR_INTERNET|net::|Failed to load resource', m.text) else None)
    await ctx.route('**/*', handler)
    await page.goto(STATIC + '/deck/index.html', wait_until='load'); await page.wait_for_timeout(1500)
    await page.evaluate("""([raw, tg]) => { const rows = []; for (const o of JSON.parse(raw)) { const c = fromScryfall(o); if (c) rows.push(c); } const best = new Map();
      for (const c of rows) { const k = norm(c.n), x = best.get(k); if (!x || (x.p == null && c.p != null)) best.set(k, c); }
      useFull([...best.values()], '2026-10-06', true); S.noAsk = true; S.upView = 'list'; S.syncRecs = true; useTags(JSON.parse(tg)); }""", [cards, tags])
    sa = bands(dev); A = lambda s, **k: audit(page, dev, 'db-' + s, safe=sa, **k)
    await page.evaluate("() => { S.view = 'home'; S.open = false; render(); }"); await nav_check(page, dev, 'db-home'); await A('home')
    await page.evaluate("""async () => { await loadPreconLive('wakanda-forever', 'Wakanda Forever'); const d = S.draft; S.profile.decks.unshift(d); S.draft = null; S.deckId = d.id; touch(); await loadEdh(d.commander); await loadThemes(d.commander, d.aims);
      for (let i = 0; i < 80 && !apexFor(d); i++) await new Promise(r => setTimeout(r, 100)); }""")
    show = lambda tab: page.evaluate("([tab]) => { const d = S.profile.decks[0]; S.deckId = d.id; S.view = 'decks'; S.open = true; S.tab = tab; $('#modal').hidden = true; render(); try { fitWork(); fitNav(); } catch (e) {} }", [tab])
    await page.evaluate("() => { S.view = 'decks'; S.open = false; render(); }"); await nav_check(page, dev, 'db-decks-list'); await A('decks-list')
    await show('list'); await nav_check(page, dev, 'db-decklist'); await A('decklist')
    await show('up'); await page.evaluate("async () => { const d = cur(); recsFor.k = null; render(); await recsReady(d); for (let i = 0; i < 150 && recsFor.v && recsFor.v.pool && !recsFor.v.poolDone; i++) await new Promise(r => setTimeout(r, 100)); }")
    await page.wait_for_timeout(400); await nav_check(page, dev, 'db-upgrades')
    r = await A('upgrades')
    pb = await page.evaluate("() => { const vw = document.documentElement.clientWidth; const e = [...document.querySelectorAll('.panel *, main *')].filter(x => /^power\\s*\\d/i.test(x.textContent.trim()) && x.textContent.length < 60 && x.getBoundingClientRect().width).pop(); if (!e) return null; const bar = e; const r = bar.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.right), vw]; }")
    check(dev, 'db-upgrades', 'power strip (Power / Tier / Price / Bracket) present and inside the viewport', bool(pb) and pb[0] >= -1 and pb[1] <= pb[2] + 1, str(pb))
    await show('stats'); await nav_check(page, dev, 'db-stats'); await A('build-stats')
    await show('list')
    await page.evaluate("() => { const d = cur(); const c = LIB.find(c => c.cmd && c.ci.every(x => ctxOf(d).ident.includes(x)) && !d.cards.some(e => norm(e.n) === c._n) && !tags(c).land); openCard(c.n); }")
    await page.wait_for_timeout(400); await A('card-window', root='#modal')
    await page.evaluate("() => { $('#modal').hidden = true; }")
    await page.evaluate("() => { openDeckPop('health'); }"); await page.wait_for_timeout(600); await A('health-popup', root='#modal')
    await page.evaluate("() => { $('#modal').hidden = true; S.deckPop = null; }")
    await page.evaluate("() => { S.view = 'decks'; S.open = false; render(); openGenerate(); }"); await page.wait_for_timeout(600); await A('generate-panel', root='#modal')
    await page.evaluate("() => { $('#modal').hidden = true; }")
    check(dev, 'deck-builder', 'no console/page errors', not page.errors, ' | '.join(page.errors[:3]))
    await ctx.close()

async def main():
    async with async_playwright() as p:
        engine = p.webkit if os.environ.get('DEVICES_WEBKIT') else p.chromium
        browser = await engine.launch()
        print('engine:', 'webkit' if os.environ.get('DEVICES_WEBKIT') else 'chromium (profile viewport/UA/touch/scale; WebKit not installed)', '| deck data:', PROTO)
        for dev in DEVICES:
            await game_app(browser, p, dev)
            await deck_builder(browser, p, dev)
        await browser.close()
    # summary per check name
    by = {}
    for dev, screen, name, ok, d in results: by.setdefault(name, []).append(ok)
    print('\nper screen (device: failing checks):')
    scr = {}
    for dev, screen, name, ok, d in results:
        if not ok: scr.setdefault((screen, dev), []).append(name)
    for (screen, dev), v in sorted(scr.items()): print(f'  {screen} [{dev}]: ' + ', '.join(v))
    for name, v in by.items(): print(f'{"ok  " if all(v) else "FAIL"} {name}: {sum(v)}/{len(v)}')
    print(f'{sum(r[3] for r in results)}/{len(results)} checks passed; screenshots in {OUT}')
    sys.exit(0 if all(r[3] for r in results) else 1)

if __name__ == '__main__':
    asyncio.run(main())
