import asyncio
from playwright.async_api import async_playwright

# Full Act I quest-chain end-to-end test:
# intro → q1 shard → q2 crystal riddle (wrong+right order) → q3 anchors + shielded herald
# → grotto relics → tyrant (enrage) → star key → crater → Melbu two-phase → act complete.
URL = 'http://localhost:8123/index.html'
OUT = 'shots'

async def tp(page, x, z):
    await page.evaluate(f"() => {{ World.player3d.group.position.set({x}, 0, {z}); }}")
    await page.wait_for_timeout(1400)

async def quest(page):
    return await page.evaluate("() => document.getElementById('quest-text').innerText.replace(/\\n/g,' | ')")

async def buff(page, s):
    await page.evaluate(f"() => {{ const p = RPG.player; p.attr.str = {s}; p.attr.vit = 200; RPG.recalc(); p.hp = p.maxHp; p.spirit = 100; }}")

async def attack_round(page):
    # the battle menu is rebuilt per actor, so the buttons carry no stable data-action —
    # the acting character's Addition is always the first button
    try:
        await page.click('#battle-menu .battle-btn >> nth=0', timeout=3000)
    except Exception:
        await page.wait_for_timeout(1500); return
    for i in range(12):
        await page.keyboard.press('Space'); await page.wait_for_timeout(320)
    await page.wait_for_timeout(2600)

async def ensure_world(page, max_rounds=12):
    """Fight out of any battle (incl. ambushes) until back in world state."""
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

async def engage_boss(page, bossId, rounds=20):
    """Keep engaging until the named boss is dead, handling ambush fights on the way."""
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
            await attack_round(page)
    return await page.evaluate(f"() => !!(RPG.player.flags && RPG.player.flags['{bossId}Dead'])")

async def main():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(args=['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--no-sandbox'])
        page = await browser.new_page(viewport={'width':1600,'height':900})
        errors = []
        page.on('pageerror', lambda e: errors.append('PAGEERROR: '+str(e)))
        await page.goto(URL); await page.wait_for_timeout(2000)
        await page.click('.class-card[data-class="knight"]'); await page.click('#btn-start')
        await page.wait_for_timeout(600)
        await page.screenshot(path=f'{OUT}/50_intro.png')
        await page.click('#btn-intro-begin')
        await page.evaluate("() => { window.__autoPerfect = true; }")
        await page.wait_for_timeout(2500)

        # the game now opens in Mirewood Hollow — take the road out to the Whisperwood
        await page.evaluate("() => { if (World.zone !== 'forest') World.travelTo('forest'); }")
        await page.wait_for_timeout(1800)

        await page.keyboard.press('j'); await page.wait_for_timeout(700)
        await page.screenshot(path=f'{OUT}/51_questlog.png')
        await page.keyboard.press('j'); await page.wait_for_timeout(500)

        # Q1
        await page.evaluate("() => { RPG.player.kills = 3; }"); await page.wait_for_timeout(2500)
        await tp(page, 2.5, 4)
        await page.screenshot(path=f'{OUT}/52_shard.png')
        await press_e(page)
        print('Q1 done:', await page.evaluate("() => !!(RPG.player.flags||{}).done_q1"))

        # Q2 wrong order then correct
        await tp(page, 35, 10); await press_e(page)
        for x,z in [(15,-38),(35,10),(-20,40)]:
            await tp(page, x, z); await press_e(page)
        print('Q2 done:', await page.evaluate("() => !!(RPG.player.flags||{}).done_q2"))
        await page.screenshot(path=f'{OUT}/53_trial_done.png')

        # Q3 anchors + herald
        for x,z in [(6,1),(-5,5),(-5,-5)]:
            await tp(page, x, z); await press_e(page)
        await tp(page, 0, 8); await page.wait_for_timeout(3000)
        print('HERALD spawned:', await page.evaluate("() => World.enemies.some(e=>e.bossId==='herald')"))
        await buff(page, 300)
        print('HERALD dead:', await engage_boss(page, 'herald'))
        print('Q3 done:', await page.evaluate("() => !!(RPG.player.flags||{}).done_q3"))

        # Q4 grotto + relics
        await tp(page, -45, -45); await press_e(page)
        print('ZONE:', await page.evaluate("() => World.zone"))
        for x,z in [(20,-15),(-25,10),(-10,-35),(35,25)]:
            await tp(page, x, z); await press_e(page)
        await page.wait_for_timeout(3000)
        print('TYRANT spawned:', await page.evaluate("() => World.enemies.some(e=>e.bossId==='tyrant')"))
        await page.screenshot(path=f'{OUT}/54_grotto.png')
        await buff(page, 450)
        print('TYRANT dead:', await engage_boss(page, 'tyrant'))
        print('Q5 done:', await page.evaluate("() => !!(RPG.player.flags||{}).done_q5"))

        # Q6 meteor shard + crater + Melbu (two-phase)
        await tp(page, 30, 30); await press_e(page)
        await tp(page, 12, 14); await press_e(page)
        print('STAR KEY:', await page.evaluate("() => !!(RPG.player.flags||{}).starKey"))
        await tp(page, -45, -45); await press_e(page)
        await tp(page, -42, -42); await press_e(page)
        print('ZONE:', await page.evaluate("() => World.zone"))
        await page.wait_for_timeout(3500)
        print('MELBU spawned:', await page.evaluate("() => World.enemies.some(e=>e.bossId==='melbu')"))
        await page.screenshot(path=f'{OUT}/55_crater.png')
        await buff(page, 500)
        for r in range(20):
            dead = await page.evaluate("() => !!(RPG.player.flags||{}).melbuDead")
            if dead: break
            ok = page.locator('#btn-results-ok')
            if await ok.is_visible(): await ok.click(); await page.wait_for_timeout(1500); continue
            st = await page.evaluate("() => Main.state")
            if st == 'world':
                await page.evaluate("""() => {
                  const b = World.enemies.find(e => e.bossId === 'melbu');
                  if (b) { const pp = World.player3d.group.position;
                    pp.x = b.c3d.group.position.x + 1.2; pp.z = b.c3d.group.position.z + 1.2; }
                }""")
                await page.wait_for_timeout(2500); continue
            banner = await page.evaluate("() => document.getElementById('battle-banner').textContent")
            if 'DRAGON AVATAR' in banner and not main.phase2_shot:
                await page.wait_for_timeout(800)
                await page.screenshot(path=f'{OUT}/56_phase2.png')
                main.phase2_shot = True
                print('PHASE 2 REACHED')
            await attack_round(page)
        print('MELBU dead:', await page.evaluate("() => !!(RPG.player.flags||{}).melbuDead"))
        await page.wait_for_timeout(4000)
        await page.screenshot(path=f'{OUT}/57_actcomplete.png')
        print('Q final:', await quest(page))
        print('ERRORS:', errors if errors else '(none)')
        await browser.close()
main.phase2_shot = False

asyncio.run(main())
