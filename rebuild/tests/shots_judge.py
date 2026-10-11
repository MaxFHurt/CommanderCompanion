"""Host screens on a phone: host device (Table / Judge, with an illegal play) and a playing host (My Board / Table / Judge)."""
import asyncio, os, sys
from playwright.async_api import async_playwright
sys.path.insert(0, os.path.dirname(__file__))
from shots import PHONE, IPAD, OUT
from game_ui import fill_seat
from net_ui import open_page, join

FORCE = """async () => {
  // Screenshot setup only: make one illegal play (a forced spell with no mana) the way Free Play allows.
  const { getSession } = await import('./src/app/session.js');
  const s = getSession(), g = s.game, p = g.players[0];
  const c = [...p.deck.remainingLibrary, ...p.deck.hand].find(c => g.cardDefinitions[c.definitionId].name === 'Serra Angel');
  const mode = g.mode; g.mode = 'freeplay';
  if (c.zone !== 'hand') s.controller.dispatch({ type: 'edit', edit: { kind: 'move', instanceId: c.instanceId, to: 'hand' } }, { playerId: null, isHost: true });
  s.controller.dispatch({ type: 'play', as: p.playerId, instanceId: c.instanceId, force: true }, { playerId: null, isHost: true });
  g.mode = mode; s.actAs(null);
}"""

async def host_device(browser, device, tag):
    ctx = await browser.new_context(**device)
    host = await open_page(ctx)
    await host.click('[data-act="start"]'); await host.click('[data-mode="fully-tracked"]'); await host.click('[data-play="host-device"]'); await host.click('[data-n="2"]')
    await host.wait_for_function('!!window.__ccRoomCode'); code = await host.evaluate('window.__ccRoomCode')
    a = await open_page(ctx); b = await open_page(ctx)
    await join(a, code, 'Aaron', 'white'); await join(b, code, 'Lex', 'simic')
    await host.wait_for_selector('text=Players (2 of 2)')
    await host.click('[data-act="start"]'); await host.wait_for_selector('.rules-editor'); await host.click('[data-first-pick="0"]')
    await host.fill('[data-rule="priorityTimer"]', '0'); await host.click('.modal .btn--confirm'); await host.wait_for_selector('.game')
    for pg in (a, b): await pg.wait_for_selector('text=opening hand', timeout=15000); await pg.click('#keepHand')
    await a.wait_for_selector('.zone--hand .card')
    land = a.locator('.zone--hand .card.is-playable').first
    if await land.count(): await land.click(); await a.click('.modal .btn--confirm'); await a.wait_for_timeout(300)
    await host.evaluate(FORCE); await host.wait_for_timeout(400)
    await host.screenshot(path=f'{OUT}{tag}-host-table.png')
    await host.click('[data-act="screen"][data-screen="judge"]'); await host.wait_for_selector('.judge'); await host.wait_for_timeout(200)
    await host.screenshot(path=f'{OUT}{tag}-host-judge.png')
    print(tag, 'host device', host.errors[:3], a.errors[:3])
    await ctx.close()

async def host_player(browser, device, tag):
    ctx = await browser.new_context(**device)
    host = await open_page(ctx)
    await host.click('[data-act="start"]'); await host.click('[data-mode="fully-tracked"]'); await host.click('[data-play="host-player"]')
    await host.wait_for_selector('.setup'); await fill_seat(host, 'Aaron', 'white'); await host.click('[data-act="start"]')
    await host.wait_for_selector('text=Setup check', timeout=15000); await host.click('.modal .btn--confirm')
    await host.wait_for_function('!!window.__ccRoomCode', timeout=15000); code = await host.evaluate('window.__ccRoomCode')
    b = await open_page(ctx); await join(b, code, 'Lex', 'simic')
    await host.wait_for_selector('text=Players (2 of 2)')
    await host.click('[data-act="start"]'); await host.wait_for_selector('.rules-editor'); await host.click('[data-first-pick="0"]')
    await host.fill('[data-rule="priorityTimer"]', '0'); await host.click('.modal .btn--confirm')
    await b.wait_for_selector('.rules-summary', timeout=15000); await b.click('.modal .btn--confirm'); await host.wait_for_selector('.game')
    for pg in (host, b): await pg.wait_for_selector('text=opening hand', timeout=15000); await pg.click('#keepHand')
    await host.wait_for_selector('.zone--hand .card'); await host.wait_for_timeout(300)
    await host.screenshot(path=f'{OUT}{tag}-hostplayer-board.png')
    await host.click('[data-act="screen"][data-screen="table"]'); await host.wait_for_selector('.zone--table'); await host.wait_for_timeout(200)
    hidden = await host.locator('.zone--table .card--back').count()
    await host.screenshot(path=f'{OUT}{tag}-hostplayer-table.png')
    print(tag, 'host player: hand backs on table', hidden, 'judge screen:', await host.locator('[data-screen="judge"]').count(), host.errors[:3])
    await ctx.close()

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        for device, tag in ((PHONE, 'phone'), (IPAD, 'ipad')):
            await host_device(browser, device, tag)
            await host_player(browser, device, tag)
        await browser.close()
asyncio.run(main())
