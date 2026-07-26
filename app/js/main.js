/* main.js — bootstrap, state machine, quest engine, NPC dialogue, shops, all UI wiring */
const Main = (() => {
  let state = 'title'; // title | world | battle | paused
  let lastT = performance.now();

  const ui = id => document.getElementById(id);
  window.toast = (html, color) => {
    const t = document.createElement('div');
    t.className = 'toast'; t.innerHTML = html;
    if (color) t.style.borderColor = color;
    ui('toast-wrap').appendChild(t);
    setTimeout(()=> t.remove(), 3000);
  };

  const F = key => !!(RPG.player.flags && RPG.player.flags[key]);
  const Fget = key => (RPG.player.flags && RPG.player.flags[key]) || 0;
  function Fset(key, val=true) { (RPG.player.flags ||= {})[key] = val; }

  // ============================================================
  //  QUEST ENGINE — Act I: "The Fallen Star"
  // ============================================================
  const MAIN_QUESTS = [
    { id:'q1', num:'I', title:'Awakening',
      story: `The Fallen Star tore the heavens and sank beyond the wood. You wake at the forest's edge with the Dragoon Spirit fused to your chest — and the Whisperwood crawling with corrupted fiends. Serah, a Wingly scout, hauls you upright: "Move or die. The fiends first — questions after."`,
      objectives: [
        { text:'Slay fiends of the Whisperwood', prog:()=>[Math.min(3,RPG.player.kills),3] },
        { text:'Claim the Spirit Shard at the ruined shrine', prog:()=>[F('spiritShard')?1:0,1] },
      ],
      rewards:{ xp:60, gold:30 },
      doneBeat:'The shard sinks into your chest and the Spirit roars. Serah stares: "So it\'s true. It chose you."',
      objects:[
        { when:()=>RPG.player.kills>=3, zone:'forest', id:'shard', x:2.5, z:4, col:0xff5533,
          label:'Claim the Spirit Shard', kind:'pickup',
          onUse:()=>{ Fset('spiritShard'); World.removeInteract('shard');
            RPG.player.spirit = Math.min(100, RPG.player.spirit + 20);
            AudioSys.play('loot'); toast('✦ Spirit Shard claimed — <b>+20% spirit</b>'); UI.refreshHUD(); } },
      ] },

    { id:'q2', num:'II', title:"The Wingly's Trial",
      story:`Serah leads you to three ancient attunement crystals, half-buried in the wood. "The old trial of the Dragon Knights. Attune them in the order the verse commands and the Spirit will open to you. Guess wrong — and the trial resets." The verse reads: <i>"First the STAR that fell from grace, then the MOON that watched it fall, and last the EMBER left behind."</i>`,
      objectives: [
        { text:'Attune the crystals — in the verse\u2019s order', prog:()=>[Math.min(3,Fget('attuned')),3], hint:'Verse: "First the STAR… then the MOON… last the EMBER."' },
      ],
      rewards:{ xp:90, gold:40, spirit:25 },
      doneBeat:'All three crystals sing in harmony. Serah smiles for the first time: "You felt it, didn\'t you? The Spirit listening."',
      objects:[
        { when:()=>true, zone:'forest', id:'c_star', x:15, z:-38, col:0xcc88ff, label:'Attune the Star Crystal', kind:'attune',
          onUse:(it)=>attuneCrystal('c_star', 'Star') },
        { when:()=>true, zone:'forest', id:'c_moon', x:35, z:10, col:0x7ec8ff, label:'Attune the Moon Crystal', kind:'attune',
          onUse:(it)=>attuneCrystal('c_moon', 'Moon') },
        { when:()=>true, zone:'forest', id:'c_ember', x:-20, z:40, col:0xff9a4d, label:'Attune the Ember Crystal', kind:'attune',
          onUse:(it)=>attuneCrystal('c_ember', 'Ember') },
      ] },

    { id:'q3', num:'III', title:'Herald of Shadows',
      story:`At the shrine, Melbu Frahma's will has raised a Herald — a knight-shaped hole in the world. It is shielded by three <b>Shadow Anchors</b> driven into the shrine stones. Break the anchors. Then break the Herald. Serah: "It will know what you do. It will send pieces of itself to stop you."`,
      objectives: [
        { text:'Destroy the Shadow Anchors at the shrine', prog:()=>[Math.min(3,Fget('anchorsDestroyed')),3] },
        { text:'Slay <b>Melbu\'s Herald</b>', prog:()=>[F('heraldDead')?1:0,1] },
      ],
      rewards:{ xp:150, gold:80, item:'magic' },
      doneBeat:'The Herald folds like burnt paper. Somewhere below, stone grinds open — the way to the Grotto is free.',
      objects:[
        { when:()=>true, zone:'forest', id:'anchor1', x:6, z:1, col:0x9922cc, label:'Destroy the Shadow Anchor', kind:'anchor',
          onUse:()=>destroyAnchor('anchor1') },
        { when:()=>true, zone:'forest', id:'anchor2', x:-5, z:5, col:0x9922cc, label:'Destroy the Shadow Anchor', kind:'anchor',
          onUse:()=>destroyAnchor('anchor2') },
        { when:()=>true, zone:'forest', id:'anchor3', x:-5, z:-5, col:0x9922cc, label:'Destroy the Shadow Anchor', kind:'anchor',
          onUse:()=>destroyAnchor('anchor3') },
      ] },

    { id:'q4', num:'IV', title:'Drowned Relics',
      story:`Below the shrine, the Sunken Grotto breathes cold violet dark. Four relics of the old Dragoon order lie drowned in it. The Tyrant of the Deep guards them jealously — take them all, and it will have no choice but to surface. Serah: "It watches through the water. Expect teeth with every relic."`,
      objectives: [
        { text:'Enter the Sunken Grotto (violet portal, southwest)', prog:()=>[F('enteredGrotto')?1:0,1] },
        { text:'Recover the Drowned Relics', prog:()=>[Math.min(4,Fget('relics')),4] },
      ],
      rewards:{ xp:200, gold:120, item:'rare' },
      doneBeat:'The fourth relic leaves the water screaming. Far off, the lair empties. Something enormous begins to climb.',
      objects:[
        { when:()=>true, zone:'grotto', id:'relic1', x:20, z:-15, col:0x3ad5c8, label:'Recover the Drowned Relic', kind:'pickup',
          onUse:()=>takeRelic('relic1') },
        { when:()=>true, zone:'grotto', id:'relic2', x:-25, z:10, col:0x3ad5c8, label:'Recover the Drowned Relic', kind:'pickup',
          onUse:()=>takeRelic('relic2') },
        { when:()=>true, zone:'grotto', id:'relic3', x:-10, z:-35, col:0x3ad5c8, label:'Recover the Drowned Relic', kind:'pickup',
          onUse:()=>takeRelic('relic3') },
        { when:()=>true, zone:'grotto', id:'relic4', x:35, z:25, col:0x3ad5c8, label:'Recover the Drowned Relic', kind:'pickup',
          onUse:()=>takeRelic('relic4') },
      ] },

    { id:'q5', num:'V', title:'The Tyrant',
      story:`The water abandons the lair. What climbs out is older than the shrine above, and it remembers starving. Serah, quietly: "When it bleeds enough, it will stop being careful. That is when it is worst."`,
      objectives: [
        { text:'Slay the <b>Tyrant of the Deep</b> — beware its enrage below 30%', prog:()=>[F('tyrantDead')?1:0,1] },
      ],
      rewards:{ xp:300, gold:250, item:'rare' },
      doneBeat:'The Tyrant collapses into its own lair, and the lair collapses with it. In its gullet: a shard of burning star-metal.',
      objects:[] },

    { id:'q6', num:'VI', title:'The Fallen Star',
      story:`Herald's ember, Tyrant's trophy — one thing is still missing: a fragment of the Star itself. A meteor shard fell near the place you woke. Take it, and the Star Key is forged. Then walk into the crater and <b>end Melbu Frahma</b>. Serah: "Whatever stands up in that crater — it will not be a herald. It will be him."`,
      objectives: [
        { text:'Recover the Meteor Shard in the Whisperwood', prog:()=>[F('starKey')?1:0,1] },
        { text:'Destroy <b>MELBU FRAHMA</b> in the Star Crater', prog:()=>[F('melbuDead')?1:0,1] },
      ],
      rewards:{ xp:500, gold:500, item:'unique' },
      doneBeat:'The Star gutters like a candle. It is finished.',
      objects:[
        { when:()=>true, zone:'forest', id:'meteor', x:12, z:14, col:0xff6a3a, label:'Recover the Meteor Shard', kind:'pickup',
          onUse:()=>{ Fset('starKey'); World.removeInteract('meteor'); AudioSys.play('dragoon');
            toast('🔑 <b>The Star Key is forged</b> — the crater portal in the Grotto is open!'); } },
      ] },
  ];

  const SIDE_QUESTS = [
    { id:'s1', title:'Elite Hunter',
      text:'Gold-ringed champions stalk the wilds. Prove yourself their better.',
      prog:()=>[Math.min(3,Fget('eliteKills')),3],
      rewards:{ gold:150, item:'magic' } },
    { id:'s2', title:'Hoarder',
      text:'Greed keeps you alive out here. Pick up 6 items.',
      prog:()=>[Math.min(6,Fget('itemsFound')),6],
      rewards:{ gold:80, potions:2 } },
  ];

  // ---- quest object mechanics ----
  const ATTUNE_ORDER = ['c_star','c_moon','c_ember'];
  function attuneCrystal(id, name) {
    const idx = Fget('attuned');
    if (ATTUNE_ORDER[idx] === id) {
      Fset('attuned', idx+1);
      World.removeInteract(id);
      AudioSys.play('perfect');
      toast(`✦ The <b>${name} Crystal</b> hums in tune (${idx+1}/3)`);
      World.spawnAmbush(1);
    } else {
      Fset('attuned', 0);
      AudioSys.play('miss');
      toast('The crystals flare, then dim — <b>wrong order, the trial resets</b>.<br><small><i>"First the STAR… then the MOON… last the EMBER."</i></small>');
      resyncObjects(true);
    }
  }
  function destroyAnchor(id) {
    Fset('anchorsDestroyed', Fget('anchorsDestroyed')+1);
    World.removeInteract(id);
    AudioSys.play('crit');
    toast(`⚓ Shadow Anchor destroyed (${Fget('anchorsDestroyed')}/3) — the Herald's shield weakens!`);
    World.spawnAmbush(1);
  }
  function takeRelic(id) {
    Fset('relics', Fget('relics')+1);
    World.removeInteract(id);
    AudioSys.play('loot');
    toast(`✦ Drowned Relic recovered (${Fget('relics')}/4)`);
    if (Math.random() < .5) World.spawnAmbush(1);
    if (Fget('relics') >= 4) toast('⚠ The lair empties… <b>the Tyrant surfaces!</b>', 'var(--blood)');
  }

  // ---- engine ----
  function currentMain() { return MAIN_QUESTS.find(q => !F('done_'+q.id)); }
  function getQuestStage() { return MAIN_QUESTS.filter(q => F('done_'+q.id)).length + 1; }

  function applyRewards(r) {
    const p = RPG.player;
    if (r.xp) { const ups = RPG.gainXp(r.xp); if (ups) { AudioSys.play('levelup'); toast(`★ LEVEL UP! Now level ${p.level}`); } }
    if (r.gold) { const g = RPG.gainGold(r.gold); }
    if (r.spirit) p.spirit = Math.min(100, p.spirit + r.spirit);
    if (r.potions) { p.potions.hp += r.potions; p.potions.mp += r.potions; }
    if (r.item) {
      const it = RPG.genItem(p.level + 2, r.item === 'unique' ? 'unique' : r.item === 'rare' ? 'rare' : 'magic');
      if (p.inventory.length < 24) { p.inventory.push(it); toast(`Reward: <b class="rarity-${it.rarity}">${it.name}</b>`); }
      else p.gold += 100;
    }
    UI.refreshHUD(); UI.refreshInv();
  }

  function completeQuest(q, isSide) {
    Fset('done_'+q.id);
    AudioSys.play('levelup');
    toast(`<b style="color:var(--gold-hi)">QUEST COMPLETE — ${q.title}</b>`, 'var(--gold)');
    applyRewards(q.rewards || {});
    if (!isSide && q.doneBeat) setTimeout(()=> toast(`<i>${q.doneBeat}</i>`), 1600);
    resyncObjects(true);
  }

  function checkQuests() {
    if (!RPG.player) return;
    const q = currentMain();
    if (q && q.objectives.every(o => { const [a,b] = o.prog(); return a >= b; })) completeQuest(q, false);
    for (const s of SIDE_QUESTS) {
      if (!F('done_'+s.id)) { const [a,b] = s.prog(); if (a >= b) completeQuest(s, true); }
    }
  }

  // ---- quest objects sync (signature-based) ----
  let objSig = '';
  function resyncObjects(force) {
    if (!RPG.player || !World.syncQuestObjects) return;
    const q = currentMain();
    const zone = World.zone;
    const list = [];
    if (q) for (const o of q.objects || []) {
      if (o.zone === zone && o.when()) {
        list.push({ id:o.id, x:o.x, z:o.z, col:o.col, label:o.label, kind:o.kind, onUse:o.onUse });
      }
    }
    const sig = zone + '|' + list.map(l=>l.id).join(',');
    if (force || sig !== objSig) { objSig = sig; World.syncQuestObjects(list); }
  }

  // ---- tracker + log rendering ----
  function refreshQuest() {
    const el = ui('quest-text'); if (!el || !RPG.player) return;
    checkQuests();
    const q = currentMain();
    let html = '';
    if (q) {
      html += `<div style="color:var(--gold-hi);margin-bottom:3px">${q.num}. ${q.title}</div>`;
      for (const o of q.objectives) {
        const [a,b] = o.prog();
        const done = a >= b;
        html += `<div class="${done?'q-done':''}">${done?'✓':'·'} ${o.text} <span class="q-prog">${a}/${b}</span></div>`;
      }
    } else html = '<span class="q-done">✓ Act I complete</span>';
    for (const s of SIDE_QUESTS) {
      if (F('done_'+s.id)) continue;
      const [a,b] = s.prog();
      html += `<div style="margin-top:5px;color:var(--dim)">◇ ${s.title} <span class="q-prog">${a}/${b}</span></div>`;
    }
    el.innerHTML = html;
  }

  function renderQuestLog() {
    const wrap = ui('quest-log-body'); wrap.innerHTML = '';
    let html = `<div class="ql-act">ACT I — THE FALLEN STAR</div>`;
    for (const q of MAIN_QUESTS) {
      const done = F('done_'+q.id);
      const active = currentMain() === q;
      html += `<div class="ql-quest ${done?'done':active?'active':'locked'}">
        <h4>${q.num}. ${q.title} ${done?'<span class="ql-check">✓</span>':''}</h4>
        <p class="ql-story">${q.story}</p>
        <div class="ql-objs">${q.objectives.map(o => { const [a,b]=o.prog();
          return `<div class="${a>=b?'q-done':''}">${a>=b?'✓':'·'} ${o.text} <span class="q-prog">${a}/${b}</span>${o.hint?`<div class="ql-hint">${o.hint}</div>`:''}</div>`; }).join('')}</div>
        <div class="ql-rewards">Rewards: ${Object.entries(q.rewards).map(([k,v])=>k==='item'? v+' item': v+' '+k).join(' · ')}</div>
      </div>`;
    }
    html += `<div class="ql-act">SIDE QUESTS</div>`;
    for (const s of SIDE_QUESTS) {
      const done = F('done_'+s.id); const [a,b] = s.prog();
      html += `<div class="ql-quest ${done?'done':'active'}"><h4>◇ ${s.title} ${done?'<span class="ql-check">✓</span>':''}</h4>
        <p class="ql-story">${s.text}</p>
        <div class="${a>=b?'q-done':''}">· Progress <span class="q-prog">${a}/${b}</span></div></div>`;
    }
    html += `<div class="ql-act">THE ROAD AHEAD</div>
      <div class="ql-quest locked"><h4>ACT II — The Wingly Empire</h4><p class="ql-story">With the Star destroyed, the sky-roads open. Serah's people are not what they told the humans they were. (In development.)</p></div>
      <div class="ql-quest locked"><h4>ACT III — The Sea of Ash</h4><p class="ql-story">The Emperor's fleets burn the coast. Dragoons are being hunted for their Spirits. (In development.)</p></div>
      <div class="ql-quest locked"><h4>ACT IV — The Moon That Never Sets</h4><p class="ql-story">What called the Star down is still up there. It knows your name now. (In development.)</p></div>`;
    wrap.innerHTML = html;
  }

  // ============================================================
  //  UI helpers
  // ============================================================
  window.UI = {
    refreshHUD() {
      const p = RPG.player; if (!p) return;
      const glyph = { knight:'⚔', rogue:'🗡', sorceress:'✦' }[p.cls];
      if (ui('portrait-face').textContent !== glyph) ui('portrait-face').textContent = glyph;
      ui('hud-name').textContent = `${p.name}`;
      ui('hp-fill').style.width = Math.max(0, p.hp/p.maxHp*100) + '%';
      ui('hp-text').textContent = `${Math.ceil(p.hp)} / ${p.maxHp}`;
      ui('mp-fill').style.width = Math.max(0, p.mp/p.maxMp*100) + '%';
      ui('mp-text').textContent = `${Math.floor(p.mp)} / ${p.maxMp}`;
      ui('xp-fill').style.width = (p.xp/p.xpNext*100) + '%';
      ui('level-text').textContent = 'Lv ' + p.level;
      ui('sp-fill').style.width = (p.dragoonForm ? 100 : p.spirit) + '%';
      ui('gold-amt').textContent = p.gold;
      buildHotbar();
    },
    floaterAt(pos, text, cls) {
      const f = document.createElement('div');
      f.className = 'floater ' + (cls||'');
      f.textContent = text;
      f.style.left = (pos.x + (Math.random()*40-20)) + 'px';
      f.style.top = (pos.y + (Math.random()*20-10)) + 'px';
      f.style.color = cls === 'crit' ? '#ffdd33' : cls === 'perfect' ? '#7ec8ff' : '#ff6655';
      ui('floaters').appendChild(f);
      setTimeout(()=> f.remove(), 1200);
    },
    refreshInv() { renderInventory(); renderEquipment(); this.refreshHUD(); },
    gameVictory() { // Herald down
      ui('results-title').textContent = 'HERALD DESTROYED';
      ui('results-title').classList.remove('defeat');
      ui('results-body').innerHTML =
        `<div>The Herald folds like burnt paper. Far below, stone grinds on stone.</div>
         <div style="color:var(--lod-ice);font-size:14px;margin-top:8px">The violet portal in the southwest now leads down — to the Sunken Grotto.</div>`;
      ui('results-screen').classList.remove('hidden');
      AudioSys.play('victory');
      ui('btn-results-ok').onclick = () => { ui('results-screen').classList.add('hidden'); toWorld(); };
    },
    grottoVictory() { // Tyrant down
      ui('results-title').textContent = '💎 TYRANT SLAIN 💎';
      ui('results-title').classList.remove('defeat');
      ui('results-body').innerHTML =
        `<div>The Tyrant collapses into its own lair, and the lair collapses with it.<br>In its gullet: a shard of burning star-metal.</div>
         <div style="color:var(--lod-ice);font-size:14px;margin-top:8px">One piece remains — the Meteor Shard, back in the Whisperwood where you woke.</div>`;
      ui('results-screen').classList.remove('hidden');
      AudioSys.play('victory');
      ui('btn-results-ok').onclick = () => { ui('results-screen').classList.add('hidden'); toWorld(); };
    },
    actComplete() { // Melbu down — ACT I COMPLETE
      ui('results-title').textContent = '🌟 ACT I COMPLETE 🌟';
      ui('results-title').classList.remove('defeat');
      ui('results-body').innerHTML =
        `<div style="font-size:18px;letter-spacing:3px;color:var(--gold-hi)">THE FALLEN STAR</div>
         <div style="margin:10px 0">Melbu Frahma's avatar shatters into burning rain. The crater cools. The forest breathes.</div>
         <div style="color:var(--gold-hi)">Level ${RPG.player.level} ${RPG.player.name} · ${RPG.player.kills} kills · ${RPG.player.gold} gold</div>
         <div style="color:var(--dim);font-size:13px;margin-top:10px">ACT II — <i>The Wingly Empire</i> — is in development.<br>The world stays open: elites, loot and the trial crystals remain.</div>`;
      ui('results-screen').classList.remove('hidden');
      AudioSys.play('victory');
      ui('btn-results-ok').onclick = () => { ui('results-screen').classList.add('hidden'); toWorld(); };
    },
  };

  // ============================================================
  //  HOTBAR / PANELS
  // ============================================================
  function buildHotbar() {
    const hb = ui('hotbar'); hb.innerHTML = '';
    const p = RPG.player; if (!p) return;
    const slots = [];
    slots.push({ icon:'⚔', key:'SPC', label:'Attack' });
    const actives = Object.entries(p.skills).filter(([,r])=>r>0)
      .map(([id])=>RPG.getSkill(id)).filter(s=>s.type!=='passive').slice(0,4);
    actives.forEach((s,i)=> slots.push({ icon:s.icon, key:String(i+1), label:`${s.name} (${s.mp}MP)`, skill:s }));
    slots.push({ icon:'🧪', key:'Q', label:`HP Potion ×${p.potions.hp}`, potion:'hp' });
    slots.push({ icon:'🔷', key:'R', label:`MP Potion ×${p.potions.mp}`, potion:'mp' });
    for (const s of slots.slice(0,7)) {
      const d = document.createElement('div');
      d.className = 'hotbar-slot';
      d.title = s.label;
      d.innerHTML = `<span class="key">${s.key}</span><span class="icon">${s.icon}</span>`;
      if (s.skill && p.mp < s.skill.mp) d.classList.add('locked');
      d.onclick = () => hotbarUse(s);
      hb.appendChild(d);
    }
  }
  function hotbarUse(s) {
    if (s.potion) {
      const p = RPG.player;
      if (p.potions[s.potion] <= 0) { toast('None left!'); return; }
      p.potions[s.potion]--; AudioSys.play('potion');
      if (s.potion==='hp') { p.hp = Math.min(p.maxHp, p.hp + Math.round(p.maxHp*.4)); }
      else { p.mp = Math.min(p.maxMp, p.mp + Math.round(p.maxMp*.4)); }
      UI.refreshHUD();
    }
  }

  function renderCharSheet() {
    const p = RPG.player; if (!p) return;
    for (const a of ['str','dex','vit','ene']) ui('attr-'+a).textContent = Math.floor(p.attr[a]);
    ui('attr-points').textContent = p.attrPoints > 0 ? `· ${p.attrPoints} points to spend` : '';
    document.querySelectorAll('.attr-plus').forEach(b => {
      b.disabled = p.attrPoints <= 0;
      b.onclick = () => {
        if (p.attrPoints <= 0) return;
        p.attrPoints--; p.attr[b.dataset.attr]++;
        RPG.recalc(); AudioSys.play('click');
        renderCharSheet(); UI.refreshHUD();
      };
    });
    const d = [
      ['Attack Power', p.attack], ['Defense', p.defense],
      ['Max HP', p.maxHp], ['Max MP', p.maxMp],
      ['Crit Chance', (p.critChance*100).toFixed(1)+'%'], ['Crit Damage', (p.critMult*100).toFixed(0)+'%'],
      ['Dodge', (p.dodge*100).toFixed(1)+'%'], ['Move Speed', (p.speed*100).toFixed(0)+'%'],
      ['Spell Power', (p.spellPower*100).toFixed(0)+'%'],
      ['Magic Find', (p.magicFind*100).toFixed(0)+'%'], ['Gold Find', (p.goldFind*100).toFixed(0)+'%'],
      ['Life Leech', (p.lifeLeech*100).toFixed(0)+'%'],
    ];
    ui('derived-list').innerHTML = d.map(([k,v]) => `<div><span>${k}</span><span>${v}</span></div>`).join('');
  }

  function renderSkillTree() {
    const p = RPG.player; if (!p) return;
    ui('skill-points').textContent = `· ${p.skillPoints} skill point${p.skillPoints===1?'':'s'}`;
    const wrap = ui('tree-branches'); wrap.innerHTML = '';
    const tip = ui('skill-tooltip');
    for (const [bk, branch] of Object.entries(RPG.CLASSES[p.cls].branches)) {
      const col = document.createElement('div'); col.className = 'tree-branch';
      col.innerHTML = `<h3>${branch.icon} ${branch.name}</h3>`;
      for (const s of branch.skills) {
        const rank = RPG.skillRank(s.id);
        const met = p.level >= (s.req||0) || rank > 0;
        const node = document.createElement('div');
        node.className = 'skill-node ' + (rank > 0 ? 'learned' : (met && p.skillPoints > 0 && rank < s.max ? 'available' : 'locked'));
        node.innerHTML = `${s.icon}<span class="rank">${rank}/${s.max}</span>`;
        node.onmouseenter = e => {
          tip.innerHTML = `<h4>${s.icon} ${s.name}</h4>
            <div class="tt-cost">${s.mp>0? s.mp+' MP · ':''}${s.type.toUpperCase()}${s.req? ` · requires level ${s.req}`:''}${s.dragoonOnly?' · <span style="color:#cc88ff">DRAGOON FORM</span>':''}</div>
            <div>${s.desc}</div>
            <div class="tt-cost" style="margin-top:6px">${rank>0? `Rank ${rank}/${s.max}`:'Not learned'}${rank<s.max && met && p.skillPoints>0 ? ' — click to learn' : ''}</div>`;
          tip.classList.remove('hidden');
          tip.style.left = Math.min(innerWidth-270, e.clientX+16) + 'px';
          tip.style.top = (e.clientY+10) + 'px';
        };
        node.onmousemove = e => { tip.style.left = Math.min(innerWidth-270, e.clientX+16)+'px'; tip.style.top = (e.clientY+10)+'px'; };
        node.onmouseleave = () => tip.classList.add('hidden');
        node.onclick = () => {
          if (rank >= s.max || !met || p.skillPoints <= 0) return;
          p.skillPoints--; p.skills[s.id] = rank + 1;
          RPG.recalc(); AudioSys.play('loot');
          renderSkillTree(); UI.refreshHUD();
          if (p.hp === undefined) { p.hp = p.maxHp; p.mp = p.maxMp; }
        };
        col.appendChild(node);
      }
      wrap.appendChild(col);
    }
  }

  const AFFIX_LABEL = { dmgPct:'% damage', dmgFlat:'damage', defFlat:'defense', defPct:'% defense',
    hpFlat:'HP', hpPct:'% HP', mpFlat:'MP', mpPct:'% MP', critPct:'% crit', dodgePct:'% dodge',
    spdPct:'% speed', strFlat:'STR', dexFlat:'DEX', vitFlat:'VIT', eneFlat:'ENE', allAttr:'all attributes',
    fireDmg:'fire dmg', iceDmg:'ice dmg', ltnDmg:'lightning dmg', lifeLeech:'% life leech',
    goldFind:'% gold find', magicFind:'% magic find' };
  function affixText(a) {
    const pct = typeof a.v === 'number' && a.v < 1 && a.v > -1 && !String(a.v).includes('e');
    const val = pct ? Math.round(a.v*100) : a.v;
    return `+${val}${AFFIX_LABEL[a.stat]||a.stat}`;
  }
  function compareHtml(item) {
    const p = RPG.player;
    const slot = item.slot === 'ring' ? (p.equip.ring1 ? 'ring1' : 'ring1') : item.slot;
    const eq = p.equip[slot] || (item.slot === 'ring' ? p.equip.ring2 : null);
    if (!eq || eq === item) return '';
    let html = '<div class="tt-cmp"><div class="tt-cmp-title">EQUIPPED</div>';
    html += `<div class="rarity-${eq.rarity}">${eq.icon} ${eq.name}</div>`;
    if (item.dmg || eq.dmg) {
      const mine = item.dmg ? (item.dmg[0]+item.dmg[1])/2 : 0;
      const theirs = eq.dmg ? (eq.dmg[0]+eq.dmg[1])/2 : 0;
      const d = Math.round((mine-theirs)*10)/10;
      html += `<div>Damage: ${mine}${theirs?` <span class="${d>=0?'tt-better':'tt-worse'}">(${d>=0?'+':''}${d})</span>`:''}</div>`;
    }
    if (item.def || eq.def) {
      const d = (item.def||0)-(eq.def||0);
      html += `<div>Defense: ${item.def||0} <span class="${d>=0?'tt-better':'tt-worse'}">(${d>=0?'+':''}${d})</span></div>`;
    }
    const mineAff = (item.affixes||[]).length, theirAff = (eq.affixes||[]).length;
    if (mineAff !== theirAff) html += `<div class="${mineAff>theirAff?'tt-better':'tt-worse'}">${mineAff-theirAff>0?'+':''}${mineAff-theirAff} affixes</div>`;
    return html + '</div>';
  }
  function itemTooltip(item, e, fromEquip=false) {
    const tip = ui('item-tooltip');
    const base = item.dmg ? `<div>Damage: ${item.dmg[0]}–${item.dmg[1]}</div>` : item.def ? `<div>Defense: ${item.def}</div>` : '';
    const cmp = fromEquip ? '' : compareHtml(item);
    tip.innerHTML = `<h4 class="rarity-${item.rarity}">${item.icon} ${item.name}</h4>
      <div style="color:var(--dim);font-size:11px">${item.rarity.toUpperCase()} ${item.slot.toUpperCase()} · ilvl ${item.level}</div>
      ${base}${item.affixes.map(a=>`<div class="tt-affix">${affixText(a)}</div>`).join('')}
      ${cmp}
      <div class="tt-hint">${RPG.player.equip[item.slot]===item || RPG.player.equip.ring1===item || RPG.player.equip.ring2===item ? 'Click to unequip' : 'Click to equip'}${item.slot==='weapon'?' · Shift+Click → Serah':''}</div>`;
    tip.classList.remove('hidden');
    tip.style.left = Math.min(innerWidth-290, e.clientX+14) + 'px';
    tip.style.top = Math.max(8, e.clientY-10) + 'px';
  }
  function renderEquipment() {
    const p = RPG.player; if (!p) return;
    const slots = ['weapon','armor','helm','boots','amulet','ring1','ring2','charm'];
    const labels = { weapon:'Weapon', armor:'Armor', helm:'Helm', boots:'Boots', amulet:'Amulet', ring1:'Ring', ring2:'Ring', charm:'Charm' };
    const wrap = ui('equip-slots'); wrap.innerHTML = '';
    for (const s of slots.concat(['serahWeapon'])) {
      const d = document.createElement('div'); d.className = 'equip-slot';
      const it = s === 'serahWeapon' ? p.serah.weapon : p.equip[s];
      d.innerHTML = `${s==='serahWeapon'?'🏹 Serah':labels[s]}${it? `<span class="eq-name rarity-${it.rarity}">${it.icon} ${it.name}</span>`:'<span class="eq-name" style="color:#333d55">—</span>'}`;
      if (it) {
        d.style.borderStyle = 'solid';
        d.onmouseenter = e => itemTooltip(it, e, true);
        d.onmousemove = e => itemTooltip(it, e, true);
        d.onmouseleave = () => ui('item-tooltip').classList.add('hidden');
        d.onclick = () => {
          if (p.inventory.length >= 24) { toast('Backpack full!'); return; }
          p.inventory.push(it);
          if (s === 'serahWeapon') p.serah.weapon = null; else p.equip[s] = null;
          RPG.recalc(); AudioSys.play('click'); UI.refreshInv(); renderCharSheet();
          if (World.refreshPlayerGear) World.refreshPlayerGear();
        };
      }
      wrap.appendChild(d);
    }
  }
  function renderInventory() {
    const p = RPG.player; if (!p) return;
    const wrap = ui('inv-grid'); wrap.innerHTML = '';
    ui('inv-count').textContent = `· ${p.inventory.length}/24`;
    p.inventory.forEach((it, idx) => {
      const d = document.createElement('div'); d.className = 'inv-cell';
      d.innerHTML = `<span class="rarity-${it.rarity}">${it.icon} ${it.name}</span>`;
      d.onmouseenter = e => itemTooltip(it, e);
      d.onmousemove = e => itemTooltip(it, e);
      d.onmouseleave = () => ui('item-tooltip').classList.add('hidden');
      d.onclick = (ev) => {
        if (ev.shiftKey && it.slot === 'weapon') {
          const oldS = p.serah.weapon;
          p.serah.weapon = it; p.inventory.splice(idx, 1);
          if (oldS) p.inventory.push(oldS);
          toast(`Serah equips <b class="rarity-${it.rarity}">${it.name}</b>`);
        } else {
          const slot = it.slot === 'ring' ? (p.equip.ring1 ? (p.equip.ring2 ? 'ring1' : 'ring2') : 'ring1') : it.slot;
          const old = p.equip[slot];
          p.equip[slot] = it; p.inventory.splice(idx, 1);
          if (old) p.inventory.push(old);
        }
        RPG.recalc(); AudioSys.play('loot');
        ui('item-tooltip').classList.add('hidden');
        UI.refreshInv(); renderCharSheet();
        if (World.refreshPlayerGear) World.refreshPlayerGear();
      };
      wrap.appendChild(d);
    });
    for (const [kind, icon, label] of [['hp','🧪','Healing'],['mp','🔷','Mana']]) {
      if (p.potions[kind] > 0) {
        const d = document.createElement('div'); d.className = 'inv-cell';
        d.innerHTML = `<span>${icon} ${label} Potion</span><span class="inv-qty">×${p.potions[kind]}</span>`;
        d.onclick = () => hotbarUse({ potion: kind });
        wrap.appendChild(d);
      }
    }
  }

  // ---------- NPC DIALOGUE ----------
  const MAERA_LINES = {
    1: 'So the Spirit woke in you after all. The fiends are only the beginning — the shrine whispers a name I hoped never to hear again.',
    2: 'The old trial still works, I see. The crystals remember their verse even if the village forgot.',
    3: 'Child, do NOT face the Herald while its anchors stand. Break them, and its shield breaks with them.',
    4: 'Down in the Grotto, the relics of my order lie drowned. The Tyrant will trade blood for them. It always does.',
    5: 'The Tyrant has surfaced at last. Strike true, and mind its frenzy when it bleeds.',
    6: 'Only the Star Key can open the crater. Herald\'s ember, Tyrant\'s trophy, and a shard of the Star itself — you know where you woke, child.',
    7: 'You did what three generations of this village could not. The Hollow owes you its dawn.',
  };
  let currentNPC = null;
  function openDialogue(npc) {
    currentNPC = npc;
    ui('dlg-name').textContent = npc.name;
    ui('dlg-role').textContent = npc.role.toUpperCase();
    let line;
    if (npc.id === 'maera') line = MAERA_LINES[Math.min(7, getQuestStage())] || MAERA_LINES[7];
    else line = npc.lines[Math.floor(Math.random()*npc.lines.length)];
    ui('dlg-text').textContent = '“' + line + '”';
    ui('dlg-shop').classList.toggle('hidden', !npc.shop);
    toggleModal('dialogue', true);
    AudioSys.play('click');
  }
  ui('dlg-leave').onclick = () => toggleModal('dialogue', false);
  ui('dlg-shop').onclick = () => {
    toggleModal('dialogue', false);
    openShop(currentNPC);
  };

  // ---------- SHOPS ----------
  const SHOP_DEFS = {
    general: { title: "Bertram's General Goods", stock: () => [
      potionRow('hp', 30), potionRow('mp', 35),
      gearRow('magic'), gearRow('magic'),
    ]},
    smith: { title: "Yara's Smithy", stock: () => [
      gearRow('magic', 'weapon'), gearRow('magic', 'armor'), gearRow('magic', 'helm'),
      ...(RPG.player.level >= 5 ? [gearRow('rare')] : []),
    ]},
    alch: { title: "Fenn's Alchemy", stock: () => [
      potionRow('hp', 25), potionRow('mp', 30), spiritRow(60),
      gearRow('magic', 'amulet'), gearRow('magic', 'ring'),
    ]},
  };
  function gearPrice(it) {
    const mult = { normal:1, magic:2.2, rare:5, unique:12 }[it.rarity] || 1;
    return Math.round(it.level * 8 * mult + (it.affixes?.length||0) * 15 * mult);
  }
  function potionRow(kind, price) {
    return { icon: kind==='hp'?'🧪':'🔷', name: kind==='hp'?'Healing Potion':'Mana Potion',
      desc:'Restores 40% ' + (kind==='hp'?'HP':'MP'), price,
      buy: () => { RPG.player.potions[kind]++; } };
  }
  function spiritRow(price) {
    return { icon:'💜', name:'Spirit Draught', desc:'+25% Dragoon Spirit instantly', price,
      buy: () => { RPG.player.spirit = Math.min(100, RPG.player.spirit + 25); } };
  }
  function gearRow(rarity, slot=null) {
    const it = RPG.genItem(RPG.player.level + 1, rarity, slot);
    return { icon: it.icon, name: it.name, rarity: it.rarity, item: it,
      desc: (it.dmg ? `Damage ${it.dmg[0]}–${it.dmg[1]}` : it.def ? `Defense ${it.def}` : it.slot) +
            (it.affixes.length ? ` · ${it.affixes.length} affix${it.affixes.length>1?'es':''}` : ''),
      price: gearPrice(it),
      buy: () => { if (RPG.player.inventory.length < 24) RPG.player.inventory.push(it); else toast('Backpack full!'); }
  };
  }
  let shopMode = 'buy', shopNPC = null;
  function openShop(npc) {
    shopNPC = npc; shopMode = 'buy';
    ui('shop-title').firstChild.textContent = SHOP_DEFS[npc.shop].title + ' ';
    renderShop();
    toggleModal('shop', true);
    AudioSys.play('gold');
  }
  ui('tab-buy').onclick = () => { shopMode = 'buy'; renderShop(); };
  ui('tab-sell').onclick = () => { shopMode = 'sell'; renderShop(); };
  function renderShop() {
    const p = RPG.player;
    ui('shop-gold').textContent = `◈ ${p.gold} gold`;
    ui('tab-buy').classList.toggle('active', shopMode==='buy');
    ui('tab-sell').classList.toggle('active', shopMode==='sell');
    const list = ui('shop-list'); list.innerHTML = '';
    if (shopMode === 'buy') {
      for (const row of SHOP_DEFS[shopNPC.shop].stock()) {
        const d = document.createElement('div'); d.className = 'shop-row';
        const cant = p.gold < row.price;
        d.innerHTML = `<span class="sr-icon">${row.icon}</span>
          <span class="sr-name ${row.rarity?('rarity-'+row.rarity):''}">${row.name}<span class="sr-desc">${row.desc}</span></span>
          <span class="sr-price ${cant?'cant':''}">◈ ${row.price}</span>`;
        const b = document.createElement('button');
        b.className = 'btn-secondary'; b.textContent = 'BUY'; b.disabled = cant;
        b.onclick = () => { p.gold -= row.price; row.buy(); AudioSys.play('loot'); UI.refreshHUD(); UI.refreshInv(); renderShop(); };
        d.appendChild(b);
        list.appendChild(d);
      }
    } else {
      if (!p.inventory.length) list.innerHTML = '<div style="color:var(--dim);padding:12px">Nothing to sell.</div>';
      p.inventory.forEach((it, idx) => {
        const price = Math.max(1, Math.round(gearPrice(it) * .4));
        const d = document.createElement('div'); d.className = 'shop-row';
        d.innerHTML = `<span class="sr-icon">${it.icon}</span>
          <span class="sr-name rarity-${it.rarity}">${it.name}<span class="sr-desc">${it.rarity} ${it.slot}</span></span>
          <span class="sr-price">◈ ${price}</span>`;
        const b = document.createElement('button');
        b.className = 'btn-secondary'; b.textContent = 'SELL';
        b.onclick = () => { p.inventory.splice(idx,1); p.gold += price; AudioSys.play('gold'); UI.refreshInv(); renderShop(); };
        d.appendChild(b);
        list.appendChild(d);
      });
    }
  }

  // ---------- MODALS ----------
  function toggleModal(id, show) {
    const m = ui(id);
    const showing = !m.classList.contains('hidden');
    const want = show !== undefined ? show : !showing;
    if (want) {
      if (id === 'char-sheet') renderCharSheet();
      if (id === 'skill-tree') renderSkillTree();
      if (id === 'inventory') { renderEquipment(); renderInventory(); }
      if (id === 'quest-log') renderQuestLog();
      m.classList.remove('hidden');
    } else m.classList.add('hidden');
  }
  document.querySelectorAll('.modal-close').forEach(x =>
    x.onclick = () => toggleModal(x.dataset.close, false));

  // ---------- STATE MACHINE ----------
  function toWorld() { state = 'world'; }
  function onDefeat() {
    const p = RPG.player;
    p.hp = Math.round(p.maxHp*.5); p.mp = Math.round(p.maxMp*.5);
    const lost = Math.round(p.gold*.1); p.gold -= lost;
    ui('results-title').textContent = 'DEFEAT'; ui('results-title').classList.add('defeat');
    ui('results-body').innerHTML = `<div>You awaken at the forest's edge, wounded.<br>Lost ${lost} gold.</div>`;
    ui('results-screen').classList.remove('hidden');
    ui('btn-results-ok').onclick = () => {
      ui('results-screen').classList.add('hidden');
      World.player3d.group.position.set(24, 0, 24);
      UI.refreshHUD(); toWorld();
    };
  }
  const ZONE_META = {
    forest: { act: 'ACT I', name: 'WHISPERWOOD' },
    town: { act: 'SAFE HAVEN', name: 'MIREWOOD HOLLOW' },
    grotto: { act: 'BENEATH THE SHRINE', name: 'THE SUNKEN GROTTO' },
    crater: { act: 'THE END OF ACT I', name: 'THE STAR CRATER' },
  };
  function showZoneTitle(zone) {
    const m = ZONE_META[zone]; if (!m) return;
    ui('zone-title-act').textContent = m.act;
    ui('zone-title-name').textContent = m.name;
    const z = ui('zone-title');
    z.classList.remove('hidden', 'show'); void z.offsetWidth;
    z.classList.add('show');
  }
  function fadePulse() {
    const f = ui('fade-overlay');
    f.classList.add('on');
    setTimeout(()=> f.classList.remove('on'), 420);
  }
  function onZoneChanged(zone) {
    if (zone === 'grotto') Fset('enteredGrotto');
    objSig = ''; // force object resync in new zone
    refreshQuest(); resyncObjects(true);
    showZoneTitle(zone); fadePulse();
  }

  // ---------- BOOT ----------
  let chosenClass = null;
  document.querySelectorAll('.class-card').forEach(c => {
    c.onclick = () => {
      document.querySelectorAll('.class-card').forEach(x => x.classList.remove('selected'));
      c.classList.add('selected');
      chosenClass = c.dataset.class;
      ui('btn-start').disabled = false;
      ui('btn-start').textContent = 'BEGIN THE LEGEND';
      AudioSys.init(); AudioSys.play('click');
    };
  });
  ui('btn-start').onclick = () => {
    if (!chosenClass) return;
    AudioSys.init(); AudioSys.resume(); AudioSys.play('click');
    ui('title-screen').classList.add('hidden');
    ui('intro-screen').classList.remove('hidden');
  };
  ui('btn-intro-begin').onclick = () => {
    AudioSys.init(); AudioSys.resume(); AudioSys.startMusic(); AudioSys.play('click');
    RPG.newPlayer(chosenClass);
    RPG.recalc();
    World.init(ui('game-canvas'));
    World.setPlayerClass(chosenClass);
    World.onEncounter = (enemy) => {
      if (state !== 'world') return;
      state = 'battle';
      Battle.start(enemy);
    };
    ui('intro-screen').classList.add('hidden');
    ui('hud').classList.remove('hidden');
    UI.refreshHUD(); refreshQuest(); resyncObjects(true);
    if (World.refreshPlayerGear) World.refreshPlayerGear();
    showZoneTitle('forest');
    toast(`<b>Act I — The Fallen Star</b>`);
    setTimeout(()=> toast('<i>Serah: "Fiends first, questions after. Move!"</i>'), 2500);
    setTimeout(()=> toast('Press <b>J</b> for your quest log'), 6000);
    state = 'world';
  };

  // pause
  ui('btn-resume').onclick = () => { ui('pause-menu').classList.add('hidden'); state = 'world'; };
  ui('btn-save').onclick = () => { toast(RPG.save() ? 'Game saved ✓' : 'Save failed'); };
  ui('btn-quit').onclick = () => location.reload();

  Battle.bindMenu();

  // keyboard
  addEventListener('keydown', e => {
    if (state === 'battle') {
      if (e.code === 'Space') { e.preventDefault(); Battle.pressAddition(); }
      return;
    }
    if (state !== 'world') return;
    if (e.code === 'KeyC') toggleModal('char-sheet');
    if (e.code === 'KeyK') toggleModal('skill-tree');
    if (e.code === 'KeyI') toggleModal('inventory');
    if (e.code === 'KeyJ') toggleModal('quest-log');
    if (e.code === 'KeyQ') hotbarUse({ potion:'hp' });
    if (e.code === 'KeyR') hotbarUse({ potion:'mp' });
    if (e.code === 'KeyE') {
      const npc = World.nearNPC && World.nearNPC();
      if (npc) openDialogue(npc);
      else if (!World.tryInteract()) World.tryPortal();
    }
    if (e.code === 'Escape') {
      const anyOpen = ['char-sheet','skill-tree','inventory','quest-log','dialogue','shop'].some(id => !ui(id).classList.contains('hidden'));
      if (anyOpen) ['char-sheet','skill-tree','inventory','quest-log','dialogue','shop'].forEach(id => toggleModal(id, false));
      else {
        const p = ui('pause-menu');
        const show = p.classList.contains('hidden');
        p.classList.toggle('hidden');
        state = show ? 'paused' : 'world';
      }
    }
  });

  // ---------- MAIN LOOP ----------
  let minimapT = 0, questT = 0;
  function loop(now) {
    requestAnimationFrame(loop);
    const rawDt = (now - lastT)/1000;
    const dt = Math.min(.05, rawDt); lastT = now;
    if (state === 'world') {
      World.update(dt);
      minimapT += rawDt;
      if (minimapT > .12) { minimapT = 0; World.drawMinimap(); }
      questT += rawDt;
      if (questT > .5) { questT = 0; refreshQuest(); resyncObjects(); updateInteractHint(); }
    } else if (state === 'battle') {
      Battle.update(dt);
    }
  }
  function updateInteractHint() {
    const el = ui('interact-hint');
    const npc = World.nearNPC ? World.nearNPC() : null;
    const it = World.nearInteract ? World.nearInteract() : null;
    const pt = World.nearPortal ? World.nearPortal() : null;
    if (npc) {
      el.innerHTML = `<b>E</b> — Talk to ${npc.name} <small style="color:var(--dim)">${npc.role}</small>`;
      el.classList.remove('hidden');
    } else if (it) {
      el.innerHTML = `<b>E</b> — ${it.label}`;
      el.classList.remove('hidden');
    } else if (pt) {
      const locked = World.portalLocked(pt);
      el.innerHTML = locked ? '🔒 <b>Sealed</b> — a quest bars the way'
        : `<b>E</b> — Enter ${pt.label}`;
      el.classList.remove('hidden');
    } else el.classList.add('hidden');
  }
  requestAnimationFrame(loop);

  return { toWorld, onDefeat, onZoneChanged, getQuestStage,
    get state(){ return state; } };
})();
