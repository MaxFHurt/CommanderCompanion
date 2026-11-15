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
# Sets games/wins and the stored reward draws ([id, slot] pairs), so the test knows which rewards the profile has; `shown` = ids already announced.
SET = """async ({games, wins, draws, shown}) => {
  const raw = JSON.parse(localStorage.getItem('ccv07-profile')); raw.games = games; raw.wins = wins;
  raw.rewardDraws = draws.map(([id, slot]) => ({ id, slot, at: '2026-11-15T00:00:00Z' }));
  raw.rewardsShown = shown ?? draws.map(d => d[0]);
  raw.token.updatedAt = new Date().toISOString();
  localStorage.setItem('ccv07-profile', JSON.stringify(raw));
  const { durableSet } = await import('./src/data/userdata-db.js'); await durableSet('profile', raw);   // the saved copy must agree
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
        check('33 mats listed (8 + 25 reward mats), Amethyst open', await page.locator('.mat-slots:not(.mat-slots--dice) .mat-slot').count() == 33 and await page.locator('[data-mat-pick="amethyst"]').count() == 1)
        check('32 mats locked for a new profile', await page.locator('.mat-slots:not(.mat-slots--dice) .mat-slot.is-locked').count() == 32)
        locked = await page.inner_text('[data-locked="dark-alley"]')
        check('a locked mat says it is earned at random', 'Earned at random from achievements and games/wins' in locked, locked)
        check('33 dice (8 mat dice + 25 art dice) plus match-playmat; 32 locked, Amethyst open', await page.locator('[data-die-pick]').count() == 2 and await page.locator('[data-die-locked]').count() == 32 and await page.locator('.mat-slots--dice .mat-slot').count() == 34)
        check('art dice show their picture and are named', await page.locator('[data-die-locked="peacock-cats-eye"] .mat-slot__preview[style*="assets/skin/dice/peacock-cats-eye.webp"]').count() == 1 and 'peacock cat' in (await page.inner_text('[data-die-locked="peacock-cats-eye"]')).lower(), await page.locator('[data-die-locked="peacock-cats-eye"]').evaluate("e => e.outerHTML"))
        dl = await page.inner_text('[data-die-locked="night-flight"]')
        check('a locked die says it is earned at random', 'Earned at random from achievements and games/wins' in dl, dl)
        check('match-playmat is the default die', await page.evaluate("() => document.documentElement.dataset.dice") == 'amethyst' and await page.locator('.mat-slots--dice .is-on strong').text_content() == 'Match playmat', str([await page.evaluate("() => document.documentElement.dataset.dice"), await page.locator('.mat-slots--dice .is-on strong').all_inner_texts()]))
        await page.keyboard.press('Escape')
        # 10 games, 0 wins = level 2: mats g1-g3 (3, 6, 9 games), plus one mat and one die from the two achievements
        await page.evaluate(SET, {'games': 10, 'wins': 0, 'draws': [['mat:dark-alley', 'g3'], ['mat:night-flight', 'g6'], ['mat:ember', 'g9'], ['mat:frost', 'a1'], ['die:night-flight', 'a2']]})
        await page.reload(); await page.wait_for_function('window.__ccReady === true')
        await open_mats(page)
        check('10 games + 2 achievements: five mats and two dice open', await page.locator('.mat-slots:not(.mat-slots--dice) .mat-slot.is-locked').count() == 28 and await page.locator('[data-mat-pick="ember"]').count() == 1 and await page.locator('[data-mat-pick="frost"]').count() == 1 and await page.locator('[data-locked="gold"]').count() == 1 and await page.locator('[data-die-locked]').count() == 31)
        await page.click('[data-mat-pick="dark-alley"]')
        await page.wait_for_timeout(200)
        check('choosing a mat changes the palette app-wide', await pal() == 'dark-alley' and await css() == '#ae64f2', f'{await pal()} {await css()}')
        # a die stored while locked is not honoured: match-playmat, showing the mat's own die even though that die is locked
        await page.evaluate(PROFILE, {'diceId': 'gold'})
        await page.keyboard.press('Escape'); await page.reload(); await page.wait_for_function('window.__ccReady === true')
        check('a locked stored die falls back to match-playmat (the mat\'s own die)', await page.evaluate("() => document.documentElement.dataset.dice") == 'dark-alley')
        await page.evaluate(SET, {'games': 10, 'wins': 13, 'draws': [['mat:dark-alley', 'g3'], ['mat:night-flight', 'g6'], ['mat:ember', 'g9'], ['mat:frost', 'a1'], ['die:night-flight', 'a2'], ['mat:gold', 'a3'], ['die:dark-alley', 'w2'], ['die:ember', 'w4'], ['die:frost', 'w6'], ['die:gold', 'w8'], ['die:forge', 'w10'], ['die:emerald', 'w12']]})
        await page.reload(); await page.wait_for_function('window.__ccReady === true')
        await open_mats(page)
        check('13 wins (6 dice, one per 2 wins) + 1 from achievements = seven dice open, Gold open', await page.locator('[data-die-pick="gold"]').count() == 1 and await page.locator('[data-die-locked="peacock-cats-eye"]').count() == 1 and await page.locator('[data-die-locked]').count() == 25)
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

        # reward pop-up: 3 games played (one mat) and the first achievement (one mat), not yet announced
        await page.evaluate(SET, {'games': 3, 'wins': 0, 'draws': [['mat:dark-alley', 'g3'], ['mat:ember', 'a1']], 'shown': []})
        await page.evaluate("() => { const raw = JSON.parse(localStorage.getItem('ccv07-profile')); raw.account.matId = ''; localStorage.setItem('ccv07-profile', JSON.stringify(raw)); }")
        await page.reload(); await page.wait_for_function('window.__ccReady === true')
        await page.wait_for_selector('[data-reward-popup]', timeout=5000)
        pop = await page.inner_text('[data-reward-popup]')
        check('3 games + 1 achievement: one pop-up names both mats', 'Dark Alley playmat' in pop and 'Ember playmat' in pop and await page.locator('[data-reward]').count() == 2, pop)
        await page.click('.modal__foot .btn--confirm')
        await page.wait_for_selector('.mat-slots')
        check('Equip now opens Playmats and Dice with Dark Alley pickable', await page.locator('[data-mat-pick="dark-alley"]').count() == 1)
        await page.reload(); await page.wait_for_function('window.__ccReady === true')
        await page.wait_for_timeout(800)
        check('the pop-up is shown only once', await page.locator('[data-reward-popup]').count() == 0)
        await page.evaluate(SET, {'games': 9, 'wins': 0, 'draws': [['mat:dark-alley', 'g3'], ['mat:night-flight', 'g6'], ['mat:frost', 'g9'], ['mat:ember', 'a1']], 'shown': ['mat:dark-alley', 'mat:ember']})
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

        # random draws, made once: 6 games and no draws stored yet -> two games slots + the first achievement = three distinct mats
        await page.evaluate(SET, {'games': 6, 'wins': 0, 'draws': [], 'shown': []})
        await page.reload(); await page.wait_for_function('window.__ccReady === true')
        await page.wait_for_selector('[data-reward-popup]', timeout=5000)
        d1 = await page.evaluate("() => JSON.parse(localStorage.getItem('ccv07-profile')).rewardDraws.map(d => d.slot + '=' + d.id)")
        check('drawn on first load: two games mats (g3, g6) plus the achievements\' draws, all distinct, in one pop-up', len(d1) >= 3 and len({x.split('=')[1] for x in d1}) == len(d1) and {x.split('=')[0] for x in d1} >= {'g3', 'g6', 'a1'} and await page.locator('[data-reward]').count() == len(d1), str(d1))
        await page.click('.modal__foot .btn--cancel'); await page.wait_for_timeout(300)
        await page.reload(); await page.wait_for_function('window.__ccReady === true'); await page.wait_for_timeout(800)
        d2 = await page.evaluate("() => JSON.parse(localStorage.getItem('ccv07-profile')).rewardDraws.map(d => d.slot + '=' + d.id)")
        check('the draws are stable on reload and not announced again', d1 == d2 and await page.locator('[data-reward-popup]').count() == 0, f'{d1} {d2}')
        # a reward mat: its own picture, nearest palette, the palette's die
        await page.evaluate(SET, {'games': 3, 'wins': 0, 'draws': [['mat:cedar-moon-archer', 'g3'], ['mat:ember', 'a1']]})
        await page.evaluate("() => { const raw = JSON.parse(localStorage.getItem('ccv07-profile')); raw.account.matId = 'cedar-moon-archer'; localStorage.setItem('ccv07-profile', JSON.stringify(raw)); }")
        await page.reload(); await page.wait_for_function('window.__ccReady === true')
        got = await page.evaluate("() => [document.documentElement.dataset.palette, document.documentElement.dataset.dice, document.documentElement.style.getPropertyValue('--sk-playmat')]")
        check('reward mat: picture on this screen, the nearest palette (emerald) and its die', got[0] == 'emerald' and got[1] == 'emerald' and 'mats/cedar-moon-archer/pad.webp' in got[2], str(got))
        await open_mats(page)
        check('reward mat thumbnails in the picker', await page.locator('[data-mat-pick="cedar-moon-archer"][style*="mats/cedar-moon-archer/thumb.webp"]').count() == 1)
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
