"""Alignment check for every menu route, dialog and in-game dialog, on iPhone (844x390) and iPad (1180x820) landscape.

    python3 tests/align_check.py [route ...]       (serve rebuild/ on CC_STATIC, default :4180; online-room needs `node cloud/dev-server.mjs 8787`)

Drives the same routes as shots_skin.py (stages 3a/3b) and shots_routes3d.py (dialogs), and at each one asserts, with a 2 px tolerance:
  title     the title text box is centred in its header plate (plate art's title box: x 50%, y 64.3%);
  crown     a panel title's text is centred in its readout, and the readout sits at the panel's crown (61.5 map units below its top);
  button    every button label is centred on its steel face (horizontal, vertical);
  axis      header plate, panel group, button row and footer ornament share one vertical centre axis;
  gaps      panels in a row are separated by equal gaps;
  well      a list that fits its panel is vertically centred, one that does not starts at the top.
Exit 1 on any miss. Measurements are in CSS px.
"""
import asyncio, os, sys
from playwright.async_api import async_playwright

ONLY = [a for a in sys.argv[1:] if not a.startswith('-')]
sys.argv = [sys.argv[0], '/tmp/align-shots', '/home/user/vh']      # shots_* read argv at import
sys.path.insert(0, os.path.dirname(__file__))
import shots_skin as S
import shots_routes3d as D

TOL = 2.0
results = []
fails = []

MEASURE = """() => {
  const out = [];
  const vis = e => { const r = e.getBoundingClientRect(), s = getComputedStyle(e); return r.width > 4 && r.height > 4 && s.visibility !== 'hidden' && s.display !== 'none' && !e.closest('[hidden]') && s.opacity !== '0'; };
  // Text box of an element: the line boxes' width and content-area height. (Content-area centre, not glyph ink: it is what CSS controls, and
  // on the devices' fonts (SF) it coincides with the capitals' centre; the sandbox's fallback font puts capitals ~0.12 em higher.)
  const ink = el => {
    let L = 1e9, R = -1e9, T = 1e9, B = -1e9, n = 0;
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    while (w.nextNode()) {
      const t = w.currentNode, txt = t.textContent; if (!txt.trim()) continue;
      const p = t.parentElement, cs = getComputedStyle(p);
      if (cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.fontSize) < 2 || p.closest('[hidden]')) continue;
      const r = document.createRange(); r.selectNodeContents(t);
      const rects = [...r.getClientRects()].filter(q => q.width > 0); if (!rects.length) continue;
      const ls = parseFloat(cs.letterSpacing) || 0;
      for (const q of rects) { L = Math.min(L, q.left); R = Math.max(R, q.right - ls); }
      for (const q of rects) { T = Math.min(T, q.top); B = Math.max(B, q.bottom); }
      n++;
    }
    // A title cut short with an ellipsis (a long card name in the hand's card detail: the hand is shuffled, so it comes and goes)
    // shows its text across the whole content box; the range's rects run on past the clip, so measure what is drawn.
    const es = getComputedStyle(el);
    if (n && es.overflowX === 'hidden' && es.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1) {
      const eb = el.getBoundingClientRect();
      L = Math.max(L, eb.left + parseFloat(es.borderLeftWidth) + parseFloat(es.paddingLeft));
      R = Math.min(R, eb.right - parseFloat(es.borderRightWidth) - parseFloat(es.paddingRight));
    }
    return n ? { cx: (L + R) / 2, cy: (T + B) / 2, w: R - L } : null;
  };
  const box = e => { const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, cx: (r.left + r.right) / 2, cy: (r.top + r.bottom) / 2, w: r.width, h: r.height }; };
  const add = (kind, el, dx, dy, extra = '') => out.push({ kind, el: (el.className && el.className.baseVal === undefined ? '.' + String(el.className).trim().split(/\\s+/)[0] : el.tagName.toLowerCase()) + ' "' + (el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 22) + '"', dx: Math.round(dx * 10) / 10, dy: Math.round(dy * 10) / 10, extra });
  const unit = el => { const p = document.createElement('i'); p.style.cssText = 'position:absolute;visibility:hidden;width:calc(100 * var(--u, 0.0703rem));height:0'; el.appendChild(p); const u = p.getBoundingClientRect().width / 100; p.remove(); return u; };
  // The header plate's title box (screens/*/layout.json titleBox): centred, 64.3 % down the plate art.
  for (const el of document.querySelectorAll('.plate__title, .page__head h1, .modal__head h2')) {
    if (!vis(el)) continue;
    const pl = box(el.classList.contains('plate__title') ? el.parentElement : el), k = ink(el); if (!k) continue;
    add('title', el, k.cx - pl.cx, k.cy - (pl.t + pl.h * 0.643));
  }
  // Panel titles: ink centred in the readout; readout at the crown.
  for (const el of document.querySelectorAll('.route-panel__title, .mode-card__title')) {
    if (!vis(el)) continue;
    const rd = box(el), k = ink(el), pn = el.closest('.route-panel, .mode-card'); if (!k || !pn) continue;
    add('readout', el, k.cx - rd.cx, k.cy - rd.cy);
    const p = box(pn), u = unit(pn);
    add('crown', el, rd.cx - p.cx, rd.cy - (p.t + 61.5 * u));
  }
  // Buttons: label ink centred on the face.
  for (const el of document.querySelectorAll('button.btn, a.btn, .btn-back, button.jewel-key')) {
    if (!vis(el) || el.closest('.card, .tp, .game__bar, .gp-bar')) continue;
    const f = box(el), k = ink(el); if (!k) continue;
    add('button', el, k.cx - f.cx, k.cy - f.cy);
  }
  // One vertical axis for the stack: plate, panels, buttons, ornament.
  for (const st of document.querySelectorAll('.route__stack, .menu__stack, .modal--route .modal__panel')) {
    if (!vis(st)) continue;
    const kids = [...st.children].filter(c => vis(c) && getComputedStyle(c).position !== 'absolute');
    const cs = kids.map(c => c.classList.contains('route__panels') || c.classList.contains('mode-select__choices') ? (() => { const ps = [...c.children].filter(vis); const a = box(ps[0]), b = box(ps[ps.length - 1]); return { cx: (a.l + b.r) / 2, el: c }; })() : { cx: box(c).cx, el: c });
    const mid = box(st).cx;
    for (const c of cs) add('axis', c.el, c.cx - mid, 0);
  }
  // Panels in a row: equal gaps.
  for (const row of document.querySelectorAll('.route__panels')) {
    const ps = [...row.children].filter(vis).map(box); if (ps.length < 2) continue;
    const gaps = ps.slice(1).map((q, i) => q.l - ps[i].r);
    add('gaps', row, Math.max(...gaps) - Math.min(...gaps), 0, gaps.map(g => Math.round(g)).join(','));
  }
  // Wells: a list that fits is centred, one that does not starts at the top.
  for (const body of document.querySelectorAll('.route-panel__body')) {
    if (!vis(body)) continue;
    const items = []; const walk = e => { for (const c of e.children) { if (getComputedStyle(c).display === 'contents') walk(c); else if (vis(c)) items.push(c); } };
    body.scrollTop = 0;
    walk(body); if (!items.length) continue;
    const b = box(body), cs = getComputedStyle(body), top = b.t + parseFloat(cs.paddingTop) + parseFloat(cs.borderTopWidth), bot = b.b - parseFloat(cs.paddingBottom) - parseFloat(cs.borderBottomWidth);
    const first = box(items[0]), last = box(items[items.length - 1]);
    if (body.scrollHeight > body.clientHeight + 1) add('well-top', body, 0, first.t - top, 'long');
    else add('well', body, 0, (first.t - top) - (bot - last.b), 'short');
  }
  return out;
}"""


