# Agent Briefs — updated for Act I storyline

## Pass 5 — Elites
Champion enemies: ×1.35 scale, gold ring + aura, prefixed names, ×2.2 HP,
×1.5 damage, ×2 rewards, guaranteed item drop. 16% of spawns.

## Pass 6 — Companion
Serah the Wingly: AI party member in every battle. Own turn after the player's:
attacks with auto-additions (1–3 hits, crits), or casts Wingly Light (22% max-HP
heal) when the player drops below 35% HP.

## Pass 7 — Zones
Zone-config-driven world builder. Whisperwood (forest/shrine), Sunken Grotto
(crystal cave: stalagmites, crystal clusters, bioluminescent growth, water
pools), Star Crater (obsidian spikes, lava pools, ember sky, the Fallen Star).
Quest-gated portals with live lock evaluation.

## Pass 8 — Quest engine
Data-driven quests: objectives (kills, flags, counters), story prose, rewards
(xp/gold/items/spirit/potions), interactable world objects with E-interact,
signature-based resync. Quest log modal (J) with acts, story, objectives,
rewards, and roadmap stubs. Live quest tracker HUD.

## Pass 9 — AAA quest mechanics
- Riddle puzzle (crystal attunement order, resets on error, guardian ambushes)
- Boss-prep objective (Shadow Anchors → 85% damage shield on the Herald)
- Relic hunt gating the Tyrant spawn; relic pickups roll ambush chance
- Enrage phase (Tyrant, <30% HP, ×1.5 damage)
- Two-phase Act boss (Melbu: Dragon Avatar at 50%, +40% damage, 15% heal,
  red visual transformation, banner)
- Star Key forge chain: Herald trophy + Tyrant trophy + Meteor Shard hunt

## Critic log (this round)
- FAIL: victory screens left the game stuck in battle state → fixed (world
  state restored on all victory handlers) — caught by the full-chain test
- FAIL: grotto read empty/flat → crystal clusters, bioluminescent growth,
  lighter fog, fixed cluster anchors near spawn and the lair
- FAIL: giant crystals ate the frame → scale capped, emissive tuned
- FAIL: lava/teal pools oversaturated → emissive reduced
- PASS: intro screen, quest log, crater zone, phase-2 menace, act-complete

## Pass 10 — Combat systems (v9)
Three systems lifted out of `battle.js` into `app/js/combat.js` so the rules can be
reasoned about — and tested — without a live scene:

- **Additions.** Four named chains per class, each with its own beat count, damage
  weight, ring speed and PERFECT/GOOD windows; longer chains pay more and forgive
  less. A chain that lands every beat fires an elemental **finisher** worth ~45% of
  the chain, usually carrying an ailment. Chains level from *use* (Mastery 1–5,
  +7%/level) rather than skill points, so investment follows what you actually play.
  Switching chains is a free action.
- **Affinity.** Every hit carries a school. The multiplier is family × zone × boss,
  clamped to [0.2, 1.8], reported as WEAK/RESIST and shown as pips above the arena.
  Resistance affixes mitigate the same schools on the way in, capped at 75%.
- **Ailments.** burn / poison / bleed / chill / shock / curse — DOT, outgoing-damage
  multipliers and turn skips — carried in a plain `.ail` bag so the enemy object and
  the four party slots use identical code.

Balance note: chain damage was re-scaled (`0.45 + totalMult*0.42`, × chain weight ×
mastery). The old curve let a level-1 hero one-turn most roamers.

## Pass 11 — World flow (v9)
The game had seven zones and no spine. Now:
- It **opens in Mirewood Hollow** — shops, board, Elder, hub waystone.
- Every zone carries **one waystone**, dark until you stand at it. Attuned stones
  form a network you can travel between from anywhere, arriving on the stone's steps.
- The network panel charts all seven zones in journey order with role, level band,
  and — for anything sealed — the exact quest that unseals it.
- The tracker prints a **NEXT ▸** line and the minimap points a gold chevron at the
  live objective, so "where do I go" is always answered on screen.

## Critic log (this round)
- FAIL: Serah's and Kael's party bars had never been given CSS fills — invisible
  since v3. Fixed, and asserted in the suite.
- FAIL: `#party-frames` overlapped the hero's HUD stack. Moved, asserted by rect.
- FAIL: the world hotbar rendered on top of the battle log. Hidden in battle.
- FAIL: `test_quests` clicked a `data-action` selector the dynamic battle menu never
  emits, so the Act-I regression had never landed a blow. Confirmed against the
  pre-change baseline before fixing.
- FAIL: waystone arrival landed just outside its own interaction radius.
- FAIL: humanoids read as fully neutral to every school — the most common family was
  the least interesting to fight. Sharpened to ice 1.28 / arcane 0.75.
