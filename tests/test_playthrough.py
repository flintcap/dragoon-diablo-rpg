import asyncio, sys
from playwright.async_api import async_playwright

# Smoke test: title → class select → world → panels → battle with Addition ring.
URL = 'http://localhost:8123/index.html'
OUT = 'shots'

async def main():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(args=['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--no-sandbox'])
        page = await browser.new_page(viewport={'width':1600,'height':900})
        errors = []
        page.on('console', lambda m: errors.append(m.text) if m.type in ('error','warning') else None)
        page.on('pageerror', lambda e: errors.append('PAGEERROR: '+str(e)))

        await page.goto(URL)
        await page.wait_for_timeout(2500)
        await page.screenshot(path=f'{OUT}/01_title.png')
        await page.click('.class-card[data-class="knight"]')
        await page.click('#btn-start')
        await page.wait_for_timeout(3000)
        await page.screenshot(path=f'{OUT}/02_world.png')
        await page.keyboard.down('w'); await page.wait_for_timeout(1800); await page.keyboard.up('w')
        for key, name in [('c','charsheet'),('k','skilltree'),('i','inventory')]:
            await page.keyboard.press(key); await page.wait_for_timeout(600)
            await page.screenshot(path=f'{OUT}/04_{name}.png')
            await page.keyboard.press(key)
        await page.evaluate("""() => {
          const e = World.enemies[0];
          const p = World.player3d.group.position;
          p.x = e.c3d.group.position.x + 1.2;
          p.z = e.c3d.group.position.z + 1.2;
        }""")
        await page.wait_for_timeout(2000)
        await page.click('#battle-menu .battle-btn[data-action="attack"]')
        await page.wait_for_timeout(700)
        await page.screenshot(path=f'{OUT}/08_addition.png')
        for i in range(4):
            await page.wait_for_timeout(700); await page.keyboard.press('Space')
        await page.wait_for_timeout(2500)
        await page.screenshot(path=f'{OUT}/09_battle_after.png')
        print('CONSOLE ISSUES:', errors if errors else '(none)')
        await browser.close()

asyncio.run(main())
