"""End-to-end checks for Table Tracker. Run: python3 tests/tracker_test.py"""
import asyncio
from playwright.async_api import async_playwright
from shots import new_page, start_tracker, tap, PHONE, IPAD, OUT

results = []
def check(name, ok, detail=''):
    results.append((name, bool(ok), detail))
    print(('PASS ' if ok else 'FAIL ') + name + (f' — {detail}' if detail and not ok else ''))

card = lambda i, sel='': f'.tp:nth-of-type({i + 1}) {sel}'.strip()

async def life(page, i):
    return int(await page.inner_text(card(i, '[data-life]')))

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await new_page(browser, PHONE)
        await start_tracker(page, 4)

        check('four player cards on one screen', await page.locator('.tp').count() == 4)
        check('starting life is 40', await life(page, 0) == 40)
        check('first player is active', 'is-active' in (await page.get_attribute(card(0), 'class')))

        await tap(page, card(1, '[data-act="life"][data-delta="-1"]'), 19)
        check('life counts down', await life(page, 1) == 21)
        check('life flashes red on loss', 'is-loss' in (await page.get_attribute(card(1, '[data-life]'), 'class')))
        log_rows = await page.locator('.tlog__entry').count()
        check('rapid life taps merge into one log line', log_rows == 1, f'{log_rows} rows')
        check('log line shows the net change', 'Life 40 → 21 (-19)' in await page.inner_text('.tlog__entry'))

        # Undo
        await page.click('[data-act="undo"]')
        check('undo restores the previous life', await life(page, 1) == 22)

        # Mana tap
        await tap(page, card(0, '[data-act="mana"][data-color="R"]'), 3)
        check('tapping a mana symbol adds mana', (await page.inner_text(card(0, '[data-act="mana"][data-color="R"] b'))) == '3')

        # Inline name edit
        await page.fill(card(2, '.tp__name'), 'Carol')
        await page.press(card(2, '.tp__name'), 'Enter')
        check('inline name edit is logged', 'Name changed to Carol' in await page.inner_text('#trackerLog'))

        # Status popup: monarch is exclusive, poison is a status chip
        await page.click(card(0, '[data-act="status"]'))
        await page.click('[data-pop="status"][data-status="Monarch"]')
        await tap(page, '[data-pop="poison"][data-delta="1"]', 3)
        await page.screenshot(path=f'{OUT}phone-status-popup.png')
        await page.click('.modal__foot .btn')
        chips = await page.inner_text(card(0, '.tp__statuses'))
        check('status and poison show as chips', 'Monarch' in chips and 'Poison ×3' in chips, chips)
        await page.click(card(3, '[data-act="status"]'))
        await page.click('[data-pop="status"][data-status="Monarch"]')
        await page.click('.modal__foot .btn')
        check('monarch moves to the new player', 'Monarch' not in await page.inner_text(card(0, '.tp__statuses')) and 'Monarch' in await page.inner_text(card(3, '.tp__statuses')))

        # Counters popup
        await page.click(card(0, '[data-act="counters"]'))
        await page.click('[data-pop="counter-add"][data-name="Energy"]')
        await tap(page, '[data-pop="counter"][data-name="Energy"][data-delta="1"]', 2)
        await page.fill('#customCounter', 'Treasure')
        await page.click('[data-pop="counter-custom"]')
        await page.screenshot(path=f'{OUT}phone-counters-popup.png')
        await page.click('.modal__foot .btn')
        text = await page.inner_text(card(0, '[data-part="counters"]'))
        check('counters appear on the card', 'Energy' in text and '3' in text and 'Treasure' in text, text)
        await page.click(card(0, '[data-act="counter"][data-name="Energy"][data-delta="-1"]'))
        check('inline counter buttons work', 'Energy counters 3 → 2' in await page.inner_text('#trackerLog'), await page.inner_text('#trackerLog'))

        # Life editor: commander damage also lowers life, tax steps by 2
        await page.click(card(2, '[data-act="life-editor"]'))
        await tap(page, '[data-pop="cmd"][data-delta="1"] >> nth=0', 4)
        await tap(page, '[data-pop="tax"][data-delta="2"]', 2)
        await page.click('[data-pop="life"][data-delta="-5"]')
        await page.wait_for_timeout(1000)
        await page.screenshot(path=f'{OUT}phone-life-editor.png')
        await page.click('.modal__foot .btn')
        check('commander damage and -5 reduce life', await life(page, 2) == 31, str(await life(page, 2)))
        check('commander tax shows on the card', (await page.inner_text(card(2, '.tp__tax b'))) == '4')

        # Tracked card without network lookup
        await page.click(card(0, '[data-act="card-add"]'))
        await page.fill('#trackCardName', 'Sol Ring')
        await page.click('[data-add="typed"]')
        check('a card can be tracked by name while offline', await page.locator(card(0, '.tcard:not(.tcard--add)')).count() == 1)
        await page.click(card(0, '.tcard:not(.tcard--add)'))
        await tap(page, '[data-pop="card-counter"][data-name="Charge"][data-delta="1"]', 2)
        await page.click('.modal__foot .btn')
        check('tracked card shows its counter badge', (await page.inner_text(card(0, '.tcard__badge'))) == '2')

        # Cancel never commits
        await page.click(card(1, '[data-act="card-add"]'))
        await page.fill('#trackCardName', 'Should Not Exist')
        await page.click('.modal__foot .btn--cancel')
        check('cancel does not add the card', await page.locator(card(1, '.tcard:not(.tcard--add)')).count() == 0)

        # Turn passing
        await page.click('[data-act="next-turn"]')
        check('next turn moves the active glow', 'is-active' in (await page.get_attribute(card(1), 'class')) and 'Turn 2' in await page.text_content('#trackerTurn'))
        check('mana empties on turn change', (await page.inner_text(card(0, '[data-act="mana"][data-color="R"] b'))) == '0')
        await page.click(card(3, '[data-act="set-active"]'))
        check('tapping an avatar sets the active player', 'is-active' in (await page.get_attribute(card(3), 'class')))

        # Ask the Judge
        await page.click('.tlog [data-act="judge"]')
        await page.fill('#judgeSearch', 'commander tax')
        await page.wait_for_timeout(100)
        check('judge search finds commander tax', await page.locator('.judge__entry').count() >= 1)
        await page.screenshot(path=f'{OUT}phone-judge.png')
        await page.click('[data-modal-back]')

        await page.wait_for_timeout(500)
        await page.screenshot(path=f'{OUT}phone-tracker-busy.png')

        # Persistence: reload and continue
        await page.wait_for_timeout(900)
        await page.reload()
        await page.wait_for_function('window.__ccReady === true')
        await page.wait_for_selector('[data-act="continue"]:not([disabled])')
        await page.click('[data-act="continue"]')
        await page.wait_for_selector('.tp')
        check('continue restores life', await life(page, 2) == 31)
        check('continue restores names, counters and tracked cards', (await page.input_value(card(2, '.tp__name'))) == 'Carol' and 'Treasure' in await page.inner_text(card(0, '[data-part="counters"]')) and await page.locator(card(0, '.tcard__badge')).count() == 1)
        check('continue restores the active player and turn', 'is-active' in (await page.get_attribute(card(3), 'class')) and 'Turn 2' in await page.text_content('#trackerTurn'))

        # End game → recorded to profile
        await page.click('[data-act="menu"]')
        await page.click('[data-menu="end"]')
        await page.click('[data-winner] >> nth=0')
        await page.wait_for_selector('text=Game Complete')
        body = await page.inner_text('.modal__body')
        check('end game shows winner and first-game achievement', 'Aaron wins' in body and 'First Game' in body, body)
        await page.click('.modal__foot .btn--cancel')
        await page.wait_for_selector('.landing')
        await page.click('[data-act="profile"]')
        await page.wait_for_selector('.profile')
        stats = await page.inner_text('.profile__stats')
        check('profile counts the game and the win', stats.split() [0] == '1' and '100%' in stats, stats)
        await page.screenshot(path=f'{OUT}phone-profile.png')
        await page.click('[data-act="playmats"]')
        await page.wait_for_selector('.mat-slots')
        locked = await page.locator('.mat-slot.is-locked').count()
        check('one playmat slot open, five locked', locked == 5, f'{locked} locked')
        await page.screenshot(path=f'{OUT}phone-playmats.png')
        real = [e for e in page.errors if 'ERR_FAILED' not in e]  # blocked card lookups are expected offline
        check('no console errors', not real, str(real[:5]))

        # Layout: nothing overflows its card at any player count, on phone and iPad.
        for device, tag in ((PHONE, 'phone'), (IPAD, 'ipad')):
            for n in (2, 3, 4, 5, 6):
                pg = await new_page(browser, device)
                await start_tracker(pg, n)
                await pg.wait_for_timeout(300)
                overflow = await pg.evaluate('''() => {
                  const out = [];
                  const vw = innerWidth, vh = innerHeight;
                  for (const card of document.querySelectorAll('.tp')) {
                    const r = card.getBoundingClientRect();
                    if (r.right > vw + 1 || r.bottom > vh + 1) out.push('card off screen');
                    for (const el of card.querySelectorAll('.tp__top, .tp__life, .tp__mana, .tp__tax, .tp__statuses, .tp__counter-count, .tp__add-counter, .tp__life .icon-btn, [data-life]')) {
                      const e = el.getBoundingClientRect();
                      if (e.width && (e.right > r.right + 1 || e.bottom > r.bottom + 1 || e.left < r.left - 1)) out.push(el.className.split(' ')[0]);
                    }
                  }
                  for (const life of document.querySelectorAll('.tp__life')) {
                    const [minus, plus] = life.querySelectorAll('.icon-btn');
                    const d = life.querySelector('[data-life]').getBoundingClientRect();
                    if (minus.getBoundingClientRect().right > d.left + 2 || plus.getBoundingClientRect().left < d.right - 2) out.push('life number overlaps its buttons');
                  }
                  const log = document.querySelector('.tlog').getBoundingClientRect();
                  if (log.right > vw + 1 || log.bottom > vh + 1) out.push('log off screen');
                  return out;
                }''')
                check(f'{tag}: {n} players fit without overflow', not overflow, str(overflow[:6]))
                await pg.screenshot(path=f'{OUT}{tag}-tracker{n}.png')
                await pg.context.close()
        await browser.close()
    failed = [r for r in results if not r[1]]
    print(f'\n{len(results) - len(failed)}/{len(results)} checks passed')
    raise SystemExit(1 if failed else 0)

asyncio.run(main())
