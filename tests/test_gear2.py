import asyncio
from playwright.async_api import async_playwright

URL = 'http://localhost:8123/index.html'
OUT = '/mnt/agents/output/shots'

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

        # 1. equip a full rare/unique kit programmatically, refresh visuals
        checks = await page.evaluate("""() => {
          const p = RPG.player;
          p.equip.armor = RPG.genItem(12, 'rare', 'armor');
          p.equip.helm = RPG.genItem(12, 'rare', 'helm');
          p.equip.boots = RPG.genItem(10, 'magic', 'boots');
          p.equip.amulet = RPG.genItem(10, 'unique', 'amulet');
          p.equip.weapon = RPG.genItem(12, 'rare', 'weapon');
          RPG.recalc();
          World.refreshPlayerGear();
          const r = World.player3d.refs;
          return {
            shield: !!r.shield,
            helmMesh: !!r.helmMesh,
            pauldronCount: r.pauldrons ? r.pauldrons.length : 0,
            pauldronScale: r.pauldrons && r.pauldrons[0] ? +r.pauldrons[0].scale.x.toFixed(2) : 0,
            shins: r.shins ? r.shins.length : 0,
            amuletMesh: !!r.amuletMesh,
            uniqueAura: !!r.uniqueAura,
            uniqueLight: !!r.uniqueLight,
            armorName: p.equip.armor.name, helmName: p.equip.helm.name,
            amuletName: p.equip.amulet.name, amuletRarity: p.equip.amulet.rarity,
          };
        }""")
        print('gear visuals:', checks)

        # close-up screenshot in the world
        await page.evaluate("""() => {
          const cam = World.camera, pl = World.player3d.group.position;
          cam.position.set(pl.x + 3.5, 2.6, pl.z + 3.5);
          cam.lookAt(pl.x, 1.3, pl.z);
        }""")
        await page.wait_for_timeout(800)
        await page.screenshot(path=f'{OUT}/90_gear_closeup.png')

        # 2. unequip everything -> visuals come back off
        off = await page.evaluate("""() => {
          const p = RPG.player;
          p.equip.armor = null; p.equip.helm = null; p.equip.boots = null; p.equip.amulet = null;
          RPG.recalc(); World.refreshPlayerGear();
          const r = World.player3d.refs;
          return { shield: !!r.shield, helmMesh: !!r.helmMesh, shins: !!r.shins,
                   amuletMesh: !!r.amuletMesh, uniqueAura: !!r.uniqueAura };
        }""")
        print('all visuals removed on unequip:', off)

        # 3. re-equip + battle: the battle rig must carry shield/helm/amulet too
        await page.evaluate("""() => {
          const p = RPG.player;
          p.equip.armor = RPG.genItem(12, 'rare', 'armor');
          p.equip.helm = RPG.genItem(12, 'rare', 'helm');
          p.equip.amulet = RPG.genItem(10, 'unique', 'amulet');
          RPG.recalc(); World.refreshPlayerGear();
          p.attr.str = 500; p.attr.vit = 400; RPG.recalc(); p.hp = p.maxHp;
          const e = World.enemies[0];
          World.player3d.group.position.set(e.c3d.group.position.x + 1, 0, e.c3d.group.position.z + 1);
        }""")
        for _ in range(10):
            await page.wait_for_timeout(700)
            if await page.evaluate("() => Main.state") == 'battle': break
        await page.wait_for_timeout(1500)
        await page.screenshot(path=f'{OUT}/91_gear_battle.png')
        in_battle = await page.evaluate("() => Main.state") == 'battle'
        print('battle with gear rig:', in_battle)
        # fight out
        for _ in range(10):
            ok = page.locator('#btn-results-ok')
            if await ok.is_visible(): await ok.click(); await page.wait_for_timeout(1200); break
            st = await page.evaluate("() => Main.state")
            if st != 'battle': break
            try:
                await page.click('#battle-menu .battle-btn >> nth=0', timeout=2500)
                for i in range(6):
                    await page.wait_for_timeout(850); await page.keyboard.press('Space')
                await page.wait_for_timeout(2200)
            except Exception:
                await page.wait_for_timeout(1200)

        print('ERRORS:', errors if errors else '(none)')
        await browser.close()

asyncio.run(main())
