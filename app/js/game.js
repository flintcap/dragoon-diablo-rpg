/* game.js — overworld engine: scene, player, enemies, camera, loot, minimap */
const World = (() => {
  let renderer, scene, camera, player3d, clock;
  let enemies = [], lootDrops = [], props = [], fireflies;
  let keys = {}, mouseDown = false, camYaw = 0.6, camPitch = 0.62;
  const CAM_DIST = 12;
  const WORLD_R = 70; // playable radius
  let animT = 0, onEncounter = null, bossSpawned = false;

  const M = THREE;
  function mat(color, rough=0.85, metal=0.05, emissive=0x000000, eInt=0) {
    return new M.MeshStandardMaterial({ color, roughness: rough, metalness: metal,
      emissive, emissiveIntensity: eInt });
  }
  function fadeMat(color, rough=0.95) {
    const m = mat(color, rough);
    m.transparent = true;
    return m;
  }

  // ---------- SCENE ----------
  function init(canvas) {
    renderer = new M.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(innerWidth, innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = M.PCFSoftShadowMap;
    renderer.outputEncoding = M.sRGBEncoding;
    renderer.toneMapping = M.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    scene = new M.Scene();
    scene.background = new M.Color(0x060a14);
    scene.fog = new M.FogExp2(0x070d1a, 0.013);
    camera = new M.PerspectiveCamera(55, innerWidth/innerHeight, 0.1, 400);
    clock = new M.Clock();

    // lighting: moon key + warm rim + ambient
    const moon = new M.DirectionalLight(0x9db8ff, 1.1);
    moon.position.set(-30, 50, 20); moon.castShadow = true;
    moon.shadow.mapSize.set(2048, 2048);
    moon.shadow.camera.left = -60; moon.shadow.camera.right = 60;
    moon.shadow.camera.top = 60; moon.shadow.camera.bottom = -60;
    moon.shadow.camera.far = 150; moon.shadow.bias = -0.0004;
    scene.add(moon);
    const rim = new M.DirectionalLight(0xff9a5c, 0.35); rim.position.set(40, 20, -40); scene.add(rim);
    scene.add(new M.AmbientLight(0x1c2742, 0.55));
    const hemi = new M.HemisphereLight(0x2a3a5c, 0x080f0a, 0.28); scene.add(hemi);

    buildGround(); buildSky(); buildForest(); buildRuins(); buildFireflies();
    player3d = buildCharacter(0xff8833); scene.add(player3d.group);
    spawnEnemies();
    addEventListeners();
  }

  function buildGround() {
    const geo = new M.CircleGeometry(WORLD_R + 30, 64);
    const g = mat(0x0e1a12, 1, 0); const ground = new M.Mesh(geo, g);
    ground.rotation.x = -Math.PI/2; ground.receiveShadow = true; scene.add(ground);
    // mottled detail patches
    for (let i=0;i<90;i++){
      const r = rnd(1.5, 5), p = randInCircle(WORLD_R+20);
      const patch = new M.Mesh(new M.CircleGeometry(r, 12),
        mat(new M.Color(0x0e1a12).offsetHSL(0, rnd(-0.02,0.02), rnd(-0.015,0.02)).getHex(), 1, 0));
      patch.rotation.x = -Math.PI/2; patch.position.set(p.x, 0.01 + Math.random()*0.02, p.z);
      patch.receiveShadow = true; scene.add(patch);
    }
    // stone path to center
    for (let d=8; d<WORLD_R; d+=2.4){
      const a = Math.PI/4;
      const stone = new M.Mesh(new M.CylinderGeometry(rnd(.4,.6), rnd(.5,.7), .1, 6),
        mat(0x1f2531, .95, .02));
      stone.position.set(Math.cos(a)*d + rnd(-.4,.4), .05, Math.sin(a)*d + rnd(-.4,.4));
      stone.receiveShadow = true; scene.add(stone);
    }
  }

  function buildSky() {
    // stars
    const starGeo = new M.BufferGeometry(); const pts = [];
    for (let i=0;i<800;i++){
      const a = rnd(0,Math.PI*2), e = rnd(0.05, Math.PI/2), r = 300;
      pts.push(Math.cos(a)*Math.cos(e)*r, Math.sin(e)*r, Math.sin(a)*Math.cos(e)*r);
    }
    starGeo.setAttribute('position', new M.Float32BufferAttribute(pts, 3));
    const stars = new M.Points(starGeo, new M.PointsMaterial({ color:0xcfe0ff, size:1.4, sizeAttenuation:false }));
    scene.add(stars);
    // fallen star glow on horizon
    const glow = new M.Mesh(new M.SphereGeometry(10, 16, 16),
      new M.MeshBasicMaterial({ color:0x7ec8ff, transparent:true, opacity:.85 }));
    glow.position.set(140, 26, -190); scene.add(glow);
    const halo = new M.Mesh(new M.SphereGeometry(24, 16, 16),
      new M.MeshBasicMaterial({ color:0x3a7bd5, transparent:true, opacity:.18 }));
    halo.position.copy(glow.position); scene.add(halo);
    scene.userData.skyGlow = glow;
  }

  function buildTree(x, z, s=1) {
    const g = new M.Group(); const mats = [];
    const trunk = new M.Mesh(new M.CylinderGeometry(.35*s, .55*s, 3.4*s, 7), fadeMat(0x241a10));
    mats.push(trunk.material);
    trunk.position.y = 1.7*s; trunk.castShadow = true; g.add(trunk);
    const layers = [[2.6, 3.2, 3.4], [2.0, 2.6, 5.2], [1.3, 2.0, 6.8]];
    for (const [r, h, y] of layers) {
      const c = new M.Mesh(new M.ConeGeometry(r*s, h*s, 8),
        fadeMat(new M.Color(0x12261a).offsetHSL(0, rnd(-.03,.03), rnd(-.015,.02)).getHex()));
      mats.push(c.material);
      c.position.y = y*s; c.castShadow = true; g.add(c);
    }
    g.position.set(x, 0, z); g.rotation.y = rnd(0, 6); scene.add(g);
    props.push({ x, z, r: 1*s, mats });
  }

  function buildForest() {
    for (let i=0;i<110;i++){
      const p = randInCircle(WORLD_R+8);
      if (Math.hypot(p.x, p.z) < 12) continue;              // clear center
      if (Math.hypot(p.x-20, p.z-20) < 11) continue;        // clear spawn
      if (Math.abs(p.x - p.z) < 3 && p.x > 0) continue;      // keep path clear
      buildTree(p.x, p.z, rnd(.8, 1.7));
    }
    // rocks
    for (let i=0;i<40;i++){
      const p = randInCircle(WORLD_R+10);
      const rock = new M.Mesh(new M.DodecahedronGeometry(rnd(.5,1.6), 0), mat(0x2e3440, .9, .08));
      rock.position.set(p.x, rnd(.2,.6), p.z); rock.rotation.set(rnd(0,3),rnd(0,3),rnd(0,3));
      rock.castShadow = rock.receiveShadow = true; scene.add(rock);
      props.push({ x:p.x, z:p.z, r:1 });
    }
    // glowing spirit crystals
    for (let i=0;i<14;i++){
      const p = randInCircle(WORLD_R);
      const c = new M.Mesh(new M.OctahedronGeometry(rnd(.4,.8), 0),
        mat(0x66ccff, .2, .1, 0x2288cc, 1.6));
      c.position.set(p.x, rnd(.8,1.4), p.z); scene.add(c);
      const light = new M.PointLight(0x3a9bd5, .7, 9); light.position.copy(c.position); scene.add(light);
      props.push({ x:p.x, z:p.z, r:.7, crystal:c });
    }
  }

  function buildRuins() {
    // central ruined shrine — boss arena
    const ring = new M.Mesh(new M.CylinderGeometry(7.5, 8, .5, 24), mat(0x232835, .9, .05));
    ring.position.y = .25; ring.receiveShadow = true; scene.add(ring);
    for (let i=0;i<8;i++){
      const a = i/8*Math.PI*2;
      const h = i%2===0 ? rnd(4,5.5) : rnd(1.5,2.5); // some broken pillars
      const pil = new M.Mesh(new M.CylinderGeometry(.6,.7,h,8), mat(0x2c3242, .85, .06));
      pil.position.set(Math.cos(a)*6.4, h/2+.5, Math.sin(a)*6.4);
      pil.castShadow = true; scene.add(pil);
      props.push({ x:Math.cos(a)*6.4, z:Math.sin(a)*6.4, r:.9 });
    }
    // floating dragoon spirit stone at center
    const stone = new M.Mesh(new M.OctahedronGeometry(1.1, 0),
      mat(0xff5533, .15, .2, 0xcc2200, 2.2));
    stone.position.set(0, 4.2, 0); scene.add(stone);
    const l = new M.PointLight(0xff6633, 1.4, 22); l.position.set(0,5,0); scene.add(l);
    scene.userData.spiritStone = stone;
  }

  function buildFireflies() {
    const geo = new M.BufferGeometry(); const n = 220; const pts = new Float32Array(n*3);
    for (let i=0;i<n;i++){ const p = randInCircle(WORLD_R+10);
      pts[i*3]=p.x; pts[i*3+1]=rnd(.5,7); pts[i*3+2]=p.z; }
    geo.setAttribute('position', new M.BufferAttribute(pts, 3));
    fireflies = new M.Points(geo, new M.PointsMaterial({ color:0xaaffcc, size:.16,
      transparent:true, opacity:.85, blending:M.AdditiveBlending, depthWrite:false }));
    scene.add(fireflies);
  }

  // ---------- CHARACTERS ----------
  function buildCharacter(color, isEnemy=false, scale=1) {
    const g = new M.Group(); const body = new M.Group();
    const c = mat(color, .6, .25);
    const torso = new M.Mesh(new M.CylinderGeometry(.34*scale, .42*scale, .9*scale, 8), c);
    torso.position.y = 1.05*scale; torso.castShadow = true; body.add(torso);
    const head = new M.Mesh(new M.SphereGeometry(.28*scale, 12, 10), mat(0xe8c39a, .7));
    head.position.y = 1.85*scale; head.castShadow = true; body.add(head);
    const helm = new M.Mesh(new M.ConeGeometry(.3*scale, .5*scale, 8), c);
    helm.position.y = 2.12*scale; body.add(helm);
    // arms
    const armGeo = new M.CylinderGeometry(.09*scale, .08*scale, .7*scale, 6);
    const armL = new M.Mesh(armGeo, c); armL.position.set(-.5*scale, 1.15*scale, 0); armL.rotation.z = .25; body.add(armL);
    const armR = new M.Mesh(armGeo, c); armR.position.set(.5*scale, 1.15*scale, 0); armR.rotation.z = -.25; body.add(armR);
    // legs
    const legGeo = new M.CylinderGeometry(.11*scale, .09*scale, .65*scale, 6);
    const legL = new M.Mesh(legGeo, mat(0x2a2f3a, .9)); legL.position.set(-.18*scale, .35*scale, 0); body.add(legL);
    const legR = new M.Mesh(legGeo, mat(0x2a2f3a, .9)); legR.position.set(.18*scale, .35*scale, 0); body.add(legR);
    // weapon
    const sword = new M.Group();
    const blade = new M.Mesh(new M.BoxGeometry(.07*scale, .9*scale, .16*scale),
      mat(0xcfd8e8, .3, .9, isEnemy?0x000000:0x8899ff, isEnemy?0:.25));
    blade.position.y = .55*scale; sword.add(blade);
    const guard = new M.Mesh(new M.BoxGeometry(.3*scale, .07*scale, .2*scale), mat(0xd4af37, .4, .8));
    sword.add(guard);
    sword.position.set(.6*scale, 1.15*scale, 0); sword.rotation.z = -.4; body.add(sword);
    g.add(body);
    return { group: g, body, armL, armR, legL, legR, sword, head };
  }

  const ENEMY_TYPES = [
    { name:'Gloom Wolf',    color:0x4a5568, hp:40,  dmg:8,  xp:30,  gold:12, scale:.9, speed:2.2 },
    { name:'Cursed Husk',   color:0x5a4a3a, hp:55,  dmg:11, xp:42,  gold:16, scale:1.0, speed:1.4 },
    { name:'Void Sprite',   color:0x7a3aa0, hp:35,  dmg:14, xp:50,  gold:22, scale:.8, speed:2.8 },
    { name:'Fallen Knight', color:0x8a2020, hp:85,  dmg:16, xp:80,  gold:35, scale:1.15, speed:1.7 },
  ];
  const BOSS = { name:'Melbu\'s Shadow', color:0x220a33, hp:420, dmg:24, xp:600, gold:400, scale:1.9, speed:1.9, boss:true };

  function spawnEnemies() {
    const lvl = RPG.player ? RPG.player.level : 1;
    for (let i=0;i<14;i++){
      const t = ENEMY_TYPES[Math.min(ENEMY_TYPES.length-1, Math.floor(rnd(0, ENEMY_TYPES.length)))];
      const p = randInCircle(WORLD_R-6);
      if (Math.hypot(p.x,p.z) < 16 || Math.hypot(p.x-20,p.z-20) < 12) { i--; continue; }
      addEnemy(t, p.x, p.z, lvl);
    }
  }
  function addEnemy(t, x, z, lvl) {
    const scale = t.scale * (t.boss?1:rnd(.9,1.1));
    const c3d = buildCharacter(t.color, true, scale);
    c3d.group.position.set(x, 0, z); scene.add(c3d.group);
    // boss aura
    if (t.boss) {
      const aura = new M.PointLight(0x8833ff, 1.5, 15); aura.position.y = 2; c3d.group.add(aura);
    }
    const mult = 1 + (lvl-1)*.28;
    enemies.push({ ...t, c3d, hp: Math.round(t.hp*mult), maxHp: Math.round(t.hp*mult),
      dmg: Math.round(t.dmg*(1+(lvl-1)*.18)), xp: Math.round(t.xp*mult),
      wanderA: rnd(0,6), wanderT: 0, dead: false });
  }
  function spawnBoss() {
    if (bossSpawned) return; bossSpawned = true;
    addEnemy(BOSS, 0, -10, RPG.player.level + 2);
    toast('⚠ A terrible presence stirs at the ruined shrine…', 'var(--blood)');
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
    addEventListener('wheel', e => { /* reserved */ });
  }

  // ---------- HELPERS ----------
  const rnd = (a,b)=>a+Math.random()*(b-a);
  function randInCircle(r){ const a=rnd(0,Math.PI*2), d=Math.sqrt(Math.random())*r; return {x:Math.cos(a)*d, z:Math.sin(a)*d}; }
  function collide(x, z) {
    if (Math.hypot(x,z) > WORLD_R) return true;
    for (const p of props) if (Math.hypot(x-p.x, z-p.z) < p.r + .5) return true;
    return false;
  }

  // ---------- UPDATE ----------
  let stepT = 0;
  function update(dt) {
    animT += dt;
    const p = player3d.group.position;
    // movement
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
      // run anim
      const s = Math.sin(animT*12);
      player3d.legL.rotation.x = s*.7; player3d.legR.rotation.x = -s*.7;
      player3d.armL.rotation.x = -s*.5; player3d.armR.rotation.x = s*.5;
      player3d.body.position.y = Math.abs(Math.sin(animT*12))*.08;
      stepT += dt; if (stepT > .3) { stepT = 0; AudioSys.play('step'); }
    } else {
      player3d.legL.rotation.x = player3d.legR.rotation.x = 0;
      player3d.armL.rotation.x = player3d.armR.rotation.x = 0;
      player3d.body.position.y = Math.sin(animT*2)*.03; // idle breath
    }

    // camera
    const cx = p.x + Math.sin(camYaw)*Math.cos(camPitch)*CAM_DIST;
    const cz = p.z + Math.cos(camYaw)*Math.cos(camPitch)*CAM_DIST;
    const cy = p.y + Math.sin(camPitch)*CAM_DIST;
    camera.position.lerp(new M.Vector3(cx, cy, cz), 1 - Math.pow(.0001, dt));
    camera.lookAt(p.x, p.y + 1.6, p.z);

    // fade trees that block the camera's view of the player
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

    // enemies
    for (const e of enemies) {
      if (e.dead) continue;
      const ep = e.c3d.group.position;
      const dist = Math.hypot(p.x-ep.x, p.z-ep.z);
      e.wanderT -= dt;
      let vx = 0, vz = 0;
      if (dist < (e.boss? 14 : 9) && dist > .1) { // aggro chase
        vx = (p.x-ep.x)/dist * e.speed; vz = (p.z-ep.z)/dist * e.speed;
      } else if (e.wanderT <= 0) { e.wanderA = rnd(0, Math.PI*2); e.wanderT = rnd(2,5); }
      else { vx = Math.cos(e.wanderA)*e.speed*.35; vz = Math.sin(e.wanderA)*e.speed*.35; }
      const nx = ep.x + vx*dt, nz = ep.z + vz*dt;
      if (!collide(nx, nz) || dist < 11) { ep.x = nx; ep.z = nz; }
      if (vx||vz) e.c3d.group.rotation.y = Math.atan2(vx, vz);
      e.c3d.body.position.y = Math.abs(Math.sin(animT*6 + ep.x))*.1;
      if (dist < 1.8 && onEncounter) { onEncounter(e); }
    }

    // loot
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
            toast(`Picked up <b class="rarity-${l.item.rarity}">${l.item.name}</b>`);
            AudioSys.play('loot'); UI.refreshInv();
          } else toast('Inventory full!');
        } else if (l.gold) {
          const g = RPG.gainGold(l.gold); toast(`+${g} gold`); AudioSys.play('gold'); UI.refreshHUD();
        }
      }
    }

    // ambient anims
    scene.userData.spiritStone.rotation.y += dt*1.2;
    scene.userData.spiritStone.position.y = 4.2 + Math.sin(animT*1.5)*.4;
    scene.userData.skyGlow.scale.setScalar(1 + Math.sin(animT*.8)*.06);
    fireflies.rotation.y += dt*.01;
    fireflies.material.opacity = .6 + Math.sin(animT*2.3)*.25;

    // boss spawn condition
    if (RPG.player && RPG.player.kills >= 8 && !bossSpawned) spawnBoss();

    renderer.render(scene, camera);
  }

  function removeEnemy(e) {
    e.dead = true; scene.remove(e.c3d.group);
    enemies = enemies.filter(x => x !== e);
    RPG.player.kills++;
    // drops
    const gp = e.c3d.group.position;
    if (Math.random() < (e.boss ? 1 : .55)) {
      const item = RPG.genItem(RPG.player.level + (e.boss?3:0));
      dropLoot(gp.x + rnd(-1,1), gp.z + rnd(-1,1), item, null);
    }
    dropLoot(gp.x + rnd(-1.5,1.5), gp.z + rnd(-1.5,1.5), null, Math.round(e.gold * (e.boss?1:rnd(.6,1.4))));
    // respawn a regular enemy elsewhere
    if (!e.boss) setTimeout(() => {
      const p = randInCircle(WORLD_R-6);
      if (Math.hypot(p.x,p.z) > 16) addEnemy(ENEMY_TYPES[rndi(0, ENEMY_TYPES.length-1)], p.x, p.z, RPG.player.level);
    }, 12000);
    else {
      setTimeout(() => UI.gameVictory(), 1200);
    }
  }
  const rndi = (a,b)=>Math.floor(rnd(a,b+1));

  // ---------- MINIMAP ----------
  function drawMinimap() {
    const cv = document.getElementById('minimap'); if (!cv) return;
    const ctx = cv.getContext('2d'); const R = cv.width/2;
    ctx.clearRect(0,0,cv.width,cv.height);
    ctx.fillStyle = '#0a1210'; ctx.beginPath(); ctx.arc(R,R,R-2,0,7); ctx.fill();
    const s = (R-4) / (WORLD_R+10);
    // shrine
    ctx.fillStyle = '#525a6e'; ctx.beginPath(); ctx.arc(R, R, 5, 0, 7); ctx.fill();
    // enemies
    for (const e of enemies) {
      ctx.fillStyle = e.boss ? '#bb44ff' : '#ff4444';
      ctx.beginPath(); ctx.arc(R + e.c3d.group.position.x*s, R + e.c3d.group.position.z*s, e.boss?4:2.5, 0, 7); ctx.fill();
    }
    // loot
    ctx.fillStyle = '#ffe14d';
    for (const l of lootDrops) { ctx.fillRect(R + l.group.position.x*s - 1.5, R + l.group.position.z*s - 1.5, 3, 3); }
    // player
    const p = player3d.group.position;
    ctx.fillStyle = '#7ec8ff'; ctx.beginPath(); ctx.arc(R + p.x*s, R + p.z*s, 3.5, 0, 7); ctx.fill();
    ctx.strokeStyle = '#7ec8ff55'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(R + p.x*s, R + p.z*s, 8, 0, 7); ctx.stroke();
  }

  function reset() {
    // full reset for new game
    enemies.forEach(e => scene.remove(e.c3d.group)); enemies = [];
    lootDrops.forEach(l => scene.remove(l.group)); lootDrops = [];
    bossSpawned = false;
    player3d.group.position.set(20, 0, 20);
    spawnEnemies();
  }

  function setPlayerClass(clsKey) {
    scene.remove(player3d.group);
    player3d = buildCharacter(RPG.CLASSES[clsKey].color);
    player3d.group.position.set(20, 0, 20);
    scene.add(player3d.group);
    document.getElementById('portrait-face').style.background =
      getComputedStyle(document.querySelector(`.class-portrait.${RPG.CLASSES[clsKey].portrait}`)).background;
  }

  return { init, update, drawMinimap, reset, setPlayerClass, removeEnemy,
    get scene(){ return scene; }, get camera(){ return camera; }, get renderer(){ return renderer; },
    get player3d(){ return player3d; },
    set onEncounter(fn){ onEncounter = fn; },
    get enemies(){ return enemies; } };
})();
