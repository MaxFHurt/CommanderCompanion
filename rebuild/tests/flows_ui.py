"""More Guided/Free Play flows on one device: mulligan, search, scry, by-hand cards, discard, win, Free Play, deck editor."""
import asyncio, os, sys
from playwright.async_api import async_playwright
sys.path.insert(0, os.path.dirname(__file__))
from shots import PHONE, IPAD, OUT, URL
from game_ui import new_page, start_guided, continue_to_game, tap_curtain, pass_all, check, results, FIX

HOST = "{ playerId: null, isHost: true }"
SETUP = """async (rows) => {
  const { getSession } = await import('./src/app/session.js');
  const s = getSession(), g = s.game;
  // Test setup only: act as a room host for the edits, then return to one shared device.
  const deviceMode = g.deviceMode; g.deviceMode = 'multi-device';
  for (const [i, name, to] of rows) {
    const p = g.players[i];
    const c = [...p.deck.remainingLibrary, ...p.deck.hand].find(c => g.cardDefinitions[c.definitionId].name === name && !c.__used);
    if (!c) throw new Error('missing ' + name);
    c.__used = true;
    s.controller.dispatch({ type: 'edit', edit: { kind: 'move', instanceId: c.instanceId, to } }, { playerId: null, isHost: true });
  }
  for (const p of g.players) for (const c of p.deck.battlefield) { c.enteredTurn = 0; c.controlSinceTurn = 0; }
  s.controller.dispatch({ type: 'edit', edit: { kind: 'note', text: 'ready' } }, { playerId: null, isHost: true });
  g.deviceMode = deviceMode; s.actAs(s.actingAs());
}"""

async def keep_both(page, mulligan_first=False):
    await page.wait_for_selector('text=opening hand')
    if mulligan_first:
        await page.click('.modal .btn--cancel')           # mulligan (free)
        await page.wait_for_timeout(200)
        await page.click('.modal .btn--cancel')           # second mulligan → bottom 1
        await page.wait_for_selector('text=put on the bottom')
        check('keep is disabled until a card is chosen for the bottom', await page.locator('#keepHand').is_disabled())
        await page.locator('.modal .card').first.click()
        await page.screenshot(path=f'{OUT}phone-mulligan.png')
    await page.click('#keepHand')
    await page.wait_for_selector('.curtain'); await tap_curtain(page)
    await page.wait_for_selector('text=opening hand')
    await page.click('#keepHand')
    await page.wait_for_selector('.curtain'); await tap_curtain(page)
    await page.wait_for_selector('.zone--hand')

async def card(page, zone, name):
    await page.click(f'.zone--{zone} .card[aria-label="{name}"]')

