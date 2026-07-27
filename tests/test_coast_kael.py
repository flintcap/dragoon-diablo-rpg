import asyncio
from playwright.async_api import async_playwright

# v2 test: coast map, river, Kael rescue + party-of-3 battle cycle, enemy specials
URL = 'http://localhost:8123/index.html'
OUT = 'shots'

async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(args=['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--no-sandbox'])
        page = await b.new_page(viewport={'width':1600,'height':900})
        errs=[]
        page.on('pageerror', lambda e: errs.append(str(e)))
        await page.goto(URL); await page.wait_for_timeout(2000)
        await page.click('.class-card[data-class="knight"]'); await page.click('#btn-start')
        await page.wait_for_timeout(400); await page.click('#btn-intro-begin'); await page.wait_for_timeout(2000)

        # the game now opens in Mirewood Hollow — take the road out to the Whisperwood
        await page.evaluate("() => { if (World.zone !== 'forest') World.travelTo('forest'); }")
        await page.wait_for_timeout(1800)


        # river screenshot
        await page.evaluate("() => { World.player3d.group.position.set(13, 0, 14); }")
        await page.wait_for_timeout(2000)
        await page.screenshot(path=f'{OUT}/90_river.png')

        # coast
        await page.evaluate("() => { World.player3d.group.position.set(45, 0, -18); }")
        await page.wait_for_timeout(1500)
        await page.keyboard.press('e'); await page.wait_for_timeout(3000)
        print('ZONE:', await page.evaluate("() => World.zone"))
        await page.screenshot(path=f'{OUT}/91_coast.png')
        await page.keyboard.down('d'); await page.wait_for_timeout(2200); await page.keyboard.up('d')
        await page.wait_for_timeout(600)
        await page.screenshot(path=f'{OUT}/92_coast_sea.png')
        print('coast enemies:', await page.evaluate("() => World.enemies.length"))

        # kael rescue: heraldDead → back to forest → shrine
        await page.evaluate("() => { (RPG.player.flags ||= {}).heraldDead = true; }")
        await page.evaluate("() => { World.player3d.group.position.set(-34, 0, 6); }")
        await page.wait_for_timeout(1500)
        await page.keyboard.press('e'); await page.wait_for_timeout(2500)
        await page.evaluate("() => { World.player3d.group.position.set(-8, 0, 6); }")
        await page.wait_for_timeout(2500)
        await page.keyboard.press('e'); await page.wait_for_timeout(1500)
        print('kaelJoined:', await page.evaluate("() => !!(RPG.player.flags||{}).kaelJoined"))

        # battle: 3-member turn cycle + kael skill + specials
        await page.evaluate("() => { window.__autoPerfect = true; }")
        await page.evaluate("""() => {
          const w = World.enemies.find(e => e.kind === 'wolf') || World.enemies[0];
          const p = World.player3d.group.position;
          p.x = w.c3d.group.position.x + 1.2; p.z = w.c3d.group.position.z + 1.2;
        }""")
        await page.wait_for_timeout(3000)
        print('kael model in battle:', await page.evaluate("() => !!document.querySelector('#kael-bars:not(.hidden)')"))
        await page.click('#battle-menu .battle-btn >> nth=0'); await page.wait_for_timeout(6000)
        t1 = await page.evaluate("() => document.getElementById('turn-indicator').textContent")
        await page.click('#battle-menu .battle-btn >> nth=0'); await page.wait_for_timeout(6000)
        t2 = await page.evaluate("() => document.getElementById('turn-indicator').textContent")
        print('turn cycle:', t1, '→', t2)
        await page.click('#battle-menu .battle-btn >> nth=1'); await page.wait_for_timeout(800)
        sub = page.locator('#battle-submenu .battle-btn')
        n = await sub.count()
        print('kael skills listed:', n)
        mp0 = await page.evaluate("() => RPG.player.kael.mp")
        if n > 1: await sub.first.click()
        await page.wait_for_timeout(4000)
        mp1 = await page.evaluate("() => RPG.player.kael.mp")
        print('kael MP:', mp0, '→', mp1)
        await page.screenshot(path=f'{OUT}/93_party3.png')
        special = False
        for i in range(5):
            await page.wait_for_timeout(4000)
            log = await page.evaluate("() => document.getElementById('battle-log').textContent + '|' + document.getElementById('battle-banner').textContent")
            if any(k in log for k in ['SAVAGE','VOID','SEISMIC','FLOURISH','frothing','void bolt','shockwave','flourish']):
                special = log; break
            for a in range(3):
                try: await page.click('#battle-menu .battle-btn >> nth=-1', timeout=2500)
                except: break
                await page.wait_for_timeout(2200)
        print('SPECIAL seen:', special if special else '(none in window)')
        print('errors:', errs if errs else '(none)')
        await b.close()

asyncio.run(main())