async def check(page, label):
    await page.wait_for_timeout(450)
    res = await page.evaluate(MEASURE)
    bad = [r for r in res if abs(r['dx']) > TOL or abs(r['dy']) > TOL]
    for r in res:
        results.append((label,r))
    for r in bad:
        fails.append(f"{label}: {r['kind']} {r['el']} dx={r['dx']} dy={r['dy']} {r['extra']}")


def patch():
    async def s_snap(page, name, route, device):
        if not ONLY or name in ONLY: await check(page, f'{device} {name}')
    async def d_snap(page, device, name, route=None, dialog=True):
        if not ONLY or name in ONLY: await check(page, f'{device} {name}')
    S.snap = s_snap
    D.snap = d_snap


def dev_server():
    # online-room needs the local test Worker (cloud/dev-server.mjs on :8787); start it when nothing listens there.
    import socket, subprocess, time
    if socket.socket().connect_ex(('127.0.0.1', 8787)) == 0: return None
    p = subprocess.Popen(['node', os.path.join(os.path.dirname(__file__), '..', '..', 'cloud', 'dev-server.mjs'), '8787'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1.5)
    return p


async def main():
    srv = dev_server()
    patch()
    D.want = lambda n: not ONLY or n in ONLY
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        for device in S.DEVICES:
            ctx = await browser.new_context(welcome=True, **S.DEVICES[device])      # shots.py answers the welcome screen unless asked
            page = await ctx.new_page(); await page.goto(S.URL); await page.wait_for_selector('.welcome'); await check(page, f'{device} welcome'); await page.context.close()
            for palette in (None, 'ember', 'frost'):
                page = await S.fresh(browser, device, palette=palette)
                await page.wait_for_selector('.landing'); await check(page, f'{device} landing {palette or ""}')
                if palette is None:
                    await page.click('[data-act="start"]'); await page.wait_for_selector('.mode-select'); await check(page, f'{device} mode-select')
                await page.context.close()
        await S.routes(browser)
        await S.routes3b(browser)
        for device in D.DEVICES:
            await D.game_dialogs(browser, device)
            await D.tracker(browser, device)
        await browser.close()
    n = len(results)
    if os.environ.get('ALIGN_STATS'):
        for kind in ('title', 'readout', 'crown', 'button', 'axis', 'gaps', 'well', 'well-top'):
            v = [(r['dx'], r['dy']) for _, r in results if r['kind'] == kind]
            if v: print(f'  {kind:8} n={len(v):4} dx {min(a for a, _ in v):6.1f}..{max(a for a, _ in v):5.1f}  dy {min(b for _, b in v):6.1f}..{max(b for _, b in v):5.1f}')
    print(f'{n} measurements, {len(fails)} misaligned (tolerance {TOL} px); page errors: {S.errors + D.errors or "none"}')
    for f in fails: print('  MISS ' + f)
    if srv: srv.terminate()
    sys.exit(1 if fails or S.errors or D.errors else 0)


if __name__ == '__main__':
    asyncio.run(main())