async def guided(browser):
    page = await new_page(browser, PHONE)
    await start_guided(page, ('simic', 'rakdos'))
    await continue_to_game(page)
    await keep_both(page, mulligan_first=True)
    check('hand is 7 after mulligan to 6 + draw', await page.locator('.zone--hand .card').count() == 7, str(await page.locator('.zone--hand .card').count()))
    await page.evaluate(SETUP, [[0, 'Forest', 'battlefield'], [0, 'Forest', 'battlefield'], [0, 'Island', 'battlefield'], [0, 'Island', 'battlefield'], [0, 'Rampant Growth', 'hand'], [0, 'Opt', 'hand'], [0, 'Colossal Dreadmaw', 'hand'], [0, 'Grizzly Bears', 'battlefield'],
                                [1, 'Swamp', 'battlefield'], [1, 'Mountain', 'battlefield'], [1, 'Mountain', 'battlefield'], [1, 'Storm the Vault Oddity', 'hand']])
    await page.wait_for_timeout(200)
    # Library search
    await card(page, 'hand', 'Rampant Growth'); await page.click('.modal .btn--confirm'); await pass_all(page)
    await page.wait_for_selector('text=search your library')
    await page.screenshot(path=f'{OUT}phone-search.png')
    await page.locator('.pick').first.click(); await page.click('#decisionConfirm')
    await pass_all(page)
    check('searched land arrived', await page.locator('.zone--lands .card').count() == 5, str(await page.locator('.zone--lands .card').count()))
    # Scry (arrange)
    await card(page, 'hand', 'Opt'); await page.click('.modal .btn--confirm'); await pass_all(page)
    await page.wait_for_selector('.arrange')
    await page.screenshot(path=f'{OUT}phone-scry.png')
    await page.click('[data-move="other"]'); await page.click('.modal .btn--confirm')
    await pass_all(page)
    check('Opt resolved', 'Opt resolves' in await page.locator('.glog__list').text_content())
    # Card detail explains why something cannot be played
    await card(page, 'hand', 'Colossal Dreadmaw')
    why = await page.locator('.card-detail__why').count()
    check('unplayable card explains why', why == 1)
    await page.click('.modal .btn--cancel')
    # End turn → Lex (rakdos) → by-hand card
    for _ in range(5):
        if await page.locator('.curtain').count() or await page.locator('.modal').count(): break
        btn = page.locator('.game__next:not([disabled])')
        if await btn.count(): await btn.click()
        await page.wait_for_timeout(250)
    await pass_all(page)
    if await page.locator('#discardConfirm').count():
        for c in await page.locator('.modal .card').all():
            if await page.locator('#discardConfirm').is_enabled(): break
            await c.click()
        await page.screenshot(path=f'{OUT}phone-discard.png')
        await page.click('#discardConfirm'); await pass_all(page)
    name = (await page.locator('.rail-name strong').text_content()).strip()
    check('turn passed to Lex', name == 'Lex', name)
    await card(page, 'hand', 'Storm the Vault Oddity'); await page.click('.modal .btn--confirm')
    await pass_all(page)
    jewel = (await page.locator('.jewel span').text_content()).strip()
    check('unsupported card asks to RESOLVE by hand', jewel == 'RESOLVE', jewel)
    await page.click('.jewel'); await page.wait_for_selector('text=This effect is not automated')
    await page.screenshot(path=f'{OUT}phone-guided.png')
    await page.click('.modal .btn--confirm'); await page.wait_for_timeout(300)
    check('by-hand card finished', 'applied by hand' in await page.locator('.glog__list').text_content())
    # Stack / log / card id / chat popups open
    for act, sel in (('log', '.glog__list--full'), ('stack', 'text=The stack is empty'), ('card-id', '[data-q]'), ('help', '#judgeSearch'), ('profile', 'text=Commander damage taken')):
        await page.click(f'[data-act="{act}"]'); await page.wait_for_selector(sel); await page.click('.modal [data-modal-back]')
    await page.click('[data-act="card-id"]'); await page.fill('[data-q]', 'Sol Ring'); await page.click('[data-go]'); await page.wait_for_selector('.card-detail')
    await page.screenshot(path=f'{OUT}phone-card-id.png'); await page.click('.modal .btn--cancel')
    # Concede → game over → profile records it
    await page.click('[data-act="settings"]'); await page.click('[data-do="concede"]'); await page.click('.modal .btn--danger')
    await page.wait_for_selector('text=Game complete')
    await page.screenshot(path=f'{OUT}phone-postgame.png')
    check('winner announced', 'Aaron' in await page.locator('.postgame__winner').text_content())
    await page.click('.modal .btn--confirm')
    await page.wait_for_selector('.landing')
    games = await page.evaluate("import('./src/data/profile.js').then(m => m.loadProfile().games)")
    check('game recorded in profile', games == 1, str(games))
    check('continue is disabled after a finished game', await page.locator('[data-act="continue"]').is_disabled())
    check('no console errors (guided)', not page.errors, str(page.errors[:3]))
    await page.context.close()

