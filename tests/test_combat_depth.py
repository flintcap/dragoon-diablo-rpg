"""v9 — Additions, Affinities & Ailments.

Covers the three systems added in this pass:
  * named Additions with per-chain beat counts / timing windows / mastery levels
  * elemental affinity (family x zone x boss) on outgoing damage, resistances on incoming
  * the ailment engine (burn / bleed / chill / shock / curse / poison) on enemy and party

Run with the game served at :8123 (cd app && python3 -m http.server 8123).
"""
import asyncio, os
from playwright.async_api import async_playwright

URL = 'http://localhost:8123/index.html'
OUT = os.environ.get('SHOTS', '/mnt/agents/output/shots')
CHROME = os.environ.get('CHROME', '/usr/bin/chromium')


async def shot(page, name):
    try:
        await page.screenshot(path=f'{OUT}/{name}.png')
    except Exception:
        pass


async def start_game(page, cls='knight'):
    await page.goto(URL); await page.wait_for_timeout(2200)
    await page.click(f'.class-card[data-class="{cls}"]'); await page.click('#btn-start')
    await page.wait_for_timeout(700)
    await page.click('#btn-intro-begin'); await page.wait_for_timeout(2200)
    await page.evaluate("() => { window.__autoPerfect = true; }")


async def force_battle(page):
    """Drop the hero on top of the nearest roamer to trigger an encounter."""
    await page.evaluate("""() => {
        const e = World.enemies.find(x => x.c3d);
        if (e) World.player3d.group.position.set(e.c3d.group.position.x, 0, e.c3d.group.position.z + 1);
    }""")
    for _ in range(20):
        await page.wait_for_timeout(400)
        if await page.evaluate("() => Battle.active"):
            await page.wait_for_timeout(1600)
            return True
    return False


async def throw_addition(page, presses=16):
    """Click the Addition button and hit every beat (window forced to PERFECT).
    Presses generously — the ring only accepts one per beat, extras are no-ops."""
    await page.click('#battle-menu .battle-btn >> nth=0', timeout=8000)
    for _ in range(presses):
        await page.keyboard.press('Space')
        await page.wait_for_timeout(300)
    await page.wait_for_timeout(3200)


