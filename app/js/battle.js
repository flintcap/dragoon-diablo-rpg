/* battle.js — the Addition system-style turn-based battles with timed Addition combos */
const Battle = (() => {
  const M = THREE;
  let scene, camera, active = false, enemy = null, playerModel = null, enemyModel = null, allyModel = null;
  let turn = 'player', animQueue = Promise.resolve(), spiritGainMult = 1;
  let ascendTurns = 0, enemyDebuff = { dmg: 0, miss: 0, turns: 0 };
  // Ailment carriers for the four party slots. The enemy carries its own `.ail` bag.
  let partyAil = { player:{ail:{}}, serah:{ail:{}}, kael:{ail:{}}, lyra:{ail:{}} };
  let playerBuffs = { dodge: 0, defPct: 0, turns: 0, doubleHit: false, empower: false };
  let ringState = null, arenaLight = null, ascendWings = null;
  const arenaEls = { inlays: [], flames: [], ring: null, emblem: null, floorMat: null };
  // per-zone arena moods — every battlefield should feel like the place you fight in
  const ARENA_THEMES = {
    forest:  { accent: 0x3a7bd5, inlay: 0x24508a, floor: 0x59637e, ember: 0x7ec8ff },
    town:    { accent: 0xd8a84a, inlay: 0x8a6a2a, floor: 0x5e5648, ember: 0xffdd88 },
    coast:   { accent: 0x3ab8d8, inlay: 0x1d6a80, floor: 0x4e5e6a, ember: 0xbfe8ff },
    grotto:  { accent: 0x3ad5c8, inlay: 0x1d7a70, floor: 0x3e4e5e, ember: 0x8a7aff },
    dungeon: { accent: 0xd8823a, inlay: 0x7a4a1d, floor: 0x4a4440, ember: 0xffaa55 },
    crater:  { accent: 0xd85a3a, inlay: 0x7a2a1d, floor: 0x54423e, ember: 0xff9a4d },
    peaks:   { accent: 0x7ae8ff, inlay: 0x2a7a8a, floor: 0x4e5c72, ember: 0xd8e6ff },
  };
  function applyArenaTheme(zone) {
    const t = ARENA_THEMES[zone] || ARENA_THEMES.forest;
    if (arenaEls.ring) arenaEls.ring.material.color.setHex(t.accent);
    for (const inl of arenaEls.inlays) inl.material.color.setHex(t.inlay);
    if (arenaEls.emblem) arenaEls.emblem.material.color.setHex(t.inlay);
    if (arenaEls.floorMat) arenaEls.floorMat.color.setHex(t.floor);
    if (arenaLight) arenaLight.color.setHex(t.accent);
    for (const f of arenaEls.flames) f.color.setHex(t.accent);
    if (scene && scene.userData.embers) scene.userData.embers.material.color.setHex(t.ember);
  }
  let currentActor = 'player', serahKO = false, serahDefending = false, partyDodge = 0, partyDodgeTurns = 0;
  let kaelModel = null, kaelKO = false, kaelDefending = false, partyDef = 0, partyDefTurns = 0;
  let lyraModel = null, lyraKO = false, lyraDefending = false;

  const ui = id => document.getElementById(id);
  const log = msg => ui('battle-log').innerHTML = msg;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const rnd = (a,b)=>a+Math.random()*(b-a);

  // ---------- SCENE ----------
  function buildScene() {
    scene = new M.Scene();
    scene.background = new M.Color(0x070a14);
    scene.fog = new M.FogExp2(0x0a0f1e, 0.02);
    camera = new M.PerspectiveCamera(50, innerWidth/innerHeight, .1, 200);
    const key = new M.DirectionalLight(0x9db8ff, 1.1); key.position.set(-10, 20, 10);
    key.castShadow = true; key.shadow.mapSize.set(1024,1024); scene.add(key);
    scene.add(new M.AmbientLight(0x1c2742, 0.7));
    arenaLight = new M.PointLight(0x3a7bd5, 1, 40); arenaLight.position.set(0, 8, 0); scene.add(arenaLight);
    // arena floor
    const floorMat = new M.MeshStandardMaterial({ color: 0x2a3142, roughness: .9 });
    if (typeof TexFactory !== 'undefined') { TexFactory.apply(floorMat, 'stoneBrick', 6, 6); floorMat.color.setHex(0x59637e); }
    const floor = new M.Mesh(new M.CylinderGeometry(12, 13, .6, 32), floorMat);
    floor.receiveShadow = true; scene.add(floor);
    const ring = new M.Mesh(new M.TorusGeometry(11.5, .18, 8, 48),
      new M.MeshBasicMaterial({ color: 0x3a7bd5 }));
    ring.rotation.x = Math.PI/2; ring.position.y = .32; scene.add(ring);
    arenaEls.ring = ring;
    // concentric inlays + center emblem + radial cracks
    for (const [r, col] of [[8, 0x24508a], [4.5, 0x1d4a70]]) {
      const inl = new M.Mesh(new M.TorusGeometry(r, .08, 6, 48),
        new M.MeshBasicMaterial({ color: col, transparent:true, opacity:.8 }));
      inl.rotation.x = Math.PI/2; inl.position.y = .31; scene.add(inl);
      arenaEls.inlays.push(inl);
    }
    const emblem = new M.Mesh(new M.CircleGeometry(1.6, 24),
      new M.MeshBasicMaterial({ color: 0x2a5a9a, transparent:true, opacity:.5 }));
    emblem.rotation.x = -Math.PI/2; emblem.position.y = .31; scene.add(emblem);
    arenaEls.emblem = emblem; arenaEls.floorMat = floorMat;
    for (let i=0;i<8;i++){
      const a = i/8*Math.PI*2 + .35;
      const crack = new M.Mesh(new M.PlaneGeometry(rnd(2,4.5), rnd(.06,.14)),
        new M.MeshBasicMaterial({ color: 0x05070c, transparent:true, opacity:.8 }));
      crack.rotation.x = -Math.PI/2; crack.rotation.z = a + rnd(-.2,.2);
      crack.position.set(Math.cos(a)*rnd(4,9), .315, Math.sin(a)*rnd(4,9));
      scene.add(crack);
    }
    // rune glyphs
    for (let i=0;i<10;i++){
      const a = i/10*Math.PI*2;
      const glyph = new M.Mesh(new M.PlaneGeometry(.5,.5),
        new M.MeshBasicMaterial({ color:0x1d4a70, transparent:true, opacity:.35 }));
      glyph.rotation.x = -Math.PI/2; glyph.rotation.z = a;
      glyph.position.set(Math.cos(a)*9, .32, Math.sin(a)*9); scene.add(glyph);
    }
    // pillars around arena
    for (let i=0;i<6;i++){
      const a = i/6*Math.PI*2 + .5;
      const h = rnd(4,7);
      const pil = new M.Mesh(new M.CylinderGeometry(.5,.6,h,8),
        new M.MeshStandardMaterial({ color: 0x1c2230, roughness:.9 }));
      pil.position.set(Math.cos(a)*15, h/2 - .3, Math.sin(a)*15); scene.add(pil);
      const flame = new M.PointLight(0x3a7bd5, .8, 12);
      flame.position.set(Math.cos(a)*15, 5, Math.sin(a)*15); scene.add(flame);
      arenaEls.flames.push(flame);
    }
    // embers
    const geo = new M.BufferGeometry(); const n = 120; const pts = new Float32Array(n*3);
    for (let i=0;i<n;i++){ pts[i*3]=rnd(-15,15); pts[i*3+1]=rnd(0,10); pts[i*3+2]=rnd(-15,15); }
    geo.setAttribute('position', new M.BufferAttribute(pts, 3));
    scene.userData.embers = new M.Points(geo, new M.PointsMaterial({ color:0x7ec8ff, size:.16, map:World.getDotTexture ? World.getDotTexture() : null,
      transparent:true, opacity:.7, blending:M.AdditiveBlending, depthWrite:false }));
    scene.add(scene.userData.embers);
  }

  // ---------- START / END ----------
  function start(worldEnemy) {
    if (!scene) buildScene();
    applyArenaTheme(typeof World !== 'undefined' ? World.zone : 'forest');
    active = true; enemy = worldEnemy;
    enemyDebuff = { dmg: 0, miss: 0, turns: 0 };
    Combat.cureAll(enemy);
    partyAil = { player:{ail:{}}, serah:{ail:{}}, kael:{ail:{}}, lyra:{ail:{}} };
    playerBuffs = { dodge: 0, defPct: 0, turns: 0, doubleHit: false, empower: false };
    RPG.player.cheatDeathUsed = false;
    if (RPG.player.ascended) endStarforged(true);

    // clear old models
    if (playerModel) scene.remove(playerModel.group);
    if (enemyModel) scene.remove(enemyModel.group);
    if (allyModel) scene.remove(allyModel.group);
    playerModel = WorldBuild(RPG.CLASSES[RPG.player.cls].color, false, 1);
    playerModel.group.position.set(-4.5, .3, -1); playerModel.group.rotation.y = Math.PI/2;
    scene.add(playerModel.group);
    // Serah the Sylvani — AI companion
    allyModel = buildRig(0x9fd4ff, false, .88, true);
    allyModel.group.position.set(-5.5, .3, 2.2); allyModel.group.rotation.y = Math.PI/2;
    // her Sylvani bow
    if (allyModel.sword) allyModel.body.remove(allyModel.sword);
    const bow = new M.Group();
    const arc = new M.Mesh(new M.TorusGeometry(.5, .035, 6, 14, Math.PI),
      new M.MeshStandardMaterial({ color: 0x8a6a3a, roughness: .5, metalness: .4 }));
    arc.rotation.z = -Math.PI/2; bow.add(arc);
    const string = new M.Mesh(new M.CylinderGeometry(.008, .008, 1, 4),
      new M.MeshBasicMaterial({ color: 0xdfe8f0 }));
    bow.add(string);
    bow.position.set(.55, 1.2, 0); bow.rotation.z = -.2;
    allyModel.body.add(bow);
    scene.add(allyModel.group);
    // Kael the Lancer — third party member (if rescued)
    if (kaelModel) { scene.remove(kaelModel.group); kaelModel = null; }
    if (RPG.player.flags && RPG.player.flags.kaelJoined) {
      kaelModel = buildRig(0xd4a24a, false, 1.02, true);
      kaelModel.group.position.set(-6.2, .3, -2.4); kaelModel.group.rotation.y = Math.PI/2;
      if (kaelModel.sword) kaelModel.body.remove(kaelModel.sword);
      const sp = World.buildWeaponMesh ? World.buildWeaponMesh('spear') : null;
      if (sp) { sp.position.set(.6, 1.15, 0); sp.rotation.z = -.4; kaelModel.body.add(sp); kaelModel.sword = sp; }
      scene.add(kaelModel.group);
      ui('kael-bars').classList.remove('hidden');
    } else ui('kael-bars').classList.add('hidden');
    kaelKO = false; kaelDefending = false; partyDef = 0; partyDefTurns = 0;
    // Lyra the Pyromancer — fourth party member (if freed from the Hollow Deep)
    if (lyraModel) { scene.remove(lyraModel.group); lyraModel = null; }
    if (RPG.player.flags && RPG.player.flags.lyraJoined) {
      lyraModel = buildRig(0xd8683a, false, .9, true);
      lyraModel.group.position.set(-6.8, .3, 4.2); lyraModel.group.rotation.y = Math.PI/2;
      if (lyraModel.sword) lyraModel.body.remove(lyraModel.sword);
      const stf = World.buildWeaponMesh ? World.buildWeaponMesh('staff') : null;
      if (stf) { stf.position.set(.6, 1.0, 0); stf.rotation.z = -.3; lyraModel.body.add(stf); lyraModel.sword = stf; }
      scene.add(lyraModel.group);
      ui('lyra-bars').classList.remove('hidden');
    } else ui('lyra-bars').classList.add('hidden');
    lyraKO = false; lyraDefending = false;

    enemyModel = World.makeEnemyModel(enemy, enemy.scale * (enemy.boss?1.6:1.3));
    enemyModel.group.position.set(4.5, .3, 0); enemyModel.group.rotation.y = -Math.PI/2;
    scene.add(enemyModel.group);
    if (enemy.boss) {
      const aura = new M.PointLight(0x8833ff, 1.6, 14); aura.position.y = 2.5; enemyModel.group.add(aura);
    }
    enemy.hpCur = enemy.hp;
    // party state
    currentActor = 'player'; serahKO = false; serahDefending = false; partyDodge = 0; partyDodgeTurns = 0;
    const ss = RPG.serahStats();
    if (RPG.player.serah.hp <= 0) RPG.player.serah.hp = Math.round(ss.maxHp * .6);
    const ks = RPG.kaelStats();
    if (RPG.player.kael.hp <= 0) RPG.player.kael.hp = Math.round(ks.maxHp * .6);
    const ls = RPG.lyraStats();
    if (RPG.player.lyra && RPG.player.lyra.hp <= 0) RPG.player.lyra.hp = Math.round(ls.maxHp * .6);
    ui('serah-bars').classList.remove('hidden');
    updateAllyBars();

    // herald shield hint
    if (enemy.shielded && (RPG.player.flags?.anchorsDestroyed || 0) < 3) {
      setTimeout(() => { if (active) log(`⚠ ${enemy.name} is shielded by the Shadow Anchors — destroy them at the shrine! (damage greatly reduced)`); }, 1400);
    }

    // boss HP bar
    if (enemy.boss) {
      ui('boss-bar').classList.remove('hidden');
      ui('boss-name').textContent = enemy.name.toUpperCase();
      lastBossHp = -1;
    } else ui('boss-bar').classList.add('hidden');

    camera.position.set(0, 6.5, 12.5); camera.lookAt(0, 1.4, 0);
    update(0.016); // render one battle frame immediately so no world frame lingers
    ui('battle-ui').classList.remove('hidden');
    ui('hud').classList.remove('hidden');
    document.body.classList.add('battle-mode');
    banner('⚔ ' + enemy.name.toUpperCase() + ' ⚔');
    AudioSys.play('encounter');
    log(`A wild ${enemy.name} appears! ${affinityBrief()}`);
    updateStatusUI();
    updateTurn('YOUR TURN');
    setTimeout(() => { if (active) showMenu(); }, 1200);
  }

  function end(victory) {
    active = false; ringState = null;
    // serah recovers after battle
    const sse = RPG.serahStats();
    RPG.player.serah.hp = Math.max(RPG.player.serah.hp, Math.round(sse.maxHp * .5));
    RPG.player.serah.mp = sse.maxMp;
    const kse = RPG.kaelStats();
    RPG.player.kael.hp = Math.max(RPG.player.kael.hp, Math.round(kse.maxHp * .5));
    RPG.player.kael.mp = kse.maxMp;
    if (RPG.player.lyra) {
      const lse = RPG.lyraStats();
      RPG.player.lyra.hp = Math.max(RPG.player.lyra.hp, Math.round(lse.maxHp * .5));
      RPG.player.lyra.mp = lse.maxMp;
    }
    ui('serah-bars').classList.add('hidden');
    ui('kael-bars').classList.add('hidden');
    ui('lyra-bars').classList.add('hidden');
    ui('boss-bar').classList.add('hidden');
    ui('battle-ui').classList.add('hidden');
    ui('battle-menu').classList.add('hidden');
    ui('battle-submenu').classList.add('hidden');
    ui('addition-ring').classList.add('hidden');
    ui('combo-counter').classList.add('hidden');
    if (ui('addition-name')) ui('addition-name').classList.add('hidden');
    if (ui('enemy-status')) ui('enemy-status').classList.add('hidden');
    document.body.classList.remove('battle-mode');
    if (RPG.player.ascended) endStarforged(true);
    if (victory) {
      World.removeEnemy(enemy);
      AudioSys.play('victory');
      showResults();
    } else {
      Main.onDefeat();
    }
    enemy = null;
  }

  function showResults() {
    const p = RPG.player;
    const xpG = enemy.xp, goldG = RPG.gainGold(enemy.gold);
    const prevLevel = p.level;
    const lvUps = RPG.gainXp(xpG);
    const fresh = lvUps ? RPG.newlyUnlockedAdditions(prevLevel) : [];
    p.spirit = Math.min(100, p.spirit + 15);
    UI.refreshHUD();
    ui('results-title').textContent = 'VICTORY'; ui('results-title').classList.remove('defeat');
    ui('results-body').innerHTML =
      `<div>+${xpG} XP &nbsp;·&nbsp; +${goldG} gold &nbsp;·&nbsp; +15% spirit</div>` +
      (lvUps ? `<div style="color:var(--gold-hi);font-size:20px">★ LEVEL UP! Now level ${p.level} ★<br><small>+3 attribute points · +1 skill point (press C / K)</small></div>` : '') +
      (fresh.length ? `<div style="color:var(--lod-ice);font-size:16px;margin-top:6px">🌀 New Addition learned: <b>${fresh.map(a=>a.icon+' '+a.name).join(', ')}</b><br><small>Choose it in battle under <b>Additions</b>.</small></div>` : '');
    ui('results-screen').classList.remove('hidden');
    if (lvUps) AudioSys.play('levelup');
    ui('btn-results-ok').onclick = () => { ui('results-screen').classList.add('hidden'); Main.toWorld(); };
  }

  // ---------- TURN FLOW ----------
  function updateTurn(t) { ui('turn-indicator').textContent = t; }
  function updateAllyBars() {
    const p = RPG.player; if (!p || !ui('serah-bars')) return;
    const ss = RPG.serahStats();
    ui('serah-hp').style.width = Math.max(0, p.serah.hp/ss.maxHp*100) + '%';
    ui('serah-mp').style.width = Math.max(0, p.serah.mp/ss.maxMp*100) + '%';
    ui('serah-bars').style.opacity = serahKO ? .4 : 1;
    if (ui('kael-bars') && kaelModel) {
      const ks = RPG.kaelStats();
      ui('kael-hp').style.width = Math.max(0, p.kael.hp/ks.maxHp*100) + '%';
      ui('kael-mp').style.width = Math.max(0, p.kael.mp/ks.maxMp*100) + '%';
      ui('kael-bars').style.opacity = kaelKO ? .4 : 1;
    }
    if (ui('lyra-bars') && lyraModel && p.lyra) {
      const ls = RPG.lyraStats();
      ui('lyra-hp').style.width = Math.max(0, p.lyra.hp/ls.maxHp*100) + '%';
      ui('lyra-mp').style.width = Math.max(0, p.lyra.mp/ls.maxMp*100) + '%';
      ui('lyra-bars').style.opacity = lyraKO ? .4 : 1;
    }
  }
  function banner(t) {
    const b = ui('battle-banner'); b.textContent = t; b.style.opacity = 1;
    setTimeout(()=> b.style.opacity = 0, 1600);
  }

  function showMenu() {
    if (!active) return;
    turn = 'player';
    updateTurn(currentActor === 'player'
      ? 'YOUR TURN — ' + RPG.player.name.toUpperCase()
      : 'YOUR TURN — ' + currentActor.toUpperCase());
    buildMenu();
    updateAllyBars();
    updateStatusUI();
  }
  function hideMenu(){ ui('battle-menu').classList.add('hidden'); ui('battle-submenu').classList.add('hidden'); }

  // ---------- ELEMENTAL RESOLUTION ----------
  // Every point of damage the party puts on the enemy goes through here so affinity,
  // ailment modifiers and the Shadow-Anchor shield are applied exactly once.
  function dealToEnemy(raw, element, opts = {}) {
    const zone = typeof World !== 'undefined' ? World.zone : 'forest';
    const r = Combat.strike(enemy, raw, element || 'phys', zone);
    let dmg = r.dmg;
    if (enemy.shielded && (RPG.player.flags?.anchorsDestroyed || 0) < 3) dmg = Math.max(1, Math.round(dmg * .15));
    enemy.hpCur -= dmg;
    if (opts.floater !== false) {
      UI.floaterAt(project(enemyModel.group.position, opts.yOff || 2.3), dmg + (r.label ? ' ' + r.label : ''),
        r.tag === 'weak' ? 'weak' : r.tag === 'resist' ? 'resist' : (opts.cls || ''));
    }
    // schools that carry a signature ailment get a roll, weighted by how badly it lands
    if (opts.ailment !== false && element && element !== 'phys')
      applyEnemyAilment(Combat.rollElementAilment(enemy, element, dmg, r.mult, opts.ailBonus || 0));
    return { ...r, dmg };
  }
  function applyEnemyAilment(def) {
    if (!def) return;
    AudioSys.play(def.el === 'fire' ? 'fire' : def.el === 'ice' ? 'ice' : def.el === 'lightning' ? 'lightning' : 'hit');
    log(`${enemy.name} is <b style="color:${def.color}">${def.name.toUpperCase()}</b> — ${def.desc}`);
    updateStatusUI();
  }
  // A one-line read on what this thing fears, shown when the fight opens.
  function affinityBrief() {
    const zone = typeof World !== 'undefined' ? World.zone : 'forest';
    const weak = [], strong = [];
    for (const el of Combat.ELEMENT_KEYS) {
      const tag = Combat.affinityTag(Combat.affinity(enemy, el, zone));
      if (tag === 'weak') weak.push(Combat.ELEMENTS[el].icon);
      else if (tag === 'resist') strong.push(Combat.ELEMENTS[el].icon);
    }
    return (weak.length ? `<span class="aff-weak">weak ${weak.join('')}</span> ` : '')
         + (strong.length ? `<span class="aff-resist">resists ${strong.join('')}</span>` : '');
  }
  // ---------- STATUS STRIPS ----------
  function ailChips(holder) {
    return Combat.listAilments(holder)
      .map(a => `<span class="ail-chip" style="border-color:${a.color};color:${a.color}" title="${a.name} — ${a.desc} (${a.turns} turn${a.turns>1?'s':''})">${a.icon}<i>${a.turns}</i></span>`)
      .join('');
  }
  function updateStatusUI() {
    const es = ui('enemy-status');
    if (es) {
      const zone = typeof World !== 'undefined' ? World.zone : 'forest';
      const aff = enemy ? Combat.ELEMENT_KEYS.map(el => {
        const tag = Combat.affinityTag(Combat.affinity(enemy, el, zone));
        return tag ? `<span class="aff-pip ${tag}" title="${Combat.ELEMENTS[el].name}: ${tag === 'weak' ? 'weak to' : 'resists'}">${Combat.ELEMENTS[el].icon}</span>` : '';
      }).join('') : '';
      es.innerHTML = enemy ? `<span class="es-name">${enemy.name}</span>${aff}${ailChips(enemy)}` : '';
      es.classList.toggle('hidden', !enemy || !active);
    }
    for (const who of ['player','serah','kael','lyra']) {
      const el = ui(who + '-ail'); if (!el) continue;
      el.innerHTML = ailChips(partyAil[who]);
    }
  }

  // ---------- ADDITION SYSTEM ----------
  /* Runs one named Addition. `add` carries its own beat count, timing windows and
     ring speed, so Whirlwind Sting and Blazing Dynamo genuinely play differently. */
  function runAddition(add, onDone) {
    const chainMax = add.beats;
    let chain = 0, totalMult = 0, perfects = 0;
    const ring = ui('addition-ring'), shrink = ui('ring-shrink'), judge = ui('ring-judge'), combo = ui('combo-counter');
    const nameEl = ui('addition-name');
    if (nameEl) { nameEl.innerHTML = `${add.icon} ${add.name}<i>${chainMax} beats</i>`; nameEl.classList.remove('hidden'); }
    ring.classList.remove('hidden'); combo.classList.remove('hidden');

    function oneBeat() {
      if (!active || chain >= chainMax) { finish(); return; }
      const last = chain === chainMax - 1;
      combo.textContent = chain > 0 ? `${chain} HIT${chain>1?'S':''}!` : 'READY…';
      combo.classList.toggle('finisher', last && !!add.finisher);
      // each beat closes faster than the last — the chain fights you as it grows
      const dur = Math.max(.42, add.speed - chain*.075);
      const startT = performance.now();
      ringState = { t: 0, dur, pressed: false, window: add.window };
      AudioSys.play('swing');
      lunge(actorModel() || playerModel, enemyModel, .35);

      function frame(now) {
        if (!ringState || !active) return;
        const t = (now - startT) / (dur*1000);
        ringState.t = t;
        const size = 260 - (260-92)*Math.min(1, t);
        shrink.style.width = shrink.style.height = size + 'px';
        shrink.style.left = -size/2 + 'px'; shrink.style.top = -size/2 + 'px';
        if (ringState.pressed) return;
        if (t >= 1.25) { // timed out
          ringState = null; judgeBeat('MISS', 0);
        } else requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);

      function judgeBeat(verdict, quality) {
        if (verdict === 'MISS') {
          judge.textContent = 'MISS'; judge.style.color = '#ff5555'; AudioSys.play('miss');
          judge.classList.remove('pop'); void judge.offsetWidth; judge.classList.add('pop');
          finish(); return;
        }
        chain++;
        const isPerf = verdict === 'PERFECT';
        if (isPerf) perfects++;
        const mult = isPerf ? 1.5 : 1.0;
        totalMult += mult;
        judge.textContent = verdict + '!'; judge.style.color = isPerf ? 'var(--lod-ice)' : 'var(--gold-hi)';
        judge.classList.remove('pop'); void judge.offsetWidth; judge.classList.add('pop');
        AudioSys.play(isPerf ? 'perfect' : 'hit');
        beatFX(enemyModel, chain, isPerf);
        RPG.player.spirit = Math.min(100, RPG.player.spirit + (isPerf ? add.spirit : Math.round(add.spirit*.7)));
        UI.refreshHUD();
        setTimeout(oneBeat, 260);
      }
      ringState.judge = () => { // Space pressed
        const t = ringState.t;
        const w = ringState.window;
        ringState.pressed = true;
        let verdict, q;
        const err = Math.abs(t - 1);
        if (err <= w.perfect) { verdict = 'PERFECT'; q = 1; }
        else if (err <= w.good) { verdict = 'GOOD'; q = .7; }
        else { verdict = 'MISS'; q = 0; }
        ringState = null;
        judgeBeat(verdict, q);
      };
    }

    function finish() {
      ring.classList.add('hidden');
      if (nameEl) nameEl.classList.add('hidden');
      const full = chain >= chainMax;
      combo.textContent = chain > 0 ? (full ? `${add.name.toUpperCase()} — ${chain} HITS!` : `${chain}-HIT ADDITION!`) : '';
      combo.classList.toggle('finisher', full && !!add.finisher);
      setTimeout(()=> { combo.classList.add('hidden'); combo.classList.remove('finisher'); }, 900);
      onDone(chain, totalMult, perfects, full);
    }
    oneBeat();
  }
  /* Allies don't have named Additions — they get an honest chain built from their stats. */
  function allyAddition(who, chainMax) {
    return { id:'ally_'+who, name:'Chain', icon:'⚔', beats:chainMax, mult:1,
             window:{ perfect:.09, good:.22 }, speed:.98, spirit:3 };
  }

  function pressAddition() {
    if (ringState && ringState.judge) {
      if (window.__autoPerfect) ringState.t = 1; // test hook: force PERFECT timing
      ringState.judge();
    }
  }

  // ---------- ANIMATION HELPERS ----------
  function lunge(model, target, power=1) {
    const from = model.group.position.clone();
    const to = target.group.position.clone().lerp(from, .35);
    const up = { v: 0 };
    const dur = 320;
    const startT = performance.now();
    (function frame(now){
      const t = Math.min(1, (now-startT)/dur);
      const k = t < .5 ? t*2 : (1-t)*2;
      model.group.position.lerpVectors(from, to, k*power);
      model.armR && (model.armR.rotation.x = -Math.sin(k*Math.PI)*2*power);
      model.sword && (model.sword.rotation.z = -.4 - Math.sin(k*Math.PI)*1.6*power);
      if (t < 1) requestAnimationFrame(frame);
      else { model.group.position.copy(from);
        if (model.armR) model.armR.rotation.x = 0;
        if (model.sword) model.sword.rotation.z = -.4; }
    })(performance.now());
  }

  function impactFX(model, strong) {
    const pos = model.group.position;
    for (let i=0;i<(strong?14:8);i++){
      const p = new M.Mesh(new M.SphereGeometry(rnd(.05,.14), 6, 6),
        new M.MeshBasicMaterial({ color: strong?0x7ec8ff:0xffcc66 }));
      p.position.set(pos.x+rnd(-.5,.5), pos.y+rnd(.8,2), pos.z+rnd(-.5,.5));
      p.userData.v = new M.Vector3(rnd(-3,3), rnd(2,6), rnd(-3,3));
      p.userData.life = 1;
      scene.add(p); (scene.userData.fx ||= []).push(p);
    }
    shake(strong ? .5 : .25);
  }
  function elementalFX(type, model) {
    const colors = { fire:0xff5522, ice:0x99ddff, lightning:0xeeff66, arcane:0xcc88ff, phys:0xffcc66 };
    const col = colors[type] || 0xffffff;
    for (let i=0;i<26;i++){
      const p = new M.Mesh(new M.SphereGeometry(rnd(.06,.2), 6, 6),
        new M.MeshBasicMaterial({ color: col, transparent:true }));
      const pos = model.group.position;
      p.position.set(pos.x+rnd(-1,1), pos.y+rnd(.5,2.5), pos.z+rnd(-1,1));
      p.userData.v = new M.Vector3(rnd(-4,4), rnd(1,7), rnd(-4,4));
      p.userData.life = 1.4;
      scene.add(p); (scene.userData.fx ||= []).push(p);
    }
    const flash = new M.PointLight(col, 3, 12); flash.position.copy(model.group.position).setY(2);
    scene.add(flash); setTimeout(()=> scene.remove(flash), 220);
    AudioSys.play(type==='fire'?'fire':type==='ice'?'ice':type==='lightning'?'lightning':'hit');
    shake(.6);
  }

  // expanding shockwave ring — reused by beats, boss deaths, golem slams, ascend cinematic
  function flashRing(pos, color, maxR=6, dur=500) {
    const ringM = new M.Mesh(new M.TorusGeometry(1, .1, 8, 40),
      new M.MeshBasicMaterial({ color, transparent:true, opacity:.95, blending:M.AdditiveBlending, depthWrite:false, side:M.DoubleSide }));
    ringM.rotation.x = Math.PI/2; ringM.position.set(pos.x, .45, pos.z);
    scene.add(ringM);
    const st = performance.now();
    (function frame(now){ const t = (now-st)/dur;
      if (t >= 1) { scene.remove(ringM); return; }
      ringM.scale.setScalar(.5 + t*maxR); ringM.material.opacity = .95*(1-t);
      requestAnimationFrame(frame); })(st);
  }
  // escalating per-beat Addition impact — each chained hit lands harder and brighter
  function beatFX(model, chain, perfect) {
    const pos = model.group.position;
    const col = perfect ? 0x9adfff : [0xffcc66, 0xffb84d, 0xffa233, 0xff8a1a][Math.min(3, chain-1)];
    const n = 6 + chain*3 + (perfect ? 6 : 0);
    for (let i=0;i<n;i++){
      const p = new M.Mesh(new M.SphereGeometry(rnd(.05, .13 + (perfect ? .05 : 0)), 6, 6),
        new M.MeshBasicMaterial({ color: col }));
      p.position.set(pos.x+rnd(-.6,.6), pos.y+rnd(.7,2.3), pos.z+rnd(-.6,.6));
      p.userData.v = new M.Vector3(rnd(-4,4), rnd(2.5,7.5), rnd(-4,4));
      p.userData.life = 1.1;
      scene.add(p); (scene.userData.fx ||= []).push(p);
    }
    slashFX(model, perfect); // an arc on every landed beat
    if (perfect) flashRing(pos, 0x9adfff, 5, 420);
    if (chain >= 3) fovPunch();
    shake(.25 + chain*.1 + (perfect ? .2 : 0));
  }

  function slashFX(model, strong) {
    const arc = new M.Mesh(new M.TorusGeometry(strong?1.5:1.1, .07, 6, 14, Math.PI*.9),
      new M.MeshBasicMaterial({ color: strong?0xffdd66:0xbfe8ff, transparent:true, opacity:.95,
        blending:M.AdditiveBlending, depthWrite:false, side:M.DoubleSide }));
    const pos = model.group.position;
    arc.position.set(pos.x, pos.y + 1.4, pos.z + .2);
    arc.rotation.z = rnd(0, Math.PI*2);
    scene.add(arc);
    const startT = performance.now();
    (function frame(now){
      const t = (now-startT)/260;
      if (t >= 1) { scene.remove(arc); return; }
      arc.scale.setScalar(.6 + t*.9);
      arc.material.opacity = .95 * (1-t);
      arc.rotation.z += .12;
      requestAnimationFrame(frame);
    })(startT);
    impactFX(model, strong);
  }
  function projectileFX(from, to, color) {
    return new Promise(resolve => {
      const orb = new M.Mesh(new M.SphereGeometry(.14, 8, 8),
        new M.MeshBasicMaterial({ color }));
      const a = from.group.position.clone(); a.y += 1.5;
      const b = to.group.position.clone(); b.y += 1.4;
      orb.position.copy(a);
      const glow = new M.PointLight(color, 1.5, 6); orb.add(glow);
      scene.add(orb);
      const startT = performance.now();
      (function frame(now){
        const t = Math.min(1, (now-startT)/300);
        orb.position.lerpVectors(a, b, t);
        if (t < 1) requestAnimationFrame(frame);
        else { scene.remove(orb); resolve(); }
      })(startT);
    });
  }

  let shakeAmt = 0;
  function shake(a){ shakeAmt = Math.max(shakeAmt, a); }
  function vignette() {
    const v = ui('vignette'); if (!v) return;
    v.classList.remove('hit'); void v.offsetWidth; v.classList.add('hit');
  }
  function fovPunch() {
    const base = camera.fov;
    camera.fov = Math.max(35, base - 5); camera.updateProjectionMatrix();
    setTimeout(() => { camera.fov = base; camera.updateProjectionMatrix(); }, 110);
  }

  // ---------- PARTY TURN FLOW ----------
  function buildMenu() {
    const menu = ui('battle-menu'); menu.innerHTML = '';
    const p = RPG.player;
    const isPlayer = currentActor === 'player';
    const mkBtn = (label, sub, fn, disabled=false) => {
      const b = document.createElement('button'); b.className = 'battle-btn';
      b.innerHTML = `${label} <small>${sub}</small>`; b.disabled = disabled;
      b.onclick = () => { AudioSys.play('click'); fn(); };
      menu.appendChild(b);
    };
    if (isPlayer) {
      const add = RPG.currentAddition();
      const lv = RPG.additionLevel(add.id);
      mkBtn(`${add.icon} ${add.name}`,
        `${add.beats} beats · mastery ${lv}/${Combat.MASTERY_MAX}${add.finisher ? ' · ' + Combat.ELEMENTS[add.finisher.element].icon + ' finisher' : ''}`,
        () => doAttack());
      if (Combat.unlockedAdditions(p.cls, p.level).length > 1)
        mkBtn('🌀 Additions', 'switch chain — free action', () => openAdditions());
    } else mkBtn('⚔ Attack', 'Addition combo', () => doAttack());
    mkBtn('✦ Skills', 'MP cost', () => openSkills());
    mkBtn('✚ Items', 'potions', () => openItems());
    if (isPlayer) mkBtn('🐉 Starforged', p.ascended ? 'ASCENDED' : `needs 100% (${Math.floor(p.spirit)}%)`,
      () => doStarforged(), !(p.spirit >= 100 && !p.ascended));
    mkBtn('🛡 Defend', 'half damage' + (isPlayer ? ', +spirit' : ''), () => doDefend());
    menu.classList.remove('hidden');
    ui('battle-submenu').classList.add('hidden');
  }
  function serahPhase() {
    if (!active) return;
    if (serahKO) { kaelPhase(); return; }
    currentActor = 'serah';
    showMenu();
  }
  function kaelPhase() {
    if (!active) return;
    if (!kaelModel || kaelKO) { lyraPhase(); return; }
    currentActor = 'kael';
    showMenu();
  }
  function lyraPhase() {
    if (!active) return;
    // last ally phase — if no pyromancer, hand the turn back to the player before the enemy acts
    if (!lyraModel || lyraKO) { currentActor = 'player'; enemyTurn(); return; }
    currentActor = 'lyra';
    showMenu();
  }
  function afterActorAction() {
    if (currentActor === 'player') serahPhase();
    else if (currentActor === 'serah') kaelPhase();
    else if (currentActor === 'kael') lyraPhase();
    else { currentActor = 'player'; enemyTurn(); }
  }

  // ---------- PLAYER ACTIONS ----------
  function actorModel() { return currentActor === 'player' ? playerModel : currentActor === 'serah' ? allyModel : currentActor === 'kael' ? kaelModel : lyraModel; }
  function actorStats() {
    const p = RPG.player;
    if (currentActor === 'player') return { atk: p.attack, critCh: p.critChance, chainMax: RPG.CLASSES[p.cls].additionCount + (p.ascended ? 2 : 0) };
    const s = currentActor === 'serah' ? RPG.serahStats() : currentActor === 'kael' ? RPG.kaelStats() : RPG.lyraStats();
    return { atk: s.attack, critCh: s.critChance, chainMax: s.chainMax };
  }

  async function doAttack() {
    hideMenu();
    const p = RPG.player;
    const isPlayer = currentActor === 'player';
    const A = actorStats();
    const atk = A.atk, critCh = A.critCh;
    const add = isPlayer ? RPG.currentAddition() : allyAddition(currentActor, A.chainMax);
    const mastery = isPlayer ? Combat.masteryMult(RPG.additionUses(add.id)) : 1;
    runAddition(add, async (chain, totalMult, perfects, full) => {
      if (!active) return;
      if (chain > 0) {
        // chain scalar × the Addition's own weight × how well you know it × gear
        let dmg = atk * (0.45 + totalMult*0.42) * add.mult * mastery;
        if (isPlayer) dmg *= (1 + (p.additionBonus || 0));
        if (isPlayer && p.ascended) dmg *= 1.6;
        dmg *= Combat.outgoingMult(partyAil[currentActor]);
        const crit = Math.random() < critCh;
        if (crit) dmg *= p.critMult;
        dmg = Math.max(1, Math.round(dmg * rnd(.9,1.1)));
        if (isPlayer && playerBuffs.doubleHit) { dmg = Math.round(dmg * 1.8); playerBuffs.doubleHit = false; log('Shadow clone strikes!'); }
        slashFX(enemyModel, crit);
        if (crit) fovPunch();
        const res = dealToEnemy(dmg, 'phys', { cls: crit ? 'crit' : '', ailment: false });
        if (isPlayer && p.lifeLeech > 0) { p.hp = Math.min(p.maxHp, p.hp + Math.round(res.dmg*p.lifeLeech)); }
        log(`${isPlayer ? add.name : currentActor.charAt(0).toUpperCase()+currentActor.slice(1)+': '}` +
            ` — ${chain}-hit Addition for ${res.dmg}${crit?' — CRITICAL!':''}${res.label?' — '+res.label:''}`);
        // credit mastery for the chain you actually threw, even if it was the killing blow
        const masteryUp = isPlayer ? RPG.logAdditionUse(add.id) : 0;
        await wait(560);
        if (checkEnemyDead()) { if (masteryUp) announceMastery(add, masteryUp); return; }
        // the finisher only fires when the whole chain landed — that's what the last beat is for
        if (full && add.finisher && enemy.hpCur > 0) {
          await finisherStrike(add, res.dmg);
          if (checkEnemyDead()) { if (masteryUp) announceMastery(add, masteryUp); return; }
        }
        if (masteryUp) { announceMastery(add, masteryUp); await wait(900); }
      } else {
        // whiffing the opening beat still swings the weapon — a glancing blow, no chain credit
        const glance = Math.max(1, Math.round(atk * .3 * Combat.outgoingMult(partyAil[currentActor])));
        slashFX(enemyModel, false);
        const res = dealToEnemy(glance, 'phys', { ailment: false });
        log(`The Addition breaks apart — only a glancing blow for ${res.dmg}.`);
        await wait(500);
        if (checkEnemyDead()) return;
      }
      afterActorAction();
    });
  }
  function announceMastery(add, lv) {
    banner(`✦ ${add.name.toUpperCase()} — MASTERY ${lv} ✦`);
    AudioSys.play('levelup');
    toast(`✦ <b>${add.name}</b> reaches Mastery ${lv} — +${Math.round((Combat.masteryMult(RPG.additionUses(add.id))-1)*100)}% chain damage.`, 'var(--gold)');
  }
  /* The last beat of a full chain carries its own school — and often an ailment with it. */
  async function finisherStrike(add, chainDmg) {
    const f = add.finisher;
    const el = f.element || 'phys';
    banner(`${Combat.ELEMENTS[el].icon} ${add.name.toUpperCase()} — FINISH ${Combat.ELEMENTS[el].icon}`);
    elementalFX(el, enemyModel);
    flashRing(enemyModel.group.position, Combat.ELEMENTS[el].hex, 7, 520);
    fovPunch(); shake(.9);
    await wait(260);
    const res = dealToEnemy(Math.round(chainDmg * .45), el, { cls:'perfect', yOff:2.7, ailment:false });
    log(`<b>${add.name}</b> finishes for ${res.dmg} ${Combat.ELEMENTS[el].name.toLowerCase()} damage${res.label?' — '+res.label:''}.`);
    await wait(520);
    // give the finisher line a beat to be read before the ailment banner replaces it
    if (f.ailment) {
      const zone = typeof World !== 'undefined' ? World.zone : 'forest';
      const affMult = Combat.affinity(enemy, el, zone);
      const got = Combat.inflict(enemy, f.ailment, res.dmg, Math.min(.95, (f.chance || .5) * Math.max(.5, affMult)));
      if (got) { applyEnemyAilment(got); await wait(420); }
    }
  }

  async function doSkill(skill) {
    if (currentActor !== 'player') return doAllySkill(skill);
    hideMenu();
    const p = RPG.player;
    const rank = RPG.skillRank(skill.id);
    if (p.mp < skill.mp) { log('Not enough MP!'); showMenu(); return; }
    p.mp -= skill.mp; UI.refreshHUD();

    if (skill.type === 'heal') {
      const amt = Math.round(p.maxHp * (skill.mult + skill.per*rank));
      p.hp = Math.min(p.maxHp, p.hp + amt);
      elementalFX('ice', playerModel); AudioSys.play('heal');
      UI.floaterAt(project(playerModel.group.position, 2.2), '+'+amt, 'perfect');
      log(`${skill.name} restores ${amt} HP.`);
    } else if (skill.type === 'buff') {
      if (skill.stat === 'dodge') { playerBuffs.dodge = skill.per*rank; playerBuffs.turns = skill.turns; }
      if (skill.stat === 'defPct') { playerBuffs.defPct = skill.per*rank; playerBuffs.turns = skill.turns; }
      if (skill.stat === 'doubleHit') playerBuffs.doubleHit = true;
      if (skill.stat === 'empower') { p.mp = Math.min(p.maxMp, p.mp + Math.round(p.maxMp*(skill.per*rank))); playerBuffs.empower = true; }
      elementalFX('arcane', playerModel);
      log(`${skill.name} activated!`);
    } else if (skill.type === 'debuff') {
      enemyDebuff.dmg = .2 + skill.per*rank; enemyDebuff.turns = 3;
      if (skill.id === 'smoke_bomb') enemyDebuff.miss = .3 + skill.per*rank;
      elementalFX('arcane', enemyModel);
      log(`${enemy.name} is weakened!`);
      // Dragon Roar rattles a thing badly enough to curse it
      if (skill.id === 'dragon_roar') applyEnemyAilment(Combat.inflict(enemy, 'curse', 0, .6));
    } else { // damage skill
      if (skill.type !== 'phys') { // cast pose: raise the casting arm
        const arm = playerModel.armR, st = performance.now();
        if (arm) (function frame(now){ const t = Math.min(1,(now-st)/350);
          arm.rotation.x = -Math.sin(t*Math.PI)*2.2;
          if (t<1) requestAnimationFrame(frame); else arm.rotation.x = 0; })(st);
      }
      lunge(playerModel, enemyModel, .6);
      await wait(300);
      let mult = skill.mult + skill.per*rank;
      if (skill.ascendBoost && p.ascended) mult *= skill.ascendBoost;
      let dmg = p.attack * p.spellPower * mult;
      if (p.ascended) dmg *= 1.6;
      dmg *= Combat.outgoingMult(partyAil.player);
      let crit = skill.alwaysCrit || Math.random() < (p.critChance + (skill.critBonus||0));
      if (crit) dmg *= p.critMult;
      if (playerBuffs.empower) { dmg *= 1.5; playerBuffs.empower = false; }
      dmg = Math.max(1, Math.round(dmg * rnd(.9,1.1)));
      elementalFX(skill.type, enemyModel);
      // skills flagged `dot` are built to stick — they get a much better ailment roll
      const res = dealToEnemy(dmg, skill.type, { cls: crit?'crit':'perfect', yOff:2.4, ailBonus: skill.dot ? .5 : 0 });
      log(`${skill.name} hits for ${res.dmg} ${skill.type} damage${crit?' — CRITICAL!':''}${res.label?' — <b>'+res.label+'</b>':''}`);
      if (skill.slow) { enemy.speed = Math.max(.5, enemy.speed - .3);
        applyEnemyAilment(Combat.inflict(enemy, 'chill', res.dmg, .7)); }
      if (p.lifeLeech > 0) p.hp = Math.min(p.maxHp, p.hp + Math.round(res.dmg*p.lifeLeech));
      p.spirit = Math.min(100, p.spirit + 8); UI.refreshHUD();
      await wait(700);
      if (checkEnemyDead()) return;
    }
    afterActorAction();
  }

  async function doAllySkill(skill) {
    hideMenu();
    const p = RPG.player;
    const who = currentActor; // 'serah' | 'kael' | 'lyra'
    const isSerah = who === 'serah', isKael = who === 'kael', isLyra = who === 'lyra';
    const ss = isSerah ? RPG.serahStats() : isKael ? RPG.kaelStats() : RPG.lyraStats();
    const pool = p[who];
    const model = isSerah ? allyModel : isKael ? kaelModel : lyraModel;
    if (pool.mp < skill.mp) { log(`${currentActor} is out of MP!`); showMenu(); return; }
    pool.mp -= skill.mp;
    if (skill.type === 'heal') {
      const amt = Math.round(p.maxHp * skill.mult);
      p.hp = Math.min(p.maxHp, p.hp + amt);
      elementalFX(isLyra ? 'fire' : 'ice', model); AudioSys.play('heal');
      UI.floaterAt(project(playerModel.group.position, 2.2), '+'+amt, 'perfect');
      log(`${isSerah ? "Serah's Sylvan Light" : isLyra ? "Lyra's Cauterize sears the wounds shut —" : "Kael's rally"} restores ${amt} HP.`);
      // each healer clears what it is good for: Sylvani light burns off a curse,
      // Lyra's cautery closes bleeding and boils out poison
      const cured = isSerah ? ['curse','chill'] : isLyra ? ['bleed','poison','chill'] : ['bleed'];
      const gone = cured.filter(id => Combat.hasAilment(partyAil.player, id));
      for (const id of gone) Combat.cure(partyAil.player, id);
      if (gone.length) { log(`…and clears <b>${gone.map(id => Combat.AILMENTS[id].name).join(', ')}</b>.`); updateStatusUI(); }
      UI.refreshHUD();
    } else if (skill.type === 'buff') {
      if (isSerah) { partyDodge = skill.mult; partyDodgeTurns = 3;
        log('Tailwind wraps the party — +18% dodge for 3 turns!'); }
      else { partyDef = skill.mult; partyDefTurns = 3;
        log('Bulwark! The party gains +25% defense for 3 turns!'); }
      elementalFX('arcane', model);
    } else {
      if (isSerah) { // bow draw lean
        const st = performance.now(), b = model.group;
        (function frame(now){ const t = Math.min(1,(now-st)/300);
          b.rotation.x = -Math.sin(t*Math.PI)*.18;
          if (t<1) requestAnimationFrame(frame); else b.rotation.x = 0; })(st);
      } else if (isLyra) { // two-handed cast pose
        const arm = model.armR, st = performance.now();
        if (arm) (function frame(now){ const t = Math.min(1,(now-st)/380);
          arm.rotation.x = -Math.sin(t*Math.PI)*2.4;
          if (t<1) requestAnimationFrame(frame); else arm.rotation.x = 0; })(st);
        elementalFX('fire', model);
      } else lunge(model, enemyModel, 1.0); // spear thrust
      await wait(200);
      await projectileFX(model, enemyModel, isSerah ? 0xbfe8ff : isLyra ? 0xff8a3a : 0xffcc66);
      let dmg = ss.attack * skill.mult * Combat.outgoingMult(partyAil[who]);
      const crit = Math.random() < (ss.critChance + (skill.critBonus||0));
      if (crit) dmg *= ss.critMult;
      dmg = Math.max(1, Math.round(dmg * rnd(.9,1.1)));
      if (isLyra) elementalFX('fire', enemyModel); else slashFX(enemyModel, crit);
      if (crit) fovPunch();
      const res = dealToEnemy(dmg, skill.type || 'phys', { cls: crit?'crit':'perfect', yOff:2.4 });
      log(`${isSerah?'Serah':isLyra?'Lyra':'Kael'}'s ${skill.name} hits for ${res.dmg}${crit?' — CRITICAL!':''}${res.label?' — <b>'+res.label+'</b>':''}`);
      await wait(500);
      if (checkEnemyDead()) return;
    }
    updateAllyBars();
    afterActorAction();
  }

  async function doItem(kind) {
    hideMenu();
    const p = RPG.player;
    if (p.potions[kind] <= 0) { log('None left!'); showMenu(); return; }
    p.potions[kind]--;
    AudioSys.play('potion');
    if (kind === 'hp') { const amt = Math.round(p.maxHp*.4); p.hp = Math.min(p.maxHp, p.hp+amt);
      UI.floaterAt(project(playerModel.group.position, 2.2), '+'+amt, 'perfect'); log(`Healing potion restores ${amt} HP.`); }
    else { const amt = Math.round(p.maxMp*.4); p.mp = Math.min(p.maxMp, p.mp+amt); log(`Mana potion restores ${amt} MP.`); }
    UI.refreshHUD();
    await wait(500); afterActorAction();
  }

  async function doDefend() {
    hideMenu();
    const isPlayer = currentActor === 'player';
    if (isPlayer) {
      playerBuffs.defending = true;
      RPG.player.spirit = Math.min(100, RPG.player.spirit + 12); UI.refreshHUD();
      elementalFX('ice', playerModel);
      log('You brace for impact. (+12% spirit)');
    } else {
      if (currentActor === 'serah') serahDefending = true;
      else if (currentActor === 'kael') kaelDefending = true;
      else lyraDefending = true;
      elementalFX('ice', actorModel());
      log(`${currentActor.charAt(0).toUpperCase()+currentActor.slice(1)} takes a defensive stance.`);
    }
    await wait(450); afterActorAction();
  }

  // ---------- STARFORGED FORM ----------
  async function doStarforged() {
    hideMenu();
    const p = RPG.player;
    if (p.spirit < 100 || p.ascended) return;
    p.spirit = 0; p.ascended = true; ascendTurns = 4;
    banner('🐉 STARFORGED ASCENSION 🐉');
    AudioSys.play('transform');
    // --- cinematic: camera pushes in, a pillar of spirit fire erupts ---
    const baseFov = camera.fov;
    camera.fov = Math.max(30, baseFov - 12); camera.updateProjectionMatrix();
    const pillar = new M.Mesh(new M.CylinderGeometry(1.1, 1.5, 9, 18, 1, true),
      new M.MeshBasicMaterial({ color: 0x66ccff, transparent:true, opacity:.5, blending:M.AdditiveBlending, depthWrite:false, side:M.DoubleSide }));
    pillar.position.copy(playerModel.group.position); pillar.position.y = 4.5;
    scene.add(pillar);
    const pillarLight = new M.PointLight(0x66ccff, 3.5, 18);
    pillarLight.position.copy(playerModel.group.position); pillarLight.position.y = 3;
    scene.add(pillarLight);
    const cineT = performance.now();
    let waveT = 0;
    (function frame(now){ const t = (now-cineT)/2000;
      if (t >= 1) { scene.remove(pillar); scene.remove(pillarLight);
        camera.fov = baseFov; camera.updateProjectionMatrix(); return; }
      pillar.rotation.y += .25;
      pillar.material.opacity = Math.max(0, .55*(1-Math.abs(t-.55)*1.3));
      pillar.position.y = 4.5 - t*1.5;
      waveT -= .016;
      if (waveT <= 0) { waveT = .5; flashRing(playerModel.group.position, 0x66ccff, 7, 600); }
      requestAnimationFrame(frame); })(cineT);
    // feather sparks burst outward
    for (let i=0;i<30;i++){
      const fp = new M.Mesh(new M.PlaneGeometry(.18,.3),
        new M.MeshBasicMaterial({ color: i%2?0xbfe8ff:0x66ccff, transparent:true, opacity:.9, side:M.DoubleSide }));
      const a = rnd(0,Math.PI*2);
      fp.position.set(playerModel.group.position.x+Math.cos(a)*.5, 1.2, playerModel.group.position.z+Math.sin(a)*.5);
      fp.userData.v = new M.Vector3(Math.cos(a)*rnd(2,5), rnd(3,7), Math.sin(a)*rnd(2,5));
      fp.userData.life = 1.5;
      scene.add(fp); (scene.userData.fx ||= []).push(fp);
    }
    shake(1.4);
    await wait(700);
    AudioSys.play('ascend');
    // wings — layered glowing energy feathers
    ascendWings = new M.Group();
    for (const side of [-1,1]) {
      const wing = new M.Group();
      for (let f=0; f<3; f++) {
        const shape = new M.Shape();
        shape.moveTo(0, 0);
        shape.lineTo(side*(1.1+f*.45), .55+f*.28);
        shape.lineTo(side*(1.5+f*.5), .1+f*.12);
        shape.lineTo(side*(.5+f*.2), -.15);
        shape.lineTo(0, 0);
        const feather = new M.Mesh(new M.ShapeGeometry(shape),
          new M.MeshBasicMaterial({ color: f===0?0xbfe8ff:0x66ccff, transparent:true,
            opacity:.55-f*.1, side:M.DoubleSide, blending:M.AdditiveBlending, depthWrite:false }));
        wing.add(feather);
      }
      wing.position.set(side*.3, 1.55, -.35);
      wing.rotation.y = side*.35;
      ascendWings.add(wing);
    }
    playerModel.group.add(ascendWings);
    const glow = new M.PointLight(0x66ccff, 2.5, 10); glow.position.y = 2; glow.name = 'ascendGlow';
    playerModel.group.add(glow);
    playerModel.group.traverse(o => { if (o.material && o.material.emissive) { o.userData.oldEm = o.material.emissive.getHex(); o.material.emissive.setHex(0x2266aa); o.material.emissiveIntensity = .6; } });
    log('The Starheart ignites! All damage +60% for 4 turns!');
    await wait(1500);
    showMenu();
  }
  function endStarforged(silent) {
    const p = RPG.player; p.ascended = false;
    if (ascendWings) { playerModel.group.remove(ascendWings); ascendWings = null; }
    const glow = playerModel.group.getObjectByName('ascendGlow');
    if (glow) playerModel.group.remove(glow);
    playerModel.group.traverse(o => { if (o.material && o.material.emissive && o.userData.oldEm !== undefined) { o.material.emissive.setHex(o.userData.oldEm); o.material.emissiveIntensity = .3; delete o.userData.oldEm; } });
    if (!silent) log('The Starforged form fades…');
  }

  // ---------- TARGET DAMAGE HELPERS ----------
  function targetInfo(tgt) {
    const p = RPG.player;
    if (tgt === 'serah') return { model: allyModel, def: RPG.serahStats().defense, defending: serahDefending, dodgeBonus: 0, isPlayer: false };
    if (tgt === 'kael') return { model: kaelModel, def: RPG.kaelStats().defense, defending: kaelDefending, dodgeBonus: 0, isPlayer: false };
    if (tgt === 'lyra') return { model: lyraModel, def: RPG.lyraStats().defense, defending: lyraDefending, dodgeBonus: 0, isPlayer: false };
    return { model: playerModel, def: p.defense, defending: playerBuffs.defending, isPlayer: true };
  }
  /* Allies share the leader's wards at half strength — they fight in his light. */
  function resistOf(tgt) {
    const r = RPG.player.resist || { fire:0, ice:0, lightning:0, arcane:0 };
    if (tgt === 'player') return r;
    return { fire:r.fire*.5, ice:r.ice*.5, lightning:r.lightning*.5, arcane:r.arcane*.5 };
  }
  async function damageAlly(tgt, dmg, verb, element = 'phys') {
    const p = RPG.player;
    const T = targetInfo(tgt);
    if (T.defending) dmg *= .5;
    if (T.isPlayer) dmg *= (1 - Math.min(.6, playerBuffs.defPct));
    dmg *= (1 - partyDef);
    const dr = T.def / (T.def + 120);
    dmg = dmg * (1-dr);
    const mit = Combat.mitigate(dmg, element, resistOf(tgt));
    dmg = Math.max(1, Math.round(mit.dmg * rnd(.85,1.15)));
    const warded = mit.cut >= .12 ? ` <span class="aff-resist">(warded ${Math.round(mit.cut*100)}%)</span>` : '';
    const label = tgt === 'player' ? 'you' : tgt;
    if (tgt === 'serah') p.serah.hp -= dmg;
    else if (tgt === 'kael') p.kael.hp -= dmg;
    else if (tgt === 'lyra') p.lyra.hp -= dmg;
    else p.hp -= dmg;
    AudioSys.play('playerHurt'); shake(.5); vignette();
    UI.floaterAt(project(T.model.group.position, 2.1), dmg, '');
    log(`${enemy.name} ${verb} ${label} for ${dmg}.${warded}`);
    // elemental blows leave their mark on the party too
    if (element && element !== 'phys') {
      const def = Combat.rollElementAilment(partyAil[tgt], element, dmg, 1 - (resistOf(tgt)[element] || 0));
      if (def) { log(`${label === 'you' ? 'You are' : label + ' is'} <b style="color:${def.color}">${def.name.toUpperCase()}</b> — ${def.desc}`); updateStatusUI(); }
    }
    if (tgt === 'serah' && p.serah.hp <= 0) { p.serah.hp = 0; serahKO = true; collapseAlly(allyModel, 'Serah'); }
    else if (tgt === 'kael' && p.kael.hp <= 0) { p.kael.hp = 0; kaelKO = true; collapseAlly(kaelModel, 'Kael'); }
    else if (tgt === 'lyra' && p.lyra.hp <= 0) { p.lyra.hp = 0; lyraKO = true; collapseAlly(lyraModel, 'Lyra'); }
    updateAllyBars();
    if (tgt === 'player') {
      UI.refreshHUD();
      // cheat death
      if (p.hp <= 0 && p.cheatDeath && !p.cheatDeathUsed) {
        p.hp = 1; p.cheatDeathUsed = true;
        log('★ UNDYING WILL — you refuse to fall!');
        elementalFX('arcane', playerModel);
      }
      if (p.hp <= 0) {
        await wait(700);
        AudioSys.play('defeat');
        banner('YOU HAVE FALLEN');
        await wait(1500);
        end(false);
      }
    }
    return dmg;
  }
  /* Ailment ticks bypass armour and guards by design — you can't block a poison. */
  async function dotDamage(who, amount, def) {
    const p = RPG.player;
    const T = targetInfo(who); if (!T.model) return;
    const dmg = Math.max(1, Math.round(amount));
    if (who === 'serah') p.serah.hp -= dmg;
    else if (who === 'kael') p.kael.hp -= dmg;
    else if (who === 'lyra') p.lyra.hp -= dmg;
    else p.hp -= dmg;
    UI.floaterAt(project(T.model.group.position, 2.1), dmg, 'dot');
    log(`<b style="color:${def.color}">${def.name}</b> costs ${who === 'player' ? 'you' : t2(who)} ${dmg} HP.`);
    if (who === 'serah' && p.serah.hp <= 0) { p.serah.hp = 0; serahKO = true; collapseAlly(allyModel, 'Serah'); }
    else if (who === 'kael' && p.kael.hp <= 0) { p.kael.hp = 0; kaelKO = true; collapseAlly(kaelModel, 'Kael'); }
    else if (who === 'lyra' && p.lyra.hp <= 0) { p.lyra.hp = 0; lyraKO = true; collapseAlly(lyraModel, 'Lyra'); }
    updateAllyBars(); UI.refreshHUD();
    if (who === 'player' && p.hp <= 0) {
      if (p.cheatDeath && !p.cheatDeathUsed) { p.hp = 1; p.cheatDeathUsed = true; log('★ UNDYING WILL — you refuse to fall!'); UI.refreshHUD(); return; }
      await wait(600); AudioSys.play('defeat'); banner('YOU HAVE FALLEN');
      await wait(1400); end(false);
    }
  }
  function collapseAlly(model, name) {
    log(`💔 ${name} is down! They cannot act until the battle ends.`);
    const g = model.group;
    const st = performance.now();
    (function frame(now){
      const t = Math.min(1, (now-st)/800);
      g.rotation.z = t * 1.5; g.position.y = .3 - t*.5;
      if (t < 1) requestAnimationFrame(frame);
    })(st);
  }
  async function hitTarget(tgt, baseDmg, verb, element) {
    const kindSfx = { wolf:'growl', golem:'stomp', wraith:'whoosh', humanoid:'swing' }[enemy.kind] || 'swing';
    AudioSys.play(kindSfx);
    lunge(enemyModel, targetInfo(tgt).model, .8);
    await wait(250);
    return damageAlly(tgt, baseDmg, verb, element || enemyElement());
  }
  // What school this thing swings with — wraiths are never really hitting you with a fist.
  const KIND_ELEMENT = { wraith:'arcane', wolf:'phys', golem:'phys', humanoid:'phys' };
  const BOSS_ELEMENT = { stormcaller:'lightning', tyrant:'ice', warden:'phys', herald:'arcane', malveth:'arcane' };
  function enemyElement() {
    return (enemy.bossId && BOSS_ELEMENT[enemy.bossId]) || KIND_ELEMENT[enemy.kind] || 'phys';
  }
  // Everything the enemy deals is scaled by what's riding it — chill, curse, poison.
  function enemyOut(base) { return base * Combat.outgoingMult(enemy); }

  // ---------- ENEMY SPECIAL ATTACKS — unique per enemy family ----------
  async function specialAttack() {
    const p = RPG.player;
    const kind = enemy.kind || 'humanoid';
    if (enemy.bossId === 'stormcaller') {
      banner('⛈ CHAIN LIGHTNING ⛈');
      log(`${enemy.name} calls the whole storm down on the party!`);
      AudioSys.play('lightning');
      const flash = new M.PointLight(0xcfe4ff, 4, 60); flash.position.set(0, 14, 0); scene.add(flash);
      shake(1.2);
      await wait(200);
      const targets = ['player'];
      if (!serahKO) targets.push('serah');
      if (kaelModel && !kaelKO) targets.push('kael');
      if (lyraModel && !lyraKO) targets.push('lyra');
      for (const tgt of targets) {
        await projectileFX(enemyModel, targetInfo(tgt).model, 0x9ad4ff);
        AudioSys.play('lightning');
        await damageAlly(tgt, enemyOut(enemy.dmg * .7), 'electrocutes', 'lightning');
      }
      scene.remove(flash);
      AudioSys.play('thunder');
      return;
    }
    if (kind === 'wolf') {
      const tgt = pickTarget();
      banner('🐺 SAVAGE BITE 🐺');
      log(`${enemy.name} lunges with frothing jaws!`);
      AudioSys.play('crit');
      lunge(enemyModel, targetInfo(tgt).model, 1.2);
      // jaw snap anim
      if (enemyModel.head) {
        const h = enemyModel.head, st = performance.now();
        (function frame(now){ const t = Math.min(1,(now-st)/300);
          h.scale.setScalar(1 + Math.sin(t*Math.PI)*.5);
          if (t<1) requestAnimationFrame(frame); else h.scale.setScalar(1); })(st);
      }
      await wait(300);
      await damageAlly(tgt, enemyOut(enemy.dmg * 1.4), 'savagely bites', 'phys');
      // teeth leave a wound that keeps opening
      const bleed = Combat.inflict(partyAil[tgt], 'bleed', enemy.dmg * .9, .6);
      if (bleed) { log(`${tgt === 'player' ? 'You are' : tgt + ' is'} <b style="color:${bleed.color}">BLEEDING</b>.`); updateStatusUI(); }
    } else if (kind === 'wraith') {
      const tgt = pickTarget();
      banner('🌀 VOID BOLT 🌀');
      log(`${enemy.name} hurls a shrieking void bolt!`);
      await projectileFX(enemyModel, targetInfo(tgt).model, 0xcc88ff);
      await damageAlly(tgt, enemyOut(enemy.dmg * 1.5), 'blasts with void energy', 'arcane');
    } else if (kind === 'golem') {
      banner('💥 SEISMIC SLAM 💥');
      log(`${enemy.name} slams the ground — the shockwave hits everyone!`);
      // shockwave ring on the floor
      const ringM = new M.Mesh(new M.TorusGeometry(1, .12, 8, 32),
        new M.MeshBasicMaterial({ color: 0xffcc66, transparent:true, opacity:.9, blending:M.AdditiveBlending, depthWrite:false }));
      ringM.rotation.x = Math.PI/2; ringM.position.y = .4;
      ringM.position.x = enemyModel.group.position.x; ringM.position.z = enemyModel.group.position.z;
      scene.add(ringM);
      const st = performance.now();
      (function frame(now){ const t = (now-st)/600;
        if (t >= 1) { scene.remove(ringM); return; }
        ringM.scale.setScalar(1 + t*10); ringM.material.opacity = .9*(1-t);
        requestAnimationFrame(frame); })(st);
      shake(1); AudioSys.play('crit');
      await wait(350);
      const targets = ['player'];
      if (!serahKO) targets.push('serah');
      if (kaelModel && !kaelKO) targets.push('kael');
      if (lyraModel && !lyraKO) targets.push('lyra');
      for (const tgt of targets) { await damageAlly(tgt, enemyOut(enemy.dmg * .65), 'rocks', 'phys'); }
    } else {
      // humanoid flourish — two rapid slashes at random targets, cursed steel and all
      banner('⚔ CURSED FLOURISH ⚔');
      log(`${enemy.name} unleashes a blinding sword flourish!`);
      for (let i=0;i<2;i++){
        const tgt = pickTarget();
        slashFX(targetInfo(tgt).model, true);
        AudioSys.play('swing');
        await wait(280);
        await damageAlly(tgt, enemyOut(enemy.dmg * .8), 'slashes', i === 1 ? 'arcane' : 'phys');
      }
    }
  }
  function pickTarget() {
    const pool = ['player'];
    if (!serahKO) pool.push('serah');
    if (kaelModel && !kaelKO) pool.push('kael');
    if (lyraModel && !lyraKO) pool.push('lyra');
    return pool[Math.floor(Math.random()*pool.length)];
  }

  // ---------- ENEMY TURN ----------
  async function enemyTurn() {
    if (!active) return;
    turn = 'enemy'; updateTurn('ENEMY TURN');
    UI.refreshHUD();
    await wait(700);
    if (!active) return;
    const p = RPG.player;

    // ---- phase transitions ----
    if (enemy.hpCur > 0) {
      if (enemy.phase2 && !enemy.phase2Done && enemy.hpCur < enemy.maxHp * .5) {
        enemy.phase2Done = true;
        enemy.dmg = Math.round(enemy.dmg * enemy.phase2.dmgMult);
        enemy.hpCur = Math.min(enemy.maxHp, enemy.hpCur + Math.round(enemy.maxHp * enemy.phase2.healPct));
        banner(enemy.phase2.name);
        AudioSys.play('ascend');
        enemyModel.group.traverse(o => { if (o.material && o.material.emissive !== undefined) { o.material.emissive = new M.Color(enemy.phase2.color); o.material.emissiveIntensity = .8; } });
        const aura2 = new M.PointLight(0xff2222, 2.2, 16); aura2.position.y = 3; enemyModel.group.add(aura2);
        enemyModel.group.scale.multiplyScalar(1.15);
        log('The shadow peels away — the Dragon Avatar stands revealed! Its power surges.');
        shake(1);
        await wait(1800);
      } else if (enemy.enrage && !enemy.enraged && enemy.hpCur < enemy.maxHp * enemy.enrage.at) {
        enemy.enraged = true;
        enemy.dmg = Math.round(enemy.dmg * enemy.enrage.dmgMult);
        banner('⚠ ' + enemy.name.toUpperCase() + ' ENRAGES ⚠');
        AudioSys.play('encounter');
        log(`${enemy.name} thrashes into a frenzy — its blows grow savage!`);
        await wait(900);
      }
    }

    // ---- ailments burn down before the enemy gets to move ----
    const eTick = Combat.tick(enemy);
    for (const t of eTick.ticks) {
      enemy.hpCur -= t.dmg;
      UI.floaterAt(project(enemyModel.group.position, 2.6), t.dmg, 'dot');
      log(`${enemy.name} suffers ${t.dmg} from <b style="color:${t.def.color}">${t.def.name}</b>.`);
      await wait(320);
    }
    for (const e of eTick.expired) log(`${t2(e.def.name)} fades from ${enemy.name}.`);
    if (eTick.ticks.length || eTick.expired.length) updateStatusUI();
    if (checkEnemyDead()) return;

    // shocked things lose their footing entirely
    const stunned = Combat.skipsTurn(enemy);
    if (stunned) {
      banner('⚡ ' + stunned.name.toUpperCase() + ' ⚡');
      log(`${enemy.name} convulses — it loses its turn!`);
      AudioSys.play('lightning');
      await wait(900);
      await endEnemyTurn();
      return;
    }

    // ---- enemy special attack (25% chance, unique per enemy kind) ----
    if (Math.random() < .25) { await specialAttack(); }
    else {
    // enemy attack — picks a target from the party
    const pool = ['player'];
    if (!serahKO) pool.push('serah');
    if (kaelModel && !kaelKO) pool.push('kael');
    if (lyraModel && !lyraKO) pool.push('lyra');
    const tgt = pool[Math.floor(Math.random()*pool.length)];
    const targetSerah = tgt === 'serah', targetKael = tgt === 'kael', targetLyra = tgt === 'lyra';
    const tModel = targetSerah ? allyModel : targetKael ? kaelModel : targetLyra ? lyraModel : playerModel;
    const tDodge = (targetSerah ? p.dodge*.8 : targetKael ? p.dodge*.85 : targetLyra ? p.dodge*.75 : p.dodge + playerBuffs.dodge) + partyDodge;
    if (Math.random() < (enemyDebuff.miss || 0)) {
      log(`${enemy.name} attacks but misses in the smoke!`);
    } else if (Math.random() < tDodge) {
      log(`${targetSerah ? 'Serah dodges' : targetKael ? 'Kael dodges' : targetLyra ? 'Lyra dodges' : 'You dodge'} the attack!`); AudioSys.play('swing');
    } else {
      await hitTarget(tgt, enemyOut(enemy.dmg), 'hits');
    }
    }

    await endEnemyTurn();
  }
  const t2 = s => s.charAt(0).toUpperCase() + s.slice(1);

  /* Everything that has to happen once the enemy's move is spent, whether it
     attacked, stunned out, or fizzled — party ailments burn, timers tick, turn returns. */
  async function endEnemyTurn() {
    if (!active) return;
    const p = RPG.player;
    // party ailments burn down
    const koFor = { serah: () => serahKO, kael: () => kaelKO, lyra: () => lyraKO };
    for (const who of ['player','serah','kael','lyra']) {
      if (who !== 'player' && (!targetInfo(who).model || koFor[who]())) { Combat.cureAll(partyAil[who]); continue; }
      const r = Combat.tick(partyAil[who]);
      for (const t of r.ticks) {
        await dotDamage(who, t.dmg, t.def);
        if (!active) return;
        await wait(220);
      }
      for (const e of r.expired) log(`${t2(e.def.name)} fades from ${who === 'player' ? 'you' : t2(who)}.`);
    }
    updateStatusUI();
    if (!active) return;

    playerBuffs.defending = false; serahDefending = false; kaelDefending = false; lyraDefending = false;
    // timers
    if (enemyDebuff.turns > 0 && --enemyDebuff.turns === 0) { enemyDebuff.dmg = 0; enemyDebuff.miss = 0; }
    if (playerBuffs.turns > 0 && --playerBuffs.turns === 0) { playerBuffs.dodge = 0; playerBuffs.defPct = 0; }
    if (partyDodgeTurns > 0 && --partyDodgeTurns === 0) partyDodge = 0;
    if (partyDefTurns > 0 && --partyDefTurns === 0) partyDef = 0;
    if (p.ascended && --ascendTurns === 0) endStarforged(false);
    p.spirit = Math.min(100, p.spirit + 3);
    UI.refreshHUD();
    await wait(500);
    showMenu();
  }

  // ---------- PER-FAMILY DEATH ANIMATIONS ----------
  function deathAnim(kind, boss, g, done) {
    const startT = performance.now();
    const dur = boss ? 1500 : 950;
    if (kind === 'wraith') {
      // dissolves upward into drifting motes
      AudioSys.play('dissolve');
      for (let i=0;i<(boss?26:14);i++){
        const p = new M.Mesh(new M.SphereGeometry(rnd(.06,.16), 6, 6),
          new M.MeshBasicMaterial({ color: 0xcc88ff, transparent:true }));
        p.position.set(g.position.x+rnd(-.8,.8), g.position.y+rnd(.5,2.5), g.position.z+rnd(-.8,.8));
        p.userData.v = new M.Vector3(rnd(-.5,.5), rnd(2,5), rnd(-.5,.5));
        p.userData.life = 1.6;
        scene.add(p); (scene.userData.fx ||= []).push(p);
      }
      (function frame(now){ const t = (now-startT)/dur;
        if (t >= 1 || !g.parent) { done(); return; }
        g.position.y = .3 + t*3; g.scale.setScalar(Math.max(.01, 1-t*.9));
        g.rotation.y += .06;
        requestAnimationFrame(frame); })(startT);
    } else if (kind === 'golem') {
      // bursts into tumbling debris, body topples forward
      AudioSys.play('stomp');
      for (let i=0;i<(boss?10:5);i++){
        const d = new M.Mesh(new M.DodecahedronGeometry(rnd(.12,.3), 0),
          new M.MeshStandardMaterial({ color: 0x3a4048, roughness:.9 }));
        d.position.set(g.position.x, g.position.y+rnd(.5,1.8), g.position.z);
        const a = rnd(0,Math.PI*2);
        d.userData.v = new M.Vector3(Math.cos(a)*rnd(1.5,4), rnd(2,5), Math.sin(a)*rnd(1.5,4));
        d.userData.life = 1.4;
        scene.add(d); (scene.userData.fx ||= []).push(d);
      }
      (function frame(now){ const t = (now-startT)/dur;
        if (t >= 1 || !g.parent) { done(); return; }
        g.rotation.x = t*1.5; g.position.y = .3 - t*.35;
        requestAnimationFrame(frame); })(startT);
    } else if (kind === 'wolf') {
      // crumples onto its side
      AudioSys.play('growl');
      (function frame(now){ const t = (now-startT)/dur;
        if (t >= 1 || !g.parent) { done(); return; }
        g.rotation.z = t*1.6; g.position.y = .3 - t*.45; g.scale.setScalar(Math.max(.01, 1-t*.6));
        requestAnimationFrame(frame); })(startT);
    } else {
      // humanoid: staggers, then crashes down
      (function frame(now){ const t = (now-startT)/dur;
        if (t >= 1 || !g.parent) { done(); return; }
        const k = t < .3 ? -t : (t-.3)*1.6;
        g.rotation.x = k*1.2;
        g.position.y = .3 - Math.max(0, t-.3)*.8; g.scale.setScalar(Math.max(.01, 1-t*.7));
        requestAnimationFrame(frame); })(startT);
    }
    if (boss) { // every boss death detonates a shockwave
      flashRing(g.position, 0xffe14d, 10, 900);
      shake(1.5);
    }
  }

  function checkEnemyDead() {
    if (enemy.hpCur > 0) return false;
    AudioSys.play('enemyDie');
    UI.floaterAt(project(enemyModel.group.position, 2.5), 'SLAIN', 'crit');
    log(`${enemy.name} is destroyed!`);
    const g = enemyModel.group;
    deathAnim(enemy.kind || 'humanoid', enemy.boss, g,
      () => setTimeout(()=> end(true), enemy.boss ? 600 : 400));
    return true;
  }

  // ---------- SUBMENUS ----------
  function openSkills() {
    const sub = ui('battle-submenu'); sub.innerHTML = '';
    const p = RPG.player;
    let any = false;
    if (currentActor !== 'player') {
      const skillList = currentActor === 'serah' ? RPG.SERAH_SKILLS : currentActor === 'kael' ? RPG.KAEL_SKILLS : RPG.LYRA_SKILLS;
      const pool = p[currentActor];
      for (const s of skillList) {
        if (p.level < (s.req||0)) continue;
        any = true;
        const b = document.createElement('button');
        b.className = 'battle-btn';
        b.innerHTML = `${s.icon} ${s.name} <small>${s.mp} MP · ${s.desc}</small>`;
        b.disabled = pool.mp < s.mp;
        b.onclick = () => { AudioSys.play('click'); doSkill(s); };
        sub.appendChild(b);
      }
      const back = document.createElement('button');
      back.className = 'battle-btn'; back.innerHTML = '↩ Back';
      back.onclick = () => { AudioSys.play('click'); showMenu(); };
      sub.appendChild(back);
      if (!any) log('No usable skills yet.');
      ui('battle-menu').classList.add('hidden');
      sub.classList.remove('hidden');
      return;
    }
    for (const [id, rank] of Object.entries(p.skills)) {
      if (!rank) continue;
      const s = RPG.getSkill(id);
      if (s.type === 'passive') continue;
      if (s.ascendOnly && !p.ascended) continue;
      any = true;
      const b = document.createElement('button');
      b.className = 'battle-btn';
      b.innerHTML = `${s.icon} ${s.name} <small>${s.mp} MP · rank ${rank}</small>`;
      b.disabled = p.mp < s.mp;
      b.onclick = () => { AudioSys.play('click'); doSkill(s); };
      sub.appendChild(b);
    }
    const back = document.createElement('button');
    back.className = 'battle-btn'; back.innerHTML = '↩ Back';
    back.onclick = () => { AudioSys.play('click'); showMenu(); };
    sub.appendChild(back);
    if (!any) log('No usable skills — learn some in the skill tree (K)!');
    ui('battle-menu').classList.add('hidden');
    sub.classList.remove('hidden');
  }
  /* Switching Additions costs nothing — the cost is having to hit the new rhythm. */
  function openAdditions() {
    const sub = ui('battle-submenu'); sub.innerHTML = '';
    const p = RPG.player;
    for (const a of Combat.additionsFor(p.cls)) {
      const locked = p.level < a.req;
      const uses = RPG.additionUses(a.id), lv = Combat.masteryLevel(uses), next = Combat.masteryNext(uses);
      const b = document.createElement('button');
      b.className = 'battle-btn addition-opt' + (a.id === RPG.currentAddition().id ? ' selected' : '');
      b.innerHTML = `${a.icon} ${a.name} ${locked ? `<small>🔒 unlocks at level ${a.req}</small>`
        : `<small>${a.beats} beats · ×${a.mult.toFixed(2)} · mastery ${lv}/${Combat.MASTERY_MAX}` +
          `${next ? ` (${uses}/${next})` : ' — MAXED'}` +
          `${a.finisher ? ` · ${Combat.ELEMENTS[a.finisher.element].icon} finisher` : ''}<br>${a.desc}</small>`}`;
      b.disabled = locked;
      b.onclick = () => { AudioSys.play('click'); RPG.setAddition(a.id); showMenu(); };
      sub.appendChild(b);
    }
    const back = document.createElement('button');
    back.className = 'battle-btn'; back.innerHTML = '↩ Back';
    back.onclick = () => { AudioSys.play('click'); showMenu(); };
    sub.appendChild(back);
    ui('battle-menu').classList.add('hidden');
    sub.classList.remove('hidden');
  }
  function openItems() {
    const sub = ui('battle-submenu'); sub.innerHTML = '';
    const p = RPG.player;
    for (const [kind, label, icon] of [['hp','Healing Potion','🧪'],['mp','Mana Potion','🔷']]) {
      const b = document.createElement('button');
      b.className = 'battle-btn';
      b.innerHTML = `${icon} ${label} <small>×${p.potions[kind]} · restores 40%</small>`;
      b.disabled = p.potions[kind] <= 0;
      b.onclick = () => { AudioSys.play('click'); doItem(kind); };
      sub.appendChild(b);
    }
    const back = document.createElement('button');
    back.className = 'battle-btn'; back.innerHTML = '↩ Back';
    back.onclick = () => { AudioSys.play('click'); showMenu(); };
    sub.appendChild(back);
    ui('battle-menu').classList.add('hidden');
    sub.classList.remove('hidden');
  }

  function bindMenu() { /* menus are built dynamically per actor via buildMenu() */ }

  // ---------- FRAME ----------
  function project(pos, yOff=0) {
    const v = pos.clone(); v.y += yOff; v.project(camera);
    return { x: (v.x*.5+.5)*innerWidth, y: (-v.y*.5+.5)*innerHeight };
  }
  function onResize(){ if (camera){ camera.aspect = innerWidth/innerHeight; camera.updateProjectionMatrix(); } }

  let t = 0, lastBossHp = -1, statusT = 0;
  function update(dt) {
    if (!active || !scene) return;
    t += dt;
    // the status strips are cheap and change from many code paths — keep them live
    statusT += dt;
    if (statusT > .25) { statusT = 0; updateStatusUI(); }
    if (enemy && enemy.boss && enemy.hpCur !== lastBossHp) {
      lastBossHp = enemy.hpCur;
      ui('boss-fill').style.width = Math.max(0, enemy.hpCur/enemy.maxHp*100) + '%';
    }
    // idle anims
    if (playerModel) playerModel.body.position.y = Math.sin(t*2.2)*.04;
    if (allyModel) allyModel.body.position.y = Math.sin(t*2.6+.7)*.05;
    if (enemyModel && enemy.hpCur > 0) enemyModel.body.position.y = Math.sin(t*2.8+1)*.06;
    if (ascendWings) ascendWings.rotation.x = Math.sin(t*6)*.25;
    scene.userData.embers.rotation.y += dt*.05;
    arenaLight.intensity = 1 + Math.sin(t*3)*.25;
    // fx particles
    const fx = scene.userData.fx || [];
    for (let i=fx.length-1;i>=0;i--){
      const p = fx[i];
      p.position.addScaledVector(p.userData.v, dt);
      p.userData.v.y -= 12*dt;
      p.userData.life -= dt*1.6;
      if (p.material.transparent !== undefined) p.material.opacity = Math.max(0, p.userData.life);
      p.scale.setScalar(Math.max(.01, p.userData.life));
      if (p.userData.life <= 0) { scene.remove(p); fx.splice(i,1); }
    }
    // cinematic camera drift + shake
    const base = new M.Vector3(Math.sin(t*.1)*1.5, 6.4 + Math.sin(t*.13)*.7, 12.2);
    if (shakeAmt > 0) {
      base.x += rnd(-1,1)*shakeAmt; base.y += rnd(-1,1)*shakeAmt;
      shakeAmt = Math.max(0, shakeAmt - dt*2.2);
    }
    camera.position.lerp(base, 1 - Math.pow(.001, dt));
    camera.lookAt(0, 1.4, 0);
    World.renderer.render(scene, camera);
  }

  // expose model builder (shared with world visuals)
  function WorldBuild(color, isEnemy, scale) {
    // rebuild same rig as world (kept in game.js); access through a clone helper
    return World.player3d && !isEnemy && RPG.player && color === RPG.CLASSES[RPG.player.cls].color
      ? cloneRig(World.player3d)
      : buildRig(color, isEnemy, scale);
  }
  function cloneRig(rig) {
    // build a fresh rig in the player's colors (models aren't shared across scenes)
    const r = buildRig(RPG.CLASSES[RPG.player.cls].color, false, 1);
    // swap weapon for the equipped variant
    if (r.sword) r.body.remove(r.sword);
    const w = World.buildWeaponMesh ? World.buildWeaponMesh(World.currentWeaponType()) : null;
    if (w) { w.position.set(.6, 1.15, 0); w.rotation.z = -.4; r.body.add(w); r.sword = w; }
    // carry armor pieces into battle: shield, tiered helm, amulet gem
    const eq = RPG.player.equip;
    if (eq.armor && eq.armor.def >= 8 && World.buildShieldMesh) {
      const sh = World.buildShieldMesh(eq.armor.rarity);
      sh.position.set(-.62, 1.15, .1); r.body.add(sh);
    }
    if (eq.helm && World.buildHelmMesh) {
      const hm = World.buildHelmMesh(eq.helm.name, eq.helm.rarity);
      r.body.add(hm);
    }
    if (eq.amulet) {
      const col = { normal:0xc8c8c8, magic:0x6b8cff, rare:0xffe14d, unique:0xd08028 }[eq.amulet.rarity];
      const gem = new M.Mesh(new M.OctahedronGeometry(.09, 0),
        new M.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 1.2 }));
      gem.position.set(0, 1.42, .3); r.body.add(gem);
    }
    return r;
  }
  function buildRig(color, isEnemy, scale, isAlly=false) {
    const g = new M.Group(); const body = new M.Group();
    const c = new M.MeshStandardMaterial({ color, roughness:.6, metalness:.25 });
    const torso = new M.Mesh(new M.CylinderGeometry(.34*scale,.42*scale,.9*scale,8), c);
    torso.position.y = 1.05*scale; torso.castShadow = true; body.add(torso);
    const head = new M.Mesh(new M.SphereGeometry(.28*scale,12,10),
      new M.MeshStandardMaterial({ color: isEnemy? color : 0xe8c39a, roughness:.7 }));
    head.position.y = 1.85*scale; body.add(head);
    const helm = new M.Mesh(new M.ConeGeometry(.3*scale,.5*scale,8), c);
    helm.position.y = 2.12*scale; body.add(helm);
    const armGeo = new M.CylinderGeometry(.09*scale,.08*scale,.7*scale,6);
    const armL = new M.Mesh(armGeo, c); armL.position.set(-.5*scale,1.15*scale,0); armL.rotation.z=.25; body.add(armL);
    const armR = new M.Mesh(armGeo, c); armR.position.set(.5*scale,1.15*scale,0); armR.rotation.z=-.25; body.add(armR);
    const legGeo = new M.CylinderGeometry(.11*scale,.09*scale,.65*scale,6);
    const legL = new M.Mesh(legGeo, new M.MeshStandardMaterial({ color:0x2a2f3a })); legL.position.set(-.18*scale,.35*scale,0); body.add(legL);
    const legR = new M.Mesh(legGeo, new M.MeshStandardMaterial({ color:0x2a2f3a })); legR.position.set(.18*scale,.35*scale,0); body.add(legR);
    const sword = new M.Group();
    const blade = new M.Mesh(new M.BoxGeometry(.07*scale,.9*scale,.16*scale),
      new M.MeshStandardMaterial({ color:0xcfd8e8, roughness:.3, metalness:.9, emissive: isEnemy?0x330000:0x8899ff, emissiveIntensity:.3 }));
    blade.position.y = .55*scale; sword.add(blade);
    const guard = new M.Mesh(new M.BoxGeometry(.3*scale,.07*scale,.2*scale),
      new M.MeshStandardMaterial({ color:0xd4af37, metalness:.8, roughness:.4 }));
    sword.add(guard);
    sword.position.set(.6*scale,1.15*scale,0); sword.rotation.z=-.4; body.add(sword);
    if (!isEnemy && !isAlly && RPG.player) {
      const cls = RPG.player.cls;
      if (cls === 'knight') {
        const cape = new M.Mesh(new M.PlaneGeometry(.85*scale, 1.15*scale),
          new M.MeshStandardMaterial({ color: 0x7a1a1a, roughness:.9, side:M.DoubleSide }));
        cape.position.set(0, 1.1*scale, -.3*scale); cape.rotation.x = .18; body.add(cape);
        for (const side of [-1,1]) {
          const paul = new M.Mesh(new M.SphereGeometry(.18*scale, 8, 6, 0, Math.PI*2, 0, Math.PI/2),
            new M.MeshStandardMaterial({ color:0xd4af37, metalness:.8, roughness:.4 }));
          paul.position.set(side*.48*scale, 1.52*scale, 0); body.add(paul);
        }
      } else if (cls === 'rogue') {
        const hood = new M.Mesh(new M.ConeGeometry(.34*scale, .42*scale, 8),
          new M.MeshStandardMaterial({ color:0x2a1a3a, roughness:.85 }));
        hood.position.y = 2*scale; body.add(hood);
      } else if (cls === 'sorceress') {
        const hat = new M.Mesh(new M.ConeGeometry(.42*scale, .55*scale, 9),
          new M.MeshStandardMaterial({ color:0x1a3a5c, roughness:.85 }));
        hat.position.y = 2.25*scale; body.add(hat);
        const brim = new M.Mesh(new M.CylinderGeometry(.55*scale, .55*scale, .05*scale, 12),
          new M.MeshStandardMaterial({ color:0x1a3a5c, roughness:.85 }));
        brim.position.y = 2*scale; body.add(brim);
      }
    }
    if (isEnemy) { // glowing eyes
      for (const side of [-1,1]) {
        const eye = new M.Mesh(new M.SphereGeometry(.05*scale,6,6),
          new M.MeshBasicMaterial({ color:0xff2222 }));
        eye.position.set(side*.1*scale, 1.9*scale, .24*scale); body.add(eye);
      }
    }
    g.add(body);
    return { group:g, body, armL, armR, legL, legR, sword, head };
  }

  // test/debug window into live battle state — the ailment bags are otherwise unreachable
  function debug() {
    return {
      actor: currentActor, turn,
      enemy: enemy ? { name: enemy.name, kind: enemy.kind, bossId: enemy.bossId,
                       hp: enemy.hpCur, maxHp: enemy.maxHp,
                       ail: Object.keys(enemy.ail || {}) } : null,
      party: Object.fromEntries(Object.entries(partyAil).map(([k,v]) => [k, Object.keys(v.ail || {})])),
    };
  }
  return { start, update, pressAddition, bindMenu, onResize, debug,
    get active(){ return active; }, get scene(){ return scene; } };
})();
