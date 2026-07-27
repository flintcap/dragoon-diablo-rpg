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

async def ensure_world(page, max_rounds=16):
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

async def start_battle(page):
    """Teleport onto the nearest non-boss enemy."""
    await ensure_world(page)
    await page.evaluate("""() => {
      const e = World.enemies.find(e => !e.boss);
      if (!e) return;
      const pp = World.player3d.group.position;
      pp.x = e.c3d.group.position.x + 1.0; pp.z = e.c3d.group.position.z + 1.0;
    }""")
    for _ in range(10):
        await page.wait_for_timeout(700)
        if await page.evaluate("() => Main.state") == 'battle': return True
    return False

async def skip_to_actor(page, name, max_steps=6):
    """Attack through turns until the turn indicator shows the requested actor."""
    for _ in range(max_steps):
        st = await page.evaluate("() => Main.state")
        if st != 'battle': return False
        ind = await page.evaluate("() => document.getElementById('turn-indicator').innerText")
        if name.upper() in ind.upper(): return True
        await attack_round(page)
    ind = await page.evaluate("() => document.getElementById('turn-indicator').innerText")
    return name.upper() in ind.upper()

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


        # 0. rescue must NOT be available while the Warden lives
        await page.evaluate("""() => { const f = RPG.player.flags = RPG.player.flags || {};
          f.heraldDead = true; f.kaelJoined = true; f.starKey = true; }""")
        await buff(page, 500)
        # travel: forest -> grotto -> dungeon
        await tp(page, -44, -44); await press_e(page)
        print('reached grotto:', await page.evaluate("() => World.zone") == 'grotto')
        await tp(page, 33, -33); await press_e(page)
        print('reached dungeon:', await page.evaluate("() => World.zone") == 'dungeon')
        await tp(page, -24, -30)
        await page.keyboard.press('e'); await page.wait_for_timeout(1200)
        early = await page.evaluate("() => !!(RPG.player.flags.lyraJoined)")
        print('rescue blocked while Warden alive:', early == False)

        # 1. Warden dead -> the cell lock can be broken
        await page.evaluate("() => { RPG.player.flags.wardenDead = true; }")
        await tp(page, -24, -30); await page.wait_for_timeout(1500)
        hint = await page.evaluate("() => document.getElementById('interact-hint').innerText")
        print('rescue hint:', hint.strip()[:50])
        await page.screenshot(path=f'{OUT}/70_lyra_cell.png')
        await press_e(page)
        joined = await page.evaluate("() => !!RPG.player.flags.lyraJoined")
        print('lyra joined after rescue:', joined)

        # 2. battle: full 4-member turn cycle incl. LYRA + lyra bars visible
        # (weak stats so the enemy survives a full party cycle)
        await page.evaluate("() => { const p = RPG.player; p.attr.str = 20; p.attr.vit = 300; RPG.recalc(); p.hp = p.maxHp; }")
        await start_battle(page)
        cyc = []
        for name in ['STARFORGED KNIGHT', 'SERAH', 'KAEL', 'LYRA']:
            ok = await skip_to_actor(page, name)
            cyc.append(f'{name}:{ok}')
            if not ok: break
            if name == 'LYRA':
                await page.screenshot(path=f'{OUT}/71_lyra_turn.png')
            await attack_round(page)
        print('turn cycle:', ' '.join(cyc))
        bars = await page.evaluate("() => !document.getElementById('lyra-bars').classList.contains('hidden')")
        print('lyra bars visible in battle:', bars)

        # 3. Lyra casts Emberbolt (fire special path)
        in_battle = await page.evaluate("() => Main.state") == 'battle'
        if not in_battle: await start_battle(page)
        # make the current enemy unkillable for the duration of the cast test
        await page.evaluate("() => { World.enemies.forEach(e => { e.hpCur = 999999; e.hp = 999999; e.maxHp = 999999; }); }")
        on_lyra = await skip_to_actor(page, 'LYRA', max_steps=10)
        print('on lyra turn for cast test:', on_lyra)
        mp0 = await page.evaluate("() => RPG.player.lyra.mp")
        try:
            await page.click('#battle-menu .battle-btn >> nth=1', timeout=5000)  # Skills
            await page.wait_for_timeout(700)
            await page.click('#battle-submenu .battle-btn >> nth=0', timeout=5000)  # Emberbolt
            await page.wait_for_timeout(3500)
        except Exception as ex:
            print('cast click failed:', type(ex).__name__)
        mp1 = await page.evaluate("() => RPG.player.lyra.mp")
        blog = await page.evaluate("() => document.getElementById('battle-log').innerText")
        print('emberbolt mp spent:', mp0 - mp1, '| log:', blog[:60])
        await page.screenshot(path=f'{OUT}/72_lyra_cast.png')
        # finish the battle: drop the enemy to 1hp and hit it once
        await page.evaluate("() => { World.enemies.forEach(e => { e.hpCur = 1; }); }")
        await attack_round(page); await attack_round(page)
        await ensure_world(page)

        # 4. equip: Alt-click a weapon -> Lyra's slot
        await page.evaluate("""() => { const it = RPG.genItem(RPG.player.level+2, 'rare', 'weapon');
          RPG.player.inventory.push(it); UI.refreshInv(); }""")
        await page.keyboard.press('KeyI'); await page.wait_for_timeout(900)
        cells = page.locator('.inv-cell')
        n = await cells.count()
        clicked = False
        for i in range(n-1, -1, -1):
            txt = await cells.nth(i).inner_text()
            if 'Potion' in txt: continue
            await cells.nth(i).click(modifiers=['Alt'])
            clicked = True; break
        await page.wait_for_timeout(800)
        has_wpn = await page.evaluate("() => !!RPG.player.lyra.weapon")
        print('alt-click equips weapon to Lyra:', clicked and has_wpn)
        lyra_slot = await page.evaluate("() => RPG.player.lyra.weapon ? RPG.player.lyra.weapon.name : ''")
        print('lyra weapon:', lyra_slot)
        await page.keyboard.press('Escape'); await page.wait_for_timeout(500)

        print('ERRORS:', errors if errors else '(none)')
        await browser.close()

asyncio.run(main())
