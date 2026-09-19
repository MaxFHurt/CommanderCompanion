const { test, expect } = require('@playwright/test');

async function launchFreeplay(page) {
  await page.goto('index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__ccAppReady === true, null, { timeout: 30_000 });
  await page.locator('#startGameBtn').click();
  await page.locator('[data-game-mode="freeplay"]').click();
  await page.locator('#modePlayerCount').selectOption('2');
  await page.locator('#modeProceed').click();
  await expect(page.locator('#gameScreen')).toBeVisible();
}

test.describe('Locked landscape device masters', () => {
  test('center hand and action rail stay inside battlefield column and never overlay player/right rail', async ({ page }) => {
    await page.setViewportSize({ width: 932, height: 430 });
    await launchFreeplay(page);
    await page.evaluate(() => {
      document.body.classList.remove('cc-device-other-phone','cc-device-ipad');
      document.body.classList.add('cc-device-iphone');
    });
    const boxes = await page.evaluate(() => {
      const rect = s => {
        const r=document.querySelector(s)?.getBoundingClientRect();
        return r&&{left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};
      };
      return {
        hero:rect('.player-hero'),
        battle:rect('.battle-panel'),
        hand:rect('.landscape-hand-zone'),
        action:rect('.landscape-action-rail'),
        right:rect('.landscape-right-rail'),
        logPosition:getComputedStyle(document.querySelector('.landscape-right-rail .inline-game-log')).position
      };
    });
    expect(boxes.hand.left).toBeGreaterThanOrEqual(boxes.battle.left - 1);
    expect(boxes.hand.right).toBeLessThanOrEqual(boxes.battle.right + 1);
    expect(boxes.action.left).toBeGreaterThanOrEqual(boxes.battle.left - 1);
    expect(boxes.action.right).toBeLessThanOrEqual(boxes.battle.right + 1);
    expect(boxes.hero.right).toBeLessThanOrEqual(boxes.hand.left + 1);
    expect(boxes.battle.right).toBeLessThanOrEqual(boxes.right.left + 1);
    expect(boxes.action.top).toBeGreaterThanOrEqual(boxes.hand.bottom - 1);
    expect(boxes.logPosition).not.toBe('fixed');
  });

  test('iPhone, iPad, and other-phone use three explicit fixed geometry masters', async ({ page }) => {
    await page.goto('index.html', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__ccAppReady === true, null, { timeout: 30_000 });
    const values = await page.evaluate(() => {
      const read = cls => {
        document.body.classList.remove('cc-device-iphone','cc-device-ipad','cc-device-other-phone');
        document.body.classList.add(cls);
        const cs=getComputedStyle(document.body);
        return {
          left:cs.getPropertyValue('--cc-fixed-left').trim(),
          right:cs.getPropertyValue('--cc-fixed-right').trim(),
          hand:cs.getPropertyValue('--cc-fixed-hand').trim(),
          ttRight:cs.getPropertyValue('--tt-right').trim()
        };
      };
      return { iphone:read('cc-device-iphone'), ipad:read('cc-device-ipad'), other:read('cc-device-other-phone') };
    });
    expect(values.iphone).toEqual({left:'248px',right:'252px',hand:'92px',ttRight:'250px'});
    expect(values.ipad).toEqual({left:'360px',right:'348px',hand:'148px',ttRight:'350px'});
    expect(values.other).toEqual({left:'236px',right:'238px',hand:'88px',ttRight:'238px'});
  });

  test('landing page uses fixed three-column landscape composition without horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 932, height: 430 });
    await page.goto('index.html', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__ccAppReady === true, null, { timeout: 30_000 });
    await page.evaluate(() => {
      document.body.classList.remove('cc-device-other-phone','cc-device-ipad');
      document.body.classList.add('cc-device-iphone');
    });
    const result=await page.evaluate(()=>({
      display:getComputedStyle(document.querySelector('.landing079-shell')).display,
      page:document.documentElement.scrollWidth,
      viewport:document.documentElement.clientWidth
    }));
    expect(result.display).toBe('grid');
    expect(result.page).toBeLessThanOrEqual(result.viewport+2);
  });
});
