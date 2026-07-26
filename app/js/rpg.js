/* rpg.js — Diablo II-style systems: classes, attributes, skills, items, affixes, inventory */
const RPG = (() => {

  // ---------- CLASSES ----------
  const CLASSES = {
    knight: {
      name: 'Dragoon Knight', color: 0xff8833, portrait: 'knight',
      base: { str: 16, dex: 11, vit: 14, ene: 8 },
      growth: { str: 3, dex: 1.5, vit: 2.5, ene: 1 },
      weapon: 'Sword', additionCount: 4,
      branches: {
        blade:  { name: 'Blade of the Dragoon', icon: '⚔', skills: [
          { id:'double_slash', name:'Double Slash', icon:'⚔', max:5, mp:6,  req:0,  desc:'Slash twice. 120% + 15%/rank weapon damage.', type:'phys', mult:1.2, per:.15 },
          { id:'burning_rush', name:'Burning Rush', icon:'🔥', max:5, mp:12, req:5, desc:'Flaming charge. 180% + 20%/rank fire damage.', type:'fire', mult:1.8, per:.2 },
          { id:'moon_strike', name:'Moon Strike', icon:'🌙', max:5, mp:20, req:12, desc:'Arc of lunar steel. 260% + 25%/rank, always crits.', type:'phys', mult:2.6, per:.25, alwaysCrit:true },
        ]},
        dragon: { name: 'Dragon Spirit', icon: '🐉', skills: [
          { id:'dragon_roar', name:'Dragon Roar', icon:'🐉', max:5, mp:8,  req:0,  desc:'Terrify enemy: -20% + 5%/rank enemy damage for 3 turns.', type:'debuff', mult:0, per:.05 },
          { id:'wings_of_fire', name:'Wings of Fire', icon:'🦅', max:5, mp:16, req:6, desc:'Dragoon dive attack. 220% + 30%/rank. +50% in Dragoon form.', type:'fire', mult:2.2, per:.3, dragoonBoost:1.5 },
          { id:'red_eye_burst', name:'Red-Eye Burst', icon:'👁', max:3, mp:30, req:14, desc:'The Red-Eye Dragon awakens. 400% + 50%/rank. Dragoon form only.', type:'fire', mult:4.0, per:.5, dragoonOnly:true },
        ]},
        guard:  { name: 'Indomitable', icon: '🛡', skills: [
          { id:'iron_skin', name:'Iron Skin', icon:'🛡', max:5, mp:0, req:0,  desc:'Passive: +8% defense per rank.', type:'passive', stat:'defPct', per:.08 },
          { id:'second_wind', name:'Second Wind', icon:'💚', max:5, mp:14, req:7, desc:'Heal 25% + 6%/rank of max HP.', type:'heal', mult:.25, per:.06 },
          { id:'undying_will', name:'Undying Will', icon:'♾', max:1, mp:0, req:15, desc:'Passive: survive a fatal blow at 1 HP (once per battle).', type:'passive', stat:'cheatDeath', per:1 },
        ]},
      }
    },
    rogue: {
      name: 'Shadow Rogue', color: 0xaa66ff, portrait: 'rogue',
      base: { str: 11, dex: 17, vit: 11, ene: 10 },
      growth: { str: 1.5, dex: 3, vit: 1.8, ene: 1.5 },
      weapon: 'Daggers', additionCount: 5,
      branches: {
        shadow: { name: 'Shadow Arts', icon: '🗡', skills: [
          { id:'twin_fang', name:'Twin Fang', icon:'🗡', max:5, mp:5,  req:0,  desc:'Two dagger strikes. 110% + 15%/rank, +10% crit chance.', type:'phys', mult:1.1, per:.15, critBonus:.1 },
          { id:'venom_edge', name:'Venom Edge', icon:'☠', max:5, mp:11, req:5, desc:'Poison strike. 130% + 15%/rank + poison 3 turns.', type:'phys', mult:1.3, per:.15, dot:true },
          { id:'assassinate', name:'Assassinate', icon:'💀', max:5, mp:22, req:12, desc:'Strike a vital point. 300% + 40%/rank, +30% crit chance.', type:'phys', mult:3.0, per:.4, critBonus:.3 },
        ]},
        storm:  { name: 'Tempest Steps', icon: '⚡', skills: [
          { id:'shock_cut', name:'Shock Cut', icon:'⚡', max:5, mp:9,  req:0,  desc:'Lightning-imbued cut. 150% + 20%/rank lightning damage.', type:'lightning', mult:1.5, per:.2 },
          { id:'blur', name:'Blur', icon:'💨', max:5, mp:13, req:6, desc:'+15% dodge per rank for 3 turns.', type:'buff', stat:'dodge', per:.15, turns:3 },
          { id:'thunder_god', name:'Thunder God Dance', icon:'🌩', max:3, mp:28, req:14, desc:'Blue Dragoon spirit. 380% + 45%/rank lightning. Dragoon form only.', type:'lightning', mult:3.8, per:.45, dragoonOnly:true },
        ]},
        trick:  { name: 'Dirty Tricks', icon: '🃏', skills: [
          { id:'lucky_strike', name:'Lucky Strike', icon:'🍀', max:5, mp:0, req:0, desc:'Passive: +5% crit chance and +8% gold per rank.', type:'passive', stat:'critGold', per:.05 },
          { id:'smoke_bomb', name:'Smoke Bomb', icon:'💣', max:5, mp:10, req:7, desc:'Enemy misses 30% + 8%/rank more for 2 turns.', type:'debuff', mult:0, per:.08 },
          { id:'shadow_clone', name:'Shadow Clone', icon:'👥', max:1, mp:24, req:15, desc:'Next attack hits twice.', type:'buff', stat:'doubleHit', per:1 },
        ]},
      }
    },
    sorceress: {
      name: 'Storm Sorceress', color: 0x66ccff, portrait: 'sorceress',
      base: { str: 8, dex: 11, vit: 10, ene: 18 },
      growth: { str: 1, dex: 1.5, vit: 1.8, ene: 3.5 },
      weapon: 'Staff', additionCount: 3,
      branches: {
        fire:   { name: 'Fire', icon: '🔥', skills: [
          { id:'fire_bolt', name:'Fire Bolt', icon:'🔥', max:5, mp:7,  req:0,  desc:'Hurl flame. 160% + 25%/rank fire damage.', type:'fire', mult:1.6, per:.25 },
          { id:'immolate', name:'Immolate', icon:'☄', max:5, mp:15, req:5, desc:'Engulf enemy in flame. 200% + 25%/rank + burn.', type:'fire', mult:2.0, per:.25, dot:true },
          { id:'meteor', name:'Meteor', icon:'🌠', max:3, mp:32, req:13, desc:'Call down a burning star. 450% + 60%/rank fire damage.', type:'fire', mult:4.5, per:.6 },
        ]},
        frost:  { name: 'Frost', icon: '❄', skills: [
          { id:'ice_shard', name:'Ice Shard', icon:'❄', max:5, mp:6,  req:0,  desc:'Piercing shard. 140% + 20%/rank, slows enemy.', type:'ice', mult:1.4, per:.2, slow:true },
          { id:'frozen_armor', name:'Frozen Armor', icon:'🧊', max:5, mp:12, req:6, desc:'+20% defense per rank for 3 turns.', type:'buff', stat:'defPct', per:.2, turns:3 },
          { id:'blizzard', name:'Blizzard', icon:'🌨', max:3, mp:30, req:14, desc:'Violet Dragoon storm. 420% + 55%/rank ice. Dragoon form only.', type:'ice', mult:4.2, per:.55, dragoonOnly:true },
        ]},
        arcane: { name: 'Arcane', icon: '✦', skills: [
          { id:'mana_font', name:'Mana Font', icon:'💧', max:5, mp:0, req:0, desc:'Passive: +15% max MP and +10% spell power per rank.', type:'passive', stat:'mpPct', per:.15 },
          { id:'arcane_surge', name:'Arcane Surge', icon:'✦', max:5, mp:10, req:7, desc:'Restore 20% + 5%/rank MP and empower next spell +50%.', type:'buff', stat:'empower', per:.2 },
          { id:'starfall', name:'Starfall', icon:'⭐', max:1, mp:40, req:15, desc:'The Fallen Star answers. 600% arcane damage.', type:'arcane', mult:6.0, per:0 },
        ]},
      }
    },
  };

  // ---------- ITEM BASES ----------
  const BASES = {
    weapon: [
      { name:'Sword', icon:'🗡', dmg:[6,12], cls:'knight' }, { name:'Broadsword', icon:'⚔', dmg:[10,18], cls:'knight' },
      { name:'Dragoon Lance', icon:'🔱', dmg:[16,28], cls:'knight' },
      { name:'Dagger', icon:'🔪', dmg:[5,10], cls:'rogue' }, { name:'Kris', icon:'🗡', dmg:[9,15], cls:'rogue' },
      { name:'Shadow Fang', icon:'⚔', dmg:[14,24], cls:'rogue' },
      { name:'Staff', icon:'🪄', dmg:[4,9], cls:'sorceress' }, { name:'Orb Staff', icon:'🔮', dmg:[8,14], cls:'sorceress' },
      { name:'Star Rod', icon:'✨', dmg:[13,22], cls:'sorceress' },
    ],
    armor: [
      { name:'Cloth Garb', icon:'🥋', def:4 }, { name:'Leather Armor', icon:'🦺', def:8 },
      { name:'Chain Mail', icon:'⛓', def:14 }, { name:'Plate Armor', icon:'🛡', def:20 },
      { name:'Dragoon Mail', icon:'🐲', def:28 },
    ],
    helm: [
      { name:'Cap', icon:'🧢', def:2 }, { name:'Helm', icon:'🪖', def:5 },
      { name:'Great Helm', icon:'⛑', def:9 }, { name:'Dragoon Helm', icon:'👑', def:14 },
    ],
    boots: [
      { name:'Boots', icon:'🥾', def:2 }, { name:'Greaves', icon:'🦿', def:5 }, { name:'Winged Boots', icon:'👢', def:9 },
    ],
    amulet: [ { name:'Amulet', icon:'📿' }, { name:'Talisman', icon:'🧿' }, { name:'Dragon Stone', icon:'💎' } ],
    ring: [ { name:'Ring', icon:'💍' }, { name:'Band', icon:'⭕' }, { name:'Signet', icon:'🔘' } ],
  };
  const PREFIXES = [
    { name:'Cruel', stat:'dmgPct', v:[.1,.3], rar:1 }, { name:'Sharp', stat:'dmgFlat', v:[3,9], rar:1 },
    { name:'Sturdy', stat:'defFlat', v:[3,10], rar:1 }, { name:'Vigorous', stat:'hpFlat', v:[10,40], rar:1 },
    { name:'Brilliant', stat:'mpFlat', v:[8,30], rar:1 }, { name:'Fiery', stat:'fireDmg', v:[4,14], rar:2 },
    { name:'Frozen', stat:'iceDmg', v:[4,14], rar:2 }, { name:'Voltaic', stat:'ltnDmg', v:[4,14], rar:2 },
    { name:'Deadly', stat:'critPct', v:[.04,.12], rar:2 }, { name:'Swift', stat:'spdPct', v:[.05,.15], rar:2 },
    { name:'Dragon\'s', stat:'strFlat', v:[4,12], rar:3 }, { name:'Serpent\'s', stat:'dexFlat', v:[4,12], rar:3 },
    { name:'Sage\'s', stat:'eneFlat', v:[4,12], rar:3 }, { name:'Titan\'s', stat:'vitFlat', v:[4,12], rar:3 },
  ];
  const SUFFIXES = [
    { name:'of the Bear', stat:'hpFlat', v:[12,50], rar:1 }, { name:'of the Fox', stat:'dodgePct', v:[.03,.1], rar:1 },
    { name:'of Power', stat:'dmgPct', v:[.08,.25], rar:2 }, { name:'of the Leech', stat:'lifeLeech', v:[.03,.08], rar:2 },
    { name:'of the Whale', stat:'hpPct', v:[.1,.3], rar:3 }, { name:'of the Zodiac', stat:'allAttr', v:[2,6], rar:3 },
    { name:'of Greed', stat:'goldFind', v:[.15,.5], rar:2 }, { name:'of Fortune', stat:'magicFind', v:[.1,.35], rar:2 },
  ];
  const UNIQUES = [
    { name:'Soul of the Red-Eye', slot:'weapon', dmg:[30,45], affixes:[{stat:'dmgPct',v:.4},{stat:'fireDmg',v:20},{stat:'lifeLeech',v:.06}] },
    { name:'Azure Dragoon Spirit', slot:'amulet', affixes:[{stat:'ltnDmg',v:18},{stat:'mpFlat',v:40},{stat:'spdPct',v:.12}] },
    { name:'Melbu Frahma\'s Crown', slot:'helm', def:18, affixes:[{stat:'allAttr',v:5},{stat:'hpPct',v:.2}] },
    { name:'Emperor\'s Plate', slot:'armor', def:34, affixes:[{stat:'defPct',v:.25},{stat:'hpFlat',v:60}] },
    { name:'Wingly Tears', slot:'ring', affixes:[{stat:'magicFind',v:.4},{stat:'eneFlat',v:10},{stat:'critPct',v:.08}] },
  ];
  const RARITY = [
    { key:'normal', w:55, affixes:0 }, { key:'magic', w:28, affixes:[1,2] },
    { key:'rare', w:13, affixes:[2,3] }, { key:'unique', w:4, affixes:0 },
  ];

  const rnd = (a,b) => a + Math.random()*(b-a);
  const rndi = (a,b) => Math.floor(rnd(a,b+1));
  const pick = arr => arr[Math.floor(Math.random()*arr.length)];

  // ---------- PLAYER ----------
  let player = null;

  function newPlayer(clsKey) {
    const c = CLASSES[clsKey];
    player = {
      cls: clsKey, name: c.name, level: 1, xp: 0, xpNext: 100,
      attr: { ...c.base }, attrPoints: 0, skillPoints: 1,
      skills: {}, gold: 50, potions: { hp: 3, mp: 2 },
      equip: { weapon:null, armor:null, helm:null, boots:null, amulet:null, ring1:null, ring2:null, charm:null },
      inventory: [], spirit: 0, dragoonForm: false,
      buffs: {}, cheatDeathUsed: false, kills: 0,
      serah: { hp: 0, mp: 0, weapon: null },
      kael: { hp: 0, mp: 0, weapon: null },
      lyra: { hp: 0, mp: 0, weapon: null },
    };
    // starter weapon
    const w = genItem(1, 'normal', 'weapon', clsKey);
    player.equip.weapon = w;
    recalc(); player.hp = player.maxHp; player.mp = player.maxMp;
    player.serah.hp = serahStats().maxHp; player.serah.mp = serahStats().maxMp;
    player.kael.hp = kaelStats().maxHp; player.kael.mp = kaelStats().maxMp;
    player.lyra.hp = lyraStats().maxHp; player.lyra.mp = lyraStats().maxMp;
    return player;
  }

  // ---------- KAEL (party member — the Lancer) ----------
  // tanky spear fighter: joins after the Herald falls
  function kaelStats() {
    const lvl = player.level;
    const wpn = player.kael.weapon;
    const wDmg = wpn && wpn.dmg ? (wpn.dmg[0]+wpn.dmg[1])/2 : (8 + lvl*2.5);
    return {
      maxHp: Math.round(player.maxHp * .8),
      maxMp: Math.round(player.maxMp * .35),
      attack: Math.round(player.attack * .5 + wDmg),
      defense: Math.round(player.defense * .8),
      critChance: player.critChance * .8,
      critMult: player.critMult,
      chainMax: 4,
    };
  }

  const KAEL_SKILLS = [
    { id:'pierce', name:'Pierce', icon:'🔱', mp:7, req:0, desc:'A lance through the guard. 210% damage.', type:'phys', mult:2.1 },
    { id:'bulwark', name:'Bulwark', icon:'🛡', mp:9, req:0, desc:'+25% defense for the whole party, 3 turns.', type:'buff', mult:.25 },
    { id:'sweeping_arc', name:'Sweeping Arc', icon:'🌀', mp:11, req:6, desc:'A wide spear sweep. 260% damage.', type:'phys', mult:2.6, critBonus:.1 },
    { id:'dragonslayer', name:'Dragonslayer', icon:'🐲', mp:20, req:9, desc:'The sky-splitting thrust. 400% damage.', type:'phys', mult:4.0, critBonus:.2 },
  ];

  // ---------- LYRA (party member — the Pyromancer) ----------
  // glass-cannon fire caster rescued from the Hollow Deep's cells
  function lyraStats() {
    const lvl = player.level;
    if (!player.lyra) player.lyra = { hp: 0, mp: 0, weapon: null };
    const wpn = player.lyra.weapon;
    const wDmg = wpn && wpn.dmg ? (wpn.dmg[0]+wpn.dmg[1])/2 : (7 + lvl*2.2);
    return {
      maxHp: Math.round(player.maxHp * .45),
      maxMp: Math.round(player.maxMp * .8),
      attack: Math.round(player.attack * .38 + wDmg * 1.2),
      defense: Math.round(player.defense * .4),
      critChance: player.critChance,
      critMult: player.critMult,
      chainMax: 2,
    };
  }

  const LYRA_SKILLS = [
    { id:'emberbolt', name:'Emberbolt', icon:'🔥', mp:6, req:0, desc:'A bolt of prison-yard spite. 190% fire damage.', type:'fire', mult:1.9 },
    { id:'cauterize', name:'Cauterize', icon:'🩹', mp:9, req:0, desc:'Burn the wounds shut. Heal the leader for 26% of max HP.', type:'heal', mult:.26 },
    { id:'cinderstorm', name:'Cinderstorm', icon:'🌋', mp:14, req:5, desc:'A whirling column of ash and flame. 300% fire damage.', type:'fire', mult:3.0, critBonus:.1 },
    { id:'immolation', name:'Immolation', icon:'💥', mp:22, req:8, desc:'Everything burns. 430% fire damage, high crit chance.', type:'fire', mult:4.3, critBonus:.25 },
  ];

  // ---------- SERAH (party member) ----------
  // her stats scale from the player's level; she has her own HP/MP pool and weapon slot
  function serahStats() {
    const lvl = player.level;
    const wpn = player.serah.weapon;
    const wDmg = wpn && wpn.dmg ? (wpn.dmg[0]+wpn.dmg[1])/2 : (6 + lvl*2);
    return {
      maxHp: Math.round(player.maxHp * .55),
      maxMp: Math.round(player.maxMp * .5),
      attack: Math.round(player.attack * .42 + wDmg),
      defense: Math.round(player.defense * .5),
      critChance: Math.min(.65, player.critChance * 1.25),
      critMult: player.critMult,
      chainMax: 3,
    };
  }

  const SERAH_SKILLS = [
    { id:'silver_arrow', name:'Silver Arrow', icon:'🏹', mp:6, req:0, desc:'A streak of Wingly light. 180% damage.', type:'phys', mult:1.8 },
    { id:'wingly_light', name:'Wingly Light', icon:'💫', mp:10, req:0, desc:'Heal the party leader for 32% of max HP.', type:'heal', mult:.32 },
    { id:'tailwind', name:'Tailwind', icon:'🌬', mp:8, req:4, desc:'+18% dodge for the whole party, 3 turns.', type:'buff', mult:.18 },
    { id:'starfall_shot', name:'Starfall Shot', icon:'☄', mp:18, req:8, desc:'Her deadliest arrow. 330% damage, high crit chance.', type:'phys', mult:3.3, critBonus:.25 },
  ];

  function skillRank(id){ return player.skills[id] || 0; }
  function getSkill(id){
    for (const b of Object.values(CLASSES[player.cls].branches))
      for (const s of b.skills) if (s.id === id) return s;
    return null;
  }

  // ---------- DERIVED STATS ----------
  function recalc() {
    const a = player.attr, eq = player.equip;
    const flat = { str:0, dex:0, vit:0, ene:0, hpFlat:0, mpFlat:0, defFlat:0, dmgFlat:0, fireDmg:0, iceDmg:0, ltnDmg:0 };
    const pct = { dmg:0, def:0, hp:0, mp:0, crit:0, dodge:0, spd:0, gold:0, mf:0, allAttr:0, lifeLeech:0 };
    for (const slot of Object.values(eq)) {
      if (!slot) continue;
      for (const af of slot.affixes || []) {
        const map = { strFlat:'str', dexFlat:'dex', vitFlat:'vit', eneFlat:'ene' };
        if (map[af.stat]) flat[map[af.stat]] += af.v;
        else if (af.stat==='allAttr') pct.allAttr += af.v;
        else if (af.stat in flat) flat[af.stat] += af.v;
        else if (af.stat==='dmgPct') pct.dmg += af.v;
        else if (af.stat==='defPct') pct.def += af.v;
        else if (af.stat==='hpPct') pct.hp += af.v;
        else if (af.stat==='mpPct') pct.mp += af.v;
        else if (af.stat==='critPct') pct.crit += af.v;
        else if (af.stat==='dodgePct') pct.dodge += af.v;
        else if (af.stat==='spdPct') pct.spd += af.v;
        else if (af.stat==='goldFind') pct.gold += af.v;
        else if (af.stat==='magicFind') pct.mf += af.v;
        else if (af.stat==='lifeLeech') pct.lifeLeech += af.v;
      }
    }
    const S = { str: a.str+flat.str+pct.allAttr, dex: a.dex+flat.dex+pct.allAttr,
                vit: a.vit+flat.vit+pct.allAttr, ene: a.ene+flat.ene+pct.allAttr };
    player.effAttr = S;
    // passives
    let passiveDefPct = 0, passiveMpPct = 0, passiveCrit = 0, passiveGold = 0, cheat = false;
    for (const [id, rank] of Object.entries(player.skills)) {
      if (!rank) continue;
      const s = getSkill(id); if (!s || s.type !== 'passive') continue;
      if (s.stat==='defPct') passiveDefPct += s.per*rank;
      if (s.stat==='mpPct') passiveMpPct += s.per*rank;
      if (s.stat==='critGold') { passiveCrit += s.per*rank; passiveGold += .08*rank; }
      if (s.stat==='cheatDeath') cheat = true;
    }
    player.cheatDeath = cheat;
    const wDmg = eq.weapon ? eq.weapon.dmg : [2,4];
    const baseDmg = (wDmg[0]+wDmg[1])/2;
    player.weaponDmg = wDmg;
    player.attack = Math.round((baseDmg + S.str*1.6 + flat.dmgFlat + S.ene*0.4) * (1+pct.dmg));
    const armorDef = ['armor','helm','boots'].reduce((t,k)=> t + (eq[k]?.def||0), 0);
    player.defense = Math.round((armorDef + S.vit*0.8 + flat.defFlat) * (1+pct.def+passiveDefPct));
    player.maxHp = Math.round((50 + S.vit*9 + player.level*8 + flat.hpFlat) * (1+pct.hp));
    player.maxMp = Math.round((30 + S.ene*7 + player.level*4 + flat.mpFlat) * (1+pct.mp+passiveMpPct));
    player.critChance = Math.min(.6, .05 + S.dex*0.006 + pct.crit + passiveCrit);
    player.critMult = 1.75 + S.dex*0.005;
    player.dodge = Math.min(.5, S.dex*0.004 + pct.dodge);
    player.speed = 1 + S.dex*0.004 + pct.spd;
    player.spellPower = 1 + S.ene*0.02 + passiveMpPct*.67;
    player.goldFind = pct.gold + passiveGold; player.magicFind = pct.mf;
    player.lifeLeech = pct.lifeLeech;
    if (player.hp !== undefined) player.hp = Math.min(player.hp, player.maxHp);
    if (player.mp !== undefined) player.mp = Math.min(player.mp, player.maxMp);
    if (player.serah) {
      const ss = serahStats();
      player.serah.hp = Math.min(player.serah.hp, ss.maxHp);
      player.serah.mp = Math.min(player.serah.mp, ss.maxMp);
    }
    if (player.kael) {
      const ks = kaelStats();
      player.kael.hp = Math.min(player.kael.hp, ks.maxHp);
      player.kael.mp = Math.min(player.kael.mp, ks.maxMp);
    }
    if (player.lyra) {
      const ls = lyraStats();
      player.lyra.hp = Math.min(player.lyra.hp, ls.maxHp);
      player.lyra.mp = Math.min(player.lyra.mp, ls.maxMp);
    }
  }

  // ---------- ITEMS ----------
  function rollRarity(mf=0) {
    const w = RARITY.map(r => ({...r, w: r.key==='normal'? r.w*(1-mf) : r.key==='unique'? r.w*(1+mf*3) : r.w*(1+mf*1.5)}));
    const total = w.reduce((t,x)=>t+x.w,0); let roll = Math.random()*total;
    for (const x of w){ roll -= x.w; if (roll<=0) return x.key; }
    return 'normal';
  }

  function genItem(level, forceRarity=null, forceSlot=null, forCls=null) {
    const slots = ['weapon','armor','helm','boots','amulet','ring'];
    const slot = forceSlot || pick(slots);
    let rarity = forceRarity || rollRarity(player ? player.magicFind : 0);
    let basePool = BASES[slot].filter(b => !b.cls || !forCls || b.cls===forCls);
    if (!basePool.length) basePool = BASES[slot];
    // scale base tier by level
    const tierIdx = Math.min(basePool.length-1, Math.floor(level/6) + (Math.random()<.3?1:0));
    const base = basePool[Math.min(tierIdx, basePool.length-1)];
    const lvlScale = 1 + level*0.09;
    const item = {
      id: Math.random().toString(36).slice(2,9), slot, icon: base.icon, rarity,
      affixes: [], level,
    };
    if (base.dmg) item.dmg = [Math.round(base.dmg[0]*lvlScale), Math.round(base.dmg[1]*lvlScale)];
    // weapon family for on-character visuals
    if (slot === 'weapon') {
      const n = base.name;
      item.baseType = n.includes('Lance') ? 'spear'
        : (n.includes('Staff') || n.includes('Rod') || n.includes('Orb')) ? 'staff'
        : (n.includes('Dagger') || n.includes('Kris') || n.includes('Fang')) ? 'dagger' : 'sword';
    }
    if (base.def) item.def = Math.round(base.def*lvlScale);

    if (rarity === 'unique') {
      const u = pick(UNIQUES.filter(u => u.slot === slot) ) || null;
      if (u) {
        item.name = u.name; if (u.dmg) item.dmg = u.dmg.map(d=>Math.round(d*lvlScale/2.2));
        if (u.def) item.def = Math.round(u.def*lvlScale/2);
        item.affixes = u.affixes.map(a=>({...a}));
      } else { rarity = 'rare'; item.rarity = 'rare'; }
    }
    if (rarity !== 'unique') {
      const r = RARITY.find(x=>x.key===rarity);
      const nAff = r.affixes === 0 ? 0 : rndi(r.affixes[0], r.affixes[1]);
      const pool = [...PREFIXES, ...SUFFIXES];
      const used = new Set();
      for (let i=0;i<nAff;i++){
        const af = pick(pool); if (used.has(af.stat)) { i--; continue; }
        used.add(af.stat);
        const v = af.stat.endsWith('Pct') || ['critPct','dodgePct','lifeLeech','goldFind','magicFind'].includes(af.stat)
          ? +(rnd(af.v[0],af.v[1])).toFixed(2) : Math.round(rnd(af.v[0],af.v[1])*(1+level*.05));
        item.affixes.push({ stat: af.stat, v, label: af.name });
      }
      const pre = item.affixes.find(a=>PREFIXES.some(p=>p.name===a.label));
      const suf = item.affixes.find(a=>SUFFIXES.some(s=>s.name===a.label));
      item.name = `${pre?pre.label+' ':''}${base.name}${suf?' '+suf.label:''}`;
      if (rarity==='normal') item.name = base.name;
    }
    return item;
  }

  // ---------- XP / LEVEL ----------
  function gainXp(amount) {
    player.xp += amount; let ups = 0;
    while (player.xp >= player.xpNext) {
      player.xp -= player.xpNext; player.level++;
      player.xpNext = Math.round(100 * Math.pow(1.45, player.level-1));
      player.attrPoints += 3; player.skillPoints += 1; ups++;
      const g = CLASSES[player.cls].growth;
      player.attr.str += g.str; player.attr.dex += g.dex; player.attr.vit += g.vit; player.attr.ene += g.ene;
    }
    if (ups) { recalc(); player.hp = player.maxHp; player.mp = player.maxMp; }
    return ups;
  }

  function gainGold(amount){ const g = Math.round(amount*(1+player.goldFind)); player.gold += g; return g; }

  // ---------- SAVE / LOAD ----------
  function save() {
    try { localStorage.setItem('dfs_save', JSON.stringify(player)); return true; } catch(e){ return false; }
  }
  function load() {
    try {
      const d = localStorage.getItem('dfs_save'); if (!d) return false;
      player = JSON.parse(d);
      // migrations for older saves
      if (!player.lyra) player.lyra = { hp: 0, mp: 0, weapon: null };
      if (!player.kael) player.kael = { hp: 0, mp: 0, weapon: null };
      if (!player.serah) player.serah = { hp: 0, mp: 0, weapon: null };
      recalc(); return true;
    } catch(e){ return false; }
  }
  function hasSave(){ return !!localStorage.getItem('dfs_save'); }

  return { CLASSES, BASES, newPlayer, recalc, genItem, gainXp, gainGold, skillRank, getSkill,
           save, load, hasSave, serahStats, SERAH_SKILLS, kaelStats, KAEL_SKILLS, lyraStats, LYRA_SKILLS,
           get player(){ return player; }, set player(p){ player = p; } };
})();
