/* main.js — bootstrap, state machine, all UI wiring */
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

  // ---------- UI helpers (global for other modules) ----------
  window.UI = {
    refreshHUD() {
      const p = RPG.player; if (!p) return;
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
    gameVictory() {
      ui('results-title').textContent = '🌟 LEGEND FULFILLED 🌟';
      ui('results-title').classList.remove('defeat');
      ui('results-body').innerHTML =
        `<div>Melbu's Shadow is destroyed. The Fallen Star dims, and dawn returns to the forest.</div>
         <div style="margin-top:10px;color:var(--gold-hi)">Level ${RPG.player.level} ${RPG.player.name} · ${RPG.player.kills} kills · ${RPG.player.gold} gold</div>
         <div style="color:var(--dim);font-size:13px;margin-top:8px">The world stays open — keep hunting loot as long as you like.</div>`;
      ui('results-screen').classList.remove('hidden');
      AudioSys.play('victory');
      ui('btn-results-ok').onclick = () => { ui('results-screen').classList.add('hidden'); };
    },
  };

  // ---------- HOTBAR ----------
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

  // ---------- CHARACTER SHEET ----------
  function renderCharSheet() {
    const p = RPG.player; if (!p) return;
    for (const a of ['str','dex','vit','ene']) {
      ui('attr-'+a).textContent = Math.floor(p.attr[a]);
    }
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

  // ---------- SKILL TREE ----------
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

  // ---------- INVENTORY / EQUIPMENT ----------
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
  function itemTooltip(item, e) {
    const tip = ui('item-tooltip');
    const base = item.dmg ? `<div>Damage: ${item.dmg[0]}–${item.dmg[1]}</div>` : item.def ? `<div>Defense: ${item.def}</div>` : '';
    tip.innerHTML = `<h4 class="rarity-${item.rarity}">${item.icon} ${item.name}</h4>
      <div style="color:var(--dim);font-size:11px">${item.rarity.toUpperCase()} ${item.slot.toUpperCase()} · ilvl ${item.level}</div>
      ${base}${item.affixes.map(a=>`<div class="tt-affix">${affixText(a)}</div>`).join('')}
      <div class="tt-hint">${RPG.player.equip[item.slot]===item || RPG.player.equip.ring1===item || RPG.player.equip.ring2===item ? 'Click to unequip' : 'Click to equip'}</div>`;
    tip.classList.remove('hidden');
    tip.style.left = Math.min(innerWidth-290, e.clientX+14) + 'px';
    tip.style.top = Math.max(8, e.clientY-10) + 'px';
  }
  function renderEquipment() {
    const p = RPG.player; if (!p) return;
    const slots = ['weapon','armor','helm','boots','amulet','ring1','ring2','charm'];
    const labels = { weapon:'Weapon', armor:'Armor', helm:'Helm', boots:'Boots', amulet:'Amulet', ring1:'Ring', ring2:'Ring', charm:'Charm' };
    const wrap = ui('equip-slots'); wrap.innerHTML = '';
    for (const s of slots) {
      const d = document.createElement('div'); d.className = 'equip-slot';
      const it = p.equip[s];
      d.innerHTML = `${labels[s]}${it? `<span class="eq-name rarity-${it.rarity}">${it.icon} ${it.name}</span>`:'<span class="eq-name" style="color:#333d55">—</span>'}`;
      if (it) {
        d.style.borderStyle = 'solid';
        d.onmouseenter = e => itemTooltip(it, e);
        d.onmousemove = e => itemTooltip(it, e);
        d.onmouseleave = () => ui('item-tooltip').classList.add('hidden');
        d.onclick = () => {
          if (p.inventory.length >= 24) { toast('Backpack full!'); return; }
          p.inventory.push(it); p.equip[s] = null;
          RPG.recalc(); AudioSys.play('click'); UI.refreshInv(); renderCharSheet();
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
      d.onclick = () => {
        const slot = it.slot === 'ring' ? (p.equip.ring1 ? (p.equip.ring2 ? 'ring1' : 'ring2') : 'ring1') : it.slot;
        const old = p.equip[slot];
        p.equip[slot] = it; p.inventory.splice(idx, 1);
        if (old) p.inventory.push(old);
        RPG.recalc(); AudioSys.play('loot');
        ui('item-tooltip').classList.add('hidden');
        UI.refreshInv(); renderCharSheet();
      };
      wrap.appendChild(d);
    });
    // potion cells
    for (const [kind, icon, label] of [['hp','🧪','Healing'],['mp','🔷','Mana']]) {
      if (p.potions[kind] > 0) {
        const d = document.createElement('div'); d.className = 'inv-cell';
        d.innerHTML = `<span>${icon} ${label} Potion</span><span class="inv-qty">×${p.potions[kind]}</span>`;
        d.onclick = () => hotbarUse({ potion: kind });
        wrap.appendChild(d);
      }
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
    AudioSys.init(); AudioSys.resume(); AudioSys.startMusic();
    RPG.newPlayer(chosenClass);
    RPG.recalc();
    World.init(ui('game-canvas'));
    World.setPlayerClass(chosenClass);
    World.onEncounter = (enemy) => {
      if (state !== 'world') return;
      state = 'battle';
      Battle.start(enemy);
    };
    ui('title-screen').classList.add('hidden');
    ui('hud').classList.remove('hidden');
    UI.refreshHUD();
    toast(`Welcome, ${RPG.player.name}. Slay 8 fiends to draw out the shrine's master.`);
    state = 'world';
    // starter toasts
    setTimeout(()=> toast('Spend points anytime: <b>C</b> attributes · <b>K</b> skills'), 4000);
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
    if (e.code === 'KeyQ') hotbarUse({ potion:'hp' });
    if (e.code === 'KeyR') hotbarUse({ potion:'mp' });
    if (e.code === 'Escape') {
      const anyOpen = ['char-sheet','skill-tree','inventory'].some(id => !ui(id).classList.contains('hidden'));
      if (anyOpen) ['char-sheet','skill-tree','inventory'].forEach(id => toggleModal(id, false));
      else {
        const p = ui('pause-menu');
        const show = p.classList.contains('hidden');
        p.classList.toggle('hidden');
        state = show ? 'paused' : 'world';
      }
    }
  });

  // ---------- MAIN LOOP ----------
  let minimapT = 0;
  function loop(now) {
    requestAnimationFrame(loop);
    const dt = Math.min(.05, (now - lastT)/1000); lastT = now;
    if (state === 'world') {
      World.update(dt);
      minimapT += dt;
      if (minimapT > .12) { minimapT = 0; World.drawMinimap(); }
    } else if (state === 'battle') {
      Battle.update(dt);
    }
  }
  requestAnimationFrame(loop);

  return { toWorld, onDefeat, get state(){ return state; } };
})();
