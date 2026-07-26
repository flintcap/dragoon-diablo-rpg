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