async def freeplay(browser):
    page = await new_page(browser, PHONE)
    await start_guided(page, ('white', 'red', 'rakdos'), mode='freeplay')
    await page.screenshot(path=f'{OUT}phone-setup3.png')
    await continue_to_game(page)
    for _ in range(3):
        await page.wait_for_selector('text=opening hand'); await page.click('#keepHand'); await page.wait_for_selector('.curtain'); await tap_curtain(page)
    await page.wait_for_selector('.zone--hand .card')
    check('free play label and Edit Game button', await page.locator('text=FREE PLAY').count() == 1 and 'Edit' in await page.locator('[data-act="tools"]').text_content())
    check('three players: two opponents listed', await page.locator('.opp').count() == 2)
    await page.evaluate(SETUP, [[0, 'Serra Angel', 'hand']])
    await page.wait_for_timeout(200)
    await card(page, 'hand', 'Serra Angel')
    check('free play offers Play anyway', 'Play anyway' in await page.locator('.modal__foot').text_content())
    await page.click('.modal .btn--danger'); await page.wait_for_timeout(300); await pass_all(page)
    check('forced card reached the battlefield', await page.locator('.zone--battle .card[aria-label="Serra Angel"]').count() == 1)
    await card(page, 'battle', 'Serra Angel')
    await page.click('[data-edit="counter"][data-delta="1"]'); await page.wait_for_selector('.card-detail')
    check('counter edit shows on the card', '1 +1/+1 counter' in await page.locator('.card-detail__status').text_content())
    await page.click('.modal .btn--cancel')
    await page.click('[data-act="tools"]'); await page.click('[data-tool="token"]'); await page.locator('[data-choice]').first.click(); await page.click('[data-token="1"]'); await page.click('.modal .btn--confirm')
    await page.wait_for_timeout(300)
    check('token created', await page.locator('.zone--battle .card.is-token').count() == 1)
    await page.click('[data-act="undo"]'); await page.click('.modal .btn--confirm'); await page.wait_for_timeout(300)
    check('undo removed the token', await page.locator('.zone--battle .card.is-token').count() == 0)
    await page.screenshot(path=f'{OUT}phone-freeplay.png')
    check('no console errors (free play)', not page.errors, str(page.errors[:3]))
    await page.context.close()

async def deck_editor(browser):
    page = await new_page(browser, PHONE)
    await page.click('[data-act="decks"]')
    await page.wait_for_selector('.deck-editor')
    await page.fill('#deckName', 'Mono White')
    await page.fill('#deckList', FIX['decks']['white']['list'])
    await page.click('[data-act="pick-cmd"][data-slot="1"]')
    await page.wait_for_selector('.modal .option')
    check('commander picker lists the legendary creature', 'Isamaru' in await page.locator('.modal .option-list').text_content())
    await page.locator('.modal .option').first.click()
    await page.fill('#cardSearch', 'Serra'); await page.click('[data-act="search"]'); await page.wait_for_selector('[data-act="add-card"]')
    await page.screenshot(path=f'{OUT}phone-deck-editor.png')
    await page.click('[data-act="validate"]'); await page.wait_for_selector('.deck-analytics-panel')
    status = await page.locator('#deckStatus').text_content()
    check('deck validates as legal', 'Commander legal' in status, status)
    await page.click('[data-act="save"]'); await page.wait_for_selector('.deck-editor__saved .option')
    check('deck saved and listed', 'Mono White' in await page.locator('.deck-editor__saved').text_content())
    await page.screenshot(path=f'{OUT}phone-deck-editor-saved.png')
    # Saved deck is offered in player setup
    await page.click('[data-act="back"]'); await page.click('[data-act="start"]'); await page.click('[data-mode="fully-tracked"]'); await page.click('[data-play="local"]')
    await page.click('[data-seat-act="saved"]'); await page.locator('.modal [data-deck]').first.click()
    check('saved deck fills the commander', await page.input_value('[data-field="commander1"]') == 'Isamaru, Hound of Konda')
    check('no console errors (deck editor)', not page.errors, str(page.errors[:3]))
    await page.context.close()

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        which = sys.argv[1] if len(sys.argv) > 1 else 'all'
        if which in ('all', 'guided'): await guided(browser)
        if which in ('all', 'freeplay'): await freeplay(browser)
        if which in ('all', 'decks'): await deck_editor(browser)
        await browser.close()
    print(f'{sum(results)}/{len(results)} passed')
    sys.exit(0 if all(results) else 1)

asyncio.run(main())