async def main():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(executable_path=CHROME,
            args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--no-sandbox'])
        page = await browser.new_page(viewport={'width': 1600, 'height': 900})
        errors = []
        page.on('pageerror', lambda e: errors.append('PAGEERROR: ' + str(e)))

        await start_game(page, 'knight')

        # ---------------------------------------------------------------- 1. affinity tables
        aff = await page.evaluate("""() => ({
            wraithFire:  Combat.affinity({kind:'wraith'},  'fire', 'forest'),
            wraithArc:   Combat.affinity({kind:'wraith'},  'arcane', 'forest'),
            golemPhys:   Combat.affinity({kind:'golem'},   'phys', 'forest'),
            golemLtn:    Combat.affinity({kind:'golem'},   'lightning', 'forest'),
            peaksIce:    Combat.affinity({kind:'wolf'},    'ice', 'peaks'),
            peaksFire:   Combat.affinity({kind:'wolf'},    'fire', 'peaks'),
            craterFire:  Combat.affinity({kind:'humanoid'},'fire', 'crater'),
            stormLtn:    Combat.affinity({kind:'humanoid', bossId:'stormcaller'}, 'lightning', 'peaks'),
        })""")
        print('affinity — wraith takes fire %.2f / arcane %.2f' % (aff['wraithFire'], aff['wraithArc']))
        print('affinity — golem takes phys %.2f / lightning %.2f' % (aff['golemPhys'], aff['golemLtn']))
        print('affinity — peaks ice %.2f vs fire %.2f · crater fire %.2f' %
              (aff['peaksIce'], aff['peaksFire'], aff['craterFire']))
        print('affinity — Stormcaller vs lightning %.2f (near-immune):' % aff['stormLtn'],
              aff['stormLtn'] < 0.3)
        print('PASS affinity ordering:',
              aff['wraithFire'] > 1.25 and aff['wraithArc'] < 0.8
              and aff['golemPhys'] < 0.8 and aff['golemLtn'] > 1.25
              and aff['peaksIce'] < 0.8 and aff['peaksFire'] > 1.25
              and aff['craterFire'] < 0.8 and aff['stormLtn'] < 0.3)

        # ---------------------------------------------------------------- 2. named additions
        start_add = await page.evaluate("() => RPG.currentAddition().name")
        unlocked_1 = await page.evaluate("() => Combat.unlockedAdditions('knight', 1).length")
        unlocked_15 = await page.evaluate("() => Combat.unlockedAdditions('knight', 15).length")
        print('starting Addition:', start_add, '| unlocked at lv1:', unlocked_1, '· at lv15:', unlocked_15)
        print('PASS addition gating:', unlocked_1 == 1 and unlocked_15 == 4)

        beats = await page.evaluate("() => Combat.additionsFor('knight').map(a => a.beats)")
        windows = await page.evaluate("() => Combat.additionsFor('knight').map(a => a.window.perfect)")
        print('beat counts:', beats, '| perfect windows:', windows)
        print('PASS longer chains have tighter windows:',
              beats == sorted(beats) and windows == sorted(windows, reverse=True))

        # ---------------------------------------------------------------- 3. mastery from use
        await page.evaluate("() => { RPG.gainXp(20000); RPG.recalc(); }")
        lvl = await page.evaluate("() => RPG.player.level")
        switched = await page.evaluate("() => RPG.setAddition('crush_dance') && RPG.currentAddition().id")
        print('level after xp grant:', lvl, '| switched to:', switched)

        mastery = await page.evaluate("""() => {
            RPG.player.additions = {};
            const seen = [];
            for (let i = 0; i < 40; i++) seen.push(RPG.logAdditionUse('crush_dance'));
            return { ups: seen.filter(Boolean), uses: RPG.player.additions.crush_dance,
                     lv: RPG.additionLevel('crush_dance'),
                     dmg: Combat.masteryMult(RPG.player.additions.crush_dance) };
        }""")
        print('mastery level-ups at uses %s → Lv %d (×%.2f chain damage)' %
              (mastery['ups'], mastery['lv'], mastery['dmg']))
        print('PASS mastery ladder:', mastery['ups'] == [2, 3, 4] and mastery['lv'] == 4 and mastery['dmg'] > 1)
        await page.evaluate("() => { RPG.player.additions = {}; }")

        # ---------------------------------------------------------------- 4. live battle: chain + finisher
        if not await force_battle(page):
            print('FAIL could not enter battle'); await browser.close(); return
        menu = await page.evaluate(
            "() => [...document.querySelectorAll('#battle-menu button')].map(b => b.innerText.replace('\\n',' | '))")
        print('battle menu:', menu[:2])
        print('PASS menu names the Addition:', 'Crush Dance' in menu[0])
        print('PASS Additions switcher present:', any('Additions' in m for m in menu))

        es = await page.evaluate("""() => {
            const el = document.getElementById('enemy-status');
            const kind = Battle.debug().enemy.kind;
            // how many schools this family reads as weak/resist — the pip count must match exactly
            const expect = Combat.ELEMENT_KEYS.filter(k =>
                Combat.affinityTag(Combat.affinity({kind}, k, World.zone))).length;
            return { kind, text: el.innerText.replace(/\\n/g, ''), hidden: el.classList.contains('hidden'),
                     pips: el.querySelectorAll('.aff-pip').length, expect };
        }""")
        print('enemy status strip (%s): %r · %d pips (expected %d)' %
              (es['kind'], es['text'], es['pips'], es['expect']))
        print('PASS enemy affinity is on screen:',
              not es['hidden'] and es['pips'] == es['expect'] and es['expect'] > 0)

        await shot(page, '96_combat_battle')

        # ---------------------------------------------------------------- 4b. HUD regressions
        # (checked mid-battle — the party frames live inside #battle-ui)
        bars = await page.evaluate("""() => {
            const bg = id => getComputedStyle(document.getElementById(id)).backgroundImage;
            return { serah: bg('serah-hp'), kael: bg('kael-hp'), lyra: bg('lyra-hp') };
        }""")
        print('PASS every party bar has a visible fill:',
              all(v and v != 'none' for v in bars.values()))
        clear = await page.evaluate("""() => {
            const a = document.getElementById('hud-topleft').getBoundingClientRect();
            const b = document.getElementById('party-frames').getBoundingClientRect();
            return { hud: Math.round(a.bottom), party: Math.round(b.top), ok: b.top >= a.bottom - 1 };
        }""")
        print('party frames start at y=%d, hero HUD ends at y=%d' % (clear['party'], clear['hud']))
        print('PASS party frames clear the hero HUD:', clear['ok'])
        hotbar = await page.evaluate("() => getComputedStyle(document.getElementById('hotbar')).display")
        print('PASS world hotbar hidden during battle (it sat on the battle log):', hotbar == 'none')

        # give both sides enough padding that the fight survives a few rounds
        await page.evaluate("""() => {
            const p = RPG.player; p.attr.vit = 400; RPG.recalc(); p.hp = p.maxHp;
            const e = World.enemies.find(x => x.hpCur !== undefined);
            e.hp = e.maxHp = e.hpCur = 200000; e.dmg = 1;
        }""")
        hp_before = await page.evaluate("() => Battle.debug().enemy.hp")
        # capture the whole log for the turn, not just the last line
        await page.evaluate("""() => {
            window.__log = [];
            const el = document.getElementById('battle-log');
            new MutationObserver(() => window.__log.push(el.innerText)).observe(el, {childList:true, subtree:true, characterData:true});
        }""")
        await throw_addition(page)
        st = await page.evaluate("() => Battle.debug()")
        uses = await page.evaluate("() => RPG.player.additions.crush_dance || 0")
        lines = await page.evaluate("() => window.__log")
        print('enemy HP %s → %s | mastery uses: %d' % (hp_before, st['enemy']['hp'], uses))
        print('PASS chain landed and scored mastery:', uses >= 1)
        fin = [l for l in lines if 'finishes for' in l]
        print('finisher line:', fin[0][:90] if fin else '(none)')
        print('PASS full chain fires its finisher:', bool(fin))
        await shot(page, '97_combat_chain')

        # ---------------------------------------------------------------- 4c. live ailment tick
        await page.evaluate("""() => {
            const e = World.enemies.find(x => x.hpCur !== undefined);
            Combat.inflict(e, 'burn', 500, 1);
        }""")
        await page.wait_for_timeout(400)
        chip = await page.evaluate("() => document.querySelectorAll('#enemy-status .ail-chip').length")
        hp_burn_before = await page.evaluate("() => Battle.debug().enemy.hp")
        # spend the party's turns so the enemy phase (and the ailment tick) runs
        for _ in range(4):
            try:
                await page.click('#battle-menu .battle-btn >> nth=-1', timeout=4000)
            except Exception:
                break
            await page.wait_for_timeout(1400)
        await page.wait_for_timeout(2500)
        after = await page.evaluate("() => Battle.debug()")
        burn_lines = [l for l in await page.evaluate("() => window.__log") if 'Burn' in l]
        print('burn chip rendered:', chip, '| enemy HP %s → %s' % (hp_burn_before, after['enemy']['hp']))
        print('burn log:', burn_lines[0][:90] if burn_lines else '(none)')
        print('PASS burn shows on the enemy and ticks in battle:',
              chip >= 1 and after['enemy']['hp'] < hp_burn_before and bool(burn_lines))
        await shot(page, '97b_combat_ailment')

        # ---------------------------------------------------------------- 5. ailments on the enemy
        ail = await page.evaluate("""() => {
            const e = { kind:'humanoid', name:'Dummy' };
            Combat.inflict(e, 'burn', 100, 1);
            const applied = Object.keys(e.ail);
            const t1 = Combat.tick(e), t2 = Combat.tick(e), t3 = Combat.tick(e);
            return { applied, dot: t1.ticks[0] && t1.ticks[0].dmg,
                     ticks: [t1.ticks.length, t2.ticks.length, t3.ticks.length],
                     expired: t3.expired.map(x => x.id), left: Object.keys(e.ail) };
        }""")
        print('burn: applied %s, %s damage/turn, ticks %s, expired %s' %
              (ail['applied'], ail['dot'], ail['ticks'], ail['expired']))
        print('PASS burn ticks 3 turns then expires:',
              ail['applied'] == ['burn'] and ail['ticks'] == [1, 1, 1]
              and ail['expired'] == ['burn'] and ail['left'] == [])

        mods = await page.evaluate("""() => {
            const chilled = { kind:'wolf' }; Combat.inflict(chilled, 'chill', 0, 1);
            const cursed  = { kind:'wolf' }; Combat.inflict(cursed, 'curse', 0, 1);
            let skipped = 0;
            const shocked = { kind:'wolf' };
            for (let i = 0; i < 400; i++) { Combat.inflict(shocked, 'shock', 0, 1); if (Combat.skipsTurn(shocked)) skipped++; }
            return { chill: Combat.outgoingMult(chilled), curse: Combat.outgoingMult(cursed), skipRate: skipped / 400 };
        }""")
        print('chill ×%.2f outgoing · curse ×%.2f outgoing · shock skips %.0f%% of turns' %
              (mods['chill'], mods['curse'], mods['skipRate'] * 100))
        print('PASS ailment modifiers bite:',
              mods['chill'] < 1 and mods['curse'] < 1 and 0.2 < mods['skipRate'] < 0.5)

        # ---------------------------------------------------------------- 6. resistances
        res = await page.evaluate("""() => {
            const p = RPG.player;
            p.equip.amulet = { slot:'amulet', rarity:'magic', name:'Test Ward', icon:'📿', level:1,
                               affixes:[{stat:'resFire', v:0.30}, {stat:'resAll', v:0.10}] };
            RPG.recalc();
            const r = p.resist;
            const raw = 100;
            const hit = Combat.mitigate(raw, 'fire', r);
            p.equip.amulet = null; RPG.recalc();
            return { fire:r.fire, ice:r.ice, mitigated:hit.dmg, cap:Combat.RES_CAP };
        }""")
        print('resist affixes → fire %.2f / ice %.2f · a 100-damage fire hit lands for %.0f (cap %.0f%%)' %
              (res['fire'], res['ice'], res['mitigated'], res['cap'] * 100))
        print('PASS resistances reduce elemental damage:',
              abs(res['fire'] - 0.40) < 0.001 and abs(res['ice'] - 0.10) < 0.001 and abs(res['mitigated'] - 60) < 0.001)

        # ---------------------------------------------------------------- 7. character sheet panels
        # finish the fight properly so the game is back in world state
        await page.evaluate("() => { const e = World.enemies.find(x => x.hpCur !== undefined); if (e) e.hpCur = 1; }")
        if await page.evaluate("() => Battle.active"):
            await throw_addition(page, 6)
        for _ in range(12):
            if await page.evaluate("() => !document.getElementById('results-screen').classList.contains('hidden')"):
                await page.click('#btn-results-ok'); break
            await page.wait_for_timeout(500)
        await page.wait_for_timeout(900)
        print('back in world after victory:', await page.evaluate("() => Main.state"))
        await page.keyboard.press('c'); await page.wait_for_timeout(700)
        cells = await page.evaluate("() => document.querySelectorAll('#resist-list .res-cell').length")
        rows = await page.evaluate("() => document.querySelectorAll('#addition-list .add-row').length")
        locked = await page.evaluate("() => document.querySelectorAll('#addition-list .add-row.locked').length")
        print('character sheet — %d resistance cells, %d Addition rows (%d locked)' % (cells, rows, locked))
        print('PASS sheet shows both new panels:', cells == 4 and rows == 4)
        await shot(page, '98_combat_sheet')
        await page.keyboard.press('Escape'); await page.wait_for_timeout(300)

        # ---------------------------------------------------------------- 8. save round-trips the new state
        rt = await page.evaluate("""() => {
            RPG.player.additions = { crush_dance: 12 };
            RPG.player.addition = 'crush_dance';
            RPG.save();
            RPG.player = null; RPG.load();
            return { uses: RPG.player.additions.crush_dance, sel: RPG.player.addition,
                     lv: RPG.additionLevel('crush_dance') };
        }""")
        print('save/load — %d uses, selected %s, mastery Lv %d' % (rt['uses'], rt['sel'], rt['lv']))
        print('PASS mastery survives save/load:', rt['uses'] == 12 and rt['sel'] == 'crush_dance' and rt['lv'] == 2)

        print('ERRORS:', errors if errors else '(none)')
        await browser.close()


asyncio.run(main())
