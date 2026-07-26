/* game.js — overworld engine: zones, player, enemies, elites, camera, loot, minimap, portals */
const World = (() => {
  let renderer, scene, camera, player3d, clock;
  let enemies = [], lootDrops = [], props = [], particles = null, portals = [], interactables = [], npcs = [], houses = []; let grottoBossSpawnedFlag = false;
  let keys = {}, mouseDown = false, camYaw = 0.6, camPitch = 0.62;
  const CAM_DIST = 12;
  const WORLD_R = 70;
  let animT = 0, onEncounter = null, bossSpawned = false, grottoBossSpawned = false, camSnap = true;
  let currentZone = 'forest';

  const M = THREE;
  const rnd = (a,b)=>a+Math.random()*(b-a);
  const rndi = (a,b)=>Math.floor(rnd(a,b+1));
  function randInCircle(r){ const a=rnd(0,Math.PI*2), d=Math.sqrt(Math.random())*r; return {x:Math.cos(a)*d, z:Math.sin(a)*d}; }
  function mat(color, rough=0.85, metal=0.05, emissive=0x000000, eInt=0) {
    return new M.MeshStandardMaterial({ color, roughness: rough, metalness: metal,
      emissive, emissiveIntensity: eInt });
  }
  function fadeMat(color, rough=0.95) { const m = mat(color, rough); m.transparent = true; return m; }

  // ---------- ZONE DEFINITIONS ----------
  const ZONES = {
    forest: {
      name: 'Whisperwood',
      bg: 0x060a14, fog: [0x070d1a, 0.013], ground: 0x0e1a12,
      ambient: [0x1c2742, 0.55], hemi: [0x2a3a5c, 0x080f0a, 0.28],
      moon: [0x9db8ff, 1.1], rim: [0xff9a5c, 0.35],
      sky: true, trees: 110, treePalette: 0x12261a, rocks: 40, crystals: 14,
      ruins: true, fireflies: [0xaaffcc, 220],
      enemies: [
        { name:'Gloom Wolf',    kind:'wolf', color:0x4a5568, hp:40,  dmg:8,  xp:30,  gold:12, scale:.9, speed:2.2 },
        { name:'Cursed Husk',   kind:'golem', color:0x5a4a3a, hp:55,  dmg:11, xp:42,  gold:16, scale:1.0, speed:1.4 },
        { name:'Void Sprite',   kind:'wraith', color:0x7a3aa0, hp:35,  dmg:14, xp:50,  gold:22, scale:.8, speed:2.8 },
        { name:'Fallen Knight', kind:'humanoid', color:0x8a2020, hp:85,  dmg:16, xp:80,  gold:35, scale:1.15, speed:1.7 },
      ],
      enemyCount: 14, levelMod: 0,
    },
    town: {
      name: 'Mirewood Hollow',
      bg: 0x0a0e12, fog: [0x0c1016, 0.012], ground: 0x142016,
      ambient: [0x2a3040, 0.7], hemi: [0x3a4a5c, 0x0c1008, 0.35],
      moon: [0x9db8ff, 0.85], rim: [0xffc46a, 0.45],
      sky: true, trees: 24, treePalette: 0x12261a, rocks: 10, crystals: 0,
      ruins: false, fireflies: [0xffdd88, 120],
      enemies: [], enemyCount: 0, levelMod: 0, town: true,
    },
    coast: {
      name: 'Emberstrand Coast',
      bg: 0x0a1016, fog: [0x0c141c, 0.011], ground: 0x4a3f2c,
      ambient: [0x2a3648, 0.65], hemi: [0x3a4a6e, 0x100e08, 0.35],
      moon: [0xa8c4ff, 0.95], rim: [0xffc46a, 0.4],
      sky: true, trees: 0, treePalette: 0, rocks: 20, crystals: 0,
      ruins: false, fireflies: [0xbfe8ff, 140],
      enemies: [
        { name:'Sand Snapper',  kind:'wolf', color:0x8a7a4a, hp:60,  dmg:13, xp:55,  gold:20, scale:.95, speed:2.6 },
        { name:'Tide Wraith',   kind:'wraith', color:0x2a6a8a, hp:55,  dmg:18, xp:75,  gold:30, scale:.95, speed:2.8 },
        { name:'Coral Golem',   kind:'golem', color:0x9e5a5a, hp:110, dmg:16, xp:100, gold:38, scale:1.25, speed:1.3 },
        { name:'Pirate Husk',   kind:'humanoid', color:0x3a4a3a, hp:90, dmg:20, xp:95, gold:44, scale:1.1, speed:1.9 },
      ],
      enemyCount: 12, levelMod: 2,
    },
    dungeon: {
      name: 'The Hollow Deep',
      bg: 0x040508, fog: [0x060810, 0.024], ground: 0x0c0e14,
      ambient: [0x1a2030, 0.35], hemi: [0x222a3e, 0x050608, 0.16],
      moon: [0x6a7aaa, 0.3], rim: [0xff8a3a, 0.35],
      sky: false, trees: 0, treePalette: 0, rocks: 15, crystals: 0,
      ruins: false, fireflies: [0xffaa55, 90],
      enemies: [
        { name:'Dungeon Rat',    kind:'wolf', color:0x4a3a30, hp:80,  dmg:17, xp:90,  gold:28, scale:.85, speed:3.0 },
        { name:'Hollow Skeleton',kind:'humanoid', color:0x9a9a8a, hp:100, dmg:22, xp:120, gold:40, scale:1.05, speed:1.8 },
        { name:'Dark Acolyte',   kind:'wraith', color:0x3a2a4a, hp:75,  dmg:26, xp:110, gold:42, scale:.95, speed:2.6 },
        { name:'Stone Sentinel', kind:'golem', color:0x4a4a52, hp:150, dmg:20, xp:140, gold:52, scale:1.35, speed:1.1 },
      ],
      enemyCount: 10, levelMod: 4, dungeon: true,
    },
    grotto: {
      name: 'The Sunken Grotto',
      bg: 0x05060e, fog: [0x0a0a18, 0.016], ground: 0x0b0d16,
      ambient: [0x241c42, 0.6], hemi: [0x3a2a5c, 0x05060a, 0.3],
      moon: [0x8a7aff, 0.6], rim: [0x3ad5c8, 0.4],
      sky: false, trees: 0, treePalette: 0, rocks: 25, crystals: 46,
      ruins: false, fireflies: [0x8a7aff, 160],
      enemies: [
        { name:'Cave Lurker',   kind:'wolf', color:0x3a4a5a, hp:70,  dmg:15, xp:70,  gold:26, scale:1.0, speed:2.4 },
        { name:'Crystal Golem', kind:'golem', color:0x5a8a9e, hp:120, dmg:18, xp:110, gold:40, scale:1.3, speed:1.2 },
        { name:'Drowned Wraith',kind:'wraith', color:0x4a3a6a, hp:60,  dmg:22, xp:95,  gold:38, scale:.95, speed:2.9 },
        { name:'Gem Eater',     kind:'golem', color:0x9e5a3a, hp:90,  dmg:17, xp:85,  gold:46, scale:1.05, speed:1.8 },
      ],
      enemyCount: 12, levelMod: 3,
    },
    crater: {
      name: 'The Star Crater',
      bg: 0x0c0505, fog: [0x140808, 0.018], ground: 0x140e0c,
      ambient: [0x421c1c, 0.6], hemi: [0x5c2a1a, 0x0a0505, 0.3],
      moon: [0xff7a5c, 0.65], rim: [0xffb45c, 0.45],
      sky: false, trees: 0, treePalette: 0, rocks: 30, crystals: 20,
      ruins: false, fireflies: [0xff9a4d, 240],
      enemies: [
        { name:'Ash Revenant',  kind:'wraith', color:0x4a2a2a, hp:110, dmg:24, xp:130, gold:50, scale:1.05, speed:2.0 },
        { name:'Star Spawn',    kind:'wraith', color:0x6a3a5a, hp:85,  dmg:28, xp:150, gold:60, scale:.9, speed:3.0 },
        { name:'Magma Husk',    kind:'golem', color:0x7a3a1a, hp:160, dmg:26, xp:170, gold:65, scale:1.35, speed:1.3 },
        { name:'Ember Fiend',   kind:'humanoid', color:0xa03818, hp:95,  dmg:30, xp:160, gold:70, scale:1.0, speed:2.6 },
      ],
      enemyCount: 12, levelMod: 6,
    },
    peaks: {
      name: 'Stormpeak Ascent',
      bg: 0x070a12, fog: [0x090e1a, 0.019], ground: 0x232a3a,
      ambient: [0x222c42, 0.42], hemi: [0x2c3c5a, 0x080c12, 0.24],
      moon: [0x9db4e8, 0.7], rim: [0x7ae8ff, 0.42],
      sky: true, trees: 0, treePalette: 0, rocks: 30, crystals: 6,
      ruins: false, fireflies: [0xbfe8ff, 110],
      enemies: [
        { name:'Snow Stalker',   kind:'wolf', color:0x9aa8bc, hp:150, dmg:32, xp:200, gold:75,  scale:1.0, speed:3.1 },
        { name:'Frost Revenant', kind:'wraith', color:0x6a9ac8, hp:120, dmg:38, xp:230, gold:85,  scale:1.0, speed:2.9 },
        { name:'Crag Golem',     kind:'golem', color:0x5a6474, hp:220, dmg:34, xp:260, gold:95,  scale:1.4, speed:1.2 },
        { name:'Storm Cultist',  kind:'humanoid', color:0x3a4a7a, hp:140, dmg:40, xp:250, gold:110, scale:1.1, speed:2.2 },
      ],
      enemyCount: 12, levelMod: 8,
    },
  };
  const BOSS = { name:'Melbu\'s Herald', color:0x220a33, hp:420, dmg:24, xp:600, gold:400, scale:1.9, speed:1.9, boss:true, bossId:'herald', kind:'humanoid', shielded:true };
  const GROTTO_BOSS = { name:'Tyrant of the Deep', color:0x1a3a4a, hp:700, dmg:30, xp:1200, gold:900, scale:2.1, speed:1.6, boss:true, bossId:'tyrant', kind:'golem', enrage:{ at:.3, dmgMult:1.5 } };
  const CRATER_BOSS = { name:'MELBU FRAHMA', color:0x33111a, hp:1100, dmg:36, xp:3000, gold:2000, scale:2.4, speed:1.8, boss:true, bossId:'melbu', kind:'humanoid',
    phase2: { name:'🐉 MELBU FRAHMA — DRAGON AVATAR 🐉', dmgMult:1.4, healPct:.15, color:0x8a1420 } };
  const WARDEN = { name:'The Warden of Chains', color:0x3a2a2a, hp:550, dmg:28, xp:900, gold:600, scale:2.0, speed:1.7,
    boss:true, bossId:'warden', kind:'humanoid', enrage:{ at:.35, dmgMult:1.4 } };
  const STORMCALLER = { name:'The Stormcaller', color:0x2a4a7a, hp:1500, dmg:44, xp:4500, gold:3000, scale:2.3, speed:2.1,
    boss:true, bossId:'stormcaller', kind:'humanoid', enrage:{ at:.25, dmgMult:1.5 } };
  const ELITE_PREFIX = ['Cursed', 'Ancient', 'Void-Touched', 'Bloodbound'];

  // ---------- INIT ----------
  function init(canvas) {
    renderer = new M.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(innerWidth, innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = M.PCFSoftShadowMap;
    renderer.outputEncoding = M.sRGBEncoding;
    renderer.toneMapping = M.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    camera = new M.PerspectiveCamera(55, innerWidth/innerHeight, 0.1, 400);
    clock = new M.Clock();
    player3d = buildCharacter(0xff8833);
    buildZone('forest', true);
    addEventListeners();
  }

  // ---------- ZONE CONSTRUCTION ----------
  function buildZone(zoneId, first=false) {
    const Z = ZONES[zoneId];
    currentZone = zoneId;
    scene = new M.Scene();
    scene.background = new M.Color(Z.bg);
    scene.fog = new M.FogExp2(Z.fog[0], Z.fog[1]);
    enemies = []; lootDrops = []; props = []; portals = []; interactables = []; npcs = []; houses = []; gulls = []; torches = []; drips = [];
    snowPts = null; stormLight = null; summitTip = null; stormFlash = 0;

    const moon = new M.DirectionalLight(Z.moon[0], Z.moon[1]);
    moon.position.set(-30, 50, 20); moon.castShadow = true;
    moon.shadow.mapSize.set(2048, 2048);
    moon.shadow.camera.left = -60; moon.shadow.camera.right = 60;
    moon.shadow.camera.top = 60; moon.shadow.camera.bottom = -60;
    moon.shadow.camera.far = 150; moon.shadow.bias = -0.0004;
    scene.add(moon);
    const rim = new M.DirectionalLight(Z.rim[0], Z.rim[1]); rim.position.set(40, 20, -40); scene.add(rim);
    scene.add(new M.AmbientLight(Z.ambient[0], Z.ambient[1]));
    scene.add(new M.HemisphereLight(Z.hemi[0], Z.hemi[1], Z.hemi[2]));

    buildGround(Z);
    if (Z.sky) buildSky();
    if (Z.trees) buildForest(Z);
    if (zoneId === 'dungeon') buildDungeon(Z);
    if (zoneId === 'coast') buildCoast(Z);
    if (zoneId === 'town') buildTown(Z);
    if (zoneId === 'forest') buildRiver();
    if (zoneId === 'grotto') buildGrotto(Z);
    if (zoneId === 'crater') buildCrater(Z);
    if (zoneId === 'peaks') buildPeaks(Z);
    if (zoneId === 'peaks' && !(RPG.player && RPG.player.flags && RPG.player.flags.stormcallerDead)) stormcallerSpawned = false;
    if (Z.ruins) buildRuins();
    buildRocksAndCrystals(Z);
    buildClutter(Z);
    buildLeaves();
    buildParticles(Z);
    buildPortal(zoneId);
    scene.add(player3d.group);
    player3d.group.position.set(zoneId === 'forest' ? 20 : 24, 0, zoneId === 'forest' ? 20 : 24);
    camSnap = true;
    spawnEnemies(Z);
  }

  function buildGround(Z) {
    const geo = new M.CircleGeometry(WORLD_R + 30, 64);
    const gmat = mat(Z.ground, 1, 0);
    // procedural ground texture
    const gtex = (currentZone === 'forest' || currentZone === 'town') ? 'grass'
      : currentZone === 'coast' ? 'sand' : currentZone === 'dungeon' ? 'stoneBrick'
      : currentZone === 'peaks' ? 'snow'
      : currentZone === 'grotto' ? 'stoneBrick' : 'ash';
    if (typeof TexFactory !== 'undefined') TexFactory.apply(gmat, gtex, 24, 24);
    const ground = new M.Mesh(geo, gmat);
    ground.rotation.x = -Math.PI/2; ground.receiveShadow = true; scene.add(ground);
    for (let i=0;i<90;i++){
      const r = rnd(1.5, 5), p = randInCircle(WORLD_R+20);
      const patch = new M.Mesh(new M.CircleGeometry(r, 12),
        mat(new M.Color(Z.ground).offsetHSL(0, rnd(-0.02,0.02), rnd(-0.015,0.02)).getHex(), 1, 0));
      patch.rotation.x = -Math.PI/2; patch.position.set(p.x, 0.01 + Math.random()*0.02, p.z);
      patch.receiveShadow = true; scene.add(patch);
    }
    if (currentZone === 'town' || currentZone === 'coast' || currentZone === 'dungeon' || currentZone === 'peaks') {
      // town/coast/dungeon/peaks ground detail handled by their own builders
    } else if (currentZone === 'forest') {
      for (let d=8; d<WORLD_R; d+=2.4){
        const a = Math.PI/4;
        const stone = new M.Mesh(new M.CylinderGeometry(rnd(.4,.6), rnd(.5,.7), .1, 6), mat(0x1f2531, .95, .02));
        stone.position.set(Math.cos(a)*d + rnd(-.4,.4), .05, Math.sin(a)*d + rnd(-.4,.4));
        stone.receiveShadow = true; scene.add(stone);
      }
    } else {
      // glowing pools: teal water in grotto, lava in crater
      const lava = currentZone === 'crater';
      for (let i=0;i<14;i++){
        const p = randInCircle(WORLD_R-8);
        const pool = new M.Mesh(new M.CircleGeometry(rnd(1.5,3.5), 16),
          new M.MeshStandardMaterial(lava
            ? { color:0x3a0f05, emissive:0xcc3300, emissiveIntensity:.9, roughness:.3, metalness:.4 }
            : { color:0x062030, emissive:0x083a55, emissiveIntensity:.32, roughness:.2, metalness:.6 }));
        pool.rotation.x = -Math.PI/2; pool.position.set(p.x, .03, p.z); scene.add(pool);
        if (lava) { const pl = new M.PointLight(0xcc4400, .8, 10); pl.position.set(p.x, 1, p.z); scene.add(pl); }
      }
    }
  }

  function buildClutter(Z) {
    if (currentZone !== 'forest') return;
    // grass tufts
    for (let i=0;i<260;i++){
      const p = randInCircle(WORLD_R+8);
      const blades = 3;
      for (let b=0;b<blades;b++){
        const blade = new M.Mesh(new M.ConeGeometry(rnd(.04,.09), rnd(.25,.55), 4),
          mat(new M.Color(0x142a18).offsetHSL(0, rnd(-.03,.05), rnd(-.02,.03)).getHex(), .95));
        blade.position.set(p.x + rnd(-.25,.25), rnd(.1,.2), p.z + rnd(-.25,.25));
        blade.rotation.set(rnd(-.25,.25), rnd(0,3), rnd(-.25,.25));
        scene.add(blade);
      }
    }
    // nightbloom flowers
    for (let i=0;i<36;i++){
      const p = randInCircle(WORLD_R);
      const col = [0x7ec8ff, 0xcc88ff, 0xff9a9a][rndi(0,2)];
      const f = new M.Mesh(new M.ConeGeometry(.09, .18, 5), mat(col, .5, 0, col, .5));
      f.position.set(p.x, .22, p.z); scene.add(f);
      const stem = new M.Mesh(new M.CylinderGeometry(.015,.02,.2,4), mat(0x142a18, .95));
      stem.position.set(p.x, .1, p.z); scene.add(stem);
    }
    // fallen logs
    for (let i=0;i<9;i++){
      const p = randInCircle(WORLD_R-5);
      if (Math.hypot(p.x,p.z) < 12) continue;
      const log = new M.Mesh(new M.CylinderGeometry(rnd(.2,.3), rnd(.22,.32), rnd(2,4), 7), mat(0x241a10, .95));
      log.position.set(p.x, .28, p.z);
      log.rotation.z = Math.PI/2; log.rotation.y = rnd(0,3);
      log.castShadow = log.receiveShadow = true; scene.add(log);
      props.push({ x:p.x, z:p.z, r:1.4 });
    }
    // path edge pebbles
    for (let d=8; d<WORLD_R; d+=4.5){
      const a = Math.PI/4;
      for (const off of [-1.2, 1.2]) {
        const peb = new M.Mesh(new M.DodecahedronGeometry(rnd(.1,.22), 0), mat(0x252b38, .95));
        peb.position.set(Math.cos(a)*d - Math.sin(a)*off + rnd(-.3,.3), .08, Math.sin(a)*d + Math.cos(a)*off + rnd(-.3,.3));
        scene.add(peb);
      }
    }
  }

  // falling leaves
  let leaves = [];
  function buildLeaves() {
    leaves = [];
    if (currentZone !== 'forest') return;
    for (let i=0;i<70;i++){
      const leaf = new M.Mesh(new M.PlaneGeometry(.16,.2),
        new M.MeshBasicMaterial({ color: [0x2a4a2a, 0x3a5a24, 0x4a3a1a][rndi(0,2)], transparent:true, opacity:.8, side:M.DoubleSide }));
      const p = randInCircle(WORLD_R);
      leaf.position.set(p.x, rnd(2, 12), p.z);
      leaf.userData = { sway: rnd(0,6), fall: rnd(.4,.9) };
      scene.add(leaf); leaves.push(leaf);
    }
  }
  function updateLeaves(dt) {
    for (const leaf of leaves) {
      leaf.position.y -= leaf.userData.fall * dt;
      leaf.userData.sway += dt;
      leaf.position.x += Math.sin(leaf.userData.sway*2)*dt*.8;
      leaf.rotation.set(leaf.userData.sway*2, leaf.userData.sway, 0);
      if (leaf.position.y < 0) {
        const p = randInCircle(WORLD_R);
        leaf.position.set(p.x, rnd(8, 13), p.z);
      }
    }
  }

  // ---------- TOWN ----------
  function texMat(tex, rx, ry, opts={}) {
    const m = new M.MeshStandardMaterial({ color: 0xffffff, roughness: opts.rough ?? .9, metalness: opts.metal ?? .02 });
    if (typeof TexFactory !== 'undefined') TexFactory.apply(m, tex, rx, ry);
    if (opts.emissive) { m.emissive = new M.Color(opts.emissive); m.emissiveIntensity = opts.eInt ?? 1; }
    return m;
  }
  function buildHouse(x, z, rot, w, d, hgt) {
    const g = new M.Group();
    const walls = new M.Mesh(new M.BoxGeometry(w, hgt, d), texMat('plaster', 2, 1.5));
    walls.position.y = hgt/2; walls.castShadow = walls.receiveShadow = true; g.add(walls);
    const roof = new M.Mesh(new M.ConeGeometry(Math.max(w,d)*.78, hgt*.85, 4), texMat('shingle', 3, 2));
    roof.position.y = hgt + hgt*.42; roof.rotation.y = Math.PI/4; roof.castShadow = true; g.add(roof);
    const door = new M.Mesh(new M.BoxGeometry(w*.22, hgt*.55, .12), texMat('wood', 1, 1.2));
    door.position.set(0, hgt*.27, d/2 + .03); g.add(door);
    for (const side of [-1,1]) {
      const win = new M.Mesh(new M.PlaneGeometry(w*.2, hgt*.28),
        new M.MeshBasicMaterial({ color: 0xffc46a }));
      win.position.set(side*w*.3, hgt*.55, d/2 + .02); g.add(win);
      const beam = new M.Mesh(new M.BoxGeometry(.18, hgt, .18), texMat('wood', 1, 2));
      beam.position.set(side*(w/2-.05), hgt/2, d/2 - .05); g.add(beam);
    }
    const chim = new M.Mesh(new M.BoxGeometry(.35, hgt*.8, .35), texMat('stoneBrick', 1, 1.5));
    chim.position.set(w*.28, hgt + hgt*.5, -d*.15); chim.castShadow = true; g.add(chim);
    g.position.set(x, 0, z); g.rotation.y = rot; scene.add(g);
    houses.push({ x, z });
    props.push({ x, z, r: Math.max(w,d)*.75 });
    return g;
  }
  function buildLamp(x, z) {
    const g = new M.Group();
    const pole = new M.Mesh(new M.CylinderGeometry(.07, .1, 3, 6), texMat('wood', 1, 2));
    pole.position.y = 1.5; pole.castShadow = true; g.add(pole);
    const cage = new M.Mesh(new M.BoxGeometry(.34, .42, .34),
      new M.MeshBasicMaterial({ color: 0xffdd88 }));
    cage.position.y = 3.1; g.add(cage);
    const l = new M.PointLight(0xffc46a, 1.2, 12); l.position.y = 3.2; g.add(l);
    g.position.set(x, 0, z); scene.add(g);
    props.push({ x, z, r: .3 });
  }
  function buildWell(x, z) {
    const g = new M.Group();
    const ring = new M.Mesh(new M.CylinderGeometry(1, 1.1, .9, 10), texMat('stoneBrick', 4, 1));
    ring.position.y = .45; ring.castShadow = true; g.add(ring);
    for (const side of [-1,1]) {
      const post = new M.Mesh(new M.CylinderGeometry(.06,.08,1.8,5), texMat('wood', 1, 2));
      post.position.set(side*.85, 1.4, 0); g.add(post);
    }
    const wroof = new M.Mesh(new M.ConeGeometry(1.2, .8, 4), texMat('shingle', 2, 1.5));
    wroof.position.y = 2.6; wroof.rotation.y = Math.PI/4; g.add(wroof);
    g.position.set(x, 0, z); scene.add(g);
    props.push({ x, z, r: 1.3 });
  }
  function buildNPC(color, name) {
    const g = new M.Group(); const body = new M.Group();
    const robe = new M.Mesh(new M.CylinderGeometry(.3, .44, 1.3, 8), mat(color, .8));
    robe.position.y = .85; robe.castShadow = true; body.add(robe);
    const head = new M.Mesh(new M.SphereGeometry(.26, 12, 10), mat(0xe8c39a, .7));
    head.position.y = 1.75; body.add(head);
    const hood = new M.Mesh(new M.ConeGeometry(.3, .45, 8), mat(new M.Color(color).offsetHSL(0,0,-.06).getHex(), .8));
    hood.position.y = 1.95; body.add(hood);
    const armGeo = new M.CylinderGeometry(.07,.06,.6,5);
    for (const side of [-1,1]) {
      const arm = new M.Mesh(armGeo, mat(color, .8));
      arm.position.set(side*.38, 1.1, 0); arm.rotation.z = side*.3; body.add(arm);
    }
    g.add(body);
    return { group: g, body };
  }

  function buildTown(Z) {
    // dirt paths: portal → well → houses
    const pathMat = texMat('dirt', 6, 6);
    const mkPath = (x1,z1,x2,z2,w) => {
      const len = Math.hypot(x2-x1, z2-z1);
      const p = new M.Mesh(new M.PlaneGeometry(w, len), pathMat);
      p.rotation.x = -Math.PI/2; p.rotation.z = Math.atan2(x2-x1, z2-z1) + Math.PI;
      p.position.set((x1+x2)/2, .04, (z1+z2)/2); p.receiveShadow = true; scene.add(p);
    };
    mkPath(-27,-27, 0,0, 3); mkPath(0,0, 18,-14, 2.4); mkPath(0,0, -16,12, 2.4);
    mkPath(0,0, 10,18, 2.4); mkPath(0,0, -18,-10, 2.2);
    // houses
    buildHouse(14, -16, .4, 5, 4.4, 3.2);
    buildHouse(-17, 10, -.5, 4.6, 4, 3);
    buildHouse(8, 19, 2.6, 5.2, 4.6, 3.4);
    buildHouse(-19, -9, 1.1, 4.4, 4, 2.9);
    buildHouse(20, 8, -2.2, 4.8, 4.2, 3.1);
    buildHouse(-6, 24, .1, 4.2, 3.8, 2.8);
    // central well + lamps
    buildWell(0, 0);
    buildLamp(-24,-24); buildLamp(4,-4); buildLamp(-4,4); buildLamp(12,14); buildLamp(-12,-14); buildLamp(16,-11);
    // pond with water texture
    const pond = new M.Mesh(new M.CircleGeometry(6, 24), texMat('water', 3, 3, { rough:.15, metal:.5 }));
    pond.rotation.x = -Math.PI/2; pond.position.set(26, .05, 18); scene.add(pond);
    const pl = new M.PointLight(0x2a6a8e, .8, 14); pl.position.set(26, 1, 18); scene.add(pl);
    props.push({ x:26, z:18, r:6 });
    // wooden fences along main path
    for (let i=0;i<8;i++){
      const t = i/8, fx = -27 + (27*t), fz = -27 + (27*t);
      for (const off of [-2.2, 2.2]) {
        const f = new M.Mesh(new M.CylinderGeometry(.06,.07,.8,5), texMat('wood', 1, 1));
        f.position.set(fx + off*.7, .4, fz - off*.7); scene.add(f);
      }
    }
    // ---------- NPCS ----------
    const NPC_DEFS = [
      { id:'bertram', name:'Bertram', role:'General Goods', color:0x6a4a2a, x:12, z:-13, wander:3,
        lines:['Potions, charms, curios from beyond the wood. Coin talks, friend.',
               'I heard the shrine whispering again last night. Buy extra potions. Just in case.'],
        shop:'general' },
      { id:'yara', name:'Yara', role:'Blacksmith', color:0x5a2a2a, x:-15, z:8, wander:2,
        lines:['Steel doesn\'t care about prophecies. It cares about edge and temper.',
               'Bring me gold, I\'ll bring you something that bites.'],
        shop:'smith' },
      { id:'fenn', name:'Fenn', role:'Alchemist', color:0x2a5a5a, x:24, z:14, wander:4,
        lines:['The pond water glows since the Star fell. Delicious irony — it heals AND it kills.',
               'Mana is just water that remembers being lightning.'],
        shop:'alch' },
      { id:'maera', name:'Elder Maera', role:'Village Elder', color:0x8a8a9a, x:3, z:3, wander:1,
        lines:[] }, // quest-aware lines provided by Main
      { id:'pip', name:'Pip', role:'Kid', color:0x4a6a3a, x:-6, z:18, wander:8,
        lines:['Serah showed me a REAL Wingly feather! It glows!',
               'When I grow up I\'m gonna be a Dragoon too!'],
        shop:null },
    ];
    for (const def of NPC_DEFS) {
      const m = buildNPC(def.color, def.name);
      if (def.id === 'pip') m.group.scale.setScalar(.7);
      m.group.position.set(def.x, 0, def.z);
      scene.add(m.group);
      npcs.push({ ...def, c3d: m, home:{x:def.x, z:def.z}, wanderT: rnd(1,4), tx:def.x, tz:def.z });
    }
  }

  // ---------- NPC update/interact ----------
  function updateNPCs(dt) {
    for (const n of npcs) {
      const gp = n.c3d.group.position;
      n.wanderT -= dt;
      if (n.wanderT <= 0) {
        n.wanderT = rnd(3, 7);
        const a = rnd(0, Math.PI*2);
        n.tx = n.home.x + Math.cos(a) * n.wander;
        n.tz = n.home.z + Math.sin(a) * n.wander;
      }
      const dx = n.tx - gp.x, dz = n.tz - gp.z, d = Math.hypot(dx, dz);
      if (d > .2) {
        gp.x += dx/d * dt * 1.4; gp.z += dz/d * dt * 1.4;
        n.c3d.group.rotation.y = Math.atan2(dx, dz);
        n.c3d.body.position.y = Math.abs(Math.sin(animT*8 + gp.x))*.05;
      } else n.c3d.body.position.y = Math.sin(animT*2 + gp.x)*.02;
    }
  }
  function nearNPC() {
    const p = player3d.group.position;
    for (const n of npcs) {
      if (Math.hypot(p.x - n.c3d.group.position.x, p.z - n.c3d.group.position.z) < 2.6) return n;
    }
    return null;
  }

  // ---------- DUNGEON ----------
  let torches = [];
  function buildTorch(x, z, h=2.6) {
    const g = new M.Group();
    const stick = new M.Mesh(new M.CylinderGeometry(.05,.06,.8,5), texMat('wood', 1, 1));
    stick.position.y = h; stick.rotation.z = .3; g.add(stick);
    const flame = new M.Mesh(new M.SphereGeometry(.16, 8, 8),
      new M.MeshBasicMaterial({ color: 0xffaa33 }));
    flame.position.y = h + .5; g.add(flame);
    const l = new M.PointLight(0xff8a3a, 1.3, 11); l.position.y = h + .6; g.add(l);
    g.position.set(x, 0, z); scene.add(g);
    torches.push({ flame, l, seed: rnd(0, 10) });
  }
  function updateTorches(dt) {
    animT += 0;
    for (const t of torches) {
      t.seed += dt * 8;
      const f = .9 + Math.sin(t.seed) * .18 + Math.sin(t.seed*2.7) * .08;
      t.l.intensity = 1.3 * f;
      t.flame.scale.setScalar(f);
    }
  }
  function buildWallSeg(x, z, w, d, rot=0) {
    const wall = new M.Mesh(new M.BoxGeometry(w, 4.5, d), texMat('stoneBrick', Math.max(1,w/4), 1.5));
    wall.position.set(x, 2.25, z); wall.rotation.y = rot;
    wall.castShadow = wall.receiveShadow = true; scene.add(wall);
    props.push({ x, z, r: Math.max(w,d)*.55 });
  }
  function buildCell(x, z, rot=0) {
    const g = new M.Group();
    for (let i=0;i<5;i++){
      const bar = new M.Mesh(new M.CylinderGeometry(.06,.06,3,5),
        new M.MeshStandardMaterial({ color: 0x2a2e38, roughness: .4, metalness: .8 }));
      bar.position.set(-1 + i*.5, 1.5, 0); g.add(bar);
    }
    const lintel = new M.Mesh(new M.BoxGeometry(2.4, .2, .15),
      new M.MeshStandardMaterial({ color: 0x2a2e38, roughness: .4, metalness: .8 }));
    lintel.position.y = 3; g.add(lintel);
    g.position.set(x, 0, z); g.rotation.y = rot; scene.add(g);
    props.push({ x, z, r: 1.2 });
    // straw + bones inside
    const straw = new M.Mesh(new M.CircleGeometry(.8, 8), mat(0x3a3020, 1));
    straw.rotation.x = -Math.PI/2; straw.position.set(x, .05, z - 1.2); scene.add(straw);
    const bone = new M.Mesh(new M.CylinderGeometry(.04,.05,.7,4), mat(0xd8d0c0, .7));
    bone.position.set(x + rnd(-.5,.5), .1, z - 1 + rnd(-.5,.5));
    bone.rotation.set(Math.PI/2, 0, rnd(0,3)); scene.add(bone);
  }
  function buildDungeon(Z) {
    // perimeter walls
    const R = WORLD_R + 6;
    buildWallSeg(0, -R, R*2, 2); buildWallSeg(0, R, R*2, 2);
    buildWallSeg(-R, 0, 2, R*2); buildWallSeg(R, 0, 2, R*2);
    // corridor segments — a rough maze feel
    buildWallSeg(-20, -12, 24, 2, 0);
    buildWallSeg(14, -20, 2, 20, 0);
    buildWallSeg(20, 8, 22, 2, .2);
    buildWallSeg(-6, 16, 2, 22, 0);
    buildWallSeg(-26, 22, 16, 2, -.3);
    buildWallSeg(8, 30, 2, 14, 0);
    buildWallSeg(30, -34, 14, 2, .4);
    // warden's chamber at the north
    buildWallSeg(-14, -34, 2, 12, 0);
    buildWallSeg(14, -34, 2, 12, 0);
    buildWallSeg(0, -40, 30, 2, 0);
    // torches along corridors
    for (const [x,z] of [[-18,-10],[-22,-14],[12,-18],[18,6],[-4,14],[-24,20],[6,28],[28,-32],[-10,-36],[10,-36],[-8,-28],[8,-28],[2,-6],[-28,6],[26,24],[-14,26]])
      buildTorch(x + rnd(-.5,.5), z + rnd(-.5,.5));
    // cells
    buildCell(-24, -30, .3); buildCell(24, -14, -.4); buildCell(-30, 8, 1.2); buildCell(18, 26, .2);
    // rubble
    for (let i=0;i<16;i++){
      const p = randInCircle(WORLD_R);
      const rb = new M.Mesh(new M.DodecahedronGeometry(rnd(.2,.6), 0), mat(0x242a36, .9, .05));
      rb.position.set(p.x, rnd(.1,.3), p.z); rb.rotation.set(rnd(0,3),rnd(0,3),rnd(0,3));
      rb.castShadow = true; scene.add(rb);
      if (i%3===0) props.push({ x:p.x, z:p.z, r:.6 });
    }
    // hanging chains in warden's room
    for (let i=0;i<6;i++){
      const ch = new M.Mesh(new M.CylinderGeometry(.03,.03,rnd(2,4),4),
        new M.MeshStandardMaterial({ color: 0x3a3e48, roughness: .35, metalness: .85 }));
      ch.position.set(-6 + i*2.4, 5, -34 + rnd(-2,2)); scene.add(ch);
      const hook = new M.Mesh(new M.TorusGeometry(.12, .03, 6, 10, Math.PI),
        new M.MeshStandardMaterial({ color: 0x3a3e48, metalness: .85, roughness: .3 }));
      hook.position.copy(ch.position); hook.position.y -= 2; scene.add(hook);
    }
    // drip particles (water from ceiling)
    for (let i=0;i<20;i++){
      const drip = new M.Mesh(new M.SphereGeometry(.04, 4, 4),
        new M.MeshBasicMaterial({ color: 0x7ec8ff, transparent:true, opacity:.7 }));
      drip.position.set(rnd(-30,30), rnd(4,10), rnd(-30,30));
      drip.userData = { y0: drip.position.y, spd: rnd(3,7) };
      scene.add(drip);
      drips.push(drip);
    }
  }
  let drips = [];
  function updateDrips(dt) {
    for (const d of drips) {
      d.position.y -= d.userData.spd * dt;
      if (d.position.y < 0) d.position.y = d.userData.y0;
    }
  }

  // ---------- COAST ----------
  function buildPalm(x, z, s=1) {
    const g = new M.Group();
    const trunk = new M.Mesh(new M.CylinderGeometry(.12*s, .2*s, 4.2*s, 6), texMat('wood', 1, 2));
    trunk.position.y = 2*s; trunk.rotation.z = .18; trunk.castShadow = true; g.add(trunk);
    for (let i=0;i<6;i++){
      const a = i/6*Math.PI*2;
      const frond = new M.Mesh(new M.PlaneGeometry(2.2*s, .5*s),
        new M.MeshStandardMaterial({ color: 0x1d4a24, roughness:.9, side:M.DoubleSide }));
      frond.position.set(Math.cos(a)*.8*s + .7*s, 4.3*s, Math.sin(a)*.8*s);
      frond.rotation.y = -a; frond.rotation.z = -.5;
      g.add(frond);
    }
    g.position.set(x, 0, z); scene.add(g);
    props.push({ x, z, r: .5 });
  }
  function buildCoast(Z) {
    // the sea: a vast water expanse east of the strand
    const sea = new M.Mesh(new M.CircleGeometry(80, 48), texMat('water', 12, 12, { rough:.12, metal:.5 }));
    sea.rotation.x = -Math.PI/2; sea.position.set(110, .02, 0); scene.add(sea);
    const seaGlow = new M.PointLight(0x2a6a9e, 1.2, 60); seaGlow.position.set(50, 3, 0); scene.add(seaGlow);
    // surf line: foam edge where water meets sand
    for (let i=0;i<12;i++){
      const foam = new M.Mesh(new M.CircleGeometry(rnd(.4,.9), 10),
        new M.MeshBasicMaterial({ color: 0xbfe8ff, transparent:true, opacity:.4 }));
      foam.rotation.x = -Math.PI/2;
      foam.position.set(38 + rnd(-1.5,1.5), .06, -30 + i*5.5 + rnd(-1,1));
      scene.add(foam);
    }
    // pier into the water
    for (let i=0;i<7;i++){
      const plank = new M.Mesh(new M.BoxGeometry(1.8, .14, 1.1), texMat('wood', 1.5, 1));
      plank.position.set(36 + i*1.9, .55, -6); plank.castShadow = true; scene.add(plank);
      for (const side of [-1,1]) {
        const post = new M.Mesh(new M.CylinderGeometry(.07,.09,.9,5), texMat('wood', 1, 1));
        post.position.set(36 + i*1.9, .15, -6 + side*.8); scene.add(post);
      }
    }
    // palms scattered on the strand
    for (let i=0;i<10;i++){
      const p = randInCircle(WORLD_R);
      if (p.x > 26 || Math.hypot(p.x,p.z) < 10) continue;
      buildPalm(p.x, p.z, rnd(.8, 1.3));
    }
    // mountains silhouetting the west horizon
    for (const [mx, mh] of [[-70, 26],[-52, 18],[-38, 22]]){
      const mtn = new M.Mesh(new M.ConeGeometry(22, mh, 6),
        new M.MeshStandardMaterial({ color: 0x141c2a, roughness: 1 }));
      mtn.position.set(mx, mh/2 - 2, -55); scene.add(mtn);
      const cap = new M.Mesh(new M.ConeGeometry(7, mh*.35, 6),
        new M.MeshStandardMaterial({ color: 0x3a4a5c, roughness: .9 }));
      cap.position.set(mx, mh - mh*.18 - 2, -55); scene.add(cap);
    }
    // shells + driftwood
    for (let i=0;i<20;i++){
      const p = randInCircle(WORLD_R-5);
      if (p.x > 30) continue;
      const sh = new M.Mesh(new M.ConeGeometry(rnd(.08,.16), rnd(.1,.2), 5),
        mat([0xd8cfc0, 0xc8b8a8, 0xe8e0d0][rndi(0,2)], .6));
      sh.position.set(p.x, .08, p.z); scene.add(sh);
    }
    for (let i=0;i<6;i++){
      const p = randInCircle(WORLD_R-8);
      const dw = new M.Mesh(new M.CylinderGeometry(rnd(.1,.18), rnd(.12,.2), rnd(1.5,3), 6), texMat('wood', 2, 1));
      dw.position.set(p.x, .2, p.z); dw.rotation.z = Math.PI/2; dw.rotation.y = rnd(0,3);
      dw.castShadow = true; scene.add(dw);
      props.push({ x:p.x, z:p.z, r:1 });
    }
    // gull cries: white birds circling high
    for (let i=0;i<8;i++){
      const bird = new M.Mesh(new M.PlaneGeometry(.5,.16),
        new M.MeshBasicMaterial({ color: 0xdfe8f0, side:M.DoubleSide }));
      bird.position.set(rnd(-20,30), rnd(12,20), rnd(-20,20));
      bird.userData = { a: rnd(0,6), r: rnd(8,18), y: bird.position.y, cx: rnd(-10,20), cz: rnd(-10,10), spd: rnd(.3,.7) };
      scene.add(bird);
      gulls.push(bird);
    }
  }
  let gulls = [];
  function updateGulls(dt) {
    for (const b of gulls) {
      const u = b.userData;
      u.a += dt * u.spd;
      b.position.set(u.cx + Math.cos(u.a)*u.r, u.y + Math.sin(u.a*2)*.8, u.cz + Math.sin(u.a)*u.r);
      b.rotation.y = -u.a;
    }
  }

  // ---------- STORMPEAK ASCENT ----------
  let snowPts = null, stormT = 0, stormFlash = 0, stormLight = null, summitTip = null;
  function buildPeakCone(x, z, r, h) {
    const rockM = texMat('iceRock', 3, 3, { rough:.95, metal:.02 });
    const cone = new M.Mesh(new M.ConeGeometry(r, h, 7), rockM);
    cone.position.set(x, h/2 - .4, z);
    cone.rotation.y = rnd(0, 6);
    cone.castShadow = cone.receiveShadow = true; scene.add(cone);
    // snow cap
    const cap = new M.Mesh(new M.ConeGeometry(r*.46, h*.4, 7), mat(0xaebdd4, .9, .02));
    cap.position.set(x, h*.82 - .4, z); cap.rotation.y = cone.rotation.y;
    cap.castShadow = true; scene.add(cap);
  }
  function buildDeadPine(x, z, s=1) {
    const g = new M.Group();
    const trunk = new M.Mesh(new M.CylinderGeometry(.09*s, .16*s, 2.6*s, 5), mat(0x1e1a16, .95, 0));
    trunk.position.y = 1.3*s; trunk.castShadow = true; g.add(trunk);
    const bMat = mat(0x17140f, .95, 0);
    const nb = rndi(3, 5);
    for (let i=0;i<nb;i++){
      const bl = rnd(.7, 1.3)*s;
      const br = new M.Mesh(new M.CylinderGeometry(.02*s, .05*s, bl, 4), bMat);
      const a = rnd(0, Math.PI*2), tilt = rnd(.6, 1.1);
      br.position.set(Math.cos(a)*bl*.32, (1.4 + i*.28)*s, Math.sin(a)*bl*.32);
      br.rotation.z = Math.cos(a)*tilt; br.rotation.x = -Math.sin(a)*tilt;
      br.castShadow = true; g.add(br);
    }
    // dusting of snow on the trunk top
    const dust = new M.Mesh(new M.ConeGeometry(.14*s, .3*s, 5), mat(0xaebdd4, .9, 0));
    dust.position.y = 2.7*s; g.add(dust);
    g.position.set(x, 0, z); g.rotation.y = rnd(0, 6);
    scene.add(g); return g;
  }
  function buildPeaks(Z) {
    // ring of jagged mountains hemming the ascent
    for (let i=0;i<14;i++){
      const a = (i/14) * Math.PI*2 + rnd(-.08, .08);
      const d = WORLD_R + rnd(4, 16);
      buildPeakCone(Math.cos(a)*d, Math.sin(a)*d, rnd(7, 13), rnd(18, 34));
    }
    // inner crags — switchback feel
    for (let i=0;i<8;i++){
      const a = rnd(0, Math.PI*2), d = rnd(24, WORLD_R-8);
      const x = Math.cos(a)*d, z = Math.sin(a)*d;
      if (Math.hypot(x-24, z-24) < 14 || Math.hypot(x, z+34) < 16) continue;
      buildPeakCone(x, z, rnd(2.5, 5), rnd(6, 12));
    }
    // dead pines clinging to the slope
    for (let i=0;i<26;i++){
      const p = randInCircle(WORLD_R-4);
      if (Math.hypot(p.x-24, p.z-24) < 10 || Math.hypot(p.x, p.z+34) < 12) continue;
      buildDeadPine(p.x, p.z, rnd(.8, 1.5));
    }
    // boulders
    for (let i=0;i<24;i++){
      const p = randInCircle(WORLD_R-3);
      const b = new M.Mesh(new M.DodecahedronGeometry(rnd(.4, 1.3), 0), texMat('iceRock', 1, 1, { rough:.95 }));
      b.position.set(p.x, rnd(.1, .4), p.z); b.rotation.set(rnd(0,3), rnd(0,3), rnd(0,3));
      b.castShadow = b.receiveShadow = true; scene.add(b);
    }
    // wind-scoured drift ridges
    for (let i=0;i<16;i++){
      const p = randInCircle(WORLD_R);
      const drift = new M.Mesh(new M.SphereGeometry(rnd(1.2, 2.6), 10, 6), mat(0x3e4c62, 1, 0));
      drift.scale.set(1, rnd(.12, .2), rnd(.5, .8));
      drift.position.set(p.x, .02, p.z); drift.rotation.y = rnd(0, 6);
      drift.receiveShadow = true; scene.add(drift);
    }
    // the summit shrine — broken circle of standing stones around a storm obelisk
    const sy = -34;
    const plat = new M.Mesh(new M.CylinderGeometry(9, 10, .7, 18), texMat('stoneBrick', 6, 6, { rough:.9 }));
    plat.position.set(0, .35, sy); plat.receiveShadow = true; scene.add(plat);
    for (let i=0;i<7;i++){
      const a = (i/7)*Math.PI*2;
      const h = rnd(2.6, 4.2);
      const stone = new M.Mesh(new M.BoxGeometry(rnd(.7, 1), h, rnd(.5, .8)), texMat('iceRock', 1, 2, { rough:.95 }));
      stone.position.set(Math.cos(a)*7.4, .7 + h/2, sy + Math.sin(a)*7.4);
      stone.rotation.y = a + rnd(-.2, .2); stone.castShadow = true; scene.add(stone);
    }
    const ob = new M.Mesh(new M.CylinderGeometry(.5, 1.1, 6.5, 6), texMat('iceRock', 1, 3, { rough:.8, metal:.15 }));
    ob.position.set(0, 3.9, sy); ob.castShadow = true; scene.add(ob);
    const obTip = new M.Mesh(new M.OctahedronGeometry(.7, 0), mat(0x7ae8ff, .2, .6, 0x7ae8ff, 1.2));
    obTip.position.set(0, 7.6, sy); scene.add(obTip);
    const obLight = new M.PointLight(0x7ae8ff, 1.4, 22); obLight.position.set(0, 6.5, sy); scene.add(obLight);
    summitTip = obTip;
    // lightning rod for storm flashes
    stormLight = new M.PointLight(0xcfe4ff, 0, 120); stormLight.position.set(0, 30, 0); scene.add(stormLight);
    stormT = rnd(4, 8); stormFlash = 0;
    // snowfall
    const N = 900, pos = new Float32Array(N*3);
    for (let i=0;i<N;i++){ pos[i*3] = rnd(-70, 70); pos[i*3+1] = rnd(0, 40); pos[i*3+2] = rnd(-70, 70); }
    const geo = new M.BufferGeometry();
    geo.setAttribute('position', new M.BufferAttribute(pos, 3));
    snowPts = new M.Points(geo, new M.PointsMaterial({
      color: 0xd8e6ff, size: .14, transparent: true, opacity: .85, depthWrite: false }));
    scene.add(snowPts);
  }
  function updatePeaks(dt) {
    if (currentZone !== 'peaks') return;
    // obelisk crystal turns in the wind
    if (summitTip) { summitTip.rotation.y += dt * .8; summitTip.position.y = 7.6 + Math.sin(animT * 1.4) * .18; }
    // snowfall drifts down and sideways with the wind, wrapping around the player
    if (snowPts) {
      const arr = snowPts.geometry.attributes.position.array;
      const p = player3d.group.position;
      for (let i=0;i<arr.length;i+=3){
        arr[i+1] -= dt * 6.5;
        arr[i]   += dt * 2.2;
        if (arr[i+1] < 0) { arr[i+1] = 40; arr[i] = p.x + rnd(-70, 70); arr[i+2] = p.z + rnd(-70, 70); }
      }
      snowPts.geometry.attributes.position.needsUpdate = true;
    }
    // storm cycle: charge, flash, rumble
    stormT -= dt;
    if (stormT <= 0) {
      stormT = rnd(5, 13);
      stormFlash = .6;
      if (stormLight) stormLight.intensity = 3.2;
      setTimeout(() => AudioSys.play('thunder'), rnd(300, 900));
    }
    if (stormFlash > 0) {
      stormFlash -= dt;
      if (stormLight) stormLight.intensity = Math.max(0, stormFlash * 5.5 - (Math.random() < .3 ? 1.2 : 0));
    }
  }

  // ---------- FOREST RIVER ----------
  function buildRiver() {
    // a cold river cutting across the wood, crossed by a plank bridge on the stone path
    const rmat = texMat('water', 8, 2, { rough:.15, metal:.5 });
    const river = new M.Mesh(new M.PlaneGeometry(6, 130), rmat);
    river.rotation.x = -Math.PI/2; river.rotation.z = Math.PI/4 + .95;
    river.position.set(6, .04, -2); scene.add(river);
    const rl = new M.PointLight(0x2a5a7e, .7, 30); rl.position.set(6, 2, -2); scene.add(rl);
    // collision along its length (skip at bridge)
    const dirA = Math.PI/4 + .95;
    for (let i=-9;i<=9;i++){
      const d = i*6.5;
      const cx = 6 + Math.cos(dirA+Math.PI/2)*d*0 + Math.cos(dirA)*d*0; // river center line param below
    }
    // collision circles along the river center line
    for (let i=-9;i<=9;i++){
      const d = i*6.5;
      const cx = 6 + Math.cos(dirA)*d, cz = -2 + Math.sin(dirA)*d;
      if (Math.hypot(cx-13, cz-11) < 5) continue; // bridge gap
      props.push({ x:cx, z:cz, r:2.6 });
    }
    // the bridge on the stone path
    const bridge = new M.Mesh(new M.BoxGeometry(7, .2, 3.4), texMat('wood', 4, 2));
    bridge.position.set(13, .3, 11); bridge.rotation.y = dirA; bridge.castShadow = true; scene.add(bridge);
    for (const side of [-1,1]) {
      const rail = new M.Mesh(new M.BoxGeometry(7, .5, .12), texMat('wood', 4, 1));
      rail.position.set(13 - Math.sin(dirA)*side*1.6, .8, 11 - Math.cos(dirA)*side*1.6);
      rail.rotation.y = dirA; scene.add(rail);
    }
  }

  function buildSky() {
    const starGeo = new M.BufferGeometry(); const pts = [];
    for (let i=0;i<800;i++){
      const a = rnd(0,Math.PI*2), e = rnd(0.05, Math.PI/2), r = 300;
      pts.push(Math.cos(a)*Math.cos(e)*r, Math.sin(e)*r, Math.sin(a)*Math.cos(e)*r);
    }
    starGeo.setAttribute('position', new M.Float32BufferAttribute(pts, 3));
    scene.add(new M.Points(starGeo, new M.PointsMaterial({ color:0xcfe0ff, size:1.4, sizeAttenuation:false })));
    const glow = new M.Mesh(new M.SphereGeometry(10, 16, 16),
      new M.MeshBasicMaterial({ color:0x7ec8ff, transparent:true, opacity:.85 }));
    glow.position.set(140, 26, -190); scene.add(glow);
    const halo = new M.Mesh(new M.SphereGeometry(24, 16, 16),
      new M.MeshBasicMaterial({ color:0x3a7bd5, transparent:true, opacity:.18 }));
    halo.position.copy(glow.position); scene.add(halo);
    scene.userData.skyGlow = glow;
  }

  function buildTree(x, z, s, palette) {
    const g = new M.Group(); const mats = [];
    const trunk = new M.Mesh(new M.CylinderGeometry(.35*s, .55*s, 3.4*s, 7), fadeMat(0x241a10));
    mats.push(trunk.material);
    trunk.position.y = 1.7*s; trunk.castShadow = true; g.add(trunk);
    const layers = [[2.6, 3.2, 3.4], [2.0, 2.6, 5.2], [1.3, 2.0, 6.8]];
    for (const [r, h, y] of layers) {
      const c = new M.Mesh(new M.ConeGeometry(r*s, h*s, 8),
        fadeMat(new M.Color(palette).offsetHSL(0, rnd(-.03,.03), rnd(-.015,.02)).getHex()));
      mats.push(c.material);
      c.position.y = y*s; c.castShadow = true; g.add(c);
    }
    g.position.set(x, 0, z); g.rotation.y = rnd(0, 6); scene.add(g);
    props.push({ x, z, r: 1*s, mats });
  }

  function buildForest(Z) {
    for (let i=0;i<Z.trees;i++){
      const p = randInCircle(WORLD_R+8);
      if (Math.hypot(p.x, p.z) < 12) continue;
      if (Math.hypot(p.x-20, p.z-20) < 11) continue;
      if (Math.abs(p.x - p.z) < 3 && p.x > 0) continue;
      buildTree(p.x, p.z, rnd(.8, 1.7), Z.treePalette);
    }
  }

  function buildGrotto(Z) {
    // stalagmites & stalactites
    for (let i=0;i<60;i++){
      const p = randInCircle(WORLD_R+10);
      if (Math.hypot(p.x, p.z) < 10) continue;
      const h = rnd(1.5, 6), up = Math.random() < .7;
      const c = new M.Mesh(new M.ConeGeometry(rnd(.4,1.1), h, 6),
        mat(new M.Color(0x1a2030).offsetHSL(0, 0, rnd(-.02,.03)).getHex(), .9, .05));
      if (up) { c.position.set(p.x, h/2, p.z); props.push({ x:p.x, z:p.z, r:.8 }); }
      else { c.rotation.x = Math.PI; c.position.set(p.x, 14 + h/2, p.z); }
      c.castShadow = true; scene.add(c);
    }
    // landmark crystal clusters (first two fixed: spawn approach + tyrant lair)
    const clusterSpots = [{x:16,z:16},{x:0,z:-26}];
    for (let cl=0; cl<7; cl++){
      const c0 = cl < 2 ? clusterSpots[cl] : randInCircle(WORLD_R-10);
      if (cl >= 2 && Math.hypot(c0.x, c0.z) < 12) { cl--; continue; }
      for (let i=0;i<4;i++){
        const s = rnd(.7, 1.5);
        const cry = new M.Mesh(new M.OctahedronGeometry(s, 0),
          mat(0x8a6aff, .15, .15, 0x5533cc, 1.5));
        cry.position.set(c0.x + rnd(-2.2,2.2), s*.8, c0.z + rnd(-2.2,2.2));
        cry.rotation.set(rnd(-.3,.3), rnd(0,3), rnd(-.3,.3));
        scene.add(cry);
      }
      const cl1 = new M.PointLight(0x6644dd, 1.6, 16); cl1.position.set(c0.x, 2.5, c0.z); scene.add(cl1);
      props.push({ x:c0.x, z:c0.z, r:2.2 });
    }
    // bioluminescent cave growth
    for (let i=0;i<50;i++){
      const p = randInCircle(WORLD_R);
      const col = Math.random()<.5 ? 0x3ad5c8 : 0x8a6aff;
      const sh = new M.Mesh(new M.ConeGeometry(rnd(.1,.22), rnd(.25,.5), 5),
        mat(col, .4, 0, col, 1.3));
      sh.position.set(p.x, .2, p.z); scene.add(sh);
    }
    // cave ceiling disc (dark canopy high above)
    const ceil = new M.Mesh(new M.CircleGeometry(WORLD_R + 30, 32),
      new M.MeshBasicMaterial({ color: 0x03040a, side: M.DoubleSide }));
    ceil.rotation.x = Math.PI/2; ceil.position.y = 22; scene.add(ceil);
  }

  function buildCrater(Z) {
    // obsidian spikes
    for (let i=0;i<50;i++){
      const p = randInCircle(WORLD_R+10);
      if (Math.hypot(p.x, p.z) < 10) continue;
      const h = rnd(2, 8);
      const c = new M.Mesh(new M.ConeGeometry(rnd(.4,1.2), h, 5),
        mat(new M.Color(0x120c10).offsetHSL(0, 0, rnd(-.01,.03)).getHex(), .55, .3));
      c.position.set(p.x, h/2, p.z); c.castShadow = true; scene.add(c);
      props.push({ x:p.x, z:p.z, r:.8 });
    }
    // crater bowl at center
    const bowl = new M.Mesh(new M.CylinderGeometry(9, 5, 2.5, 24, 1, true),
      new M.MeshStandardMaterial({ color:0x1a0f0c, roughness:.95, side:M.DoubleSide }));
    bowl.position.y = -1; scene.add(bowl);
    // the Fallen Star itself — pulsing meteor core
    const star = new M.Mesh(new M.DodecahedronGeometry(2.2, 0),
      mat(0x3a1a10, .3, .6, 0xff4400, 1.8));
    star.position.set(0, 2.5, 0); scene.add(star);
    const sl = new M.PointLight(0xff5500, 2.2, 30); sl.position.set(0, 4, 0); scene.add(sl);
    scene.userData.spiritStone = star;
  }

  function buildRocksAndCrystals(Z) {
    for (let i=0;i<Z.rocks;i++){
      const p = randInCircle(WORLD_R+10);
      const rock = new M.Mesh(new M.DodecahedronGeometry(rnd(.5,1.6), 0), mat(0x2e3440, .9, .08));
      rock.position.set(p.x, rnd(.2,.6), p.z); rock.rotation.set(rnd(0,3),rnd(0,3),rnd(0,3));
      rock.castShadow = rock.receiveShadow = true; scene.add(rock);
      props.push({ x:p.x, z:p.z, r:1 });
    }
    const crystalCol = currentZone === 'grotto' ? [0x8a6aff, 0x5533cc]
      : currentZone === 'crater' ? [0xff6a3a, 0xcc3300] : [0x66ccff, 0x2288cc];
    for (let i=0;i<Z.crystals;i++){
      const p = randInCircle(WORLD_R);
      const s = currentZone === 'grotto' ? rnd(.45,.9) : currentZone === 'crater' ? rnd(.5,1) : rnd(.4,.8);
      const c = new M.Mesh(new M.OctahedronGeometry(s, 0),
        mat(crystalCol[0], .2, .1, crystalCol[1], currentZone === 'forest' ? 1.6 : 1.05));
      c.position.set(p.x, rnd(.8,1.4), p.z); scene.add(c);
      const light = new M.PointLight(crystalCol[1], .7, 9); light.position.copy(c.position); scene.add(light);
      props.push({ x:p.x, z:p.z, r:.7, crystal:c });
    }
  }

  function buildRuins() {
    const ring = new M.Mesh(new M.CylinderGeometry(7.5, 8, .5, 24), mat(0x232835, .9, .05));
    ring.position.y = .25; ring.receiveShadow = true; scene.add(ring);
    for (let i=0;i<8;i++){
      const a = i/8*Math.PI*2;
      const h = i%2===0 ? rnd(4,5.5) : rnd(1.5,2.5);
      const pil = new M.Mesh(new M.CylinderGeometry(.6,.7,h,8), mat(0x2c3242, .85, .06));
      pil.position.set(Math.cos(a)*6.4, h/2+.5, Math.sin(a)*6.4);
      pil.castShadow = true; scene.add(pil);
      props.push({ x:Math.cos(a)*6.4, z:Math.sin(a)*6.4, r:.9 });
    }
    const stone = new M.Mesh(new M.OctahedronGeometry(1.1, 0), mat(0xff5533, .15, .2, 0xcc2200, 2.2));
    stone.position.set(0, 4.2, 0); scene.add(stone);
    const l = new M.PointLight(0xff6633, 1.4, 22); l.position.set(0,5,0); scene.add(l);
    scene.userData.spiritStone = stone;
  }

  let dotTex = null;
  function getDotTexture() {
    if (dotTex) return dotTex;
    const cv = document.createElement('canvas'); cv.width = cv.height = 32;
    const ctx = cv.getContext('2d');
    const g = ctx.createRadialGradient(16,16,0,16,16,16);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(.4, 'rgba(255,255,255,.5)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0,0,32,32);
    dotTex = new M.CanvasTexture(cv);
    return dotTex;
  }
  function buildParticles(Z) {
    const geo = new M.BufferGeometry(); const n = Z.fireflies[1]; const pts = new Float32Array(n*3);
    for (let i=0;i<n;i++){ const p = randInCircle(WORLD_R+10);
      pts[i*3]=p.x; pts[i*3+1]=rnd(.5,7); pts[i*3+2]=p.z; }
    geo.setAttribute('position', new M.BufferAttribute(pts, 3));
    particles = new M.Points(geo, new M.PointsMaterial({ color:Z.fireflies[0], size:.22, map:getDotTexture(),
      transparent:true, opacity:.85, blending:M.AdditiveBlending, depthWrite:false }));
    scene.add(particles);
  }

  const PORTAL_DEFS = {
    forest: [ { x:-45, z:-45, col:0x8a6aff, to:'grotto', label:'Sunken Grotto',
                lockCheck: () => !(RPG.player.flags && RPG.player.flags.heraldDead) },
              { x:27, z:27, col:0xffdd88, to:'town', label:'Mirewood Hollow', lockCheck: null },
              { x:45, z:-18, col:0x66ccff, to:'coast', label:'Emberstrand Coast', lockCheck: null },
              { x:-22, z:46, col:0xbfe8ff, to:'peaks', label:'Stormpeak Ascent',
                lockCheck: () => !(RPG.player.flags && RPG.player.flags.melbuDead) } ],
    grotto: [ { x: 30, z: 30, col:0x3ad5c8, to:'forest', label:'Whisperwood', lockCheck: null },
              { x:-42, z:-42, col:0xff5533, to:'crater', label:'Star Crater',
                lockCheck: () => !(RPG.player.flags && RPG.player.flags.starKey) },
              { x: 34, z:-34, col:0xff8a3a, to:'dungeon', label:'The Hollow Deep', lockCheck: null } ],
    crater: [ { x: 30, z: 30, col:0x8a6aff, to:'grotto', label:'Sunken Grotto', lockCheck: null } ],
    town: [ { x:-27, z:-27, col:0x8a6aff, to:'forest', label:'Whisperwood', lockCheck: null } ],
    coast: [ { x:-34, z:6, col:0x8a6aff, to:'forest', label:'Whisperwood', lockCheck: null } ],
    dungeon: [ { x:-30, z:30, col:0x8a6aff, to:'grotto', label:'Sunken Grotto', lockCheck: null } ],
    peaks: [ { x: 30, z: 30, col:0x8a6aff, to:'forest', label:'Whisperwood', lockCheck: null } ],
  };
  function buildOnePortal(cfg) {
    const g = new M.Group();
    // stone arch
    for (const side of [-1,1]) {
      const post = new M.Mesh(new M.CylinderGeometry(.4,.5,4.4,7), mat(0x2a3040, .9));
      post.position.set(side*1.6, 2.2, 0); post.castShadow = true; g.add(post);
    }
    const lintel = new M.Mesh(new M.BoxGeometry(4, .7, .9), mat(0x2a3040, .9));
    lintel.position.y = 4.6; g.add(lintel);
    // swirling portal membrane
    const mem = new M.Mesh(new M.CircleGeometry(1.35, 24),
      new M.MeshBasicMaterial({ color: cfg.col, transparent:true, opacity:.75, side:M.DoubleSide }));
    mem.position.y = 2.2; g.add(mem);
    const pl = new M.PointLight(cfg.col, 1.4, 12); pl.position.y = 2.5; g.add(pl);
    g.position.set(cfg.x, 0, cfg.z);
    g.rotation.y = Math.atan2(-cfg.x, -cfg.z); // face world center
    scene.add(g);
    portals.push({ group:g, mem, ...cfg });
  }
  function buildPortal(zoneId) {
    for (const cfg of PORTAL_DEFS[zoneId] || []) buildOnePortal(cfg);
  }

  // ---------- CHARACTERS ----------
  // distinct silhouette rigs per enemy kind
  function buildWolf(color, scale) {
    const g = new M.Group(); const body = new M.Group();
    const c = mat(color, .75, .1);
    const trunk = new M.Mesh(new M.BoxGeometry(1.3*scale, .55*scale, .5*scale), c);
    trunk.position.y = .75*scale; trunk.castShadow = true; body.add(trunk);
    const head = new M.Mesh(new M.BoxGeometry(.45*scale, .4*scale, .42*scale), c);
    head.position.set(.75*scale, .95*scale, 0); body.add(head);
    const snout = new M.Mesh(new M.BoxGeometry(.3*scale, .18*scale, .2*scale), c);
    snout.position.set(1.05*scale, .85*scale, 0); body.add(snout);
    for (const side of [-1,1]) {
      const ear = new M.Mesh(new M.ConeGeometry(.08*scale, .25*scale, 4), c);
      ear.position.set(.68*scale, 1.22*scale, side*.12*scale); body.add(ear);
      const eye = new M.Mesh(new M.SphereGeometry(.05*scale, 6, 6), new M.MeshBasicMaterial({ color:0xff3333 }));
      eye.position.set(.9*scale, 1.02*scale, side*.13*scale); body.add(eye);
    }
    const tail = new M.Mesh(new M.ConeGeometry(.1*scale, .7*scale, 5), c);
    tail.position.set(-.8*scale, .95*scale, 0); tail.rotation.z = Math.PI/2 - .5; body.add(tail);
    const legGeo = new M.CylinderGeometry(.08*scale, .06*scale, .55*scale, 5);
    const mk = (x,z) => { const l = new M.Mesh(legGeo, c); l.position.set(x, .3*scale, z); body.add(l); return l; };
    const legL = mk(.45*scale, .18*scale), legR = mk(-.45*scale, .18*scale);
    mk(.45*scale, -.18*scale); mk(-.45*scale, -.18*scale);
    g.add(body);
    return { group:g, body, legL, legR, armL:null, armR:null, sword:null, head, quad:true };
  }
  function buildWraith(color, scale) {
    const g = new M.Group(); const body = new M.Group();
    const c = mat(color, .4, .1, color, .35);
    const robe = new M.Mesh(new M.ConeGeometry(.55*scale, 1.9*scale, 8), c);
    robe.position.y = 1.15*scale; robe.castShadow = true; body.add(robe);
    const hood = new M.Mesh(new M.ConeGeometry(.32*scale, .6*scale, 8), c);
    hood.position.y = 2.2*scale; body.add(hood);
    const faceVoid = new M.Mesh(new M.SphereGeometry(.2*scale, 10, 8),
      new M.MeshBasicMaterial({ color: 0x050508 }));
    faceVoid.position.set(0, 2.05*scale, .12*scale); body.add(faceVoid);
    for (const side of [-1,1]) {
      const eye = new M.Mesh(new M.SphereGeometry(.045*scale, 6, 6),
        new M.MeshBasicMaterial({ color: 0x66eeff }));
      eye.position.set(side*.08*scale, 2.08*scale, .26*scale); body.add(eye);
      const arm = new M.Mesh(new M.CylinderGeometry(.05*scale, .03*scale, .8*scale, 5), c);
      arm.position.set(side*.55*scale, 1.5*scale, .1*scale); arm.rotation.z = side*1.1; body.add(arm);
    }
    const glow = new M.PointLight(color, .8, 6); glow.position.y = 1.5*scale; body.add(glow);
    g.add(body);
    return { group:g, body, legL:null, legR:null, armL:null, armR:null, sword:null, head:hood, wraith:true };
  }
  function buildGolem(color, scale) {
    const g = new M.Group(); const body = new M.Group();
    const c = mat(color, .7, .2);
    const trunk = new M.Mesh(new M.BoxGeometry(1.1*scale, 1*scale, .8*scale), c);
    trunk.position.y = 1.15*scale; trunk.castShadow = true; body.add(trunk);
    const head = new M.Mesh(new M.BoxGeometry(.45*scale, .4*scale, .45*scale), c);
    head.position.y = 1.9*scale; body.add(head);
    for (const side of [-1,1]) {
      const eye = new M.Mesh(new M.SphereGeometry(.05*scale, 6, 6), new M.MeshBasicMaterial({ color:0xffcc33 }));
      eye.position.set(side*.1*scale, 1.92*scale, .24*scale); body.add(eye);
      const shoulder = new M.Mesh(new M.BoxGeometry(.5*scale, .45*scale, .5*scale), c);
      shoulder.position.set(side*.8*scale, 1.55*scale, 0); body.add(shoulder);
      const arm = new M.Mesh(new M.BoxGeometry(.32*scale, 1.1*scale, .32*scale), c);
      arm.position.set(side*.85*scale, .8*scale, 0); body.add(arm);
      const leg = new M.Mesh(new M.BoxGeometry(.35*scale, .7*scale, .4*scale), mat(0x222630, .8));
      leg.position.set(side*.3*scale, .35*scale, 0); body.add(leg);
    }
    // core crystal in chest
    const core = new M.Mesh(new M.OctahedronGeometry(.2*scale, 0),
      mat(0xffaa33, .2, .3, 0xff8811, 1.5));
    core.position.set(0, 1.2*scale, .42*scale); body.add(core);
    g.add(body);
    return { group:g, body, legL:null, legR:null, armL:null, armR:null, sword:null, head, golem:true };
  }

  // ---------- WEAPON VISUALS ----------
  function buildWeaponMesh(baseType) {
    const g = new M.Group();
    if (baseType === 'dagger') {
      const blade = new M.Mesh(new M.BoxGeometry(.05, .5, .1),
        mat(0xdfe8f0, .25, .9, 0x8899ff, .3));
      blade.position.y = .3; g.add(blade);
      const guard = new M.Mesh(new M.BoxGeometry(.2, .05, .14), mat(0xd4af37, .4, .8));
      g.add(guard);
    } else if (baseType === 'staff') {
      const shaft = new M.Mesh(new M.CylinderGeometry(.04, .05, 1.3, 6), mat(0x4a3420, .8));
      shaft.position.y = .5; g.add(shaft);
      const orb = new M.Mesh(new M.SphereGeometry(.13, 10, 8), mat(0x66ccff, .2, .3, 0x2288ff, 1.6));
      orb.position.y = 1.25; g.add(orb);
      const ol = new M.PointLight(0x4488ff, .8, 4); ol.position.y = 1.25; g.add(ol);
    } else if (baseType === 'spear') {
      const shaft = new M.Mesh(new M.CylinderGeometry(.035, .04, 1.6, 6), mat(0x3a2c1a, .8));
      shaft.position.y = .6; g.add(shaft);
      const tip = new M.Mesh(new M.ConeGeometry(.08, .4, 6), mat(0xdfe8f0, .25, .9, 0x8899ff, .3));
      tip.position.y = 1.55; g.add(tip);
    } else { // sword
      const blade = new M.Mesh(new M.BoxGeometry(.07, .9, .16),
        mat(0xcfd8e8, .3, .9, 0x8899ff, .25));
      blade.position.y = .55; g.add(blade);
      const guard = new M.Mesh(new M.BoxGeometry(.3, .07, .2), mat(0xd4af37, .4, .8));
      g.add(guard);
    }
    return g;
  }
  function currentWeaponType() {
    if (typeof RPG === 'undefined' || !RPG.player) return 'sword';
    return (RPG.player.equip.weapon && RPG.player.equip.weapon.baseType) || 'sword';
  }
  // armor piece visuals: shield (when armor def>=8), tiered helm shapes, boots tint
  function buildShieldMesh(rarity) {
    const g = new M.Group();
    const col = { normal: 0x6a707e, magic: 0x3a6ad4, rare: 0xd4af37, unique: 0xb45a1a }[rarity || 'normal'];
    const face = new M.Mesh(new M.CylinderGeometry(.34, .38, .08, 12),
      new M.MeshStandardMaterial({ color: col, roughness: .35, metalness: .85 }));
    face.rotation.x = Math.PI/2; g.add(face);
    const boss = new M.Mesh(new M.SphereGeometry(.09, 8, 8),
      new M.MeshStandardMaterial({ color: 0xd4af37, metalness: .9, roughness: .25 }));
    boss.position.z = .07; g.add(boss);
    g.rotation.y = Math.PI/2;
    return g;
  }
  function buildHelmMesh(tierName, rarity) {
    const col = { normal: 0x8a90a0, magic: 0x3a6ad4, rare: 0xd4af37, unique: 0xb45a1a }[rarity || 'normal'];
    const m = new M.MeshStandardMaterial({ color: col, roughness: .4, metalness: .8 });
    const g = new M.Group();
    const n = (tierName || '').toLowerCase();
    if (n.includes('great')) {
      const helm = new M.Mesh(new M.BoxGeometry(.5, .45, .5), m); helm.position.y = 1.95; g.add(helm);
      for (const side of [-1,1]) {
        const horn = new M.Mesh(new M.ConeGeometry(.08, .4, 5), m);
        horn.position.set(side*.3, 2.1, 0); horn.rotation.z = side*-.5; g.add(horn);
      }
    } else if (n.includes('dragoon')) {
      const helm = new M.Mesh(new M.SphereGeometry(.32, 10, 8, 0, Math.PI*2, 0, Math.PI/2), m);
      helm.position.y = 1.95; g.add(helm);
      for (const side of [-1,1]) {
        const wing = new M.Mesh(new M.PlaneGeometry(.35, .14),
          new M.MeshStandardMaterial({ color: 0xd4af37, metalness: .9, roughness: .3, side: M.DoubleSide }));
        wing.position.set(side*.32, 2.05, 0); wing.rotation.z = side*.45; g.add(wing);
      }
    } else if (n.includes('helm')) {
      const helm = new M.Mesh(new M.CylinderGeometry(.28, .3, .4, 8), m);
      helm.position.y = 1.95; g.add(helm);
      const crest = new M.Mesh(new M.BoxGeometry(.06, .3, .4), m);
      crest.position.y = 2.2; g.add(crest);
    } else { // cap
      const cap = new M.Mesh(new M.SphereGeometry(.28, 10, 8, 0, Math.PI*2, 0, Math.PI/2), m);
      cap.position.y = 1.95; g.add(cap);
    }
    return g;
  }

  // refresh the on-character weapon + armor tints after gear changes
  function refreshPlayerGear() {
    if (!player3d || !player3d.refs) return;
    if (player3d.refs.sword) player3d.body.remove(player3d.refs.sword);
    const sword = buildWeaponMesh(currentWeaponType());
    sword.position.set(.6, 1.15, 0); sword.rotation.z = -.4;
    player3d.body.add(sword);
    player3d.refs.sword = sword;
    // shield when real armor is worn
    if (player3d.refs.shield) { player3d.body.remove(player3d.refs.shield); player3d.refs.shield = null; }
    const armorIt = RPG.player.equip.armor;
    if (armorIt && armorIt.def >= 8) {
      const sh = buildShieldMesh(armorIt.rarity);
      sh.position.set(-.62, 1.15, .1);
      player3d.body.add(sh);
      player3d.refs.shield = sh;
    }
    // tiered helm replaces the class cone when a helm is equipped
    if (player3d.refs.helmMesh) { player3d.body.remove(player3d.refs.helmMesh); player3d.refs.helmMesh = null; }
    if (player3d.refs.classHelm) player3d.refs.classHelm.visible = true;
    const helmIt = RPG.player.equip.helm;
    if (helmIt) {
      const hm = buildHelmMesh(helmIt.name, helmIt.rarity);
      player3d.body.add(hm);
      player3d.refs.helmMesh = hm;
      if (player3d.refs.classHelm) player3d.refs.classHelm.visible = false;
    }
    // boots tint on legs
    const bootsIt = RPG.player.equip.boots;
    if (player3d.refs.legMat) {
      player3d.refs.legMat.color.setHex(bootsIt ? ({ normal:0x2a2f3a, magic:0x24406a, rare:0x5a4a1a, unique:0x4a2408 }[bootsIt.rarity] || 0x2a2f3a) : 0x2a2f3a);
    }
    // armor/helm rarity tints on the torso + helm materials
    const tintOf = r => ({ magic:0x2244aa, rare:0xaa8811, unique:0x994d0f }[r] || 0x000000);
    const armor = RPG.player.equip.armor, helm = RPG.player.equip.helm;
    if (player3d.refs.torsoMat) {
      player3d.refs.torsoMat.emissive = new M.Color(tintOf(armor?.rarity));
      player3d.refs.torsoMat.emissiveIntensity = armor?.rarity === 'normal' || !armor ? 0 : .45;
    }
    if (player3d.refs.helmMat) {
      player3d.refs.helmMat.emissive = new M.Color(tintOf(helm?.rarity));
      player3d.refs.helmMat.emissiveIntensity = helm?.rarity === 'normal' || !helm ? 0 : .45;
    }
  }

  // ---------- CHARACTERS ----------
  function buildCharacter(color, isEnemy=false, scale=1) {
    const rig_refs = {};
    const g = new M.Group(); const body = new M.Group();
    const c = mat(color, .6, .25);
    const torso = new M.Mesh(new M.CylinderGeometry(.34*scale, .42*scale, .9*scale, 8), c);
    torso.position.y = 1.05*scale; torso.castShadow = true; body.add(torso);
    const head = new M.Mesh(new M.SphereGeometry(.28*scale, 12, 10), mat(isEnemy?color:0xe8c39a, .7));
    head.position.y = 1.85*scale; head.castShadow = true; body.add(head);
    const helm = new M.Mesh(new M.ConeGeometry(.3*scale, .5*scale, 8), c);
    helm.position.y = 2.12*scale; body.add(helm);
    rig_refs.classHelm = helm;
    const armGeo = new M.CylinderGeometry(.09*scale, .08*scale, .7*scale, 6);
    const armL = new M.Mesh(armGeo, c); armL.position.set(-.5*scale, 1.15*scale, 0); armL.rotation.z = .25; body.add(armL);
    const armR = new M.Mesh(armGeo, c); armR.position.set(.5*scale, 1.15*scale, 0); armR.rotation.z = -.25; body.add(armR);
    const legGeo = new M.CylinderGeometry(.11*scale, .09*scale, .65*scale, 6);
    const legMat = mat(0x2a2f3a, .9);
    rig_refs.legMat = legMat;
    const legL = new M.Mesh(legGeo, legMat); legL.position.set(-.18*scale, .35*scale, 0); body.add(legL);
    const legR = new M.Mesh(legGeo, legMat); legR.position.set(.18*scale, .35*scale, 0); body.add(legR);
    const sword = isEnemy ? buildWeaponMesh('sword') : buildWeaponMesh(currentWeaponType());
    sword.scale.setScalar(scale);
    sword.position.set(.6*scale, 1.15*scale, 0); sword.rotation.z = -.4; body.add(sword);
    rig_refs.sword = sword; rig_refs.torsoMat = c; rig_refs.helmMat = c;
    // class accessories (player only)
    if (!isEnemy && typeof RPG !== 'undefined' && RPG.player) {
      const cls = RPG.player.cls;
      if (cls === 'knight') {
        const cape = new M.Mesh(new M.PlaneGeometry(.85*scale, 1.15*scale),
          new M.MeshStandardMaterial({ color: 0x7a1a1a, roughness: .9, side: M.DoubleSide }));
        cape.position.set(0, 1.1*scale, -.3*scale); cape.rotation.x = .18; body.add(cape);
        for (const side of [-1,1]) {
          const paul = new M.Mesh(new M.SphereGeometry(.18*scale, 8, 6, 0, Math.PI*2, 0, Math.PI/2),
            mat(0xd4af37, .4, .8));
          paul.position.set(side*.48*scale, 1.52*scale, 0); body.add(paul);
        }
        rig_refs.cape = cape;
      } else if (cls === 'rogue') {
        const hood = new M.Mesh(new M.ConeGeometry(.34*scale, .42*scale, 8), mat(0x2a1a3a, .85));
        hood.position.y = 2*scale; body.add(hood);
        const scarf = new M.Mesh(new M.TorusGeometry(.22*scale, .07*scale, 6, 12), mat(0x4a2a6a, .85));
        scarf.position.y = 1.6*scale; scarf.rotation.x = Math.PI/2; body.add(scarf);
      } else if (cls === 'sorceress') {
        const hat = new M.Mesh(new M.ConeGeometry(.42*scale, .55*scale, 9), mat(0x1a3a5c, .85));
        hat.position.y = 2.25*scale; body.add(hat);
        const brim = new M.Mesh(new M.CylinderGeometry(.55*scale, .55*scale, .05*scale, 12), mat(0x1a3a5c, .85));
        brim.position.y = 2*scale; body.add(brim);
        const orb = new M.Mesh(new M.SphereGeometry(.12*scale, 10, 8), mat(0x66ccff, .2, .2, 0x2288ff, 1.5));
        orb.position.set(.6*scale, 1.75*scale, 0); body.add(orb);
      }
    }
    if (isEnemy) {
      for (const side of [-1,1]) {
        const eye = new M.Mesh(new M.SphereGeometry(.05*scale,6,6), new M.MeshBasicMaterial({ color:0xff2222 }));
        eye.position.set(side*.1*scale, 1.9*scale, .24*scale); body.add(eye);
      }
    }
    g.add(body);
    return { group: g, body, armL, armR, legL, legR, sword, head, refs: rig_refs };
  }

  // ---------- ENEMY MODEL FACTORY ----------
  function makeEnemyModel(t, scale) {
    const kind = t.kind || 'humanoid';
    if (kind === 'wolf') return buildWolf(t.color, scale);
    if (kind === 'wraith') return buildWraith(t.color, scale);
    if (kind === 'golem') return buildGolem(t.color, scale);
    return buildCharacter(t.color, true, scale);
  }

  // ---------- ENEMIES ----------
  function spawnEnemies(Z) {
    if (!Z.enemies.length) return;
    const lvl = (RPG.player ? RPG.player.level : 1) + Z.levelMod;
    for (let i=0;i<Z.enemyCount;i++){
      const t = Z.enemies[rndi(0, Z.enemies.length-1)];
      const p = randInCircle(WORLD_R-6);
      if (Math.hypot(p.x,p.z) < 16 || Math.hypot(p.x-20,p.z-20) < 12 || Math.hypot(p.x-24,p.z-24) < 12) { i--; continue; }
      addEnemy(t, p.x, p.z, lvl, Math.random() < .16); // 16% elite
    }
  }
  function addEnemy(t, x, z, lvl, elite=false) {
    const scale = t.scale * (elite ? 1.35 : rnd(.9,1.1));
    const c3d = makeEnemyModel(t, scale);
    c3d.group.position.set(x, 0, z); scene.add(c3d.group);
    if (elite) {
      const aura = new M.PointLight(0xffcc44, 1.1, 9); aura.position.y = 2; c3d.group.add(aura);
      const ringM = new M.Mesh(new M.TorusGeometry(.9*scale, .06, 6, 24),
        new M.MeshBasicMaterial({ color: 0xffcc44, transparent:true, opacity:.7 }));
      ringM.rotation.x = Math.PI/2; ringM.position.y = .15; c3d.group.add(ringM);
    }
    if (t.boss) {
      const aura = new M.PointLight(0x8833ff, 1.5, 15); aura.position.y = 2; c3d.group.add(aura);
    }
    const mult = (1 + (lvl-1)*.28) * (elite ? 2.2 : 1);
    enemies.push({ ...t,
      name: elite ? pick(ELITE_PREFIX) + ' ' + t.name : t.name,
      elite, c3d, hp: Math.round(t.hp*mult), maxHp: Math.round(t.hp*mult),
      dmg: Math.round(t.dmg*(1+(lvl-1)*.18)*(elite?1.5:1)),
      xp: Math.round(t.xp*mult*(elite?1.2:1)), gold: Math.round(t.gold*(elite?2:1)),
      wanderA: rnd(0,6), wanderT: 0, dead: false });
  }
  const pick = arr => arr[Math.floor(Math.random()*arr.length)];

  function spawnBoss() {
    if (bossSpawned) return; bossSpawned = true;
    addEnemy(BOSS, 0, -10, RPG.player.level + 2);
    toast('⚠ A terrible presence stirs at the ruined shrine…', 'var(--blood)');
    AudioSys.play('encounter');
  }
  function spawnGrottoBoss() {
    if (grottoBossSpawned) return; grottoBossSpawned = true;
    addEnemy(GROTTO_BOSS, 0, -30, RPG.player.level + 4, false);
    toast('⚠ Something ancient turns over in the dark water…', 'var(--blood)');
    AudioSys.play('encounter');
  }
  let wardenSpawned = false;
  function spawnWarden() {
    if (wardenSpawned) return; wardenSpawned = true;
    addEnemy(WARDEN, 0, -32, RPG.player.level + 4, false);
    toast('⛓ Chains rattle in the dark. The Warden rises from the cells.', 'var(--blood)');
    AudioSys.play('encounter');
  }
  let stormcallerSpawned = false;
  function spawnStormcaller() {
    if (stormcallerSpawned) return; stormcallerSpawned = true;
    addEnemy(STORMCALLER, 0, -30, RPG.player.level + 6, false);
    toast('⛈ The storm takes shape. <b>The Stormcaller</b> descends to the shrine.', 'var(--blood)');
    AudioSys.play('thunder');
  }
  let craterBossSpawned = false;
  function spawnCraterBoss() {
    if (craterBossSpawned) return; craterBossSpawned = true;
    addEnemy(CRATER_BOSS, 0, -6, RPG.player.level + 6, false);
    toast('⚠ The Fallen Star cracks open. MELBU FRAHMA rises.', 'var(--blood)');
    AudioSys.play('encounter');
  }

  // ---------- LOOT ----------
  const RARITY_COLOR = { normal:0xc8c8c8, magic:0x6b8cff, rare:0xffe14d, unique:0xd08028 };
  function dropLoot(x, z, item, gold) {
    const g = new M.Group();
    const col = RARITY_COLOR[item?item.rarity:'normal'] || 0xd4af37;
    if (item) {
      const m = new M.Mesh(new M.OctahedronGeometry(.35, 0), mat(col, .3, .4, col, .9));
      m.position.y = .6; g.add(m);
      const beam = new M.Mesh(new M.CylinderGeometry(.09, .16, 5, 8, 1, true),
        new M.MeshBasicMaterial({ color: col, transparent:true, opacity:.5, blending:M.AdditiveBlending, depthWrite:false, side:M.DoubleSide }));
      beam.position.y = 2.5; g.add(beam);
    } else {
      const m = new M.Mesh(new M.CylinderGeometry(.3,.3,.15,10), mat(0xd4af37,.3,.9,0x6b5510,.5));
      m.position.y = .4; g.add(m);
    }
    g.position.set(x, 0, z); scene.add(g);
    lootDrops.push({ group:g, item, gold, t:0 });
  }

  // ---------- INPUT ----------
  function addEventListeners() {
    addEventListener('keydown', e => keys[e.code] = true);
    addEventListener('keyup', e => keys[e.code] = false);
    addEventListener('mousedown', e => { if (e.target.id === 'game-canvas') mouseDown = true; });
    addEventListener('mouseup', () => mouseDown = false);
    addEventListener('mousemove', e => {
      if (!mouseDown) return;
      camYaw -= e.movementX * 0.005;
      camPitch = Math.max(0.15, Math.min(1.25, camPitch + e.movementY * 0.004));
    });
    addEventListener('resize', () => {
      camera.aspect = innerWidth/innerHeight; camera.updateProjectionMatrix();
      renderer.setSize(innerWidth, innerHeight);
      if (Battle.scene) Battle.onResize();
    });
  }

  function collide(x, z) {
    if (Math.hypot(x,z) > WORLD_R) return true;
    for (const p of props) if (Math.hypot(x-p.x, z-p.z) < p.r + .5) return true;
    return false;
  }

  // ---------- ZONE TRAVEL ----------
  function portalLocked(pt) { return pt.lockCheck ? pt.lockCheck() : false; }
  function tryPortal() {
    const p = player3d.group.position;
    for (const pt of portals) {
      if (Math.hypot(p.x-pt.x, p.z-pt.z) < 3.2) {
        if (portalLocked(pt)) { toast('🔒 Sealed. The way is barred by a power you have not yet broken.'); return; }
        AudioSys.play('dragoon');
        buildZone(pt.to);
        toast(`— ${ZONES[pt.to].name} —`);
        if (pt.to === 'crater') setTimeout(spawnCraterBoss, 2500);
        if (pt.to === 'dungeon') setTimeout(spawnWarden, 2500);
        Main.onZoneChanged(pt.to);
        return;
      }
    }
  }
  function nearPortal() {
    const p = player3d.group.position;
    for (const pt of portals) if (Math.hypot(p.x-pt.x, p.z-pt.z) < 3.2) return pt;
    return null;
  }

  // ---------- QUEST INTERACTABLES ----------
  function addInteract(cfg) {
    // cfg: { id, x, z, col, label, kind, onUse }
    const g = new M.Group();
    let mesh;
    if (cfg.kind === 'anchor') {
      const spike = new M.Mesh(new M.ConeGeometry(.55, 2.4, 5), mat(0x140a1e, .7, .1));
      spike.position.y = 1.1; spike.castShadow = true; g.add(spike);
      mesh = new M.Mesh(new M.OctahedronGeometry(.6, 0), mat(0x2a0a3a, .25, .3, cfg.col, 1.6));
      mesh.position.y = 2.6;
    } else if (cfg.kind === 'attune') {
      mesh = new M.Mesh(new M.OctahedronGeometry(.8, 0), mat(cfg.col, .2, .1, cfg.col, 1.2));
      mesh.position.y = 1.3;
      const base = new M.Mesh(new M.CylinderGeometry(.5, .7, .6, 7), mat(0x2a3040, .9));
      base.position.y = .3; g.add(base);
    } else { // shard / relic / meteor — small glowing pickup
      mesh = new M.Mesh(new M.OctahedronGeometry(.45, 0), mat(cfg.col, .25, .3, cfg.col, 1.8));
      mesh.position.y = .9;
    }
    g.add(mesh);
    const l = new M.PointLight(cfg.col, 1.2, 10); l.position.y = 2; g.add(l);
    g.position.set(cfg.x, 0, cfg.z);
    scene.add(g);
    interactables.push({ ...cfg, group: g, mesh, done: false });
  }
  function clearInteracts() {
    for (const it of interactables) scene.remove(it.group);
    interactables = [];
  }
  function syncQuestObjects(list) {
    clearInteracts();
    for (const cfg of list) addInteract(cfg);
  }
  function removeInteract(id) {
    const it = interactables.find(x => x.id === id);
    if (it) { scene.remove(it.group); interactables = interactables.filter(x => x !== it); }
  }
  function tryInteract() {
    const p = player3d.group.position;
    for (const it of interactables) {
      if (Math.hypot(p.x-it.x, p.z-it.z) < 3) { it.onUse(it); return true; }
    }
    return false;
  }
  function nearInteract() {
    const p = player3d.group.position;
    for (const it of interactables) if (Math.hypot(p.x-it.x, p.z-it.z) < 3) return it;
    return null;
  }
  function spawnAmbush(count) {
    const Z = ZONES[currentZone];
    if (!Z.enemies.length) return;
    const p0 = player3d.group.position;
    for (let i=0;i<count;i++){
      const a = rnd(0, Math.PI*2);
      addEnemy(Z.enemies[rndi(0, Z.enemies.length-1)],
        p0.x + Math.cos(a)*rnd(6,9), p0.z + Math.sin(a)*rnd(6,9),
        RPG.player.level + Z.levelMod, Math.random() < .3);
    }
    toast('⚠ Ambush!', 'var(--blood)');
    AudioSys.play('encounter');
  }

  // ---------- UPDATE ----------
  let stepT = 0;
  function update(dt) {
    animT += dt;
    const p = player3d.group.position;
    const fwd = new M.Vector3(-Math.sin(camYaw), 0, -Math.cos(camYaw));
    const right = new M.Vector3(-fwd.z, 0, fwd.x);
    const move = new M.Vector3();
    if (keys.KeyW) move.add(fwd); if (keys.KeyS) move.sub(fwd);
    if (keys.KeyA) move.sub(right); if (keys.KeyD) move.add(right);
    const moving = move.lengthSq() > 0;
    if (moving) {
      move.normalize().multiplyScalar(8.5 * dt * (RPG.player?.speed || 1));
      const nx = p.x + move.x, nz = p.z + move.z;
      if (!collide(nx, p.z)) p.x = nx;
      if (!collide(p.x, nz)) p.z = nz;
      player3d.group.rotation.y = Math.atan2(move.x, move.z);
      const s = Math.sin(animT*12);
      player3d.legL.rotation.x = s*.7; player3d.legR.rotation.x = -s*.7;
      player3d.armL.rotation.x = -s*.5; player3d.armR.rotation.x = s*.5;
      player3d.body.position.y = Math.abs(Math.sin(animT*12))*.08;
      stepT += dt; if (stepT > .3) { stepT = 0; AudioSys.play('step'); }
    } else {
      player3d.legL.rotation.x = player3d.legR.rotation.x = 0;
      player3d.armL.rotation.x = player3d.armR.rotation.x = 0;
      player3d.body.position.y = Math.sin(animT*2)*.03;
    }
    if (player3d.refs && player3d.refs.cape) player3d.refs.cape.rotation.x = .18 + Math.sin(animT*3)*.06 + (moving?.25:0);

    const cx = p.x + Math.sin(camYaw)*Math.cos(camPitch)*CAM_DIST;
    const cz = p.z + Math.cos(camYaw)*Math.cos(camPitch)*CAM_DIST;
    const cy = p.y + Math.sin(camPitch)*CAM_DIST;
    if (camSnap) { camera.position.set(cx, cy, cz); camSnap = false; }
    else camera.position.lerp(new M.Vector3(cx, cy, cz), 1 - Math.pow(.0001, dt));
    camera.lookAt(p.x, p.y + 1.6, p.z);

    // fade trees blocking view
    const cp = camera.position;
    const segDx = p.x - cp.x, segDz = p.z - cp.z;
    const segLen2 = segDx*segDx + segDz*segDz;
    for (const pr of props) {
      if (!pr.mats) continue;
      let t = ((pr.x - cp.x)*segDx + (pr.z - cp.z)*segDz) / segLen2;
      t = Math.max(0, Math.min(1, t));
      const dx = pr.x - (cp.x + segDx*t), dz = pr.z - (cp.z + segDz*t);
      const blocking = (dx*dx + dz*dz) < 3.2*3.2 && t > 0.05 && t < 0.95;
      const target = blocking ? 0.22 : 1;
      for (const m of pr.mats) m.opacity += (target - m.opacity) * Math.min(1, dt*8);
    }

    for (const e of enemies) {
      if (e.dead) continue;
      const ep = e.c3d.group.position;
      const dist = Math.hypot(p.x-ep.x, p.z-ep.z);
      e.wanderT -= dt;
      let vx = 0, vz = 0;
      if (dist < (e.boss? 14 : 9) && dist > .1) {
        vx = (p.x-ep.x)/dist * e.speed; vz = (p.z-ep.z)/dist * e.speed;
      } else if (e.wanderT <= 0) { e.wanderA = rnd(0, Math.PI*2); e.wanderT = rnd(2,5); }
      else { vx = Math.cos(e.wanderA)*e.speed*.35; vz = Math.sin(e.wanderA)*e.speed*.35; }
      const nx = ep.x + vx*dt, nz = ep.z + vz*dt;
      if (!collide(nx, nz) || dist < 11) { ep.x = nx; ep.z = nz; }
      if (vx||vz) e.c3d.group.rotation.y = Math.atan2(vx, vz);
      if (e.c3d.wraith) { e.c3d.body.position.y = .3 + Math.sin(animT*2.2 + ep.x)*.18; e.c3d.group.rotation.y += dt*.4; }
      else e.c3d.body.position.y = Math.abs(Math.sin(animT*6 + ep.x))*.1;
      if (dist < 1.8 && onEncounter) { onEncounter(e); }
    }

    for (let i=lootDrops.length-1;i>=0;i--){
      const l = lootDrops[i]; l.t += dt;
      l.group.rotation.y += dt*2;
      l.group.children[0].position.y = .5 + Math.sin(l.t*3)*.15;
      const d = Math.hypot(p.x-l.group.position.x, p.z-l.group.position.z);
      if (d < 1.6) {
        scene.remove(l.group); lootDrops.splice(i,1);
        if (l.item) {
          if (RPG.player.inventory.length < 24) {
            RPG.player.inventory.push(l.item);
            (RPG.player.flags ||= {}).itemsFound = ((RPG.player.flags.itemsFound)||0) + 1;
            toast(`Picked up <b class="rarity-${l.item.rarity}">${l.item.name}</b>`);
            AudioSys.play('loot'); UI.refreshInv();
          } else toast('Inventory full!');
        } else if (l.gold) {
          const g = RPG.gainGold(l.gold); toast(`+${g} gold`); AudioSys.play('gold'); UI.refreshHUD();
        }
      }
    }

    // interactables pulse + spin
    for (const it of interactables) {
      it.mesh.rotation.y += dt*2;
      it.mesh.position.y = (it.kind==='anchor' ? 2.6 : it.kind==='attune' ? 1.3 : .9) + Math.sin(animT*2.5 + it.x)*.15;
    }

    // portals pulse
    for (const pt of portals) {
      pt.mem.rotation.z += dt*1.5;
      pt.mem.material.opacity = (portalLocked(pt) ? .25 : .65) + Math.sin(animT*3)*.15;
    }

    // ambient anims
    if (scene.userData.spiritStone) {
      scene.userData.spiritStone.rotation.y += dt*1.2;
      scene.userData.spiritStone.position.y = 4.2 + Math.sin(animT*1.5)*.4;
    }
    if (scene.userData.skyGlow) scene.userData.skyGlow.scale.setScalar(1 + Math.sin(animT*.8)*.06);
    particles.rotation.y += dt*.01;
    particles.material.opacity = .6 + Math.sin(animT*2.3)*.25;
    updateLeaves(dt);
    updateNPCs(dt);
    updateGulls(dt);
    updateTorches(dt);
    updateDrips(dt);
    updatePeaks(dt);

    // herald spawns when the quest is active and the player nears the shrine
    if (RPG.player && !bossSpawned && currentZone === 'forest'
        && Main.getQuestStage && Main.getQuestStage() >= 3
        && Math.hypot(p.x, p.z) < 22) spawnBoss();
    // tyrant surfaces only when all drowned relics are found
    if (RPG.player && currentZone === 'grotto' && !grottoBossSpawned
        && (RPG.player.flags?.relics||0) >= 4) spawnGrottoBoss();
    // the stormcaller answers only when all three storm sigils hum — and you reach the summit
    if (RPG.player && currentZone === 'peaks' && !stormcallerSpawned
        && (RPG.player.flags?.sigils||0) >= 3
        && Math.hypot(p.x, p.z + 34) < 22) spawnStormcaller();

    renderer.render(scene, camera);
  }

  function removeEnemy(e) {
    e.dead = true; scene.remove(e.c3d.group);
    enemies = enemies.filter(x => x !== e);
    RPG.player.kills++;
    const gp = e.c3d.group.position;
    // drops — elites always drop gear, others 55%
    if (e.elite || e.boss || Math.random() < .55) {
      const item = RPG.genItem(RPG.player.level + (e.boss?3:0) + (e.elite?2:0));
      dropLoot(gp.x + rnd(-1,1), gp.z + rnd(-1,1), item, null);
    }
    if (Math.random() < .3 && !e.boss) dropLoot(gp.x + rnd(-1,1), gp.z + rnd(-1,1), RPG.genItem(RPG.player.level, 'normal'), null);
    dropLoot(gp.x + rnd(-1.5,1.5), gp.z + rnd(-1.5,1.5), null, Math.round(e.gold * (e.boss?1:rnd(.6,1.4))));
    // potion drops
    if (Math.random() < .25) { RPG.player.potions.hp++; toast('+1 Healing Potion'); }
    else if (Math.random() < .15) { RPG.player.potions.mp++; toast('+1 Mana Potion'); }

    // quest bookkeeping
    const F = (RPG.player.flags ||= {});
    if (currentZone === 'grotto' && !e.boss) F.grottoKills = (F.grottoKills||0) + 1;
    if (e.elite) F.eliteKills = (F.eliteKills||0) + 1;
    if (e.bossId) F[e.bossId + 'Dead'] = true;

    if (e.bossId === 'warden') {
      const rareItem = RPG.genItem(RPG.player.level + 2, 'rare');
      dropLoot(gp.x, gp.z + 1.5, rareItem, null);
      toast('⛓ The Warden\'s chains shatter… something gleams in the wreckage.');
    }
    if (e.bossId === 'stormcaller') {
      const uniq = RPG.genItem(RPG.player.level + 4, 'unique');
      dropLoot(gp.x, gp.z - 1.5, uniq, null);
      setTimeout(() => UI.stormVictory(), 1200);
      return;
    }
    if (e.bossId === 'melbu') {
      setTimeout(() => UI.actComplete(), 1200);
      return;
    }
    if (e.bossId === 'tyrant') {
      setTimeout(() => UI.grottoVictory(), 1200);
      return; // no respawn
    }
    if (!e.boss) setTimeout(() => {
      const Z = ZONES[currentZone];
      const p = randInCircle(WORLD_R-6);
      if (Math.hypot(p.x,p.z) > 16) addEnemy(Z.enemies[rndi(0, Z.enemies.length-1)], p.x, p.z,
        RPG.player.level + Z.levelMod, Math.random() < .16);
    }, 12000);
    else {
      setTimeout(() => UI.gameVictory(), 1200); // herald down
    }
  }

  // ---------- MINIMAP ----------
  function drawMinimap() {
    const cv = document.getElementById('minimap'); if (!cv) return;
    const ctx = cv.getContext('2d'); const R = cv.width/2;
    ctx.clearRect(0,0,cv.width,cv.height);
    ctx.fillStyle = currentZone === 'grotto' ? '#0a0a14' : '#0a1210';
    ctx.beginPath(); ctx.arc(R,R,R-2,0,7); ctx.fill();
    const s = (R-4) / (WORLD_R+10);
    if (currentZone === 'forest') { ctx.fillStyle = '#525a6e'; ctx.beginPath(); ctx.arc(R, R, 5, 0, 7); ctx.fill(); }
    ctx.fillStyle = '#6a707e';
    for (const h of houses) ctx.fillRect(R + h.x*s - 3, R + h.z*s - 3, 6, 6);
    ctx.fillStyle = '#6fcf97';
    for (const n of npcs) { ctx.beginPath(); ctx.arc(R + n.c3d.group.position.x*s, R + n.c3d.group.position.z*s, 2, 0, 7); ctx.fill(); }
    for (const pt of portals) {
      ctx.fillStyle = '#cc88ff';
      ctx.beginPath(); ctx.arc(R + pt.x*s, R + pt.z*s, 3, 0, 7); ctx.fill();
    }
    for (const e of enemies) {
      ctx.fillStyle = e.boss ? '#bb44ff' : e.elite ? '#ffcc44' : '#ff4444';
      ctx.beginPath(); ctx.arc(R + e.c3d.group.position.x*s, R + e.c3d.group.position.z*s, e.boss?4:2.5, 0, 7); ctx.fill();
    }
    ctx.fillStyle = '#ffe14d';
    for (const l of lootDrops) { ctx.fillRect(R + l.group.position.x*s - 1.5, R + l.group.position.z*s - 1.5, 3, 3); }
    const p = player3d.group.position;
    ctx.fillStyle = '#7ec8ff'; ctx.beginPath(); ctx.arc(R + p.x*s, R + p.z*s, 3.5, 0, 7); ctx.fill();
    ctx.strokeStyle = '#7ec8ff55'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(R + p.x*s, R + p.z*s, 8, 0, 7); ctx.stroke();
  }

  function setPlayerClass(clsKey) {
    scene.remove(player3d.group);
    player3d = buildCharacter(RPG.CLASSES[clsKey].color);
    player3d.group.position.set(20, 0, 20);
    scene.add(player3d.group);
    document.getElementById('portrait-face').style.background =
      getComputedStyle(document.querySelector(`.class-portrait.${RPG.CLASSES[clsKey].portrait}`)).background;
  }

  return { init, update, drawMinimap, setPlayerClass, removeEnemy, tryPortal, nearPortal, portalLocked,
    syncQuestObjects, removeInteract, tryInteract, nearInteract, spawnAmbush, makeEnemyModel, getDotTexture, nearNPC, refreshPlayerGear, buildWeaponMesh, currentWeaponType,
    get scene(){ return scene; }, get camera(){ return camera; }, get renderer(){ return renderer; },
    get player3d(){ return player3d; }, get enemies(){ return enemies; },
    get zone(){ return currentZone; },
    set onEncounter(fn){ onEncounter = fn; } };
})();
