/* textures.js — procedural material factory.

   The old factory painted 128px of random speckle and handed the *same* texture object
   to every material that asked for it, so the last caller's `repeat` silently won for
   everyone. This one:
     · builds at 256px from layered value noise (fBm), so surfaces have structure at
       every scale instead of TV static
     · derives a NORMAL MAP from each surface's own height field, which is what actually
       makes stone read as stone under a moving light
     · returns a fresh clone per material, so repeats never collide
     · gives each surface real drawn detail — mortar courses, wood grain and knots,
       grass clumps, wave crests — rather than three passes of dots. */
const TexFactory = (() => {
  const cache = {};
  const SIZE = 192;

  // ---------- noise ----------
  function hash(x, y, seed) {
    let h = x * 374761393 + y * 668265263 + seed * 1442695041;
    h = (h ^ (h >> 13)) * 1274126177;
    return ((h ^ (h >> 16)) >>> 0) / 4294967295;
  }
  /* Tiling value noise: lattice coordinates wrap at `period`, so the texture is seamless. */
  function vnoise(x, y, period, seed) {
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = x - ix, fy = y - iy;
    const sx = fx*fx*(3-2*fx), sy = fy*fy*(3-2*fy);
    const w = v => ((v % period) + period) % period;
    const a = hash(w(ix),   w(iy),   seed), b = hash(w(ix+1), w(iy),   seed);
    const c = hash(w(ix),   w(iy+1), seed), d = hash(w(ix+1), w(iy+1), seed);
    const top = a + (b - a) * sx, bot = c + (d - c) * sx;
    return top + (bot - top) * sy;
  }
  /* Fractal Brownian motion — the octave stack is what gives a surface both broad
     patches and fine grain, which is precisely what white noise cannot do. */
  function fbm(x, y, octaves, baseFreq, seed) {
    let v = 0, amp = 1, freq = baseFreq, norm = 0;
    for (let o = 0; o < octaves; o++) {
      v += vnoise(x * freq, y * freq, Math.round(freq), seed + o * 37) * amp;
      norm += amp; amp *= .5; freq *= 2;
    }
    return v / norm;
  }

  // ---------- canvas helpers ----------
  function canvas() {
    const cv = document.createElement('canvas');
    cv.width = cv.height = SIZE;
    return cv;
  }
  function toTex(cv, srgb) {
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
    if (srgb && THREE.sRGBEncoding) t.encoding = THREE.sRGBEncoding;
    return t;
  }
  /* Painters run once per pixel — 36,864 times per surface — so anything that allocates
     in here dominates the build. Palettes are resolved to plain [r,g,b] triples up front
     and every blend writes into the caller's scratch colour. */
  const P = hex => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
  const setLerp = (c, a, b, t) => {
    c.r = a[0] + (b[0] - a[0]) * t;
    c.g = a[1] + (b[1] - a[1]) * t;
    c.b = a[2] + (b[2] - a[2]) * t;
  };
  const blend = (c, b, t) => {
    if (t <= 0) return;
    if (t > 1) t = 1;
    c.r += (b[0] - c.r) * t; c.g += (b[1] - c.g) * t; c.b += (b[2] - c.b) * t;
  };
  const lift = (c, d) => { c.r += d; c.g += d; c.b += d; };

  // one palette table, resolved once
  const C = {
    grassDark: P('#0e2110'), grassMid: P('#1c3d19'), grassLush: P('#2c5a22'),
    grassStraw: P('#4a5326'), soil: P('#2b2418'),
    dirtLo: P('#1d1610'), dirtHi: P('#3d2f21'), pebble: P('#54432e'),
    mortarLo: P('#12151c'), mortarHi: P('#1e222c'), blockLo: P('#2e3646'), blockHi: P('#454f63'), damp: P('#171b24'),
    woodLo: P('#2b1d11'), woodHi: P('#5a3f24'), knot: P('#150d07'), joint: P('#0d0805'),
    tileLo: P('#2c1a26'), tileHi: P('#553346'), tileLit: P('#7a5068'), tileShade: P('#120a10'),
    plasterLo: P('#3b3227'), plasterHi: P('#6a5f4c'), crack: P('#241d15'),
    waterLo: P('#04141f'), waterHi: P('#12455f'), crest: P('#3e8fae'),
    sandLo: P('#2f2818'), sandHi: P('#6b5c3e'), shell: P('#8a7a58'),
    ashLo: P('#0e0a09'), ashHi: P('#2b211e'), ember: P('#7a2c12'),
    snowLo: P('#151d29'), snowHi: P('#41506a'), snowCrust: P('#8ea4c6'),
    iceLo: P('#151a24'), iceHi: P('#39465c'), iceFrac: P('#5f7290'),
    metalLo: P('#232833'), metalHi: P('#5c6675'), rust: P('#3a2b1e'),
    clothLo: P('#3a1414'), clothHi: P('#7a2626'),
    barkLo: P('#1b1209'), barkHi: P('#48331f'), barkFis: P('#0d0805'),
  };

  /* Paint a colour map from a per-pixel function, recording a height value alongside it
     so the normal map can be derived from the same surface. */
  function surface(paint) {
    const cv = canvas(), ctx = cv.getContext('2d');
    const img = ctx.createImageData(SIZE, SIZE);
    const height = new Float32Array(SIZE * SIZE);
    const c = new THREE.Color();
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const i = y * SIZE + x;
        const h = paint(x, y, c);          // paint sets `c`, returns height 0..1
        height[i] = h;
        img.data[i*4]     = Math.round(Math.min(1, Math.max(0, c.r)) * 255);
        img.data[i*4 + 1] = Math.round(Math.min(1, Math.max(0, c.g)) * 255);
        img.data[i*4 + 2] = Math.round(Math.min(1, Math.max(0, c.b)) * 255);
        img.data[i*4 + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return { cv, height };
  }
  /* Sobel the height field into a tangent-space normal map. This is the step that makes
     the difference between a painted picture of stone and a surface that catches light. */
  function normalFrom(height, strength) {
    const cv = canvas(), ctx = cv.getContext('2d');
    const img = ctx.createImageData(SIZE, SIZE);
    const at = (x, y) => height[((y + SIZE) % SIZE) * SIZE + ((x + SIZE) % SIZE)];
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const dx = (at(x-1,y-1) + 2*at(x-1,y) + at(x-1,y+1)) - (at(x+1,y-1) + 2*at(x+1,y) + at(x+1,y+1));
        const dy = (at(x-1,y-1) + 2*at(x,y-1) + at(x+1,y-1)) - (at(x-1,y+1) + 2*at(x,y+1) + at(x+1,y+1));
        let nx = dx * strength, ny = dy * strength, nz = 1;
        const len = Math.hypot(nx, ny, nz);
        nx /= len; ny /= len; nz /= len;
        const i = (y * SIZE + x) * 4;
        img.data[i]     = Math.round((nx * .5 + .5) * 255);
        img.data[i + 1] = Math.round((ny * .5 + .5) * 255);
        img.data[i + 2] = Math.round((nz * .5 + .5) * 255);
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return cv;
  }

  // ---------- the surfaces ----------
  const DEFS = {
    /* Clumped growth, dry patches, and the odd bare scrape of soil. */
    grass: { strength: 2.2, paint: (x, y, c) => {
      const clump = fbm(x, y, 4, 1/26, 11);
      const blade = fbm(x, y, 3, 1/5,  23);
      const dry   = fbm(x, y, 3, 1/44, 31);
      setLerp(c, C.grassDark, C.grassMid, clump);
      blend(c, C.grassLush, (blade - .45) * 1.5);
      blend(c, C.grassStraw, (dry - .62) * 1.7);
      if (clump < .22) blend(c, C.soil, (.22 - clump) * 3);
      return clump * .6 + blade * .4;
    }},
    /* Packed earth with pebbles pressed into it. */
    dirt: { strength: 2.6, paint: (x, y, c) => {
      const base = fbm(x, y, 4, 1/30, 5);
      const grit = fbm(x, y, 2, 1/4,  17);
      const peb  = fbm(x, y, 2, 1/9,  41);
      setLerp(c, C.dirtLo, C.dirtHi, base);
      blend(c, C.pebble, (peb - .70) * 2.4);
      lift(c, (grit - .5) * .05);
      return base * .55 + Math.max(0, peb - .7) * 1.6 + grit * .1;
    }},
    /* Coursed masonry: recessed mortar, weathering pooled at the bottom of each block. */
    stoneBrick: { strength: 3.4, paint: (x, y, c) => {
      const BH = 24, BW = 48, M = 2;
      const row = Math.floor(y / BH);
      const off = (row % 2) ? BW / 2 : 0;
      const bx = ((x + off) % BW), by = y % BH;
      const wear = fbm(x, y, 4, 1/22, 7);
      const grit = fbm(x, y, 2, 1/3,  13);
      if (bx < M || bx > BW - M || by < M || by > BH - M) {
        setLerp(c, C.mortarLo, C.mortarHi, wear);
        return .12 + grit * .05;
      }
      const seed = (row * 31 + Math.floor((x + off) / BW) * 17) % 97;
      setLerp(c, C.blockLo, C.blockHi, wear);
      lift(c, ((seed / 97) - .5) * .06);                        // block-to-block variation
      blend(c, C.damp, Math.max(0, (by - BH * .72) / (BH * .28)) * .5);  // damp lower edge
      lift(c, (grit - .5) * .05);
      return .62 + wear * .28 + grit * .1;
    }},
    /* Sawn planks: grain along the length, knots, dark shadow in each joint. */
    wood: { strength: 2.8, paint: (x, y, c) => {
      const PH = 32;
      const plank = Math.floor(y / PH), py = y % PH;
      const grain = fbm(x * .35, y * 3.2, 3, 1/12, 3 + plank);
      const knot = fbm(x, y, 2, 1/34, 61);
      setLerp(c, C.woodLo, C.woodHi, grain);
      lift(c, (((plank * 53) % 89) / 89 - .5) * .05);
      if (knot > .78) blend(c, C.knot, (knot - .78) * 4);
      const edge = Math.min(py, PH - py);
      if (edge < 2) blend(c, C.joint, (2 - edge) * .45);
      return .5 + grain * .4 - (edge < 2 ? .45 : 0) - (knot > .78 ? .25 : 0);
    }},
    /* Overlapping roof tiles: lit top lip, shadowed underside. */
    shingle: { strength: 3.2, paint: (x, y, c) => {
      const RH = 24, TW = 32;
      const row = Math.floor(y / RH);
      const off = (row % 2) ? TW / 2 : 0;
      const tx = ((x + off) % TW), ty = y % RH;
      const wear = fbm(x, y, 3, 1/18, 19);
      setLerp(c, C.tileLo, C.tileHi, wear);
      lift(c, (((row * 41 + Math.floor((x + off) / TW) * 23) % 79) / 79 - .5) * .07);
      if (ty < 3) blend(c, C.tileLit, (3 - ty) * .22);
      if (ty > RH - 5) blend(c, C.tileShade, (ty - RH + 5) * .2);
      if (tx < 2) blend(c, C.tileShade, .5);
      return .55 + (ty < 3 ? .35 : 0) - (ty > RH - 5 ? .4 : 0) + wear * .12;
    }},
    /* Lime plaster: broad trowel sweeps with hairline cracks. */
    plaster: { strength: 1.6, paint: (x, y, c) => {
      const sweep = fbm(x * .6, y, 4, 1/40, 9);
      const fine  = fbm(x, y, 2, 1/6, 27);
      const crack = fbm(x, y, 3, 1/16, 71);
      setLerp(c, C.plasterLo, C.plasterHi, sweep);
      lift(c, (fine - .5) * .04);
      if (crack > .80) blend(c, C.crack, (crack - .80) * 4);
      return sweep * .7 + fine * .3 - (crack > .8 ? .5 : 0);
    }},
    /* Slow swell with crests — the normal map is what sells this one. */
    water: { strength: 1.4, paint: (x, y, c) => {
      const h = fbm(x, y * 2.2, 4, 1/34, 2) * .65 + fbm(x * 1.6, y * 3.4, 3, 1/11, 43) * .35;
      setLerp(c, C.waterLo, C.waterHi, h);
      blend(c, C.crest, (h - .74) * 2.6);
      return h;
    }},
    /* Wind-rippled sand with shell grit. */
    sand: { strength: 2.0, paint: (x, y, c) => {
      const dune = fbm(x, y * 1.5, 4, 1/30, 6);
      const ripple = Math.sin((x * .22 + fbm(x, y, 2, 1/20, 15) * 7)) * .5 + .5;
      const grit = fbm(x, y, 2, 1/3, 33);
      setLerp(c, C.sandLo, C.sandHi, dune * .7 + ripple * .3);
      blend(c, C.shell, (grit - .82) * 3);
      return dune * .6 + ripple * .3 + grit * .1;
    }},
    /* Cooling ash over a bed of embers. */
    ash: { strength: 2.4, paint: (x, y, c) => {
      const drift = fbm(x, y, 4, 1/26, 8);
      const ember = fbm(x, y, 3, 1/13, 55);
      setLerp(c, C.ashLo, C.ashHi, drift);
      blend(c, C.ember, (ember - .74) * 3.2);
      return drift * .8 + ember * .2;
    }},
    /* Wind-packed snow with a crust that catches the moon. */
    snow: { strength: 1.8, paint: (x, y, c) => {
      const drift = fbm(x, y * 1.4, 4, 1/28, 4);
      const crust = fbm(x, y, 3, 1/8, 47);
      setLerp(c, C.snowLo, C.snowHi, drift);
      blend(c, C.snowCrust, (crust - .76) * 3);
      return drift * .75 + crust * .25;
    }},
    /* Frost-shattered rock. */
    iceRock: { strength: 3.0, paint: (x, y, c) => {
      const rock = fbm(x, y, 4, 1/20, 12);
      const frac = fbm(x, y, 3, 1/9, 63);
      setLerp(c, C.iceLo, C.iceHi, rock);
      blend(c, C.iceFrac, (frac - .78) * 3);
      return rock * .8 + (frac > .78 ? .2 : 0);
    }},
    /* Weathered iron, for armour and fittings. */
    metal: { strength: 2.2, paint: (x, y, c) => {
      const brush = fbm(x * .25, y * 4, 3, 1/14, 21);
      const pit = fbm(x, y, 3, 1/7, 67);
      setLerp(c, C.metalLo, C.metalHi, brush);
      blend(c, C.rust, (pit - .80) * 3.5);
      return brush * .7 + (pit > .8 ? -.3 : 0) + .3;
    }},
    /* Woven cloth, for capes and banners. */
    cloth: { strength: 1.5, paint: (x, y, c) => {
      const weave = ((x % 4 < 2) !== (y % 4 < 2)) ? .58 : .42;
      const dye = fbm(x, y, 4, 1/30, 25);
      const wear = fbm(x, y, 2, 1/9, 81);
      setLerp(c, C.clothLo, C.clothHi, dye);
      lift(c, (weave - .5) * .09 + (wear - .5) * .05);
      return weave * .5 + dye * .5;
    }},
    /* Tree bark: vertical ridges and deep fissures. */
    bark: { strength: 3.6, paint: (x, y, c) => {
      const ridge = fbm(x * 2.6, y * .5, 4, 1/16, 14);
      const fissure = fbm(x * 3.2, y * .4, 3, 1/7, 52);
      setLerp(c, C.barkLo, C.barkHi, ridge);
      if (fissure < .3) blend(c, C.barkFis, (.3 - fissure) * 2.4);
      return ridge * .75 - (fissure < .3 ? (.3 - fissure) * 1.6 : 0) + .2;
    }},
  };

  /* Built on demand — fourteen 256px surfaces plus their normal maps is real work, and
     no single zone needs more than a handful of them. */
  function get(name) {
    if (cache[name]) return cache[name];
    const def = DEFS[name]; if (!def) return null;
    const { cv, height } = surface(def.paint);
    return (cache[name] = { map: toTex(cv, true), normal: toTex(normalFrom(height, def.strength), false) });
  }
  function all() {
    const out = {};
    for (const name of Object.keys(DEFS)) out[name] = get(name);
    return out;
  }

  /* Hand each material its OWN texture views. The previous factory shared one instance
     and mutated `.repeat` on it, so whichever material applied last dictated the tiling
     for every other material using that surface. */
  function apply(material, tex, rx = 1, ry = 1, opts = {}) {
    const t = get(tex);
    if (!t) return material;
    const map = t.map.clone(); map.needsUpdate = true;
    map.repeat.set(rx, ry);
    material.map = map;
    if (opts.normal !== false && 'normalMap' in material) {
      const nrm = t.normal.clone(); nrm.needsUpdate = true;
      nrm.repeat.set(rx, ry);
      material.normalMap = nrm;
      const ns = opts.normalScale !== undefined ? opts.normalScale : 1;
      if (material.normalScale) material.normalScale.set(ns, ns);
    }
    material.color.setHex(opts.tint !== undefined ? opts.tint : 0xffffff);
    material.needsUpdate = true;
    return material;
  }
  /* Surface relief without touching albedo — for anything that must keep its own colour
     (armour tinted by class, gear tinted by rarity) but still catch light like a material. */
  function applyNormal(material, tex, rx = 1, ry = 1, strength = 1) {
    const t = get(tex);
    if (!t || !('normalMap' in material)) return material;
    const nrm = t.normal.clone(); nrm.needsUpdate = true;
    nrm.repeat.set(rx, ry);
    material.normalMap = nrm;
    if (material.normalScale) material.normalScale.set(strength, strength);
    material.needsUpdate = true;
    return material;
  }
  return { all, get, apply, applyNormal, SIZE, names: () => Object.keys(DEFS) };
})();
