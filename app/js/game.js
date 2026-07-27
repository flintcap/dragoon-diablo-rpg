/* game.js — overworld engine: zones, player, enemies, elites, camera, loot, minimap, portals */
const World = (() => {
  let renderer, scene, camera, player3d, clock;
  let enemies = [], lootDrops = [], props = [], particles = null, portals = [], interactables = [], npcs = [], houses = []; let grottoBossSpawnedFlag = false;
  let keys = {}, mouseDown = false, camYaw = 0.6, camPitch = 0.62;
  const CAM_DIST = 12;
  const WORLD_R = 70;              // default zone radius
  let worldR = WORLD_R;            // the zone we're standing in, set by buildZone
  let animT = 0, onEncounter = null, bossSpawned = false, grottoBossSpawned = false, camSnap = true;
  /* Graphics budget. Three.js is a forward renderer: every dynamic light is compiled into
     every lit material's shader, and every shadow caster is drawn a second time. So the
     things that actually cost frames — light count, shadows, foliage density, pixel ratio —
     are all driven from one place, and the game measures itself on load and steps down if
     the machine can't hold a frame rate. */
  const QUALITY = {
    high:   { trees: 1.0,  cover: 1.0,  lights: 14, shadows: true,  pr: 2,   fog: 1.0 },
    medium: { trees: 0.72, cover: 0.6,  lights: 8,  shadows: true,  pr: 1.25, fog: 1.15 },
    low:    { trees: 0.45, cover: 0.28, lights: 4,  shadows: false, pr: 1,   fog: 1.45 },
  };
  let qualityKey = 'high', Q = QUALITY.high, qualityLocked = false;
  function setQuality(key, byPlayer) {
    if (!QUALITY[key]) return;
    if (byPlayer) qualityLocked = true;
    qualityKey = key; Q = QUALITY[key];
    if (renderer) {
      renderer.shadowMap.enabled = Q.shadows;
      renderer.setPixelRatio(Math.min(devicePixelRatio, Q.pr));
      renderer.setSize(innerWidth, innerHeight);
    }
    try { localStorage.setItem('dfs_quality', key); } catch (e) {}
  }
  /* Dynamic light budget. Every point light in the zone stays in the scene graph, but only
     the N nearest the player are `visible` — and N is held constant, so three.js keeps
     reusing the same compiled program instead of rebuilding every material each time a
     light drops in or out. */
  let managedLights = [], lightT = 0, _lp = null;
  /* Performance watchdog. We can't know the player's GPU, so measure: sample the first few
     seconds of real frames and step the quality down if the machine isn't holding up. Runs
     once per session unless the player picks a level themselves. */
  let perfSamples = [], perfDone = false, perfWait = 1.2;
  function autoQuality(dt) {
    if (perfDone || qualityLocked) return;
    if (perfWait > 0) { perfWait -= dt; return; }      // ignore the first second of zone build
    perfSamples.push(dt);
    if (perfSamples.length < 90) return;
    perfDone = true;
    const avg = perfSamples.reduce((a, b) => a + b, 0) / perfSamples.length;
    const fps = 1 / avg;
    if (fps >= 34) return;
    const next = qualityKey === 'high' ? 'medium' : qualityKey === 'medium' ? 'low' : null;
    if (!next) return;
    setQuality(next);
    buildZone(currentZone, false, false);
    if (typeof toast === 'function')
      toast(`Graphics set to <b>${next}</b> — measured ${Math.round(fps)} fps.<br><small>Change it any time in the pause menu (Esc).</small>`);
    // give the new settings their own chance to prove out
    perfSamples = []; perfDone = false; perfWait = 2;
  }

  function updateLightBudget(dt) {
    lightT -= dt;
    if (lightT > 0) return;
    lightT = .3;
    if (!_lp) _lp = new M.Vector3();
    managedLights.length = 0;
    scene.traverse(o => { if (o.isPointLight && !o.userData.alwaysOn) managedLights.push(o); });
    if (managedLights.length <= Q.lights) { for (const l of managedLights) l.visible = true; return; }
    const p = player3d.group.position;
    for (const l of managedLights) { l.getWorldPosition(_lp); l.userData.d2 = _lp.distanceToSquared(p); }
    managedLights.sort((a, b) => a.userData.d2 - b.userData.d2);
    for (let i = 0; i < managedLights.length; i++) managedLights[i].visible = i < Q.lights;
  }
  // wind-driven scenery: canopies, ferns and grass lean; mist sheets drift and breathe
  let swayers = [], drifters = [];
  let currentZone = 'town', waystone = null;

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
      bg: 0x060a14, fog: [0x0a1220, 0.0072], ground: 0x0e1a12,
      ambient: [0x24304e, 0.68], hemi: [0x36486e, 0x0d1a10, 0.42],
      moon: [0xaec8ff, 1.35], rim: [0xffb072, 0.5],
      radius: 168,
      sky: true, trees: 620, treePalette: 0x12261a, rocks: 150, crystals: 34,
      ruins: true, fireflies: [0xaaffcc, 520],
      enemies: [
        { name:'Gloom Wolf',    kind:'wolf', color:0x4a5568, hp:40,  dmg:8,  xp:30,  gold:12, scale:.9, speed:2.2 },
        { name:'Cursed Husk',   kind:'golem', color:0x5a4a3a, hp:55,  dmg:11, xp:42,  gold:16, scale:1.0, speed:1.4 },
        { name:'Void Sprite',   kind:'wraith', color:0x7a3aa0, hp:35,  dmg:14, xp:50,  gold:22, scale:.8, speed:2.8 },
        { name:'Fallen Knight', kind:'humanoid', color:0x8a2020, hp:85,  dmg:16, xp:80,  gold:35, scale:1.15, speed:1.7 },
      ],
      enemyCount: 34, levelMod: 0,
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
  const BOSS = { name:'Malveth\'s Herald', color:0x220a33, hp:420, dmg:24, xp:600, gold:400, scale:1.9, speed:1.9, boss:true, bossId:'herald', kind:'humanoid', shielded:true };
  const GROTTO_BOSS = { name:'Tyrant of the Deep', color:0x1a3a4a, hp:700, dmg:30, xp:1200, gold:900, scale:2.1, speed:1.6, boss:true, bossId:'tyrant', kind:'golem', enrage:{ at:.3, dmgMult:1.5 } };
  const CRATER_BOSS = { name:'MALVETH', color:0x33111a, hp:1100, dmg:36, xp:3000, gold:2000, scale:2.4, speed:1.8, boss:true, bossId:'malveth', kind:'humanoid',
    phase2: { name:'🐉 MALVETH — DRAGON AVATAR 🐉', dmgMult:1.4, healPct:.15, color:0x8a1420 } };
  const WARDEN = { name:'The Warden of Chains', color:0x3a2a2a, hp:550, dmg:28, xp:900, gold:600, scale:2.0, speed:1.7,
    boss:true, bossId:'warden', kind:'humanoid', enrage:{ at:.35, dmgMult:1.4 } };
  const STORMCALLER = { name:'The Stormcaller', color:0x2a4a7a, hp:1500, dmg:44, xp:4500, gold:3000, scale:2.3, speed:2.1,
    boss:true, bossId:'stormcaller', kind:'humanoid', enrage:{ at:.25, dmgMult:1.5 } };
  const ELITE_PREFIX = ['Cursed', 'Ancient', 'Void-Touched', 'Bloodbound'];

  // ---------- INIT ----------
  function init(canvas) {
    renderer = new M.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, Q.pr));
    renderer.setSize(innerWidth, innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = M.PCFSoftShadowMap;
    try { const q = localStorage.getItem('dfs_quality'); if (q && QUALITY[q]) { qualityKey = q; Q = QUALITY[q]; qualityLocked = true; } } catch (e) {}
    renderer.shadowMap.enabled = Q.shadows;
    renderer.outputEncoding = M.sRGBEncoding;
    renderer.toneMapping = M.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    camera = new M.PerspectiveCamera(55, innerWidth/innerHeight, 0.1, 400);
    clock = new M.Clock();
    player3d = buildCharacter(0xff8833);
    // every run opens in Mirewood Hollow: the hub waystone, the shops, and the road out
    buildZone('town', true);
    addEventListeners();
  }

  // ---------- ZONE CONSTRUCTION ----------
  function buildZone(zoneId, first=false, arriveAtWaystone=false) {
    const Z = ZONES[zoneId];
    currentZone = zoneId;
    worldR = Z.radius || WORLD_R;
    managedLights.length = 0; lightT = 0;
    waystone = null;
    scene = new M.Scene();
    scene.background = new M.Color(Z.bg);
    scene.fog = new M.FogExp2(Z.fog[0], Z.fog[1] * Q.fog);
    enemies = []; lootDrops = []; props = []; portals = []; interactables = []; npcs = []; houses = []; gulls = []; torches = []; drips = [];
    swayers = []; drifters = [];
    snowPts = null; stormLight = null; summitTip = null; stormFlash = 0;

    const moon = new M.DirectionalLight(Z.moon[0], Z.moon[1]);
    moon.position.set(-30, 50, 20); moon.castShadow = true;
    moon.shadow.mapSize.set(2048, 2048);
    const sh = Math.min(70, worldR);   // shadows track the playable middle, not the whole zone
    moon.shadow.camera.left = -sh; moon.shadow.camera.right = sh;
    moon.shadow.camera.top = sh; moon.shadow.camera.bottom = -sh;
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
    buildWaystone(zoneId);
    scene.add(player3d.group);
    // arriving by waystone puts you on its steps; arriving by portal drops you at the
    // zone's mouth, next to the way back
    const w = WAYSTONES[zoneId];
    if (arriveAtWaystone && w) player3d.group.position.set(w.spawn.x, 0, w.spawn.z);
    else if (zoneId === 'town') player3d.group.position.set(7, 0, 11); // on the square road, facing the well
    else player3d.group.position.set(zoneId === 'forest' ? 20 : 24, 0, zoneId === 'forest' ? 20 : 24);
    player3d.group.position.y = groundY(player3d.group.position.x, player3d.group.position.z);
    camSnap = true;
    spawnEnemies(Z);
  }

  // ============================================================
  //  TERRAIN — deterministic relief, so the world has a horizon
  // ============================================================
  /* A flat disc reads as a tabletop no matter how much you decorate it. The Whisperwood
     now sits on real relief: layered value noise, sampled by one shared `groundY(x,z)` so
     the mesh, the hero, the enemies, the loot and every prop all agree on where the floor
     is. Landmarks are flattened back out so quests never end up on a cliff. */
  const TERRAIN = {
    forest: { amp: 4.6, scale: 0.0105 },
  };
  function hash2(ix, iz) {
    let h = ix * 374761393 + iz * 668265263;
    h = (h ^ (h >> 13)) * 1274126177;
    return ((h ^ (h >> 16)) >>> 0) / 4294967295;
  }
  function vnoise(x, z) {
    const ix = Math.floor(x), iz = Math.floor(z);
    const fx = x - ix, fz = z - iz;
    const sx = fx*fx*(3-2*fx), sz = fz*fz*(3-2*fz);   // smoothstep
    const a = hash2(ix, iz),   b = hash2(ix+1, iz);
    const c = hash2(ix, iz+1), d = hash2(ix+1, iz+1);
    return (a + (b-a)*sx) + ((c + (d-c)*sx) - (a + (b-a)*sx)) * sz;
  }
  /* 0 = forced flat, 1 = full relief. Keeps the shrine plaza, the road, the river
     corridor and both arrival points level and walkable. */
  function flattenMask(x, z) {
    let m = 1;
    const soften = (d, inner, outer) => Math.max(0, Math.min(1, (d - inner) / (outer - inner)));
    m = Math.min(m, soften(Math.hypot(x, z), 11, 24));                       // shrine plaza
    const road = Math.abs(x - z) / Math.SQRT2;                               // the stone road
    if (x > 0 && z > 0) m = Math.min(m, soften(road, 3.5, 9));
    const riverA = Math.PI/4 + .95;                                          // the river cut
    const rd = Math.abs(-Math.sin(riverA)*(x-6) + Math.cos(riverA)*(z+2));
    m = Math.min(m, soften(rd, 5, 12));
    m = Math.min(m, soften(Math.hypot(x-20, z-20), 5, 13));                  // portal arrival
    const w = WAYSTONES[currentZone];
    if (w) m = Math.min(m, soften(Math.hypot(x-w.x, z-w.z), 5, 12));         // the waystone dais
    return m;
  }
  function groundY(x, z) {
    const t = TERRAIN[currentZone];
    if (!t) return 0;
    const n = vnoise(x*t.scale, z*t.scale) - .5
            + (vnoise(x*t.scale*2.9 + 31, z*t.scale*2.9 + 17) - .5) * .42
            + (vnoise(x*t.scale*6.1 + 71, z*t.scale*6.1 + 53) - .5) * .16;
    return n * t.amp * 2 * flattenMask(x, z);
  }
  /* Steepness at a point, 0..1 — drives where grass gives way to bare rock. */
  function groundSlope(x, z) {
    const d = 1.5;
    return Math.min(1, (Math.abs(groundY(x+d,z) - groundY(x-d,z))
                      + Math.abs(groundY(x,z+d) - groundY(x,z-d))) / (d*2.2));
  }

  function buildGround(Z) {
    if (TERRAIN[currentZone]) return buildTerrain(Z);
    const geo = new M.CircleGeometry(worldR + 30, 64);
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
      const r = rnd(1.5, 5), p = randInCircle(worldR+20);
      const patch = new M.Mesh(new M.CircleGeometry(r, 12),
        mat(new M.Color(Z.ground).offsetHSL(0, rnd(-0.02,0.02), rnd(-0.015,0.02)).getHex(), 1, 0));
      patch.rotation.x = -Math.PI/2; patch.position.set(p.x, 0.01 + Math.random()*0.02, p.z);
      patch.receiveShadow = true; scene.add(patch);
    }
    if (currentZone === 'town' || currentZone === 'coast' || currentZone === 'dungeon' || currentZone === 'peaks') {
      // town/coast/dungeon/peaks ground detail handled by their own builders
    } else if (currentZone === 'forest') {
      for (let d=8; d<worldR; d+=2.4){
        const a = Math.PI/4;
        const stone = new M.Mesh(new M.CylinderGeometry(rnd(.4,.6), rnd(.5,.7), .1, 6), mat(0x1f2531, .95, .02));
        stone.position.set(Math.cos(a)*d + rnd(-.4,.4), .05, Math.sin(a)*d + rnd(-.4,.4));
        stone.receiveShadow = true; scene.add(stone);
      }
    } else {
      // glowing pools: teal water in grotto, lava in crater
      const lava = currentZone === 'crater';
      for (let i=0;i<14;i++){
        const p = randInCircle(worldR-8);
        const pool = new M.Mesh(new M.CircleGeometry(rnd(1.5,3.5), 16),
          new M.MeshStandardMaterial(lava
            ? { color:0x3a0f05, emissive:0xcc3300, emissiveIntensity:.9, roughness:.3, metalness:.4 }
            : { color:0x062030, emissive:0x083a55, emissiveIntensity:.32, roughness:.2, metalness:.6 }));
        pool.rotation.x = -Math.PI/2; pool.position.set(p.x, .03, p.z); scene.add(pool);
        if (lava) { const pl = new M.PointLight(0xcc4400, .8, 10); pl.position.set(p.x, 1, p.z); scene.add(pl); }
      }
    }
  }

  /* The relief mesh. Vertex colours do the material work a single flat texture can't:
     grass in the hollows, sun-bleached growth on the rises, bare earth on anything steep,
     and a damp dark band along the riverbanks. */
  function buildTerrain(Z) {
    const SEG = worldR > 110 ? 208 : 132, SPAN = (worldR + 34) * 2;
    const geo = new M.PlaneGeometry(SPAN, SPAN, SEG, SEG);
    const pos = geo.attributes.position;
    const col = new Float32Array(pos.count * 3);
    const lo   = new M.Color(0x16301c);  // shaded hollows
    const mid  = new M.Color(0x1e3d22);  // open grass
    const high = new M.Color(0x35492a);  // dry growth on the rises
    const rock = new M.Color(0x3b3a35);  // exposed earth on the steeps
    const damp = new M.Color(0x14281f);  // riverbank
    const c = new M.Color();
    const riverA = Math.PI/4 + .95;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = -pos.getY(i);       // plane is rotated flat below
      const h = groundY(x, z);
      pos.setZ(i, h);
      const t = Math.max(0, Math.min(1, (h + 3) / 6));
      c.copy(lo).lerp(mid, Math.min(1, t*1.8)).lerp(high, Math.max(0, (t-.55)/.45));
      c.lerp(rock, Math.min(.85, groundSlope(x, z) * 1.3));
      const rd = Math.abs(-Math.sin(riverA)*(x-6) + Math.cos(riverA)*(z+2));
      if (rd < 9) c.lerp(damp, (1 - rd/9) * .55);
      // a little per-vertex mottle so large faces don't read as flat panels
      const m = (vnoise(x*.35, z*.35) - .5) * .07;
      col[i*3] = Math.max(0, c.r + m); col[i*3+1] = Math.max(0, c.g + m); col[i*3+2] = Math.max(0, c.b + m);
    }
    geo.setAttribute('color', new M.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const gmat = new M.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 1, metalness: 0 });
    if (typeof TexFactory !== 'undefined') TexFactory.apply(gmat, 'grass', 46, 46);
    const ground = new M.Mesh(geo, gmat);
    ground.rotation.x = -Math.PI/2; ground.receiveShadow = true; scene.add(ground);
    scene.userData.terrain = ground;
  }

  function buildClutter(Z) {
    if (currentZone === 'forest') return;   // the wood uses instanced undergrowth instead
    if (currentZone !== 'forest') return;
    // grass tufts
    for (let i=0;i<260;i++){
      const p = randInCircle(worldR+8);
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
      const p = randInCircle(worldR);
      const col = [0x7ec8ff, 0xcc88ff, 0xff9a9a][rndi(0,2)];
      const f = new M.Mesh(new M.ConeGeometry(.09, .18, 5), mat(col, .5, 0, col, .5));
      f.position.set(p.x, .22, p.z); scene.add(f);
      const stem = new M.Mesh(new M.CylinderGeometry(.015,.02,.2,4), mat(0x142a18, .95));
      stem.position.set(p.x, .1, p.z); scene.add(stem);
    }
    // fallen logs
    for (let i=0;i<9;i++){
      const p = randInCircle(worldR-5);
      if (Math.hypot(p.x,p.z) < 12) continue;
      const log = new M.Mesh(new M.CylinderGeometry(rnd(.2,.3), rnd(.22,.32), rnd(2,4), 7), mat(0x241a10, .95));
      log.position.set(p.x, .28, p.z);
      log.rotation.z = Math.PI/2; log.rotation.y = rnd(0,3);
      log.castShadow = log.receiveShadow = true; scene.add(log);
    }
    // path edge pebbles
    for (let d=8; d<worldR; d+=4.5){
      const a = Math.PI/4;
      for (const off of [-1.2, 1.2]) {
        const peb = new M.Mesh(new M.DodecahedronGeometry(rnd(.1,.22), 0), mat(0x252b38, .95));
        peb.position.set(Math.cos(a)*d - Math.sin(a)*off + rnd(-.3,.3), .08, Math.sin(a)*d + Math.cos(a)*off + rnd(-.3,.3));
        scene.add(peb);
      }
    }
  }

  /* One wind, sampled at each thing's own phase, so the whole wood leans together
     without every fern moving in lockstep. */
  function updateWind(dt) {
    if (!swayers.length && !drifters.length) return;
    const gust = 1 + Math.sin(animT * .23) * .55;      // slow swells rolling through
    for (const s of swayers) {
      const a = Math.sin(animT * 1.15 + s.phase) * s.amp * gust;
      s.obj.rotation.z = a;
      s.obj.rotation.x = Math.cos(animT * .85 + s.phase) * s.amp * .6 * gust;
    }
    for (const d of drifters) {
      d.obj.position.y = d.baseY + Math.sin(animT * .3 + d.phase) * .5;
      d.obj.material.opacity = .04 + Math.sin(animT * .42 + d.phase) * .022;
      d.obj.rotation.z += dt * .015;
    }
  }

  // falling leaves
  let leaves = [];
  function buildLeaves() {
    leaves = [];
    if (currentZone !== 'forest') return;
    const leafMat = new M.MeshBasicMaterial({ color: 0x3a5a2e, transparent:true, opacity:.34,
      side:M.DoubleSide, depthWrite:false });
    for (let i=0;i<90;i++){
      const leaf = new M.Mesh(new M.PlaneGeometry(.07,.09), leafMat);
      const p = randInCircle(30);                 // they follow the hero, not the whole zone
      leaf.position.set(p.x, rnd(1.5, 9), p.z);
      leaf.userData = { sway: rnd(0,6), fall: rnd(.35,.7) };
      scene.add(leaf); leaves.push(leaf);
    }
  }
  function updateLeaves(dt) {
    for (const leaf of leaves) {
      leaf.position.y -= leaf.userData.fall * dt;
      leaf.userData.sway += dt;
      leaf.position.x += Math.sin(leaf.userData.sway*2)*dt*.8;
      leaf.rotation.set(leaf.userData.sway*2, leaf.userData.sway, 0);
      const pp = player3d.group.position;
      if (leaf.position.y < groundY(leaf.position.x, leaf.position.z)) {
        const p = randInCircle(28);
        leaf.position.set(pp.x + p.x, pp.y + rnd(7, 12), pp.z + p.z);
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
        lines:['Serah showed me a REAL Sylvani feather! It glows!',
               'When I grow up I\'m gonna be a Starforged too!'],
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
    torches.push({ flame, l, base: 1.3, seed: rnd(0, 10) });
  }
  function updateTorches(dt) {
    for (const t of torches) {
      t.seed += dt * 8;
      const f = .9 + Math.sin(t.seed) * .18 + Math.sin(t.seed*2.7) * .08;
      t.l.intensity = t.base * f;
      t.flame.scale.setScalar(f);
      t.flame.rotation.y += dt * 1.6;
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
    const R = worldR + 6;
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
      const p = randInCircle(worldR);
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
      const p = randInCircle(worldR);
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
      const p = randInCircle(worldR-5);
      if (p.x > 30) continue;
      const sh = new M.Mesh(new M.ConeGeometry(rnd(.08,.16), rnd(.1,.2), 5),
        mat([0xd8cfc0, 0xc8b8a8, 0xe8e0d0][rndi(0,2)], .6));
      sh.position.set(p.x, .08, p.z); scene.add(sh);
    }
    for (let i=0;i<6;i++){
      const p = randInCircle(worldR-8);
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
      const d = worldR + rnd(4, 16);
      buildPeakCone(Math.cos(a)*d, Math.sin(a)*d, rnd(7, 13), rnd(18, 34));
    }
    // inner crags — switchback feel
    for (let i=0;i<8;i++){
      const a = rnd(0, Math.PI*2), d = rnd(24, worldR-8);
      const x = Math.cos(a)*d, z = Math.sin(a)*d;
      if (Math.hypot(x-24, z-24) < 14 || Math.hypot(x, z+34) < 16) continue;
      buildPeakCone(x, z, rnd(2.5, 5), rnd(6, 12));
    }
    // dead pines clinging to the slope
    for (let i=0;i<26;i++){
      const p = randInCircle(worldR-4);
      if (Math.hypot(p.x-24, p.z-24) < 10 || Math.hypot(p.x, p.z+34) < 12) continue;
      buildDeadPine(p.x, p.z, rnd(.8, 1.5));
    }
    // boulders
    for (let i=0;i<24;i++){
      const p = randInCircle(worldR-3);
      const b = new M.Mesh(new M.DodecahedronGeometry(rnd(.4, 1.3), 0), texMat('iceRock', 1, 1, { rough:.95 }));
      b.position.set(p.x, rnd(.1, .4), p.z); b.rotation.set(rnd(0,3), rnd(0,3), rnd(0,3));
      b.castShadow = b.receiveShadow = true; scene.add(b);
    }
    // wind-scoured drift ridges
    for (let i=0;i<16;i++){
      const p = randInCircle(worldR);
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

  /* Two species, so the canopy has silhouette variety instead of one repeated cone.
     Every tree gets flared roots at the base, bark-toned trunk variation and a swaying
     canopy; `mats` is what the camera-blocking fade already hooks into. */
  function buildTree(x, z, s, palette, kind) {
    const g = new M.Group(); const mats = [];
    const y0 = groundY(x, z);
    const bark = new M.Color(0x2a1d12).offsetHSL(0, rnd(-.04,.04), rnd(-.03,.04)).getHex();
    const trunkH = (kind === 'broadleaf' ? 2.6 : 3.4) * s;
    const trunk = new M.Mesh(new M.CylinderGeometry(.26*s, .5*s, trunkH, 8), fadeMat(bark));
    mats.push(trunk.material);
    trunk.position.y = trunkH/2; trunk.castShadow = true; g.add(trunk);
    // a flared collar at the base — one mesh instead of four separate roots
    const collar = new M.Mesh(new M.CylinderGeometry(.5*s, .95*s, .5*s, 8), fadeMat(bark));
    mats.push(collar.material);
    collar.position.y = .22*s; g.add(collar);
    const canopy = new M.Group();
    if (kind === 'broadleaf') {
      // clustered spheres — rounder, heavier, breaks up the conifer rhythm
      for (let b = 0; b < 3; b++) {
        const br = rnd(1.3, 2.1) * s;
        const blob = new M.Mesh(new M.IcosahedronGeometry(br, 0),
          fadeMat(new M.Color(palette).offsetHSL(rnd(-.02,.02), rnd(-.05,.05), rnd(-.03,.06)).getHex()));
        mats.push(blob.material);
        blob.position.set(rnd(-1.1,1.1)*s, trunkH + rnd(.2,1.5)*s, rnd(-1.1,1.1)*s);
        canopy.add(blob);
      }
    } else {
      for (const [r, h, y] of [[2.5, 3.2, .2], [1.8, 2.8, 1.9], [1.0, 2.2, 3.7]]) {
        const c = new M.Mesh(new M.ConeGeometry(r*s, h*s, 9),
          fadeMat(new M.Color(palette).offsetHSL(rnd(-.015,.015), rnd(-.04,.04), rnd(-.025,.035)).getHex()));
        mats.push(c.material);
        c.position.y = trunkH + y*s; canopy.add(c);
      }
    }
    g.add(canopy);
    g.position.set(x, y0, z);
    g.rotation.y = rnd(0, 6);
    g.rotation.z = rnd(-.035, .035);   // nothing in a wood grows perfectly plumb
    scene.add(g);
    // collide against the trunk you can see, not the canopy overhead
    props.push({ x, z, r: .6*s, mats });
    swayers.push({ obj: canopy, amp: rnd(.012, .03) / Math.max(.6, s), phase: rnd(0, 6.3) });
  }

  /* Ground cover. None of it collides — it is there to make the floor read as a forest
     floor rather than a green plane, and nothing is more infuriating than being blocked
     by a fern.

     All of it is drawn with InstancedMesh: ~2,600 pieces of undergrowth cost five draw
     calls instead of five thousand, which is the difference between this zone running and
     this zone being a slideshow. */
  function instanced(geo, material, count, place) {
    if (count <= 0) return null;
    const im = new M.InstancedMesh(geo, material, count);
    const m = new M.Matrix4(), q = new M.Quaternion(), e = new M.Euler(), pos = new M.Vector3(), sc = new M.Vector3();
    let n = 0;
    for (let i = 0; i < count; i++) {
      if (place(i, pos, e, sc) === false) continue;
      q.setFromEuler(e);
      m.compose(pos, q, sc);
      im.setMatrixAt(n++, m);
    }
    im.count = n;
    im.instanceMatrix.needsUpdate = true;
    im.frustumCulled = false;   // instances span the whole zone; one bounds test would cull all
    scene.add(im);
    return im;
  }
  function buildUndergrowth(Z) {
    const clear = (x, z) => Math.hypot(x, z) > 9 && Math.hypot(x-20, z-20) > 6;
    const spread = worldR + 6;

    // ferns — one frond geometry, five per cluster, scattered as a single instanced mesh
    const fernMat = new M.MeshStandardMaterial({ color: 0x3a6b33, roughness: .95, side: M.DoubleSide });
    const fernGeo = new M.ConeGeometry(.2, 1.3, 4);
    const fernSpots = [];
    const nFern = Math.round(340 * Q.cover);
    for (let i = 0; i < nFern; i++) {
      const p = randInCircle(spread);
      if (clear(p.x, p.z)) fernSpots.push(p);
    }
    instanced(fernGeo, fernMat, fernSpots.length * 5, (i, pos, e, sc) => {
      const spot = fernSpots[(i / 5) | 0];
      const a = (i % 5)/5*Math.PI*2 + (hash2(i, 7) - .5);
      const s = .9 + hash2(i, 11) * 1.1;
      pos.set(spot.x + Math.cos(a)*.18*s, groundY(spot.x, spot.z) + .34*s, spot.z + Math.sin(a)*.18*s);
      e.set(Math.cos(a)*.7, hash2(i, 13)*6.3, -Math.sin(a)*.7);
      sc.setScalar(s);
    });

    // grass tufts — a small fan of tapered blades, three per tuft
    const tuftMat = new M.MeshStandardMaterial({ color: 0x3f6f33, roughness: 1, side: M.DoubleSide });
    const tuftGeo = new M.ConeGeometry(.055, .72, 3);
    const tuftSpots = [];
    const nTuft = Math.round(900 * Q.cover);
    for (let i = 0; i < nTuft; i++) {
      const p = randInCircle(spread + 4);
      if (clear(p.x, p.z)) tuftSpots.push(p);
    }
    instanced(tuftGeo, tuftMat, tuftSpots.length * 3, (i, pos, e, sc) => {
      const spot = tuftSpots[(i / 3) | 0];
      const s = .8 + hash2(i, 19) * .8;
      const a = (i % 3)/3*Math.PI*2 + hash2(i, 23)*1.2;
      pos.set(spot.x + Math.cos(a)*.11, groundY(spot.x, spot.z) + .3*s, spot.z + Math.sin(a)*.11);
      e.set(Math.cos(a)*.34, hash2(i, 27)*6.3, -Math.sin(a)*.34);   // blades splay outward
      sc.setScalar(s);
    });

    // bushes
    const bushMat = new M.MeshStandardMaterial({ color: 0x24451f, roughness: .95 });
    const bushGeo = new M.IcosahedronGeometry(.5, 0);
    const bushSpots = [];
    const nBush = Math.round(220 * Q.cover);
    for (let i = 0; i < nBush; i++) {
      const p = randInCircle(worldR);
      if (clear(p.x, p.z)) bushSpots.push(p);
    }
    instanced(bushGeo, bushMat, bushSpots.length * 3, (i, pos, e, sc) => {
      const spot = bushSpots[(i / 3) | 0];
      pos.set(spot.x + (hash2(i,29)-.5)*.9, groundY(spot.x, spot.z) + .3 + hash2(i,31)*.35, spot.z + (hash2(i,37)-.5)*.9);
      e.set(hash2(i,41)*3, hash2(i,43)*6.3, 0);
      sc.setScalar(.7 + hash2(i,47)*.7);
    });

    // toadstools in rings — the wood is not well
    const capMat = new M.MeshStandardMaterial({ color: 0x8fd0c0, roughness: .6,
      emissive: 0x2f6a5c, emissiveIntensity: .55 });
    const capGeo = new M.SphereGeometry(.15, 7, 5, 0, Math.PI*2, 0, Math.PI/2);
    const rings = [];
    const nRing = Math.round(60 * Q.cover);
    for (let i = 0; i < nRing; i++) {
      const c0 = randInCircle(worldR - 8);
      if (clear(c0.x, c0.z)) rings.push(c0);
    }
    instanced(capGeo, capMat, rings.length * 5, (i, pos, e, sc) => {
      const c0 = rings[(i / 5) | 0];
      const a = (i % 5)/5*Math.PI*2 + (hash2(i,53)-.5)*.7, rr = .5 + hash2(i,59)*1.1;
      const mx = c0.x + Math.cos(a)*rr, mz = c0.z + Math.sin(a)*rr;
      const s = .5 + hash2(i,61)*.6;
      pos.set(mx, groundY(mx,mz) + .3*s, mz);
      e.set(0, 0, 0); sc.setScalar(s);
    });

    // surface roots
    const rootMat = mat(0x24190f, .95);
    const rootGeo = new M.TorusGeometry(.8, .1, 5, 8, Math.PI);
    instanced(rootGeo, rootMat, 130, (i, pos, e, sc) => {
      const p = randInCircle(worldR - 6);
      if (!clear(p.x, p.z)) return false;
      pos.set(p.x, groundY(p.x,p.z) + .02, p.z);
      e.set(0, hash2(i,67)*6.3, 0);
      sc.setScalar(.6 + hash2(i,71)*.8);
    });

    // fallen logs
    const logMat = mat(0x241a10, .95);
    const logGeo = new M.CylinderGeometry(.26, .3, 3.2, 7);
    instanced(logGeo, logMat, 40, (i, pos, e, sc) => {
      const p = randInCircle(worldR - 5);
      if (!clear(p.x, p.z)) return false;
      pos.set(p.x, groundY(p.x,p.z) + .28, p.z);
      e.set(0, hash2(i,73)*6.3, Math.PI/2);
      sc.setScalar(.7 + hash2(i,79)*.8);
    });
  }

  /* Mist pooling in the low ground, and shafts of moonlight through the canopy. Both are
     cheap additive planes — the trick is that they only read as volume because the terrain
     underneath them actually has low ground to pool in. */
  function buildAtmosphere(Z) {
    const mistMat = new M.MeshBasicMaterial({ color: 0x9fc0d8, transparent: true, opacity: .055,
      blending: M.AdditiveBlending, depthWrite: false, side: M.DoubleSide });
    for (let i = 0; i < 34; i++) {
      const p = randInCircle(worldR - 6);
      const h = groundY(p.x, p.z);
      if (h > .6) continue;                       // mist collects in the hollows
      const m = new M.Mesh(new M.PlaneGeometry(rnd(10, 22), rnd(10, 22)), mistMat);
      m.rotation.x = -Math.PI/2;
      m.position.set(p.x, h + rnd(.5, 1.6), p.z);
      scene.add(m);
      drifters.push({ obj: m, phase: rnd(0,6.3), baseY: m.position.y });
    }
    // moonlight through the canopy
    for (let i = 0; i < 9; i++) {
      const p = randInCircle(worldR - 14);
      const shaft = new M.Mesh(new M.CylinderGeometry(rnd(.5,1.1), rnd(2.4,4.2), 22, 7, 1, true),
        new M.MeshBasicMaterial({ color: 0x9db8ff, transparent: true, opacity: .045,
          blending: M.AdditiveBlending, depthWrite: false, side: M.DoubleSide }));
      shaft.position.set(p.x, groundY(p.x,p.z) + 11, p.z);
      shaft.rotation.z = rnd(-.16, .16);
      scene.add(shaft);
    }
  }

  /* Landmarks. A big map is only big if it has places in it — these are fixed, hand-placed
     and visible from a distance, so crossing the Whisperwood is navigation rather than
     wandering through procedural sameness. Each also seeds the terrain flattening it needs. */
  const FOREST_LANDMARKS = [
    { kind:'watchtower', x:-92,  z: 38 },
    { kind:'stones',     x: 74,  z:-88 },
    { kind:'camp',       x: 46,  z: 92 },
    { kind:'bog',        x:-58,  z:-104 },
    { kind:'burn',       x:118,  z: 30 },
    { kind:'gate',       x:-124, z:-42 },
  ];
  function buildLandmarks() {
    for (const L of FOREST_LANDMARKS) {
      const y = groundY(L.x, L.z);
      if (L.kind === 'watchtower') {
        // a broken tower — the tallest thing in the wood, and the easiest to navigate by
        for (let d = 0; d < 10; d++) {
          const r = .62 - d*.018, h = 2.3;
          const seg = new M.Mesh(new M.CylinderGeometry(r*3.1, r*3.3, h, 12),
            mat(d % 2 ? 0x232936 : 0x2c3342, .93, .05));
          seg.position.set(L.x, y + h*(d + .5), L.z);
          seg.rotation.y = rnd(0, 6);
          seg.castShadow = true; scene.add(seg);
          if (d === 9) {                              // the top course is sheared away
            seg.scale.y = .45;
            seg.position.y = y + h*9 + h*.22;
          }
        }
        const door = new M.Mesh(new M.BoxGeometry(1.5, 2.4, .4), mat(0x11141c, .95));
        door.position.set(L.x, y + 1.2, L.z + 1.95); scene.add(door);
        for (let i = 0; i < 9; i++) {                 // rubble at the foot
          const a = rnd(0, 6.3), rr = rnd(2.6, 6);
          const bx = L.x + Math.cos(a)*rr, bz = L.z + Math.sin(a)*rr;
          const block = new M.Mesh(new M.BoxGeometry(rnd(.5,1.1), rnd(.4,.8), rnd(.5,1.1)),
            mat(0x2b3140, .95));
          block.position.set(bx, groundY(bx,bz) + .25, bz); block.rotation.y = rnd(0,6);
          block.castShadow = true; scene.add(block);
        }
        const beacon = new M.PointLight(0x7ec8ff, 1.1, 26);
        beacon.position.set(L.x, y + 22, L.z); beacon.userData.alwaysOn = true; scene.add(beacon);
        props.push({ x:L.x, z:L.z, r: 2.2 });
      } else if (L.kind === 'stones') {
        // a ring of monoliths, older than the shrine
        for (let i = 0; i < 9; i++) {
          const a = i/9*Math.PI*2, r = 7.5;
          const sx = L.x + Math.cos(a)*r, sz = L.z + Math.sin(a)*r;
          const h = rnd(3.4, 5.6);
          const mono = new M.Mesh(new M.BoxGeometry(rnd(.9,1.4), h, rnd(.5,.8)), mat(0x2e3444, .95));
          mono.position.set(sx, groundY(sx,sz) + h/2, sz);
          mono.rotation.set(rnd(-.06,.06), a + rnd(-.2,.2), rnd(-.07,.07));
          mono.castShadow = true; scene.add(mono);
          props.push({ x:sx, z:sz, r: .7 });
        }
        const altar = new M.Mesh(new M.CylinderGeometry(1.5, 1.7, .5, 9), mat(0x262c3a, .95));
        altar.position.set(L.x, y + .25, L.z); altar.receiveShadow = true; scene.add(altar);
        const gl = new M.PointLight(0x8a7aff, 1.0, 20); gl.position.set(L.x, y + 2, L.z); scene.add(gl);
      } else if (L.kind === 'camp') {
        // somebody was living out here, and left in a hurry
        for (const [ox, oz] of [[-2.4, 1.2], [2.6, -1.4]]) {
          const tx = L.x + ox, tz = L.z + oz;
          const tent = new M.Mesh(new M.ConeGeometry(1.7, 2.1, 4), mat(0x4a4030, .95));
          tent.position.set(tx, groundY(tx,tz) + 1.05, tz); tent.rotation.y = rnd(0,6);
          tent.castShadow = true; scene.add(tent);
          props.push({ x:tx, z:tz, r: 1.2 });
        }
        const ring = new M.Mesh(new M.TorusGeometry(.85, .16, 5, 12), mat(0x2b3140, .95));
        ring.rotation.x = Math.PI/2; ring.position.set(L.x, y + .1, L.z); scene.add(ring);
        const fire = new M.Mesh(new M.ConeGeometry(.4, 1.0, 7),
          new M.MeshBasicMaterial({ color: 0xff9a4d, transparent: true, opacity: .85,
            blending: M.AdditiveBlending, depthWrite: false }));
        fire.position.set(L.x, y + .6, L.z); scene.add(fire);
        const fl = new M.PointLight(0xff8a3a, 2.0, 20); fl.position.set(L.x, y + 1.2, L.z); scene.add(fl);
        torches.push({ flame: fire, l: fl, base: 2.0, seed: rnd(0, 10) });
        for (let i = 0; i < 3; i++) {                  // drying racks
          const rx = L.x + rnd(-4,4), rz = L.z + rnd(-4,4);
          const post = new M.Mesh(new M.CylinderGeometry(.08,.1,1.8,5), mat(0x33240f, .95));
          post.position.set(rx, groundY(rx,rz) + .9, rz); scene.add(post);
        }
      } else if (L.kind === 'bog') {
        // dead water and dead trees — the wood turning to something else
        for (let i = 0; i < 7; i++) {
          const a = rnd(0,6.3), rr = rnd(0, 13);
          const px = L.x + Math.cos(a)*rr, pz = L.z + Math.sin(a)*rr;
          const pool = new M.Mesh(new M.CircleGeometry(rnd(2.4, 5.5), 18),
            new M.MeshStandardMaterial({ color: 0x0b1a16, roughness: .18, metalness: .55,
              emissive: 0x0a2a22, emissiveIntensity: .3 }));
          pool.rotation.x = -Math.PI/2; pool.position.set(px, groundY(px,pz) + .05, pz);
          scene.add(pool);
        }
        for (let i = 0; i < 16; i++) {                 // drowned trunks
          const a = rnd(0,6.3), rr = rnd(2, 15);
          const tx = L.x + Math.cos(a)*rr, tz = L.z + Math.sin(a)*rr;
          const h = rnd(3, 6.5);
          const dead = new M.Mesh(new M.CylinderGeometry(.1, .28, h, 6), mat(0x1d1a16, .97));
          dead.position.set(tx, groundY(tx,tz) + h/2, tz);
          dead.rotation.set(rnd(-.2,.2), rnd(0,6), rnd(-.2,.2));
          dead.castShadow = true; scene.add(dead);
          props.push({ x:tx, z:tz, r:.35 });
        }
        const gl = new M.PointLight(0x2a8a6a, .8, 26); gl.position.set(L.x, y + 2, L.z); scene.add(gl);
      } else if (L.kind === 'burn') {
        // where the Star's heat washed through — charred stumps and ash
        for (let i = 0; i < 26; i++) {
          const a = rnd(0,6.3), rr = rnd(0, 16);
          const sx = L.x + Math.cos(a)*rr, sz = L.z + Math.sin(a)*rr;
          const h = rnd(.7, 2.6);
          const stump = new M.Mesh(new M.CylinderGeometry(rnd(.2,.45), rnd(.35,.6), h, 7), mat(0x14100e, .98));
          stump.position.set(sx, groundY(sx,sz) + h/2, sz);
          stump.rotation.z = rnd(-.12,.12);
          stump.castShadow = true; scene.add(stump);
          if (h > 1.6) props.push({ x:sx, z:sz, r:.5 });
        }
        const ash = new M.Mesh(new M.CircleGeometry(18, 28), mat(0x1a1613, 1, 0));
        ash.rotation.x = -Math.PI/2; ash.position.set(L.x, y + .06, L.z);
        ash.receiveShadow = true; scene.add(ash);
      } else if (L.kind === 'gate') {
        // the old road's gate, still standing over a road nobody walks
        for (const side of [-1, 1]) {
          const gx = L.x + side*3.2, gz = L.z;
          const post = new M.Mesh(new M.BoxGeometry(1.4, 7.4, 1.4), mat(0x2b3140, .93));
          post.position.set(gx, groundY(gx,gz) + 3.7, gz); post.castShadow = true; scene.add(post);
          props.push({ x:gx, z:gz, r: .9 });
        }
        const lintel = new M.Mesh(new M.BoxGeometry(8.6, 1.3, 1.6), mat(0x333a4a, .93));
        lintel.position.set(L.x, y + 8, L.z); lintel.castShadow = true; scene.add(lintel);
        const gl = new M.PointLight(0xffc46a, .9, 20); gl.position.set(L.x, y + 5, L.z); scene.add(gl);
      }
    }
  }

  function buildForest(Z) {
    const nTrees = Math.round(Z.trees * Q.trees);
    for (let i=0;i<nTrees;i++){
      const p = randInCircle(worldR+8);
      if (Math.hypot(p.x, p.z) < 12) continue;
      if (Math.hypot(p.x-20, p.z-20) < 11) continue;
      if (Math.abs(p.x - p.z) < 3 && p.x > 0) continue;
      // conifers dominate; broadleaves cluster in the lower, wetter ground
      const kind = groundY(p.x, p.z) < -.4 && Math.random() < .55 ? 'broadleaf' : 'conifer';
      buildTree(p.x, p.z, rnd(.8, 1.9), Z.treePalette, kind);
    }
    if (currentZone === 'forest') { buildLandmarks(); buildUndergrowth(Z); buildAtmosphere(Z); }
  }

  function buildGrotto(Z) {
    // stalagmites & stalactites
    for (let i=0;i<60;i++){
      const p = randInCircle(worldR+10);
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
      const c0 = cl < 2 ? clusterSpots[cl] : randInCircle(worldR-10);
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
      const p = randInCircle(worldR);
      const col = Math.random()<.5 ? 0x3ad5c8 : 0x8a6aff;
      const sh = new M.Mesh(new M.ConeGeometry(rnd(.1,.22), rnd(.25,.5), 5),
        mat(col, .4, 0, col, 1.3));
      sh.position.set(p.x, .2, p.z); scene.add(sh);
    }
    // cave ceiling disc (dark canopy high above)
    const ceil = new M.Mesh(new M.CircleGeometry(worldR + 30, 32),
      new M.MeshBasicMaterial({ color: 0x03040a, side: M.DoubleSide }));
    ceil.rotation.x = Math.PI/2; ceil.position.y = 22; scene.add(ceil);
  }

  function buildCrater(Z) {
    // obsidian spikes
    for (let i=0;i<50;i++){
      const p = randInCircle(worldR+10);
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
    // one instanced draw for every rock in the zone
    const rockGeo = new M.DodecahedronGeometry(1, 0);
    const rockMat = mat(0x2e3440, .9, .08);
    instanced(rockGeo, rockMat, Z.rocks, (i, pos, e, sc) => {
      const p = randInCircle(worldR + 10);
      const rr = .5 + hash2(i, 83) * 1.1;
      pos.set(p.x, groundY(p.x,p.z) + rr*.45, p.z);
      e.set(hash2(i,89)*3, hash2(i,97)*3, hash2(i,101)*3);
      sc.setScalar(rr);
      // small rocks are scenery you walk past, not walls
      if (rr > .8) props.push({ x:p.x, z:p.z, r: rr*.7 });
    });
    const crystalCol = currentZone === 'grotto' ? [0x8a6aff, 0x5533cc]
      : currentZone === 'crater' ? [0xff6a3a, 0xcc3300] : [0x66ccff, 0x2288cc];
    for (let i=0;i<Z.crystals;i++){
      const p = randInCircle(worldR);
      const s = currentZone === 'grotto' ? rnd(.45,.9) : currentZone === 'crater' ? rnd(.5,1) : rnd(.4,.8);
      const c = new M.Mesh(new M.OctahedronGeometry(s, 0),
        mat(crystalCol[0], .2, .1, crystalCol[1], currentZone === 'forest' ? 1.6 : 1.05));
      c.position.set(p.x, groundY(p.x,p.z) + rnd(.8,1.4), p.z); scene.add(c);
      // emissive alone carries the glow; only every sixth crystal pays for a real light,
      // because each one costs every lit fragment in the zone
      if (i % 6 === 0) {
        const light = new M.PointLight(crystalCol[1], .9, 12); light.position.copy(c.position); scene.add(light);
      }
      props.push({ x:p.x, z:p.z, r: s*.8, crystal:c });
    }
  }

  /* The ruined shrine — the zone's landmark and the stage for two boss fights, so it
     earns real construction: a cracked flagstone plaza, columns in four states of
     collapse, a raised altar, carved ground runes and standing braziers. */
  function buildRuins() {
    const stoneA = 0x2b3140, stoneB = 0x353c4c, stoneC = 0x242a36;
    // --- plaza: laid flagstones, some tilted, some missing ---
    const base = new M.Mesh(new M.CylinderGeometry(9.4, 9.9, .6, 32), mat(stoneC, .95, .04));
    base.position.y = .0; base.receiveShadow = true; scene.add(base);
    for (let ring = 1; ring <= 4; ring++) {
      const r = 1.7 + ring * 1.85, n = 8 + ring * 5;
      for (let i = 0; i < n; i++) {
        if (Math.random() < .13) continue;                 // missing flagstones
        const a = i/n*Math.PI*2 + rnd(-.03,.03);
        const slab = new M.Mesh(new M.BoxGeometry(rnd(1.2,1.7), .16, rnd(1.1,1.6)),
          mat(Math.random() < .5 ? stoneA : stoneB, .92, .05));
        slab.position.set(Math.cos(a)*r + rnd(-.12,.12), .3 + rnd(-.03,.05), Math.sin(a)*r + rnd(-.12,.12));
        slab.rotation.set(rnd(-.035,.035), a + rnd(-.09,.09), rnd(-.035,.035));
        slab.receiveShadow = true; scene.add(slab);
      }
    }
    // --- carved ground runes, faintly lit ---
    for (let i = 0; i < 12; i++) {
      const a = i/12*Math.PI*2;
      const rune = new M.Mesh(new M.PlaneGeometry(.5, .5),
        new M.MeshBasicMaterial({ color: 0xff7a4d, transparent: true, opacity: .22,
          blending: M.AdditiveBlending, depthWrite: false }));
      rune.rotation.x = -Math.PI/2; rune.rotation.z = a;
      rune.position.set(Math.cos(a)*4.3, .39, Math.sin(a)*4.3);
      scene.add(rune);
    }
    // --- columns, in four states of ruin ---
    for (let i = 0; i < 10; i++) {
      const a = i/10*Math.PI*2 + .18;
      const x = Math.cos(a)*7.1, z = Math.sin(a)*7.1;
      const state = i % 4;                               // 0 whole · 1 snapped · 2 stump · 3 fallen
      if (state === 3) {
        const len = rnd(3.2, 4.8);
        const shaft = new M.Mesh(new M.CylinderGeometry(.42, .46, len, 9), mat(stoneA, .92, .05));
        shaft.position.set(x + Math.cos(a)*.7, .55, z + Math.sin(a)*.7);
        shaft.rotation.set(Math.PI/2, 0, a + rnd(-.35,.35));
        shaft.castShadow = true; scene.add(shaft);
        // it broke into drums where it hit
        for (let d = 0; d < 2; d++) {
          const drum = new M.Mesh(new M.CylinderGeometry(.44, .44, rnd(.5,.9), 9), mat(stoneB, .92, .05));
          drum.position.set(x + Math.cos(a+1.1)*rnd(1.6,2.8), .45, z + Math.sin(a+1.1)*rnd(1.6,2.8));
          drum.rotation.set(Math.PI/2, 0, rnd(0,3));
          drum.castShadow = true; scene.add(drum);
        }
        props.push({ x, z, r: .5 });
        continue;
      }
      const h = state === 0 ? rnd(6.2, 7.4) : state === 1 ? rnd(3.2, 4.4) : rnd(.9, 1.6);
      const plinth = new M.Mesh(new M.BoxGeometry(1.35, .34, 1.35), mat(stoneB, .92, .05));
      plinth.position.set(x, .47, z); plinth.castShadow = true; scene.add(plinth);
      // stacked drums read as masonry; one tall cylinder reads as a pipe
      const drums = Math.max(1, Math.round(h / 1.15));
      for (let d = 0; d < drums; d++) {
        const dh = h / drums;
        const drum = new M.Mesh(new M.CylinderGeometry(.44 - d*.012, .47 - d*.012, dh*.96, 10),
          mat(d % 2 ? stoneA : stoneB, .92, .05));
        drum.position.set(x + rnd(-.03,.03), .64 + dh*(d + .5), z + rnd(-.03,.03));
        drum.rotation.y = rnd(0, 6);
        drum.castShadow = true; scene.add(drum);
      }
      if (state === 0) {                                  // intact columns keep their capital
        const cap = new M.Mesh(new M.BoxGeometry(1.15, .3, 1.15), mat(stoneB, .9, .06));
        cap.position.set(x, .64 + h + .15, z); cap.castShadow = true; scene.add(cap);
        // and a stub of the architrave they once carried
        const arch = new M.Mesh(new M.BoxGeometry(1.5, .42, .7), mat(stoneA, .92, .05));
        arch.position.set(x*.86, .64 + h + .5, z*.86); arch.rotation.y = a; arch.castShadow = true; scene.add(arch);
      }
      props.push({ x, z, r: .62 });
    }
    // --- the altar the Spirit Shard hangs over ---
    const altar = new M.Mesh(new M.CylinderGeometry(1.5, 1.9, 1.1, 8), mat(stoneB, .88, .07));
    altar.position.y = .85; altar.castShadow = altar.receiveShadow = true; scene.add(altar);
    const altarTop = new M.Mesh(new M.CylinderGeometry(1.62, 1.5, .22, 8), mat(stoneA, .82, .09));
    altarTop.position.y = 1.5; altarTop.castShadow = true; scene.add(altarTop);
    props.push({ x: 0, z: 0, r: 1.7 });
    // --- braziers: the only warm light in a cold wood ---
    for (let i = 0; i < 4; i++) {
      const a = i/4*Math.PI*2 + Math.PI/4;
      const bx = Math.cos(a)*4.6, bz = Math.sin(a)*4.6;
      const stand = new M.Mesh(new M.CylinderGeometry(.1, .18, 1.5, 6), mat(0x1e222c, .9, .3));
      stand.position.set(bx, 1.05, bz); stand.castShadow = true; scene.add(stand);
      const bowl = new M.Mesh(new M.CylinderGeometry(.42, .22, .38, 9), mat(0x2a2118, .8, .35));
      bowl.position.set(bx, 1.95, bz); bowl.castShadow = true; scene.add(bowl);
      const flame = new M.Mesh(new M.ConeGeometry(.26, .7, 7),
        new M.MeshBasicMaterial({ color: 0xff9a4d, transparent: true, opacity: .85,
          blending: M.AdditiveBlending, depthWrite: false }));
      flame.position.set(bx, 2.42, bz); scene.add(flame);
      const fl = new M.PointLight(0xff7a33, 1.5, 13); fl.position.set(bx, 2.5, bz); scene.add(fl);
      torches.push({ flame, l: fl, base: 1.5, seed: rnd(0, 10) });
      props.push({ x: bx, z: bz, r: .35 });
    }
    // --- the Spirit Shard, turning above the altar ---
    const stone = new M.Mesh(new M.OctahedronGeometry(1.1, 0), mat(0xff5533, .15, .2, 0xcc2200, 2.2));
    stone.position.set(0, 4.2, 0); scene.add(stone);
    const halo = new M.Mesh(new M.TorusGeometry(1.9, .06, 6, 32),
      new M.MeshBasicMaterial({ color: 0xff8a4d, transparent: true, opacity: .5,
        blending: M.AdditiveBlending, depthWrite: false }));
    halo.rotation.x = Math.PI/2.4; halo.position.set(0, 4.2, 0); scene.add(halo);
    scene.userData.shrineHalo = halo;
    const l = new M.PointLight(0xff6633, 1.8, 26); l.position.set(0, 5, 0);
    l.userData.alwaysOn = true; scene.add(l);
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
    for (let i=0;i<n;i++){ const p = randInCircle(worldR+10);
      pts[i*3]=p.x; pts[i*3+1]=rnd(.5,7); pts[i*3+2]=p.z; }
    geo.setAttribute('position', new M.BufferAttribute(pts, 3));
    particles = new M.Points(geo, new M.PointsMaterial({ color:Z.fireflies[0], size:.22, map:getDotTexture(),
      transparent:true, opacity:.85, blending:M.AdditiveBlending, depthWrite:false }));
    scene.add(particles);
  }

  const PORTAL_DEFS = {
    forest: [ { x:-86, z:-86, col:0x8a6aff, to:'grotto', label:'Sunken Grotto',
                lockCheck: () => !(RPG.player.flags && RPG.player.flags.heraldDead) },
              { x:27, z:27, col:0xffdd88, to:'town', label:'Mirewood Hollow', lockCheck: null },
              { x:132, z:-52, col:0x66ccff, to:'coast', label:'Emberstrand Coast', lockCheck: null },
              { x:-64, z:134, col:0xbfe8ff, to:'peaks', label:'Stormpeak Ascent',
                lockCheck: () => !(RPG.player.flags && RPG.player.flags.malvethDead) } ],
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
  // ---------- WAYSTONE NETWORK ----------
  // One waystone per zone. You attune it by walking up to it once; from then on it is
  // a two-way door in the network, so the world stops being a corridor you must re-walk.
  // Mirewood Hollow's stone is the hub and is attuned from the first step of the game.
  const WAYSTONES = {
    // `spawn` puts you on the stone's steps — inside its interaction radius, so the
    // network is always one keypress away the moment you arrive
    town:    { x:-10, z:-10, col:0xffd76e, spawn:{ x:-10, z:-6.6 } },
    forest:  { x: 24, z: 14, col:0x7ec8ff, spawn:{ x: 24, z: 17.4 } },
    coast:   { x:-26, z: 14, col:0x3ab8d8, spawn:{ x:-26, z: 17.4 } },
    grotto:  { x: 26, z: 22, col:0x3ad5c8, spawn:{ x: 26, z: 25.4 } },
    dungeon: { x:-24, z: 24, col:0xd8823a, spawn:{ x:-24, z: 27.4 } },
    crater:  { x: 24, z: 24, col:0xff6a3a, spawn:{ x: 24, z: 27.4 } },
    peaks:   { x: 24, z: 24, col:0xbfe8ff, spawn:{ x: 24, z: 27.4 } },
  };
  function waystoneFlags() { return ((RPG.player.flags ||= {}).waystones ||= { town: true }); }
  function waystoneAttuned(zone) { return !!(RPG.player && waystoneFlags()[zone]); }
  function buildWaystone(zoneId) {
    const w = WAYSTONES[zoneId]; if (!w) return;
    const g = new M.Group();
    // a stepped dais so it reads as built, not grown
    const dais = new M.Mesh(new M.CylinderGeometry(2.6, 3.0, .3, 8), mat(0x2a3040, .95));
    dais.position.y = .15; dais.receiveShadow = true; g.add(dais);
    const step = new M.Mesh(new M.CylinderGeometry(1.9, 2.2, .3, 8), mat(0x333c4e, .95));
    step.position.y = .42; g.add(step);
    // the obelisk itself
    const shaft = new M.Mesh(new M.CylinderGeometry(.45, .62, 4.2, 6), mat(0x3a4356, .85, .15));
    shaft.position.y = 2.6; shaft.castShadow = true; g.add(shaft);
    const cap = new M.Mesh(new M.ConeGeometry(.6, .9, 6), mat(0x4a5468, .7, .3));
    cap.position.y = 5.1; g.add(cap);
    // the crystal heart — dark until attuned, blazing after
    const core = new M.Mesh(new M.OctahedronGeometry(.55, 0), mat(w.col, .2, .4, w.col, 1.6));
    core.position.y = 3.4; g.add(core);
    const halo = new M.Mesh(new M.TorusGeometry(1.1, .07, 6, 28),
      new M.MeshBasicMaterial({ color: w.col, transparent:true, opacity:.75 }));
    halo.rotation.x = Math.PI/2; halo.position.y = 3.4; g.add(halo);
    const light = new M.PointLight(w.col, 1.5, 16); light.position.y = 3.4; g.add(light);
    g.position.set(w.x, groundY(w.x, w.z), w.z);
    scene.add(g);
    waystone = { zone: zoneId, x: w.x, z: w.z, group: g, core, halo, light, col: w.col };
    refreshWaystoneGlow();
  }
  // Dormant stones are dimmed so an unattuned one reads as something to go and touch.
  function refreshWaystoneGlow() {
    if (!waystone) return;
    const on = waystoneAttuned(waystone.zone);
    waystone.light.intensity = on ? 1.5 : .35;
    waystone.halo.material.opacity = on ? .75 : .2;
    waystone.core.material.emissiveIntensity = on ? 1.6 : .25;
  }
  function nearWaystone() {
    if (!waystone) return null;
    const p = player3d.group.position;
    return Math.hypot(p.x - waystone.x, p.z - waystone.z) < 4.5 ? waystone : null;
  }
  /* E on a waystone: attune it the first time, open the network every time after. */
  function useWaystone() {
    const w = nearWaystone(); if (!w) return false;
    if (!waystoneAttuned(w.zone)) {
      waystoneFlags()[w.zone] = true;
      refreshWaystoneGlow();
      AudioSys.play('ascend');
      toast(`✦ <b>Waystone attuned — ${ZONES[w.zone].name}</b><br><small>You can now travel here from any other stone.</small>`, 'var(--gold)');
      return true;
    }
    Main.openWaystone();
    return true;
  }
  /* The one place a zone change happens, whatever triggered it. */
  function travelTo(zoneId, arriveAtWaystone = false) {
    AudioSys.play('ascend');
    buildZone(zoneId, false, arriveAtWaystone);
    toast(`— ${ZONES[zoneId].name} —`);
    if (zoneId === 'crater') setTimeout(spawnCraterBoss, 2500);
    if (zoneId === 'dungeon') setTimeout(spawnWarden, 2500);
    Main.onZoneChanged(zoneId);
  }
  function waystoneTravel(zoneId) {
    if (!waystoneAttuned(zoneId) || zoneId === currentZone) return false;
    travelTo(zoneId, true);
    return true;
  }

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
    g.position.set(cfg.x, groundY(cfg.x, cfg.z), cfg.z);
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
    } else if (n.includes('ascend')) {
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
    // pauldrons recolor + grow with the equipped armor's rarity and weight
    const pcol = { normal:0x8a90a0, magic:0x3a6ad4, rare:0xd4af37, unique:0xb45a1a };
    if (!player3d.refs.pauldrons) player3d.refs.pauldrons = [];
    if (armorIt) {
      const target = .9 + (armorIt.def||4)/36;
      const col = pcol[armorIt.rarity] || 0x8a90a0;
      if (!player3d.refs.pauldrons.length) {
        for (const side of [-1,1]) {
          const paul = new M.Mesh(new M.SphereGeometry(.18, 8, 6, 0, Math.PI*2, 0, Math.PI/2), mat(col, .4, .8));
          paul.position.set(side*.48, 1.52, 0);
          player3d.body.add(paul);
          player3d.refs.pauldrons.push(paul);
        }
      }
      for (const paul of player3d.refs.pauldrons) {
        paul.material.color.setHex(col);
        paul.scale.setScalar(target);
      }
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
    // shin guards when boots are equipped
    if (player3d.refs.shins) { for (const s of player3d.refs.shins) player3d.body.remove(s); player3d.refs.shins = null; }
    if (bootsIt) {
      const col = pcol[bootsIt.rarity] || 0x8a90a0;
      player3d.refs.shins = [];
      for (const side of [-1,1]) {
        const shin = new M.Mesh(new M.BoxGeometry(.16, .3, .16), mat(col, .45, .75));
        shin.position.set(side*.18, .55, .06);
        player3d.body.add(shin);
        player3d.refs.shins.push(shin);
      }
    }
    // amulet gem glowing at the collar
    if (player3d.refs.amuletMesh) { player3d.body.remove(player3d.refs.amuletMesh); player3d.refs.amuletMesh = null; }
    const amuIt = RPG.player.equip.amulet;
    if (amuIt) {
      const col = { normal:0xc8c8c8, magic:0x6b8cff, rare:0xffe14d, unique:0xd08028 }[amuIt.rarity];
      const gem = new M.Mesh(new M.OctahedronGeometry(.09, 0), mat(col, .2, .4, col, 1.4));
      gem.position.set(0, 1.42, .3);
      player3d.body.add(gem);
      player3d.refs.amuletMesh = gem;
    }
    // unique aura: golden ring + faint light when any equipped item is unique
    if (player3d.refs.uniqueAura) { player3d.group.remove(player3d.refs.uniqueAura); player3d.refs.uniqueAura = null; }
    if (player3d.refs.uniqueLight) { player3d.group.remove(player3d.refs.uniqueLight); player3d.refs.uniqueLight = null; }
    const hasUnique = Object.values(RPG.player.equip).some(it => it && it.rarity === 'unique');
    if (hasUnique) {
      const ring = new M.Mesh(new M.TorusGeometry(.55, .035, 8, 32),
        new M.MeshBasicMaterial({ color: 0xd08028, transparent:true, opacity:.8, blending:M.AdditiveBlending, depthWrite:false }));
      ring.rotation.x = Math.PI/2; ring.position.y = .12;
      player3d.group.add(ring);
      player3d.refs.uniqueAura = ring;
      const ul = new M.PointLight(0xd08028, .9, 6); ul.position.y = .8;
      player3d.group.add(ul);
      player3d.refs.uniqueLight = ul;
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
        rig_refs.pauldrons = [];
        for (const side of [-1,1]) {
          const paul = new M.Mesh(new M.SphereGeometry(.18*scale, 8, 6, 0, Math.PI*2, 0, Math.PI/2),
            mat(0xd4af37, .4, .8));
          paul.position.set(side*.48*scale, 1.52*scale, 0); body.add(paul);
          rig_refs.pauldrons.push(paul);
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
      const p = randInCircle(worldR-6);
      if (Math.hypot(p.x,p.z) < 16 || Math.hypot(p.x-20,p.z-20) < 12 || Math.hypot(p.x-24,p.z-24) < 12) { i--; continue; }
      addEnemy(t, p.x, p.z, lvl, Math.random() < .16); // 16% elite
    }
  }
  function addEnemy(t, x, z, lvl, elite=false) {
    const scale = t.scale * (elite ? 1.35 : rnd(.9,1.1));
    const c3d = makeEnemyModel(t, scale);
    c3d.group.position.set(x, groundY(x, z), z); scene.add(c3d.group);
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
    toast('⚠ The Fallen Star cracks open. MALVETH rises.', 'var(--blood)');
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
    g.position.set(x, groundY(x, z), z); scene.add(g);
    lootDrops.push({ group:g, item, gold, t:0 });
  }

  // ---------- INPUT ----------
  /* Held keys are latched on keydown and cleared on keyup — which means any keyup we
     never receive latches that key ON forever, and the hero runs until the tab closes.
     That happens constantly in practice: alt-tab mid-stride, a modal taking focus, or
     (worst of all) the game running in an iframe that loses focus while W is down.
     So: clear every held key whenever we stop being the thing receiving input. */
  function releaseKeys() { keys = {}; mouseDown = false; }
  function addEventListeners() {
    addEventListener('keydown', e => keys[e.code] = true);
    addEventListener('keyup', e => keys[e.code] = false);
    addEventListener('blur', releaseKeys);
    addEventListener('focus', releaseKeys);
    addEventListener('contextmenu', releaseKeys);
    document.addEventListener('visibilitychange', () => { if (document.hidden) releaseKeys(); });
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
    if (Math.hypot(x,z) > worldR) return true;
    for (const p of props) if (Math.hypot(x-p.x, z-p.z) < p.r + .35) return true;
    return false;
  }

  // ---------- ZONE TRAVEL ----------
  function portalLocked(pt) { return pt.lockCheck ? pt.lockCheck() : false; }
  function tryPortal() {
    const p = player3d.group.position;
    for (const pt of portals) {
      if (Math.hypot(p.x-pt.x, p.z-pt.z) < 3.2) {
        if (portalLocked(pt)) { toast('🔒 Sealed. The way is barred by a power you have not yet broken.'); return; }
        travelTo(pt.to);
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
    g.position.set(cfg.x, groundY(cfg.x, cfg.z), cfg.z);
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
      move.normalize().multiplyScalar(10.5 * dt * (RPG.player?.speed || 1));
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
    p.y = groundY(p.x, p.z);
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
      ep.y = groundY(ep.x, ep.z);
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
    // the waystone turns its halo and breathes; a dormant one pulses harder to draw you over
    if (waystone) {
      const on = waystoneAttuned(waystone.zone);
      waystone.halo.rotation.z += dt * (on ? 1.1 : .4);
      waystone.core.rotation.y += dt * 1.4;
      waystone.core.position.y = 3.4 + Math.sin(animT*1.6)*.16;
      waystone.light.intensity = on ? 1.5 + Math.sin(animT*2.4)*.35 : .35 + Math.sin(animT*3.2)*.3;
    }

    // ambient anims
    if (scene.userData.spiritStone) {
      scene.userData.spiritStone.rotation.y += dt*1.2;
      scene.userData.spiritStone.position.y = 4.2 + Math.sin(animT*1.5)*.4;
    }
    if (scene.userData.skyGlow) scene.userData.skyGlow.scale.setScalar(1 + Math.sin(animT*.8)*.06);
    // unique-item aura slowly turns under the hero
    if (player3d.refs && player3d.refs.uniqueAura) {
      player3d.refs.uniqueAura.rotation.z += dt*1.2;
      if (player3d.refs.uniqueLight) player3d.refs.uniqueLight.intensity = .7 + Math.sin(animT*3)*.25;
    }
    particles.rotation.y += dt*.01;
    particles.material.opacity = .6 + Math.sin(animT*2.3)*.25;
    autoQuality(dt);
    updateLightBudget(dt);
    updateWind(dt);
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
    // bounty board kill tracking (per family, per exact name)
    if (!e.boss) {
      F['kill_' + (e.kind||'humanoid')] = (F['kill_' + (e.kind||'humanoid')]||0) + 1;
      F['killname_' + e.name] = (F['killname_' + e.name]||0) + 1;
    }

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
    if (e.bossId === 'malveth') {
      setTimeout(() => UI.actComplete(), 1200);
      return;
    }
    if (e.bossId === 'tyrant') {
      setTimeout(() => UI.grottoVictory(), 1200);
      return; // no respawn
    }
    if (!e.boss) setTimeout(() => {
      const Z = ZONES[currentZone];
      if (!Z.enemies.length) return; // safe havens spawn nothing
      const p = randInCircle(worldR-6);
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
    const s = (R-4) / (worldR+10);
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
    // quest interactables — the things the tracker is actually telling you to go and touch
    for (const it of interactables) {
      ctx.fillStyle = '#f5d76e';
      ctx.beginPath(); ctx.arc(R + it.x*s, R + it.z*s, 3, 0, 7); ctx.fill();
    }
    // the waystone: a diamond, hollow while dormant
    if (waystone) {
      const wx = R + waystone.x*s, wz = R + waystone.z*s;
      ctx.beginPath();
      ctx.moveTo(wx, wz-5); ctx.lineTo(wx+4.5, wz); ctx.lineTo(wx, wz+5); ctx.lineTo(wx-4.5, wz); ctx.closePath();
      if (waystoneAttuned(waystone.zone)) { ctx.fillStyle = '#ffd76e'; ctx.fill(); }
      else { ctx.strokeStyle = '#ffd76e'; ctx.lineWidth = 1.5; ctx.stroke(); }
    }
    const p = player3d.group.position;
    ctx.fillStyle = '#7ec8ff'; ctx.beginPath(); ctx.arc(R + p.x*s, R + p.z*s, 3.5, 0, 7); ctx.fill();
    ctx.strokeStyle = '#7ec8ff55'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(R + p.x*s, R + p.z*s, 8, 0, 7); ctx.stroke();
    drawObjectiveArrow(ctx, R, s, p);
  }
  /* A gold chevron riding the minimap rim, pointing at wherever the quest wants you.
     Direction is the thing the game was missing most — this is it, on screen, always. */
  function objectivePoint() {
    const goal = Main.questGoal ? Main.questGoal() : null;
    if (!goal) return null;
    if (goal.zone && goal.zone !== currentZone) {
      // wrong zone — point at the way out toward it, then at the waystone as a fallback
      const pt = portals.find(x => x.to === goal.zone) || portals[0];
      if (pt) return { x: pt.x, z: pt.z, label: pt.label };
      return waystone ? { x: waystone.x, z: waystone.z, label: 'Waystone' } : null;
    }
    // objectives that are "any one of these" (anchors, relics, sigils) point at the
    // nearest one still standing
    const pool = goal.idPrefix ? interactables.filter(x => x.id.startsWith(goal.idPrefix))
               : goal.id ? interactables.filter(x => x.id === goal.id) : [];
    if (pool.length) {
      const p = player3d.group.position;
      const it = pool.reduce((a, b) =>
        Math.hypot(a.x-p.x, a.z-p.z) <= Math.hypot(b.x-p.x, b.z-p.z) ? a : b);
      return { x: it.x, z: it.z, label: goal.label };
    }
    if (goal.x !== undefined) return { x: goal.x, z: goal.z, label: goal.label };
    return null;
  }
  function drawObjectiveArrow(ctx, R, s, p) {
    let g; try { g = objectivePoint(); } catch (e) { g = null; }
    if (!g) return;
    const dx = g.x - p.x, dz = g.z - p.z;
    if (Math.hypot(dx, dz) < 4) return; // standing on it
    const a = Math.atan2(dz, dx);
    const rr = R - 9;
    const cx = R + Math.cos(a)*rr, cz = R + Math.sin(a)*rr;
    ctx.save(); ctx.translate(cx, cz); ctx.rotate(a);
    ctx.fillStyle = '#f5d76e';
    ctx.beginPath(); ctx.moveTo(6,0); ctx.lineTo(-4,-4.5); ctx.lineTo(-2,0); ctx.lineTo(-4,4.5); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  function setPlayerClass(clsKey) {
    scene.remove(player3d.group);
    player3d = buildCharacter(RPG.CLASSES[clsKey].color);
    player3d.group.position.set(7, 0, 11); // the Mirewood square road, facing the well
    scene.add(player3d.group);
    document.getElementById('portrait-face').style.background =
      getComputedStyle(document.querySelector(`.class-portrait.${RPG.CLASSES[clsKey].portrait}`)).background;
  }

  return { init, update, drawMinimap, setPlayerClass, removeEnemy, tryPortal, nearPortal, portalLocked,
    syncQuestObjects, removeInteract, tryInteract, nearInteract, spawnAmbush, makeEnemyModel, getDotTexture, nearNPC, refreshPlayerGear, buildWeaponMesh, currentWeaponType, buildShieldMesh, buildHelmMesh,
    WAYSTONES, nearWaystone, useWaystone, waystoneAttuned, waystoneTravel, travelTo, ZONES, releaseKeys,
    setQuality, QUALITY, get quality(){ return qualityKey; },
    get scene(){ return scene; }, get camera(){ return camera; }, get renderer(){ return renderer; },
    get player3d(){ return player3d; }, get enemies(){ return enemies; },
    get zone(){ return currentZone; },
    set onEncounter(fn){ onEncounter = fn; } };
})();
