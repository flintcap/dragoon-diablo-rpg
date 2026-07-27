import asyncio
from playwright.async_api import async_playwright

URL = 'http://localhost:8123/index.html'
OUT = '/mnt/agents/output/shots'

async def tp(page, x, z):
    await page.evaluate(f"() => {{ World.player3d.group.position.set({x}, 0, {z}); }}")
    await page.wait_for_timeout(1400)

async def buff(page, s):
    await page.evaluate(f"() => {{ const p = RPG.player; p.attr.str = {s}; p.attr.vit = 400; RPG.recalc(); p.hp = p.maxHp; p.spirit = 100; }}")

async def attack_round(page):
    try:
        await page.click('#battle-menu .battle-btn >> nth=0', timeout=3000)
    except Exception:
        await page.wait_for_timeout(1500); return
    for i in range(6):
        await page.wait_for_timeout(900); await page.keyboard.press('Space')
    await page.wait_for_timeout(2500)

async def engage_boss(page, bossId, rounds=25, shots=None):
    for r in range(rounds):
        dead = await page.evaluate(f"() => !!(RPG.player.flags && RPG.player.flags['{bossId}Dead'])")
        if dead: return True
        ok = page.locator('#btn-results-ok')
        if await ok.is_visible():
            await ok.click(); await page.wait_for_timeout(1500); continue
        st = await page.evaluate("() => Main.state")
        if st == 'world':
            found = await page.evaluate(f"""() => {{
              const b = World.enemies.find(e => e.bossId === '{bossId}');
              if (!b) return false;
              const pp = World.player3d.group.position;
              pp.x = b.c3d.group.position.x + 1.2; pp.z = b.c3d.group.position.z + 1.2;
              return true;
            }}""")
            if not found: return False
            await page.wait_for_timeout(2500)
        else:
            if shots and r == 2: await page.screenshot(path=shots)
            await attack_round(page)
    return await page.evaluate(f"() => !!(RPG.player.flags && RPG.player.flags['{bossId}Dead'])")

async def ensure_world(page, max_rounds=14):
    for _ in range(max_rounds):
        st = await page.evaluate("() => Main.state")
        if st == 'world':
            ok = page.locator('#btn-results-ok')
            if await ok.is_visible(): await ok.click(); await page.wait_for_timeout(1500)
            return True
        ok = page.locator('#btn-results-ok')
        if await ok.is_visible(): await ok.click(); await page.wait_for_timeout(1500); continue
        await attack_round(page)
    return await page.evaluate("() => Main.state === 'world'")

async def press_e(page):
    await ensure_world(page)
    await page.keyboard.press('e'); await page.wait_for_timeout(2200)
    await ensure_world(page)

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
        await page.wait_for_timeout(2000)

        # the game now opens in Mirewood Hollow — take the road out to the Whisperwood
        await page.evaluate("() => { if (World.zone !== 'forest') World.travelTo('forest'); }")
        await page.wait_for_timeout(1800)


        # 1. peaks portal must be LOCKED before Melbu dies
        await page.evaluate("() => { localStorage.removeItem('dd_save'); }")
        await tp(page, -21, 45)
        await page.keyboard.press('e'); await page.wait_for_timeout(1800)
        locked_zone = await page.evaluate("() => World.zone")
        print('portal locked before melbuDead (stays forest):', locked_zone == 'forest')
        locked_hint = await page.evaluate("() => document.getElementById('interact-hint').innerText")
        print('lock hint shown:', locked_hint.strip()[:60])

        # 2. unlock and enter Stormpeak Ascent
        await page.evaluate("() => { RPG.player.flags = RPG.player.flags || {}; RPG.player.flags.melbuDead = true; }")
        await tp(page, -21, 45)
        await page.keyboard.press('e'); await page.wait_for_timeout(2500)
        zone = await page.evaluate("() => World.zone")
        print('entered peaks:', zone == 'peaks')
        title = await page.evaluate("() => document.getElementById('zone-title-name').innerText")
        print('zone title:', title)
        await page.wait_for_timeout(2500)
        await page.screenshot(path=f'{OUT}/60_peaks_vista.png')

        # world features present
        feats = await page.evaluate("""() => {
          const s = World;
          return { enemies: s.enemies.length,
                   interactables: s.nearInteract() ? 'near' : (function(){ return 'spawned'; })(),
                   zone: s.zone };
        }""")
        print('peaks features:', feats)

        # 3. attune the three storm sigils (any order, ambushes expected)
        await buff(page, 500)
        for i, (sx, sz) in enumerate([(-10,-22), (-18,10), (16,-12)]):
            await tp(page, sx, sz)
            await press_e(page)
            n = await page.evaluate("() => RPG.player.flags.sigils || 0")
            print(f'sigils after {i+1}:', n)
            if i == 1: await page.screenshot(path=f'{OUT}/61_peaks_sigil.png')

        # 4. head to the summit — the Stormcaller must spawn
        await tp(page, 0, -30)
        await page.wait_for_timeout(3000)
        spawned = await page.evaluate("() => World.enemies.some(e => e.bossId === 'stormcaller')")
        print('stormcaller spawned at summit:', spawned)
        await page.screenshot(path=f'{OUT}/62_stormcaller_arena.png')

        # 5. kill it (chain lightning special will hit the whole party)
        await buff(page, 800)
        dead = await engage_boss(page, 'stormcaller', shots=f'{OUT}/63_stormcaller_battle.png')
        print('stormcaller dead:', dead)
        await page.wait_for_timeout(2500)
        ok = page.locator('#btn-results-ok')
        if await ok.is_visible():
            vt = await page.evaluate("() => document.getElementById('results-title').innerText")
            print('victory screen:', vt)
            await page.screenshot(path=f'{OUT}/64_storm_victory.png')
            await ok.click(); await page.wait_for_timeout(1500)

        # 6. side quest s3 completes
        await page.wait_for_timeout(3500)
        s3 = await page.evaluate("() => !!(RPG.player.flags && RPG.player.flags.done_s3)")
        print('s3 Echoes of the Storm complete:', s3)

        # 7. return portal back to forest
        await ensure_world(page)
        await tp(page, 29, 29)
        await page.keyboard.press('e'); await page.wait_for_timeout(2500)
        back = await page.evaluate("() => World.zone")
        print('returned to forest:', back == 'forest')

        print('ERRORS:', errors if errors else '(none)')
        await browser.close()

asyncio.run(main())
