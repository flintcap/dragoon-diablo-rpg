import asyncio
from playwright.async_api import async_playwright

URL = 'http://localhost:8123/index.html'
OUT = '/mnt/agents/output/shots'

async def attack_round(page, presses=6):
    try:
        await page.click('#battle-menu .battle-btn >> nth=0', timeout=3000)
    except Exception:
        await page.wait_for_timeout(1500); return
    for i in range(presses):
        await page.wait_for_timeout(900); await page.keyboard.press('Space')
    await page.wait_for_timeout(2500)

async def main():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(executable_path='/usr/bin/chromium',
            args=['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--no-sandbox'])
        page = await browser.new_page(viewport={'width':1600,'height':900})
        errors = []
        page.on('pageerror', lambda e: errors.append('PAGEERROR: '+str(e)))
        await page.goto(URL); await page.wait_for_timeout(2000)
        await page.click('.class-card[data-class="knight"]'); await page.click('#btn-start')
        await page.wait_for_timeout(600)
        await page.click('#btn-intro-begin')
        await page.evaluate("() => { window.__autoPerfect = true; }")
        await page.wait_for_timeout(2500)

        # the game now opens in Mirewood Hollow — take the road out to the Whisperwood
        await page.evaluate("() => { if (World.zone !== 'forest') World.travelTo('forest'); }")
        await page.wait_for_timeout(1800)


        # jump on a wolf (kind-specific death anim + growl attack sound)
        found = await page.evaluate("""() => {
          const e = World.enemies.find(e => e.kind === 'wolf') || World.enemies[0];
          if (!e) return false;
          World.player3d.group.position.set(e.c3d.group.position.x + 1, 0, e.c3d.group.position.z + 1);
          return true;
        }""")
        for _ in range(10):
            await page.wait_for_timeout(700)
            if await page.evaluate("() => Main.state") == 'battle': break
        print('battle started on wolf:', found)
        # weak stats + unkillable wolf so it survives the whole FX sequence
        await page.evaluate("() => { const p = RPG.player; p.attr.str = 10; RPG.recalc(); p.spirit = 100; }")
        await page.evaluate("() => { World.enemies.forEach(e => { e.hpCur = 999999; e.hp = 999999; e.maxHp = 999999; }); }")

        # 1. per-beat Addition FX — screenshot mid-chain (beat 2-3)
        await page.wait_for_timeout(1800)
        await page.click('#battle-menu .battle-btn >> nth=0')
        await page.wait_for_timeout(2600)
        await page.screenshot(path=f'{OUT}/80_beat_fx.png')
        await page.keyboard.press('Space'); await page.wait_for_timeout(900)
        await page.keyboard.press('Space'); await page.wait_for_timeout(900)
        await page.keyboard.press('Space'); await page.wait_for_timeout(900)
        await page.keyboard.press('Space'); await page.wait_for_timeout(2200)
        print('addition chain done, no errors so far:', len(errors) == 0)

        # 2. Dragoon cinematic — poll until the player's menu is actually up
        got_menu = False
        for _ in range(30):
            ind = await page.evaluate("() => document.getElementById('turn-indicator').innerText")
            vis = await page.evaluate("() => !document.getElementById('battle-menu').classList.contains('hidden')")
            if 'DRAGOON KNIGHT' in ind and vis:
                got_menu = True; break
            st = await page.evaluate("() => Main.state")
            if st != 'battle': break
            if vis: await attack_round(page)
            else: await page.wait_for_timeout(700)
        print('player menu for dragoon:', got_menu)
        await page.click('#battle-menu .battle-btn >> nth=3', timeout=8000)  # Dragoon
        await page.wait_for_timeout(1000)
        await page.screenshot(path=f'{OUT}/81_dragoon_cinematic.png')
        await page.wait_for_timeout(2500)
        form = await page.evaluate("() => RPG.player.dragoonForm")
        print('dragoon form active:', form)
        await page.screenshot(path=f'{OUT}/82_dragoon_wings.png')

        # 3. finish the wolf — catch the death anim + results
        await page.evaluate("() => { World.enemies.forEach(e => { e.hpCur = 1; }); }")
        await page.evaluate("() => { const p = RPG.player; p.attr.str = 600; RPG.recalc(); }")
        dead = False
        for _ in range(14):
            st = await page.evaluate("() => Main.state")
            if st != 'battle':
                dead = True; break
            await attack_round(page)
            ok = page.locator('#btn-results-ok')
            if await ok.is_visible():
                dead = True
                await page.screenshot(path=f'{OUT}/83_death_results.png')
                await ok.click(); await page.wait_for_timeout(1200)
                break
        print('wolf slain + results shown:', dead)

        # 4. dragoon cinematic leaves no orphan objects/pillars behind
        leftovers = await page.evaluate("""() => {
          let n = 0;
          Battle.scene && Battle.scene.traverse(o => { if (o.geometry && o.geometry.type === 'CylinderGeometry' && o.material && o.material.blending === 2) n++; });
          return n;
        }""")
        print('additive cylinders left in scene (should be small):', leftovers)

        print('ERRORS:', errors if errors else '(none)')
        await browser.close()

asyncio.run(main())
