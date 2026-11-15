"""Playmats, palette and life dice (owner, 15 Nov). Run: python3 tests/mats_ui.py  (serve rebuild/ on :4180 first)."""
import asyncio, os, sys, json
from playwright.async_api import async_playwright
sys.path.insert(0, os.path.dirname(__file__))
from shots import PHONE, IPAD, URL
from game_ui import new_page, check, results

PROFILE = """async (patch) => {
  const { loadProfile, saveAccountProfile } = await import('./src/data/profile.js');
  await saveAccountProfile(patch);
  return loadProfile().account;
}"""
# A profile as an older build saved it: games played, an uploaded mat selected on a seat, uploaded rows in storage.
OLD = """() => {
  localStorage.setItem('ccv07-profile', JSON.stringify({ version: 6, games: 12, wins: 3, awards: {}, milestones: [], players: {}, decks: {}, history: [], account: { displayName: 'Old Timer' } }));
  localStorage.setItem('cc-playmats-v1', JSON.stringify([{ id: 'mat-1-abc', slot: 1, name: 'Mine', image: 'data:image/jpeg;base64,AAAA', dim: 0.35 }]));
}"""

async def open_mats(page):
    await page.evaluate("() => { document.querySelector('[data-act=\"profile\"]')?.click() }")
    await page.wait_for_selector('.profile')
    await page.click('[data-act="playmats"]')
    await page.wait_for_selector('.mat-slots')

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await new_page(browser, IPAD)
        pal = lambda: page.evaluate("() => document.documentElement.dataset.palette")
        css = lambda: page.evaluate("() => getComputedStyle(document.documentElement).getPropertyValue('--pal-primary').trim()")
        check('default palette is amethyst', await pal() == 'amethyst')
        await open_mats(page)
        check('eight mats listed, Amethyst open', await page.locator('.mat-slots:not(.mat-slots--dice) .mat-slot').count() == 8 and await page.locator('[data-mat-pick="amethyst"]').count() == 1)
        check('seven mats locked for a new profile', await page.locator('.mat-slots:not(.mat-slots--dice) .mat-slot.is-locked').count() == 7)
        locked = await page.inner_text('[data-locked="dark-alley"]')
        check('a locked mat names its achievement', 'Play 3 games, or reach level 3' in locked, locked)
        check('eight dice plus match-playmat; seven dice locked, Amethyst open', await page.locator('[data-die-pick]').count() == 2 and await page.locator('[data-die-locked]').count() == 7)
        dl = await page.inner_text('[data-die-locked="night-flight"]')
        check('a locked die names its achievement', 'Win 3 games, or reach level 6' in dl, dl)
        check('match-playmat is the default die', await page.evaluate("() => document.documentElement.dataset.dice") == 'amethyst' and await page.locator('.mat-slots--dice .is-on strong').text_content() == 'Match playmat', str([await page.evaluate("() => document.documentElement.dataset.dice"), await page.locator('.mat-slots--dice .is-on strong').all_inner_texts()]))
        await page.keyboard.press('Escape')
        # 10 games, 0 wins: mats at 3, 6, 9 games -> Dark Alley, Night Flight, Ember; no die yet
        await page.evaluate("""async () => {
          const { loadProfile } = await import('./src/data/profile.js');
          const raw = JSON.parse(localStorage.getItem('ccv07-profile')); raw.games = 10; raw.wins = 0;
          localStorage.setItem('ccv07-profile', JSON.stringify(raw));
          const { initProfileStore } = await import('./src/data/profile.js'); await initProfileStore();
        }""")
        await page.reload(); await page.wait_for_function('window.__ccReady === true')
        await open_mats(page)
        check('10 games unlock three mats and no die', await page.locator('.mat-slots:not(.mat-slots--dice) .mat-slot.is-locked').count() == 4 and await page.locator('[data-mat-pick="ember"]').count() == 1 and await page.locator('[data-mat-locked="frost"], [data-locked="frost"]').count() == 1 and await page.locator('[data-die-locked]').count() == 7)
        await page.click('[data-mat-pick="dark-alley"]')
        await page.wait_for_timeout(200)
        check('choosing a mat changes the palette app-wide', await pal() == 'dark-alley' and await css() == '#ae64f2', f'{await pal()} {await css()}')
        # a die stored while locked is not honoured: match-playmat, showing the mat's own die even though that die is locked
        await page.evaluate(PROFILE, {'diceId': 'gold'})
        await page.keyboard.press('Escape'); await page.reload(); await page.wait_for_function('window.__ccReady === true')
        check('a locked stored die falls back to match-playmat (the mat\'s own die)', await page.evaluate("() => document.documentElement.dataset.dice") == 'dark-alley')
        await page.evaluate("""async () => {
          const raw = JSON.parse(localStorage.getItem('ccv07-profile')); raw.wins = 15;
          localStorage.setItem('ccv07-profile', JSON.stringify(raw));
        }""")
        await page.reload(); await page.wait_for_function('window.__ccReady === true')
        await open_mats(page)
        check('15 wins unlock five dice (Gold die open at 15, Forge and Emerald locked)', await page.locator('[data-die-pick="gold"]').count() == 1 and await page.locator('[data-die-locked]').count() == 2)
        await page.click('[data-die-pick="gold"]')
        await page.wait_for_timeout(200)
        check('die choice is independent of the mat', await pal() == 'dark-alley' and await page.evaluate("() => document.documentElement.dataset.dice") == 'gold')
        acct = await page.evaluate("() => JSON.parse(localStorage.getItem('ccv07-profile')).account")
        check('mat and die are saved on the profile', acct.get('matId') == 'dark-alley' and acct.get('diceId') == 'gold', str(acct))
        await page.keyboard.press('Escape')
        await page.reload(); await page.wait_for_function('window.__ccReady === true')
        check('palette and die come back after a restart', await pal() == 'dark-alley' and await page.evaluate("() => document.documentElement.dataset.dice") == 'gold')
        # a locked mat stored on the profile (e.g. restored from elsewhere) is not honoured
        await page.evaluate(PROFILE, {'matId': 'emerald'})
        await page.reload(); await page.wait_for_function('window.__ccReady === true')
        check('a still-locked stored mat falls back to Amethyst', await pal() == 'amethyst')
        await page.evaluate(PROFILE, {'matId': 'dark-alley'})
        # sync/back-up format: profile carries the choice, playmats array unchanged
        bk = await page.evaluate("async () => { const m = await import('./src/data/profile-backup.js'); const b = m.buildProfileBackup(); return { v: b.backupVersion, mats: Array.isArray(b.playmats), acct: b.profile.account.diceId }; }")
        check('back-up keeps its format and carries the choice', bk == {'v': 2, 'mats': True, 'acct': 'gold'}, str(bk))
        check('no console errors', not page.errors, str(page.errors[:4]))

        # reward pop-up: 3 games played and not yet announced
        await page.evaluate("""async () => {
          const raw = JSON.parse(localStorage.getItem('ccv07-profile')); raw.games = 3; raw.wins = 0; raw.rewardsShown = [];
          raw.account.matId = ''; localStorage.setItem('ccv07-profile', JSON.stringify(raw));
        }""")
        await page.reload(); await page.wait_for_function('window.__ccReady === true')
        await page.wait_for_selector('[data-reward-popup]', timeout=5000)
        pop = await page.inner_text('[data-reward-popup]')
        check('3 games: one pop-up names the Dark Alley playmat', 'Dark Alley playmat' in pop and await page.locator('[data-reward]').count() == 1, pop)
        await page.click('.modal__foot .btn--confirm')
        await page.wait_for_selector('.mat-slots')
        check('Equip now opens Playmats and Dice with Dark Alley pickable', await page.locator('[data-mat-pick="dark-alley"]').count() == 1)
        await page.reload(); await page.wait_for_function('window.__ccReady === true')
        await page.wait_for_timeout(800)
        check('the pop-up is shown only once', await page.locator('[data-reward-popup]').count() == 0)
        await page.evaluate("""async () => {
          const raw = JSON.parse(localStorage.getItem('ccv07-profile')); raw.games = 9; raw.rewardsShown = ['mat:dark-alley'];
          localStorage.setItem('ccv07-profile', JSON.stringify(raw));
        }""")
        await page.reload(); await page.wait_for_function('window.__ccReady === true')
        await page.wait_for_selector('[data-reward-popup]', timeout=5000)
        check('several new rewards give one pop-up listing them', await page.locator('[data-reward]').count() == 2, await page.inner_text('[data-reward-popup]'))
        await page.click('.modal__foot .btn--cancel')
        await page.wait_for_timeout(300)
        await page.reload(); await page.wait_for_function('window.__ccReady === true'); await page.wait_for_timeout(800)
        check('Later also marks them shown', await page.locator('[data-reward-popup]').count() == 0)
        check('no console errors from the pop-up', not page.errors, str(page.errors[:4]))
        # the Deck Builder records its firsts in the shared profile; the app picks them up
        await page.goto(URL.replace('/index.html', '') + '/deck/index.html'); await page.wait_for_timeout(2500)
        await page.evaluate("() => ccMark('deckImported')")
        await page.goto(URL); await page.wait_for_function('window.__ccReady === true')
        ach = await page.evaluate("async () => { const m = await import('./src/data/achievements.js'); const p = await import('./src/data/profile.js'); return m.earnedAchievements(p.loadProfile()).map(a => a.id); }")
        check('a deck imported in the Deck Builder earns "Import Duty" in the app', 'first-deck-imported' in ach, str(ach))
        await page.context.close()

        # old profile with an uploaded mat
        ctx = await browser.new_context(**IPAD)
        page = await ctx.new_page(); page.errors = []
        page.on('pageerror', lambda e: page.errors.append(str(e)))
        await page.add_init_script("if (!localStorage.getItem('ccv07-profile')) (" + OLD + ")()")   # before the app's first load
        await page.goto(URL)
        await page.wait_for_function('window.__ccReady === true', timeout=15000)
        check('old profile with an uploaded mat loads and shows Amethyst', await page.evaluate("() => document.documentElement.dataset.palette") == 'amethyst' and not page.errors, str(page.errors))
        kept = await page.evaluate("async () => { const m = await import('./src/data/playmats.js'); return [m.listPlaymats().length, m.playmatById('mat-1-abc').id, m.playmatById('default').id]; }")
        check('old uploads stay stored but are not shown; old ids resolve to Amethyst', kept == [1, 'amethyst', 'amethyst'], str(kept))
        await page.evaluate("() => document.querySelector('[data-act=\"profile\"]').click()")
        await page.wait_for_selector('.profile'); await page.click('[data-act="playmats"]'); await page.wait_for_selector('.mat-slots')
        dm = await page.locator('[data-mat-pick="dark-alley"]').count(); up = await page.locator('.mat-slot__preview[style*="AAAA"]').count()
        check('old profile: 12 games unlocks Dark Alley (3 games), uploads not listed', dm == 1 and up == 0, f'{dm} {up}')
        await ctx.close()
        await browser.close()
    bad = results.count(False)
    print(f'\n{len(results) - bad}/{len(results)} passed')
    sys.exit(1 if bad else 0)

asyncio.run(main())
