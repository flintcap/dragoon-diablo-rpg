import asyncio
from playwright.async_api import async_playwright

URL = 'http://localhost:8123/index.html'
OUT = '/mnt/agents/output/shots'

async def tp(page, x, z):
    await page.evaluate(f"() => {{ World.player3d.group.position.set({x}, 0, {z}); }}")
    await page.wait_for_timeout(1300)

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

        # 1. travel to town, find the board
        await tp(page, 26, 26)
        await page.keyboard.press('e'); await page.wait_for_timeout(2500)
        zone = await page.evaluate("() => World.zone")
        print('reached town:', zone == 'town')
        await tp(page, 6, -6)
        hint = await page.evaluate("() => document.getElementById('interact-hint').innerText")
        print('board hint:', hint.strip()[:45])

        # 2. open the board
        await page.keyboard.press('e'); await page.wait_for_timeout(1200)
        open_board = await page.evaluate("() => !document.getElementById('bounty').classList.contains('hidden')")
        offers = await page.evaluate("() => (RPG.player.flags.bountyOffers||[]).map(o => o.type + ':' + (o.kind||o.count) + ':' + o.gold)")
        print('board open:', open_board, '| offers:', offers)
        await page.screenshot(path=f'{OUT}/95_bounty_board.png')

        # 3. accept the first kill bounty (force one to exist for determinism)
        await page.evaluate("""() => {
          const f = RPG.player.flags;
          f.bountyOffers = [{ id:'test1', type:'kill', kind:'wolf', label:'the howling packs', count:2, gold:120 }];
        }""")
        await page.evaluate("() => { document.getElementById('bounty').classList.add('hidden'); }")
        await page.keyboard.press('e'); await page.wait_for_timeout(900)
        await page.click('#bounty-list .bounty-row button >> nth=0')
        await page.wait_for_timeout(800)
        has_bounty = await page.evaluate("() => !!RPG.player.flags.bounty")
        print('bounty accepted:', has_bounty)
        await page.wait_for_timeout(2200)  # let the quest tick render the tracker
        print('tracker shows bounty:', '📜' in await page.evaluate("() => document.getElementById('quest-text').innerHTML"))
        await page.screenshot(path=f'{OUT}/96_bounty_accepted.png')
        await page.keyboard.press('Escape'); await page.wait_for_timeout(500)

        # 4. back to the forest, cull 2 wolves (combat exercised elsewhere; use engine path)
        await tp(page, -26, -26)
        await page.keyboard.press('e'); await page.wait_for_timeout(2500)
        await page.evaluate("""() => {
          // two real wolf kills through the engine's own removal path
          for (let i=0;i<2;i++){
            const e = World.enemies.find(e => e.kind === 'wolf');
            if (e) World.removeEnemy(e);
          }
        }""")
        await page.wait_for_timeout(1600)  # let the quest tick notice
        ready = await page.evaluate("() => !!RPG.player.flags.bountyReady")
        prog = await page.evaluate("""() => {
          const f = RPG.player.flags;
          return { kind: f.bounty.kind, kills: f.kill_wolf||0, base: f.bountyBase.kill };
        }""")
        print('wolf kills tracked:', prog, '| bountyReady:', ready)

        # 5. claim at the board
        gold0 = await page.evaluate("() => RPG.player.gold")
        await tp(page, 26, 26)
        await page.keyboard.press('e'); await page.wait_for_timeout(2500)
        await tp(page, 6, -6)
        await page.keyboard.press('e'); await page.wait_for_timeout(1200)
        await page.screenshot(path=f'{OUT}/97_bounty_claim.png')
        can_claim = await page.evaluate("() => !document.getElementById('btn-claim-bounty').disabled")
        await page.click('#btn-claim-bounty'); await page.wait_for_timeout(1200)
        gold1 = await page.evaluate("() => RPG.player.gold")
        cleared = await page.evaluate("() => RPG.player.flags.bounty === null")
        new_offers = await page.evaluate("() => (RPG.player.flags.bountyOffers||[]).length")
        print(f'claim: can={can_claim} gold {gold0}->{gold1} (+{gold1-gold0}) cleared={cleared} newOffers={new_offers}')
        await page.screenshot(path=f'{OUT}/98_bounty_paid.png')

        print('ERRORS:', errors if errors else '(none)')
        await browser.close()

asyncio.run(main())
