import asyncio
from playwright.async_api import async_playwright

# Boss test: 8 kills → boss spawns → engage → verify boss battle renders & hurts.
URL = 'http://localhost:8123/index.html'
OUT = 'shots'

async def main():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(args=['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--no-sandbox'])
        page = await browser.new_page(viewport={'width':1600,'height':900})
        errors = []
        page.on('pageerror', lambda e: errors.append('PAGEERROR: '+str(e)))
        await page.goto(URL)
        await page.wait_for_timeout(2000)
        await page.click('.class-card[data-class="sorceress"]')
        await page.click('#btn-start')
        await page.wait_for_timeout(2500)
        await page.evaluate("() => { RPG.player.kills = 8; }")
        await page.keyboard.down('w'); await page.wait_for_timeout(400); await page.keyboard.up('w')
        await page.wait_for_timeout(1500)
        print('BOSS SPAWNED:', await page.evaluate("() => World.enemies.some(e => e.boss)"))
        await page.evaluate("""() => {
          const p = RPG.player;
          p.attr.ene = 90; p.level = 12; RPG.recalc(); p.hp = p.maxHp; p.mp = p.maxMp;
          const b = World.enemies.find(e => e.boss);
          const pp = World.player3d.group.position;
          pp.x = b.c3d.group.position.x + 1.2;
          pp.z = b.c3d.group.position.z + 1.2;
        }""")
        await page.wait_for_timeout(2000)
        await page.screenshot(path=f'{OUT}/30_boss.png')
        for r in range(10):
            if not await page.locator('#battle-menu').is_visible(): break
            await page.click('#battle-menu .battle-btn[data-action="attack"]')
            for i in range(3):
                await page.wait_for_timeout(700); await page.keyboard.press('Space')
            await page.wait_for_timeout(2800)
        await page.wait_for_timeout(4000)
        await page.screenshot(path=f'{OUT}/31_gamevictory.png')
        print('ERRORS:', errors if errors else '(none)')
        await browser.close()

asyncio.run(main())
