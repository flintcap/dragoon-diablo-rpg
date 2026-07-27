/* combat.js — the shared combat rules engine.
   Three systems live here, deliberately kept out of battle.js so the maths can be
   reasoned about (and tested) without a live scene:
     1. ELEMENTS + AFFINITY  — every point of damage now has a school, and every
        enemy has opinions about that school.
     2. AILMENTS             — burn / poison / bleed / chill / shock / curse, with
        per-turn ticks and multipliers, on enemies AND on the party.
     3. ADDITIONS            — the timed-combo pillar: named combo chains with
        their own beat counts, timing windows and mastery levels. */
const Combat = (() => {

  // ============================================================
  //  1. ELEMENTS & AFFINITY
  // ============================================================
  const ELEMENTS = {
    phys:      { name:'Physical',  icon:'⚔', color:'#ffcc66', hex:0xffcc66 },
    fire:      { name:'Fire',      icon:'🔥', color:'#ff7a3a', hex:0xff5522 },
    ice:       { name:'Ice',       icon:'❄', color:'#99ddff', hex:0x99ddff },
    lightning: { name:'Lightning', icon:'⚡', color:'#eeff66', hex:0xeeff66 },
    arcane:    { name:'Arcane',    icon:'✦', color:'#cc88ff', hex:0xcc88ff },
  };
  const ELEMENT_KEYS = Object.keys(ELEMENTS);

  // How each enemy family takes each school. 1.0 = neutral.
  // Wolves burn, golems shrug off steel but conduct, wraiths are half-there,
  // trained humanoids wear armour but not wards.
  const FAMILY_AFFINITY = {
    wolf:     { phys:1.00, fire:1.40, ice:0.80, lightning:1.05, arcane:1.00 },
    golem:    { phys:0.65, fire:0.85, ice:1.00, lightning:1.45, arcane:1.15 },
    wraith:   { phys:0.70, fire:1.35, ice:1.10, lightning:1.05, arcane:0.60 },
    humanoid: { phys:1.00, fire:1.05, ice:1.28, lightning:1.15, arcane:0.75 },
  };
  // The land leans on its natives: crater-born things are fireproof, the peaks are frozen through.
  const ZONE_AFFINITY = {
    forest:  {},
    town:    {},
    coast:   { lightning:1.20, fire:0.85 },
    grotto:  { lightning:1.25, ice:0.85 },
    dungeon: { arcane:1.15, fire:1.10 },
    crater:  { fire:0.50, ice:1.35 },
    peaks:   { ice:0.55, lightning:0.75, fire:1.35 },
  };
  // Named bosses get bespoke tables — learning them is the point of fighting them twice.
  const BOSS_AFFINITY = {
    herald:      { arcane:0.45, fire:1.30, phys:0.90 },
    tyrant:      { ice:0.45,    lightning:1.40, phys:0.80 },
    warden:      { phys:0.65,   fire:1.35, arcane:1.10 },
    stormcaller: { lightning:0.20, ice:0.60, fire:1.40 },
    malveth:     { arcane:0.55, fire:0.85, ice:0.85, lightning:0.85, phys:1.00 },
  };
  const AFF_MIN = 0.2, AFF_MAX = 1.8;

  /* Combined multiplier for `element` landing on `enemy` while fighting in `zone`. */
  function affinity(enemy, element, zone) {
    if (!element || element === 'heal' || element === 'buff' || element === 'debuff') return 1;
    const fam = FAMILY_AFFINITY[(enemy && enemy.kind) || 'humanoid'] || FAMILY_AFFINITY.humanoid;
    let m = fam[element] !== undefined ? fam[element] : 1;
    const z = ZONE_AFFINITY[zone || 'forest'];
    if (z && z[element] !== undefined) m *= z[element];
    const b = enemy && enemy.bossId && BOSS_AFFINITY[enemy.bossId];
    if (b && b[element] !== undefined) m *= b[element];
    return Math.max(AFF_MIN, Math.min(AFF_MAX, m));
  }
  /* 'weak' | 'resist' | '' — drives the on-screen tag and the log wording. */
  function affinityTag(mult) {
    if (mult >= 1.25) return 'weak';
    if (mult <= 0.80) return 'resist';
    return '';
  }
  const TAG_LABEL = { weak: 'WEAK!', resist: 'RESIST' };

  /* The single funnel every hit on an enemy goes through. */
  function strike(enemy, rawDmg, element, zone) {
    const mult = affinity(enemy, element, zone);
    const tag = affinityTag(mult);
    let dmg = rawDmg * mult;
    // ailments on the attacker's target that soften its hide
    if (hasAilment(enemy, 'curse')) dmg *= 1.12;   // cursed things ward themselves worse
    return { dmg: Math.max(1, Math.round(dmg)), mult, tag, label: TAG_LABEL[tag] || '' };
  }

  /* Incoming elemental damage on a party member, cut by their resistances.
     `resist` is a {fire,ice,lightning,arcane} map of 0..1 fractions. */
  const RES_CAP = 0.75;
  function mitigate(rawDmg, element, resist) {
    if (!element || element === 'phys' || !resist) return { dmg: rawDmg, cut: 0 };
    const r = Math.max(-1, Math.min(RES_CAP, resist[element] || 0));
    return { dmg: Math.max(1, rawDmg * (1 - r)), cut: r };
  }

  // ============================================================
  //  2. AILMENTS
  // ============================================================
  /* dot: fraction of the *inflicting hit* dealt per turn.
     outMult: multiplier on damage the afflicted deals.
     skipChance: chance the afflicted loses its turn outright. */
  const AILMENTS = {
    burn:   { name:'Burn',   icon:'🔥', el:'fire',      turns:3, dot:0.22, color:'#ff7a3a',
              desc:'Burning — takes fire damage each turn.' },
    poison: { name:'Poison', icon:'☠',  el:'phys',      turns:4, dot:0.14, outMult:0.92, color:'#8ad86a',
              desc:'Poisoned — bleeds damage every turn and strikes weaker.' },
    bleed:  { name:'Bleed',  icon:'🩸', el:'phys',      turns:3, dot:0.20, color:'#e04a4a',
              desc:'Bleeding — loses health every turn.' },
    chill:  { name:'Chill',  icon:'❄',  el:'ice',       turns:3, outMult:0.72, color:'#99ddff',
              desc:'Chilled — its blows land 28% weaker.' },
    shock:  { name:'Shock',  icon:'⚡', el:'lightning', turns:2, skipChance:0.35, color:'#eeff66',
              desc:'Shocked — 35% chance to lose its turn.' },
    curse:  { name:'Curse',  icon:'👁', el:'arcane',    turns:3, outMult:0.78, color:'#cc88ff',
              desc:'Cursed — deals 22% less damage and takes 12% more.' },
  };
  /* Which ailment each school inflicts by default, and how likely before affinity. */
  const ELEMENT_AILMENT = {
    fire:      { id:'burn',  chance:0.45 },
    ice:       { id:'chill', chance:0.50 },
    lightning: { id:'shock', chance:0.35 },
    arcane:    { id:'curse', chance:0.35 },
    phys:      null,
  };

  /* Ailments live on a plain `{ ail: {id:{turns,dmg}} }` bag so both the enemy object
     and the party-state records can carry them with no class plumbing. */
  function bag(holder) { return (holder.ail ||= {}); }
  function hasAilment(holder, id) { return !!(holder && holder.ail && holder.ail[id] && holder.ail[id].turns > 0); }
  function listAilments(holder) {
    if (!holder || !holder.ail) return [];
    return Object.entries(holder.ail).filter(([, v]) => v.turns > 0)
      .map(([id, v]) => ({ id, ...AILMENTS[id], turns: v.turns, dmg: v.dmg }));
  }
  /* Returns the ailment def if it took hold, else null. Re-applying refreshes duration.
     `chance` is an outright probability — 1 means it always lands. */
  function inflict(holder, id, sourceDmg, chance = 1) {
    const def = AILMENTS[id]; if (!def || !holder) return null;
    if (chance < 1 && Math.random() > chance) return null;
    const b = bag(holder);
    const dmg = def.dot ? Math.max(1, Math.round(sourceDmg * def.dot)) : 0;
    const prev = b[id];
    b[id] = { turns: def.turns, dmg: prev ? Math.max(prev.dmg || 0, dmg) : dmg };
    return def;
  }
  /* Roll the school's signature ailment, weighted by how badly the target takes that school. */
  function rollElementAilment(holder, element, sourceDmg, affinityMult = 1, bonus = 0) {
    const e = ELEMENT_AILMENT[element]; if (!e) return null;
    const chance = Math.min(0.9, (e.chance + bonus) * Math.max(0.4, affinityMult));
    return inflict(holder, e.id, sourceDmg, chance);
  }
  function cure(holder, id) { if (holder && holder.ail) delete holder.ail[id]; }
  function cureAll(holder) { if (holder) holder.ail = {}; }
  /* One turn of decay. Returns [{id, def, dmg}] for the ticks that dealt damage,
     plus the ids that just wore off, so the caller can log and animate them. */
  function tick(holder) {
    const out = { ticks: [], expired: [] };
    if (!holder || !holder.ail) return out;
    for (const [id, st] of Object.entries(holder.ail)) {
      if (st.turns <= 0) continue;
      const def = AILMENTS[id];
      if (def.dot && st.dmg > 0) out.ticks.push({ id, def, dmg: st.dmg });
      st.turns--;
      if (st.turns <= 0) { out.expired.push({ id, def }); delete holder.ail[id]; }
    }
    return out;
  }
  /* Aggregate outgoing-damage multiplier from every ailment riding the attacker. */
  function outgoingMult(holder) {
    let m = 1;
    for (const a of listAilments(holder)) if (a.outMult) m *= a.outMult;
    return m;
  }
  function skipsTurn(holder) {
    for (const a of listAilments(holder)) if (a.skipChance && Math.random() < a.skipChance) return a;
    return null;
  }

  // ============================================================
  //  3. ADDITIONS — named combo chains with mastery
  // ============================================================
  /* beats    — how many timed presses the chain asks for
     mult     — damage scalar on the whole chain
     window   — {perfect, good} timing tolerance; harder chains pay more
     speed    — how fast the first ring closes (seconds); each beat tightens further
     spirit   — spirit gained per landed beat
     finisher — element (and optional ailment) that the LAST beat carries
     req      — character level that unlocks it */
  const ADDITIONS = {
    knight: [
      { id:'whirl_sting',   name:'Whirlwind Sting', icon:'🌀', beats:3, mult:1.00, req:1,
        window:{ perfect:.10, good:.24 }, speed:1.00, spirit:5,
        desc:'The first form every Starforged learns. Forgiving timing, honest damage.' },
      { id:'crush_dance',   name:'Crush Dance',     icon:'⚒', beats:4, mult:1.20, req:4,
        window:{ perfect:.085, good:.20 }, speed:.92, spirit:6, finisher:{ element:'phys', ailment:'bleed', chance:.45 },
        desc:'Four descending blows. The last one opens a wound that keeps bleeding.' },
      { id:'madness_hero',  name:'Madness Hero',    icon:'⚔', beats:5, mult:1.42, req:9,
        window:{ perfect:.07, good:.17 }, speed:.86, spirit:7, finisher:{ element:'phys' },
        desc:'Five strikes with no guard between them. Miss once and you eat the recoil.' },
      { id:'blazing_dynamo',name:'Blazing Dynamo',  icon:'🔥', beats:6, mult:1.72, req:15,
        window:{ perfect:.055, good:.14 }, speed:.80, spirit:9, finisher:{ element:'fire', ailment:'burn', chance:.65 },
        desc:'Six beats ending in a rising flame. Punishing timing, dragon-sized payoff.' },
    ],
    rogue: [
      { id:'double_sting',  name:'Double Sting',    icon:'🗡', beats:3, mult:1.02, req:1,
        window:{ perfect:.10, good:.24 }, speed:.96, spirit:5,
        desc:'Two fangs and a twist. The Rogue\'s bread and butter.' },
      { id:'gust_dance',    name:'Gust Dance',      icon:'💨', beats:4, mult:1.24, req:4,
        window:{ perfect:.085, good:.20 }, speed:.88, spirit:6, finisher:{ element:'phys' },
        desc:'Footwork first, blade second. Fast rings, tight windows.' },
      { id:'thousand_petal',name:'Thousand Petals', icon:'🌸', beats:5, mult:1.46, req:9,
        window:{ perfect:.065, good:.16 }, speed:.82, spirit:7, finisher:{ element:'phys', ailment:'bleed', chance:.60 },
        desc:'A blossom of cuts. Whatever survives it does not stop bleeding.' },
      { id:'nightbloom',    name:'Nightbloom',      icon:'🌑', beats:6, mult:1.76, req:15,
        window:{ perfect:.05, good:.13 }, speed:.76, spirit:9, finisher:{ element:'arcane', ailment:'curse', chance:.60 },
        desc:'The shadow strikes with you on the sixth beat, and something is taken.' },
    ],
    sorceress: [
      { id:'spinning_cane', name:'Spinning Cane',   icon:'🪄', beats:2, mult:1.06, req:1,
        window:{ perfect:.11, good:.26 }, speed:1.05, spirit:6,
        desc:'Staff-work, not spellwork. Short, safe, and it builds Spirit fast.' },
      { id:'hexhammer',     name:'Hexhammer',       icon:'✴', beats:3, mult:1.30, req:4,
        window:{ perfect:.09, good:.21 }, speed:.95, spirit:7, finisher:{ element:'arcane', ailment:'curse', chance:.45 },
        desc:'She hammers a sigil into the air and lets it fall closed.' },
      { id:'star_cadence',  name:'Starlight Cadence',icon:'✧', beats:4, mult:1.54, req:9,
        window:{ perfect:.07, good:.17 }, speed:.88, spirit:8, finisher:{ element:'ice', ailment:'chill', chance:.60 },
        desc:'Four notes of cold light. The last one freezes the air solid.' },
      { id:'astral_drop',   name:'Astral Drop',     icon:'⭐', beats:5, mult:1.86, req:15,
        window:{ perfect:.055, good:.14 }, speed:.82, spirit:10, finisher:{ element:'lightning', ailment:'shock', chance:.60 },
        desc:'She pulls a piece of the sky down on the fifth beat.' },
    ],
  };

  /* Mastery: additions level from use, not from skill points — you get better at the
     ones you actually throw. Thresholds are cumulative landed chains. */
  const MASTERY_STEPS = [0, 6, 16, 34, 60];
  const MASTERY_MAX = MASTERY_STEPS.length;      // 5
  const MASTERY_DMG = 0.07;                      // +7% chain damage per level above 1
  function masteryLevel(uses) {
    let lv = 1;
    for (let i = 1; i < MASTERY_STEPS.length; i++) if (uses >= MASTERY_STEPS[i]) lv = i + 1;
    return lv;
  }
  function masteryNext(uses) {
    const lv = masteryLevel(uses);
    return lv >= MASTERY_MAX ? null : MASTERY_STEPS[lv];
  }
  function masteryMult(uses) { return 1 + (masteryLevel(uses) - 1) * MASTERY_DMG; }

  function additionsFor(clsKey) { return ADDITIONS[clsKey] || ADDITIONS.knight; }
  function findAddition(clsKey, id) { return additionsFor(clsKey).find(a => a.id === id) || null; }
  function unlockedAdditions(clsKey, level) { return additionsFor(clsKey).filter(a => level >= a.req); }
  /* The chain the player would throw right now: their choice if it's unlocked,
     otherwise the strongest thing they've earned. */
  function activeAddition(clsKey, level, chosenId) {
    const pool = unlockedAdditions(clsKey, level);
    if (!pool.length) return additionsFor(clsKey)[0];
    return pool.find(a => a.id === chosenId) || pool[pool.length - 1];
  }

  return {
    ELEMENTS, ELEMENT_KEYS, FAMILY_AFFINITY, ZONE_AFFINITY, BOSS_AFFINITY,
    affinity, affinityTag, strike, mitigate, RES_CAP,
    AILMENTS, ELEMENT_AILMENT, hasAilment, listAilments, inflict, rollElementAilment,
    cure, cureAll, tick, outgoingMult, skipsTurn,
    ADDITIONS, MASTERY_STEPS, MASTERY_MAX, masteryLevel, masteryNext, masteryMult,
    additionsFor, findAddition, unlockedAdditions, activeAddition,
  };
})();
