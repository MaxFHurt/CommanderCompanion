"""Room where the host also plays (no judge device): rules agreement, Challenge with a rejected
correction, and an undo request every player accepts. Same-browser loopback transport."""
import asyncio, os, sys
from playwright.async_api import async_playwright
sys.path.insert(0, os.path.dirname(__file__))
from shots import IPAD, OUT
from game_ui import fill_seat, check, results
from net_ui import open_page, join

async def answer(page, accept=True):
    await page.wait_for_selector('.modal .btn--confirm', timeout=15000)
    await page.click('.modal .btn--confirm' if accept else '.modal .btn--cancel')
    await page.wait_for_timeout(300)

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        ctx = await browser.new_context(**IPAD)
        host = await open_page(ctx)
        await host.click('[data-act="start"]'); await host.click('[data-mode="fully-tracked"]'); await host.click('[data-play="host-player"]')
        await host.wait_for_selector('.setup'); await fill_seat(host, 'Aaron', 'white'); await host.click('[data-act="start"]')
        await host.wait_for_selector('text=Setup check', timeout=15000); await host.click('.modal .btn--confirm')
        await host.wait_for_function('!!window.__ccRoomCode', timeout=15000); code = await host.evaluate('window.__ccRoomCode')
        b = await open_page(ctx); await b.set_viewport_size({'width': 844, 'height': 390})
        await join(b, code, 'Lex', 'simic')
        await host.wait_for_selector('text=Players (2 of 2)')
        await host.click('[data-act="start"]'); await host.wait_for_selector('.rules-editor')
        await host.click('[data-rule-toggle="undo"]')
        check('turning undo on marks it as a house rule', await host.locator('[data-rule-toggle="undo"] .chip--house').count() == 1)
        await host.click('[data-first-pick="0"]'); await host.fill('[data-rule="priorityTimer"]', '0'); await host.click('.modal .btn--confirm')
        await b.wait_for_selector('.rules-summary', timeout=15000)
        check('the joined player is asked to accept the rules, with house rules marked', await b.locator('.rules-summary .chip--house').count() >= 1)
        check('the game does not start before they accept', await host.locator('.game').count() == 0)
        await b.screenshot(path=f'{OUT}rules-agree.png')
        await b.click('.modal .btn--confirm')
        await host.wait_for_selector('.game', timeout=15000)
        for pg in (host, b): await pg.wait_for_selector('text=opening hand', timeout=15000); await pg.click('#keepHand')
        await host.wait_for_selector('.zone--hand .card'); await host.wait_for_timeout(300)
        check('a playing host has no Host Tools and no Judge screen', await host.locator('[data-act="tools"]').count() == 0 and await host.locator('[data-screen="judge"]').count() == 0)
        check('a playing host and a joined player both get Challenge', await host.locator('[data-act="challenge"]').count() == 1 and await b.locator('[data-act="challenge"]').count() == 1)
        land = host.locator('.zone--hand .card.is-playable').first
        await land.click(); await host.click('.modal .btn--confirm'); await host.wait_for_timeout(500)
        lands = await host.locator('.zone--lands .card').count()
        check('Aaron played a land', lands == 1)
        # Lex challenges; Aaron accepts; Lex edits a life total and proposes; Aaron declines.
        await b.click('[data-act="challenge"]'); await b.click('.modal .btn--confirm')
        await answer(host, True)
        await b.wait_for_selector('[data-act="correction"]', timeout=15000)
        check('an accepted challenge gives the challenger the correction tools', True)
        await b.click('[data-act="correction"]'); await b.click('.modal button:has-text("Host Tools")'); await b.wait_for_selector('.host-players')
        await b.locator('[data-life="-5"]').first.click(); await b.wait_for_timeout(300); await b.click('.modal [data-modal-back]')
        await b.click('[data-act="correction"]'); await b.click('.modal .btn--confirm')
        await host.wait_for_selector('.modal .btn--cancel', timeout=15000)
        detail = await host.text_content('.modal')
        check('the correction lists the change for the other player', 'life' in detail.lower(), detail[:200])
        await answer(host, False)
        await b.wait_for_selector('text=Correction rejected', timeout=15000)
        check('the challenger is told "Correction rejected"', True)
        check('the rejected change is taken back', '35' not in (await host.locator('.opp__life').first.text_content()))
        # Aaron asks to undo his land; Lex accepts.
        await host.click('[data-act="undo"]'); await host.click('.modal .btn--confirm')
        await answer(b, True)
        await host.wait_for_function("document.querySelectorAll('.zone--lands .card').length === 0", timeout=15000)
        check('an undo everyone accepts takes the play back', True)
        await host.screenshot(path=f'{OUT}challenge-host.png')
        for pg, n in ((host, 'host'), (b, 'b')):
            check(f'no console errors ({n})', not pg.errors, str(pg.errors[:3]))
        await browser.close()
    print(f'{sum(results)}/{len(results)} passed')
    sys.exit(0 if all(results) else 1)

if __name__ == '__main__':
    asyncio.run(main())
