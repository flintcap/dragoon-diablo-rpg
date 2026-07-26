/* textures.js — procedural canvas texture factory (grass, dirt, stone, wood, shingle, plaster, water) */
const TexFactory = (() => {
  const cache = {};
  function mk(size, painter) {
    const cv = document.createElement('canvas'); cv.width = cv.height = size;
    painter(cv.getContext('2d'), size);
    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }
  const rnd = (a,b)=>a+Math.random()*(b-a);
  function shade(hex, f) {
    const c = new THREE.Color(hex);
    c.offsetHSL(0, rnd(-.02,.02), rnd(-f,f));
    return '#'+c.getHexString();
  }
  function speckle(ctx, s, base, n, v, size=2) {
    for (let i=0;i<n;i++) {
      ctx.fillStyle = shade(base, v);
      ctx.fillRect(rnd(0,s), rnd(0,s), rnd(1,size), rnd(1,size));
    }
  }

  const T = {};
  function build() {
    T.grass = mk(128, (ctx,s) => {
      ctx.fillStyle = '#11230f'; ctx.fillRect(0,0,s,s);
      speckle(ctx, s, '#1a3a17', 900, .03, 3);
      speckle(ctx, s, '#0a1808', 500, .02, 2);
      speckle(ctx, s, '#2a4a1a', 200, .04, 2);
    });
    T.dirt = mk(128, (ctx,s) => {
      ctx.fillStyle = '#2a2018'; ctx.fillRect(0,0,s,s);
      speckle(ctx, s, '#3a2c1e', 700, .04, 3);
      speckle(ctx, s, '#1a120a', 400, .03, 2);
      speckle(ctx, s, '#4a3a26', 150, .03, 4);
    });
    T.stoneBrick = mk(128, (ctx,s) => {
      ctx.fillStyle = '#181c26'; ctx.fillRect(0,0,s,s);
      const bh = 16, bw = 32;
      for (let y=0; y<s/bh; y++) {
        for (let x=-1; x<s/bw+1; x++) {
          const off = y%2 ? bw/2 : 0;
          ctx.fillStyle = shade('#3a4254', .05);
          ctx.fillRect(x*bw+off+1, y*bh+1, bw-2, bh-2);
          ctx.fillStyle = 'rgba(0,0,0,.35)';
          ctx.fillRect(x*bw+off+1, y*bh+bh-3, bw-2, 2);
        }
      }
      speckle(ctx, s, '#242a38', 300, .04, 2);
    });
    T.wood = mk(128, (ctx,s) => {
      ctx.fillStyle = '#241a10'; ctx.fillRect(0,0,s,s);
      for (let y=0;y<8;y++){
        ctx.fillStyle = shade('#3a2a18', .04);
        ctx.fillRect(0, y*16+1, s, 14);
        ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.fillRect(0, y*16+14, s, 2);
        for (let g=0;g<6;g++){ ctx.fillStyle = shade('#2a1e10', .03); ctx.fillRect(rnd(0,s), y*16+rnd(2,12), rnd(10,40), 1); }
      }
    });
    T.shingle = mk(128, (ctx,s) => {
      ctx.fillStyle = '#1a1218'; ctx.fillRect(0,0,s,s);
      const rh = 16;
      for (let y=0; y<s/rh+1; y++) {
        for (let x=-1; x<9; x++) {
          const off = y%2 ? 8 : 0;
          ctx.fillStyle = shade('#4a2a3a', .05);
          ctx.beginPath();
          ctx.moveTo(x*16+off, y*rh+2);
          ctx.lineTo(x*16+off+15, y*rh+2);
          ctx.lineTo(x*16+off+13, y*rh+rh);
          ctx.lineTo(x*16+off+2, y*rh+rh);
          ctx.fill();
        }
      }
      speckle(ctx, s, '#2a1a24', 200, .04, 2);
    });
    T.plaster = mk(128, (ctx,s) => {
      ctx.fillStyle = '#4a4034'; ctx.fillRect(0,0,s,s);
      speckle(ctx, s, '#5a5044', 800, .03, 3);
      speckle(ctx, s, '#3a322a', 400, .03, 2);
      speckle(ctx, s, '#6a6050', 100, .04, 5);
    });
    T.water = mk(128, (ctx,s) => {
      ctx.fillStyle = '#06202e'; ctx.fillRect(0,0,s,s);
      for (let i=0;i<26;i++){
        ctx.strokeStyle = shade('#0e3a50', .05); ctx.lineWidth = rnd(1,2.5);
        ctx.beginPath();
        const y = rnd(0,s);
        ctx.moveTo(rnd(-20,s*.5), y);
        ctx.bezierCurveTo(s*.3, y+rnd(-6,6), s*.6, y+rnd(-6,6), s+20, y+rnd(-4,4));
        ctx.stroke();
      }
      speckle(ctx, s, '#0a2a3e', 200, .04, 2);
    });
    T.sand = mk(128, (ctx,s) => {
      ctx.fillStyle = '#3a3222'; ctx.fillRect(0,0,s,s);
      speckle(ctx, s, '#5a4e38', 900, .03, 3);
      speckle(ctx, s, '#3a3020', 500, .03, 2);
      speckle(ctx, s, '#6a5c42', 200, .04, 2);
    });
    T.ash = mk(128, (ctx,s) => {
      ctx.fillStyle = '#181010'; ctx.fillRect(0,0,s,s);
      speckle(ctx, s, '#241614', 700, .03, 3);
      speckle(ctx, s, '#0e0808', 400, .03, 2);
      speckle(ctx, s, '#3a1e12', 120, .04, 3);
    });
    T.snow = mk(128, (ctx,s) => {
      ctx.fillStyle = '#1c2431'; ctx.fillRect(0,0,s,s);
      speckle(ctx, s, '#283244', 800, .03, 3);
      speckle(ctx, s, '#141a24', 500, .03, 2);
      speckle(ctx, s, '#3c4a5e', 240, .04, 2);   // wind-packed drifts
      speckle(ctx, s, '#7a8caa', 50, .05, 1);    // ice glints
    });
    T.iceRock = mk(128, (ctx,s) => {
      ctx.fillStyle = '#1c2230'; ctx.fillRect(0,0,s,s);
      speckle(ctx, s, '#2a3242', 700, .03, 4);
      speckle(ctx, s, '#12161e', 500, .03, 3);
      speckle(ctx, s, '#3e4c62', 220, .04, 3);
    });
    return T;
  }
  function all() { return cache.t || (cache.t = build()); }
  function apply(material, tex, rx=1, ry=1) {
    const t = all()[tex]; if (!t) return material;
    t.repeat.set(rx, ry); material.map = t;
    material.color.setHex(0xffffff);
    material.needsUpdate = true;
    return material;
  }
  return { all, apply };
})();
