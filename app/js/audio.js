/* audio.js — procedural WebAudio: SFX + adaptive ambient music */
const AudioSys = (() => {
  let ctx = null, master, musicGain, sfxGain, musicTimer = null, musicOn = false;
  function init() {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = 0.5; master.connect(ctx.destination);
    musicGain = ctx.createGain(); musicGain.gain.value = 0.35; musicGain.connect(master);
    sfxGain = ctx.createGain(); sfxGain.gain.value = 0.8; sfxGain.connect(master);
  }
  function resume(){ if (ctx && ctx.state === 'suspended') ctx.resume(); }

  function tone(freq, dur, type, vol, when=0, dest=null, slideTo=null) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(freq, ctx.currentTime + when);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(1,slideTo), ctx.currentTime + when + dur);
    g.gain.setValueAtTime(0, ctx.currentTime + when);
    g.gain.linearRampToValueAtTime(vol || .3, ctx.currentTime + when + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + when + dur);
    o.connect(g); g.connect(dest || sfxGain);
    o.start(ctx.currentTime + when); o.stop(ctx.currentTime + when + dur + .05);
  }
  function noise(dur, vol, when=0, filterFreq=1200, type='lowpass') {
    const len = ctx.sampleRate * dur, buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i=0;i<len;i++) d[i] = (Math.random()*2-1) * (1 - i/len);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = filterFreq;
    const g = ctx.createGain(); g.gain.value = vol || .3;
    src.connect(f); f.connect(g); g.connect(sfxGain);
    src.start(ctx.currentTime + when);
  }

  const SFX = {
    click(){ tone(660,.06,'square',.12); },
    hover(){ tone(440,.04,'sine',.06); },
    swing(){ noise(.18,.25,0,900,'bandpass'); },
    hit(){ noise(.12,.4,0,500); tone(120,.15,'triangle',.35,0,null,60); },
    crit(){ noise(.2,.5,0,700); tone(180,.25,'sawtooth',.4,0,null,50); tone(1200,.1,'square',.2,.02); },
    perfect(){ tone(880,.12,'sine',.3); tone(1320,.18,'sine',.25,.07); },
    miss(){ tone(220,.2,'sawtooth',.2,0,null,110); },
    heal(){ tone(520,.3,'sine',.25,0,null,780); tone(780,.3,'sine',.2,.12,null,1040); },
    fire(){ noise(.4,.35,0,1600); tone(90,.4,'sawtooth',.3,0,null,40); },
    ice(){ tone(1800,.3,'sine',.2,0,null,400); noise(.25,.2,0,3000,'highpass'); },
    lightning(){ noise(.15,.5,0,4000,'highpass'); tone(2000,.12,'square',.3,0,null,200); },
    thunder(){ noise(1.4,.6,0,220); noise(.5,.45,0,500); tone(55,1.1,'sine',.5,0,null,30); },
    windGust(){ noise(1.2,.16,0,700,'bandpass'); noise(.9,.1,.2,500,'bandpass'); },
    growl(){ tone(90,.5,'sawtooth',.4,0,null,55); noise(.4,.3,0,300); },
    stomp(){ noise(.3,.6,0,180); tone(50,.35,'sine',.55,0,null,28); },
    whoosh(){ noise(.5,.3,0,1400,'bandpass'); noise(.35,.2,.08,2400,'highpass'); },
    transform(){ tone(220,1.2,'sawtooth',.3,0,null,880); tone(440,1.4,'sine',.25,.1,null,1760); noise(1.0,.2,0,3000,'highpass'); },
    dissolve(){ noise(.8,.25,0,2000,'highpass'); tone(1200,.6,'sine',.15,0,null,300); },
    ascend(){ tone(110,.9,'sawtooth',.4,0,null,440); tone(220,.9,'sawtooth',.3,.15,null,880); noise(.8,.3,0,800); },
    levelup(){ [523,659,784,1046].forEach((f,i)=>tone(f,.35,'triangle',.3,i*.12)); },
    loot(){ tone(987,.12,'sine',.25); tone(1318,.2,'sine',.22,.09); },
    gold(){ tone(1567,.08,'square',.15); tone(2093,.12,'square',.12,.06); },
    potion(){ tone(300,.25,'sine',.25,0,null,600); },
    enemyDie(){ tone(200,.5,'sawtooth',.35,0,null,40); noise(.4,.3,0,400); },
    playerHurt(){ tone(160,.25,'sawtooth',.35,0,null,80); },
    victory(){ [392,523,659,784,1046,1318].forEach((f,i)=>tone(f,.5,'triangle',.28,i*.15)); },
    defeat(){ [400,350,300,200].forEach((f,i)=>tone(f,.6,'sawtooth',.22,i*.3)); },
    step(){ noise(.05,.06,0,300); },
    encounter(){ tone(70,1,'sawtooth',.4,0,null,140); noise(.6,.4,0,600); },
  };

  // Ambient music: slow minor-key pad loop + sparse bell melody
  const scale = [220, 261.63, 293.66, 329.63, 392, 440, 523.25]; // A minor-ish
  let step = 0;
  function musicStep() {
    if (!musicOn) return;
    const padRoot = [110, 87.31, 98, 82.41][Math.floor(step/8) % 4]; // Am F G E progression
    if (step % 8 === 0) {
      [padRoot, padRoot*1.5, padRoot*2].forEach(f => tone(f, 3.6, 'sine', .07, 0, musicGain));
      tone(padRoot*2.02, 3.6, 'triangle', .03, 0, musicGain);
    }
    if (Math.random() < .5) {
      const n = scale[Math.floor(Math.random()*scale.length)] * (Math.random()<.3?2:1);
      tone(n, 1.4, 'sine', .06, Math.random()*.8, musicGain);
    }
    step++;
  }
  function startMusic(){ init(); if (musicOn) return; musicOn = true; musicTimer = setInterval(musicStep, 450); }
  function stopMusic(){ musicOn = false; clearInterval(musicTimer); }

  function play(name){ if(!ctx) return; resume(); (SFX[name]||(()=>{}))(); }
  return { init, resume, play, startMusic, stopMusic };
})();
