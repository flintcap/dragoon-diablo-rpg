import asyncio
from playwright.async_api import async_playwright

# Gameplay test: learn skill → use it → win battle → loot/xp → ascend → back to world.
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
        await page.click('.class-card[data-class="knight"]')
        await page.click('#btn-start')
        await page.wait_for_timeout(2500)

        await page.keyboard.press('k'); await page.wait_for_timeout(400)
        await page.evaluate("() => { document.querySelectorAll('.skill-node')[0].click(); }")
        await page.keyboard.press('k')

        await page.evaluate("() => { const p = RPG.player; p.attr.str = 60; RPG.recalc(); p.hp = p.maxHp; p.spirit = 100; UI.refreshHUD(); }")
        await page.evaluate("""() => {
          const e = World.enemies[0];
          const p = World.player3d.group.position;
          p.x = e.c3d.group.position.x + 1.2;
          p.z = e.c3d.group.position.z + 1.2;
        }""")
        await page.wait_for_timeout(1800)
        await page.click('#battle-menu .battle-btn[data-action="skills"]')
        await page.wait_for_timeout(500)
        sub = page.locator('#battle-submenu .battle-btn')
        if await sub.count() > 1:
            await sub.first.click(); await page.wait_for_timeout(2000)

        btn = page.locator('#battle-menu .battle-btn[data-action="ascend"]')
        if await btn.is_visible() and not await btn.is_disabled():
            await btn.click(); await page.wait_for_timeout(2200)
            await page.screenshot(path=f'{OUT}/14_ascend.png')

        for _ in range(6):
            if not await page.locator('#battle-menu').is_visible(): break
            await page.click('#battle-menu .battle-btn[data-action="attack"]')
            for i in range(5):
                await page.wait_for_timeout(720); await page.keyboard.press('Space')
            await page.wait_for_timeout(2600)
        await page.wait_for_timeout(1500)
        await page.screenshot(path=f'{OUT}/15_results.png')
        ok = page.locator('#btn-results-ok')
        if await ok.is_visible():
            await ok.click(); await page.wait_for_timeout(1500)
        print('INV/GOLD/KILLS:', await page.evaluate("() => RPG.player.inventory.length + '/' + RPG.player.gold + 'g/kills:' + RPG.player.kills"))
        print('ERRORS:', errors if errors else '(none)')
        await browser.close()

asyncio.run(main())
