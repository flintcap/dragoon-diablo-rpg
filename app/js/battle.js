/* battle.js — LOD turn-based battles: party-of-3 control, timed Additions, enemy specials */
const Battle = (() => {
  const M = THREE;
  let scene, camera, active = false, enemy = null, playerModel = null, enemyModel = null, allyModel = null;
  let turn = 'player', animQueue = Promise.resolve(), spiritGainMult = 1;
  let dragoonTurns = 0, dots = [], enemyDebuff = { dmg: 0, miss: 0, turns: 0 };
  let playerBuffs = { dodge: 0, defPct: 0, turns: 0, doubleHit: false, empower: false };
  let ringState = null, arenaLight = null, dragoonWings = null;
  let currentActor = 'player', serahKO = false, serahDefending = false, partyDodge = 0, partyDodgeTurns = 0;
  let kaelModel = null, kaelKO = false, kaelDefending = false, partyDef = 0, partyDefTurns = 0;

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
    // concentric inlays + center emblem + radial cracks
    for (const [r, col] of [[8, 0x24508a], [4.5, 0x1d4a70]]) {
      const inl = new M.Mesh(new M.TorusGeometry(r, .08, 6, 48),
        new M.MeshBasicMaterial({ color: col, transparent:true, opacity:.8 }));
      inl.rotation.x = Math.PI/2; inl.position.y = .31; scene.add(inl);
    }
    const emblem = new M.Mesh(new M.CircleGeometry(1.6, 24),
      new M.MeshBasicMaterial({ color: 0x2a5a9a, transparent:true, opacity:.5 }));
    emblem.rotation.x = -Math.PI/2; emblem.position.y = .31; scene.add(emblem);
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
    active = true; enemy = worldEnemy;
    dots = []; enemyDebuff = { dmg: 0, miss: 0, turns: 0 };
    playerBuffs = { dodge: 0, defPct: 0, turns: 0, doubleHit: false, empower: false };
    RPG.player.cheatDeathUsed = false;
    if (RPG.player.dragoonForm) endDragoon(true);

    // clear old models
    if (playerModel) scene.remove(playerModel.group);
    if (enemyModel) scene.remove(enemyModel.group);
    if (allyModel) scene.remove(allyModel.group);
    playerModel = WorldBuild(RPG.CLASSES[RPG.player.cls].color, false, 1);
    playerModel.group.position.set(-4.5, .3, -1); playerModel.group.rotation.y = Math.PI/2;
    scene.add(playerModel.group);
    // Serah the Wingly — AI companion
    allyModel = buildRig(0x9fd4ff, false, .88, true);
    allyModel.group.position.set(-5.5, .3, 2.2); allyModel.group.rotation.y = Math.PI/2;
    // her Wingly bow
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
    banner('⚔ ' + enemy.name.toUpperCase() + ' ⚔');
    AudioSys.play('encounter');
    log(`A wild ${enemy.name} appears!`);
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
    ui('serah-bars').classList.add('hidden');
    ui('kael-bars').classList.add('hidden');
    ui('boss-bar').classList.add('hidden');
    ui('battle-ui').classList.add('hidden');
    ui('battle-menu').classList.add('hidden');
    ui('battle-submenu').classList.add('hidden');
    ui('addition-ring').classList.add('hidden');
    ui('combo-counter').classList.add('hidden');
    if (RPG.player.dragoonForm) endDragoon(true);
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
    const lvUps = RPG.gainXp(xpG);
    p.spirit = Math.min(100, p.spirit + 15);
    UI.refreshHUD();
    ui('results-title').textContent = 'VICTORY'; ui('results-title').classList.remove('defeat');
    ui('results-body').innerHTML =
      `<div>+${xpG} XP &nbsp;·&nbsp; +${goldG} gold &nbsp;·&nbsp; +15% spirit</div>` +
      (lvUps ? `<div style="color:var(--gold-hi);font-size:20px">★ LEVEL UP! Now level ${p.level} ★<br><small>+3 attribute points · +1 skill point (press C / K)</small></div>` : '');
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
  }
  function hideMenu(){ ui('battle-menu').classList.add('hidden'); ui('battle-submenu').classList.add('hidden'); }

  // ---------- ADDITION SYSTEM ----------
  function runAddition(chainMax, onDone) {
    let chain = 0, totalMult = 0, perfects = 0;
    const ring = ui('addition-ring'), shrink = ui('ring-shrink'), judge = ui('ring-judge'), combo = ui('combo-counter');
    ring.classList.remove('hidden'); combo.classList.remove('hidden');

    function oneBeat() {
      if (!active || chain >= chainMax) { finish(); return; }
      combo.textContent = chain > 0 ? `${chain} HIT${chain>1?'S':''}!` : 'READY…';
      const dur = Math.max(.55, 1.0 - chain*.08); // speeds up each beat
      const startT = performance.now();
      ringState = { t: 0, dur, pressed: false };
      AudioSys.play('swing');
      lunge(playerModel, enemyModel, .35);

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
        impactFX(enemyModel, isPerf);
        RPG.player.spirit = Math.min(100, RPG.player.spirit + (isPerf ? 6 : 4));
        UI.refreshHUD();
        setTimeout(oneBeat, 260);
      }
      ringState.judge = () => { // Space pressed
        const t = ringState.t;
        ringState.pressed = true;
        let verdict, q;
        const err = Math.abs(t - 1);
        if (err <= .09) { verdict = 'PERFECT'; q = 1; }
        else if (err <= .22) { verdict = 'GOOD'; q = .7; }
        else { verdict = 'MISS'; q = 0; }
        ringState = null;
        judgeBeat(verdict, q);
      };
    }

    function finish() {
      ring.classList.add('hidden');
      combo.textContent = chain > 0 ? `${chain}-HIT ADDITION!` : '';
      setTimeout(()=> combo.classList.add('hidden'), 900);
      onDone(chain, totalMult, perfects);
    }
    oneBeat();
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
    mkBtn('⚔ Attack', 'Addition combo', () => doAttack());
    mkBtn('✦ Skills', 'MP cost', () => openSkills());
    mkBtn('✚ Items', 'potions', () => openItems());
    if (isPlayer) mkBtn('🐉 Dragoon', p.dragoonForm ? 'DRAGOON ACTIVE' : `needs 100% (${Math.floor(p.spirit)}%)`,
      () => doDragoon(), !(p.spirit >= 100 && !p.dragoonForm));
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
    if (!kaelModel || kaelKO) { enemyTurn(); return; }
    currentActor = 'kael';
    showMenu();
  }
  function afterActorAction() {
    if (currentActor === 'player') serahPhase();
    else if (currentActor === 'serah') kaelPhase();
    else { currentActor = 'player'; enemyTurn(); }
  }

  // ---------- PLAYER ACTIONS ----------
  function actorModel() { return currentActor === 'player' ? playerModel : currentActor === 'serah' ? allyModel : kaelModel; }
  function actorStats() {
    const p = RPG.player;
    if (currentActor === 'player') return { atk: p.attack, critCh: p.critChance, chainMax: RPG.CLASSES[p.cls].additionCount + (p.dragoonForm ? 2 : 0) };
    const s = currentActor === 'serah' ? RPG.serahStats() : RPG.kaelStats();
    return { atk: s.attack, critCh: s.critChance, chainMax: s.chainMax };
  }

  async function doAttack() {
    hideMenu();
    const p = RPG.player;
    const isPlayer = currentActor === 'player';
    const model = actorModel();
    const A = actorStats();
    const atk = A.atk, critCh = A.critCh, maxChain = A.chainMax;
    runAddition(maxChain, async (chain, totalMult) => {
      if (!active) return;
      if (chain > 0) {
        let dmg = atk * (0.55 + totalMult*0.45);
        if (isPlayer && p.dragoonForm) dmg *= 1.6;
        const crit = Math.random() < critCh;
        if (crit) dmg *= p.critMult;
        dmg = Math.max(1, Math.round(dmg * rnd(.9,1.1)));
        if (isPlayer && playerBuffs.doubleHit) { dmg = Math.round(dmg * 1.8); playerBuffs.doubleHit = false; log('Shadow clone strikes!'); }
        if (enemy.shielded && (RPG.player.flags?.anchorsDestroyed||0) < 3) dmg = Math.max(1, Math.round(dmg*.15));
        slashFX(enemyModel, crit);
        enemy.hpCur -= dmg;
        UI.floaterAt(project(enemyModel.group.position, 2.2), dmg, crit ? 'crit' : '');
        if (isPlayer && p.lifeLeech > 0) { p.hp = Math.min(p.maxHp, p.hp + Math.round(dmg*p.lifeLeech)); }
        log(`${isPlayer?'': currentActor.charAt(0).toUpperCase()+currentActor.slice(1)+': '}${chain}-hit Addition for ${dmg} damage${crit?' — CRITICAL!':''}`);
        await wait(650);
        if (checkEnemyDead()) return;
      } else log('The Addition failed — no damage!');
      afterActorAction();
    });
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
    } else { // damage skill
      lunge(playerModel, enemyModel, .6);
      await wait(300);
      let mult = skill.mult + skill.per*rank;
      if (skill.dragoonBoost && p.dragoonForm) mult *= skill.dragoonBoost;
      let dmg = p.attack * p.spellPower * mult;
      if (p.dragoonForm) dmg *= 1.6;
      let crit = skill.alwaysCrit || Math.random() < (p.critChance + (skill.critBonus||0));
      if (crit) dmg *= p.critMult;
      if (playerBuffs.empower) { dmg *= 1.5; playerBuffs.empower = false; }
      dmg = Math.max(1, Math.round(dmg * rnd(.9,1.1)));
      if (enemy.shielded && (RPG.player.flags?.anchorsDestroyed||0) < 3) dmg = Math.max(1, Math.round(dmg*.15));
      elementalFX(skill.type, enemyModel);
      enemy.hpCur -= dmg;
      UI.floaterAt(project(enemyModel.group.position, 2.4), dmg, crit?'crit':'perfect');
      log(`${skill.name} hits for ${dmg} ${skill.type} damage${crit?' — CRITICAL!':''}`);
      if (skill.dot) dots.push({ turns: 3, dmg: Math.round(dmg*.15), src: skill.type });
      if (skill.slow) enemy.speed = Math.max(.5, enemy.speed - .3);
      if (p.lifeLeech > 0) p.hp = Math.min(p.maxHp, p.hp + Math.round(dmg*p.lifeLeech));
      p.spirit = Math.min(100, p.spirit + 8); UI.refreshHUD();
      await wait(700);
      if (checkEnemyDead()) return;
    }
    afterActorAction();
  }

  async function doAllySkill(skill) {
    hideMenu();
    const p = RPG.player;
    const isSerah = currentActor === 'serah';
    const ss = isSerah ? RPG.serahStats() : RPG.kaelStats();
    const pool = isSerah ? p.serah : p.kael;
    const model = isSerah ? allyModel : kaelModel;
    if (pool.mp < skill.mp) { log(`${currentActor} is out of MP!`); showMenu(); return; }
    pool.mp -= skill.mp;
    if (skill.type === 'heal') {
      const amt = Math.round(p.maxHp * skill.mult);
      p.hp = Math.min(p.maxHp, p.hp + amt);
      elementalFX('ice', model); AudioSys.play('heal');
      UI.floaterAt(project(playerModel.group.position, 2.2), '+'+amt, 'perfect');
      log(`${isSerah ? "Serah's Wingly Light" : "Kael's rally"} restores ${amt} HP.`);
      UI.refreshHUD();
    } else if (skill.type === 'buff') {
      if (isSerah) { partyDodge = skill.mult; partyDodgeTurns = 3;
        log('Tailwind wraps the party — +18% dodge for 3 turns!'); }
      else { partyDef = skill.mult; partyDefTurns = 3;
        log('Bulwark! The party gains +25% defense for 3 turns!'); }
      elementalFX('arcane', model);
    } else {
      await projectileFX(model, enemyModel, isSerah ? 0xbfe8ff : 0xffcc66);
      let dmg = ss.attack * skill.mult;
      const crit = Math.random() < (ss.critChance + (skill.critBonus||0));
      if (crit) dmg *= ss.critMult;
      dmg = Math.max(1, Math.round(dmg * rnd(.9,1.1)));
      if (enemy.shielded && (RPG.player.flags?.anchorsDestroyed||0) < 3) dmg = Math.max(1, Math.round(dmg*.15));
      slashFX(enemyModel, crit);
      enemy.hpCur -= dmg;
      UI.floaterAt(project(enemyModel.group.position, 2.4), dmg, crit?'crit':'perfect');
      log(`${isSerah?'Serah':'Kael'}'s ${skill.name} hits for ${dmg}${crit?' — CRITICAL!':''}`);
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
      if (currentActor === 'serah') serahDefending = true; else kaelDefending = true;
      elementalFX('ice', actorModel());
      log(`${currentActor.charAt(0).toUpperCase()+currentActor.slice(1)} takes a defensive stance.`);
    }
    await wait(450); afterActorAction();
  }

  // ---------- DRAGOON FORM ----------
  async function doDragoon() {
    hideMenu();
    const p = RPG.player;
    if (p.spirit < 100 || p.dragoonForm) return;
    p.spirit = 0; p.dragoonForm = true; dragoonTurns = 4;
    AudioSys.play('dragoon');
    banner('🐉 DRAGOON TRANSFORMATION 🐉');
    // wings — layered glowing energy feathers
    dragoonWings = new M.Group();
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
      dragoonWings.add(wing);
    }
    playerModel.group.add(dragoonWings);
    const glow = new M.PointLight(0x66ccff, 2.5, 10); glow.position.y = 2; glow.name = 'dragoonGlow';
    playerModel.group.add(glow);
    playerModel.group.traverse(o => { if (o.material && o.material.emissive) { o.userData.oldEm = o.material.emissive.getHex(); o.material.emissive.setHex(0x2266aa); o.material.emissiveIntensity = .6; } });
    log('The Dragoon Spirit ignites! All damage +60% for 4 turns!');
    await wait(1600);
    showMenu();
  }
  function endDragoon(silent) {
    const p = RPG.player; p.dragoonForm = false;
    if (dragoonWings) { playerModel.group.remove(dragoonWings); dragoonWings = null; }
    const glow = playerModel.group.getObjectByName('dragoonGlow');
    if (glow) playerModel.group.remove(glow);
    playerModel.group.traverse(o => { if (o.material && o.material.emissive && o.userData.oldEm !== undefined) { o.material.emissive.setHex(o.userData.oldEm); o.material.emissiveIntensity = .3; delete o.userData.oldEm; } });
    if (!silent) log('The Dragoon form fades…');
  }

  // ---------- TARGET DAMAGE HELPERS ----------
  function targetInfo(tgt) {
    const p = RPG.player;
    if (tgt === 'serah') return { model: allyModel, def: RPG.serahStats().defense, defending: serahDefending, dodgeBonus: 0, isPlayer: false };
    if (tgt === 'kael') return { model: kaelModel, def: RPG.kaelStats().defense, defending: kaelDefending, dodgeBonus: 0, isPlayer: false };
    return { model: playerModel, def: p.defense, defending: playerBuffs.defending, isPlayer: true };
  }
  async function damageAlly(tgt, dmg, verb) {
    const p = RPG.player;
    const T = targetInfo(tgt);
    if (T.defending) dmg *= .5;
    if (T.isPlayer) dmg *= (1 - Math.min(.6, playerBuffs.defPct));
    dmg *= (1 - partyDef);
    const dr = T.def / (T.def + 120);
    dmg = Math.max(1, Math.round(dmg * (1-dr) * rnd(.85,1.15)));
    const label = tgt === 'player' ? 'you' : tgt;
    if (tgt === 'serah') p.serah.hp -= dmg;
    else if (tgt === 'kael') p.kael.hp -= dmg;
    else p.hp -= dmg;
    AudioSys.play('playerHurt'); shake(.5);
    UI.floaterAt(project(T.model.group.position, 2.1), dmg, '');
    log(`${enemy.name} ${verb} ${label} for ${dmg}.`);
    if (tgt === 'serah' && p.serah.hp <= 0) { p.serah.hp = 0; serahKO = true; collapseAlly(allyModel, 'Serah'); }
    else if (tgt === 'kael' && p.kael.hp <= 0) { p.kael.hp = 0; kaelKO = true; collapseAlly(kaelModel, 'Kael'); }
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
  async function hitTarget(tgt, baseDmg, verb) {
    lunge(enemyModel, targetInfo(tgt).model, .8);
    await wait(250);
    return damageAlly(tgt, baseDmg, verb);
  }

  // ---------- ENEMY SPECIAL ATTACKS — unique per enemy family ----------
  async function specialAttack() {
    const p = RPG.player;
    const kind = enemy.kind || 'humanoid';
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
      await damageAlly(tgt, enemy.dmg * 1.4, 'savagely bites');
    } else if (kind === 'wraith') {
      const tgt = pickTarget();
      banner('🌀 VOID BOLT 🌀');
      log(`${enemy.name} hurls a shrieking void bolt!`);
      await projectileFX(enemyModel, targetInfo(tgt).model, 0xcc88ff);
      await damageAlly(tgt, enemy.dmg * 1.5, 'blasts with void energy');
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
      for (const tgt of targets) { await damageAlly(tgt, enemy.dmg * .65, 'rocks'); }
    } else {
      // humanoid flourish — two rapid slashes at random targets
      banner('⚔ CURSED FLOURISH ⚔');
      log(`${enemy.name} unleashes a blinding sword flourish!`);
      for (let i=0;i<2;i++){
        const tgt = pickTarget();
        slashFX(targetInfo(tgt).model, true);
        AudioSys.play('swing');
        await wait(280);
        await damageAlly(tgt, enemy.dmg * .8, 'slashes');
      }
    }
  }
  function pickTarget() {
    const pool = ['player'];
    if (!serahKO) pool.push('serah');
    if (kaelModel && !kaelKO) pool.push('kael');
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
        enemy.hpCur = Math.min(enemy.maxHp, enemy.hpCur + Math.round(enemy.maxHp * enemy.phase2.healPct);
        banner(enemy.phase2.name);
        AudioSys.play('dragoon');
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

    // DOT ticks on enemy
    for (const d of dots) {
      if (d.turns > 0) { enemy.hpCur -= d.dmg; UI.floaterAt(project(enemyModel.group.position, 2.6), d.dmg, '');
        log(`${enemy.name} suffers ${d.dmg} ${d.src} damage.`); d.turns--; await wait(350); }
    }
    dots = dots.filter(d => d.turns > 0);
    if (checkEnemyDead()) return;

    // ---- enemy special attack (25% chance, unique per enemy kind) ----
    if (Math.random() < .25) { await specialAttack(); }
    else {
    // enemy attack — picks a target from the party
    const pool = ['player'];
    if (!serahKO) pool.push('serah');
    if (kaelModel && !kaelKO) pool.push('kael');
    const tgt = pool[Math.floor(Math.random()*pool.length)];
    const targetSerah = tgt === 'serah', targetKael = tgt === 'kael';
    const tModel = targetSerah ? allyModel : targetKael ? kaelModel : playerModel;
    const tDodge = (targetSerah ? p.dodge*.8 : targetKael ? p.dodge*.85 : p.dodge + playerBuffs.dodge) + partyDodge;
    if (Math.random() < (enemyDebuff.miss || 0)) {
      log(`${enemy.name} attacks but misses in the smoke!`);
    } else if (Math.random() < tDodge) {
      log(`${targetSerah ? 'Serah dodges' : targetKael ? 'Kael dodges' : 'You dodge'} the attack!`); AudioSys.play('swing');
    } else {
      await hitTarget(tgt, enemy.dmg, 'hits');
    }
    }

    playerBuffs.defending = false; serahDefending = false; kaelDefending = false;
    // timers
    if (enemyDebuff.turns > 0 && --enemyDebuff.turns === 0) { enemyDebuff.dmg = 0; enemyDebuff.miss = 0; }
    if (playerBuffs.turns > 0 && --playerBuffs.turns === 0) { playerBuffs.dodge = 0; playerBuffs.defPct = 0; }
    if (partyDodgeTurns > 0 && --partyDodgeTurns === 0) partyDodge = 0;
    if (partyDefTurns > 0 && --partyDefTurns === 0) partyDef = 0;
    if (p.dragoonForm && --dragoonTurns === 0) endDragoon(false);
    p.spirit = Math.min(100, p.spirit + 3);
    UI.refreshHUD();
    await wait(500);
    showMenu();
  }

  function checkEnemyDead() {
    if (enemy.hpCur > 0) return false;
    AudioSys.play('enemyDie');
    UI.floaterAt(project(enemyModel.group.position, 2.5), 'SLAIN', 'crit');
    log(`${enemy.name} is destroyed!`);
    // death anim
    const g = enemyModel.group;
    const startT = performance.now();
    (function frame(now){
      const t = (now-startT)/900;
      if (t >= 1 || !g.parent) { setTimeout(()=> end(true), 400); return; }
      g.position.y = .3 - t*.8; g.rotation.z = t*1.2; g.scale.setScalar(Math.max(.01, 1-t));
      requestAnimationFrame(frame);
    })(startT);
    return true;
  }

  // ---------- SUBMENUS ----------
  function openSkills() {
    const sub = ui('battle-submenu'); sub.innerHTML = '';
    const p = RPG.player;
    let any = false;
    if (currentActor !== 'player') {
      const skillList = currentActor === 'serah' ? RPG.SERAH_SKILLS : RPG.KAEL_SKILLS;
      const pool = currentActor === 'serah' ? p.serah : p.kael;
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
      if (s.dragoonOnly && !p.dragoonForm) continue;
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

  let t = 0, lastBossHp = -1;
  function update(dt) {
    if (!active || !scene) return;
    t += dt;
    if (enemy && enemy.boss && enemy.hpCur !== lastBossHp) {
      lastBossHp = enemy.hpCur;
      ui('boss-fill').style.width = Math.max(0, enemy.hpCur/enemy.maxHp*100) + '%';
    }
    // idle anims
    if (playerModel) playerModel.body.position.y = Math.sin(t*2.2)*.04;
    if (allyModel) allyModel.body.position.y = Math.sin(t*2.6+.7)*.05;
    if (enemyModel && enemy.hpCur > 0) enemyModel.body.position.y = Math.sin(t*2.8+1)*.06;
    if (dragoonWings) dragoonWings.rotation.x = Math.sin(t*6)*.25;
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

  return { start, update, pressAddition, bindMenu, onResize,
    get active(){ return active; }, get scene(){ return scene; } };
})();
