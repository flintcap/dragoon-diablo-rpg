# Verifier index (append-only)

## v1 — 2026-07-26
Measures: (a) all game files exist & load with no JS syntax errors; (b) Act 1 hub town
"Mirewood Hollow" exists as a 4th map with houses, lamps, well, pond, NPCs and a
two-way portal to the forest; (c) 3 merchant NPCs open a shop UI; buying a potion
decrements gold and increments potion count; selling is possible; (d) elder NPC
opens dialogue; (e) procedural texture factory produces >=6 texture types used by
ground/builds; (f) zero pageerrors during a scripted town walkthrough; (g) visual
critic pass on screenshots (town readability, texture presence, shop/dialogue UI).
Differs from prior: first version.

## v1 runs — 2026-07-26
Two runs logged under verifier/runs/2026-07-26-town-party.md: town hub + party control +
gear visuals (all PASS), plus full Act I chain regression after the party refactor
(Q1→Q6, Melbu dead, zero errors). Two bugs found and fixed in-loop: grotto pools leaking
into town ground; test selectors invalidated by dynamic battle menus.

## v2 — 2026-07-26
Measures: Emberstrand Coast map (5th zone: sea/surf/pier/palms/mountains/new enemy family),
forest river with bridge, Kael as third controllable party member (rescue event, turn cycle
player→serah→kael, skills, KO/revive, equip slot), unique enemy special attacks per family
(bite/bolt/slam/flourish). Run logged at verifier/runs/2026-07-26-coast-kael.md — all PASS.

## v3 — 2026-07-26
Measures: The Hollow Deep dungeon map (corridors/torches/cells/Warden + rare drop),
armor pieces on characters (shield/tiered helm/boots tint), unified party frames,
damage vignette, cast animations + crit FOV punch. Run at verifier/runs/2026-07-26-dungeon-gear-hud.md — all PASS.

## v4 — 2026-07-27
Measures: Stormpeak Ascent mountains biome (7th zone: snow textures, peak ring, dead pines,
summit shrine, snowfall + lightning/thunder weather), portal gated on Act-I completion,
"Echoes of the Storm" quest (3 any-order Storm Sigils + ambushes -> Stormcaller boss with
unique Chain Lightning party-wide special, guaranteed unique drop), per-zone battle arena
theming (7 palettes). Differs from prior: first biome built around live weather; first boss
gated behind another act's completion; first arena re-theming. Run logged at
verifier/runs/2026-07-27-stormpeak-arenas.md — all PASS, Act-I regression green.

## v5 — 2026-07-27
Measures: Lyra the Pyromancer as 4th controllable party member — cell rescue event in the
Hollow Deep gated on the Warden's death, 4-actor turn cycle (player→Serah→Kael→Lyra→enemy),
4 fire skills with cast anims, KO/recovery path, lyra-bars HUD, lyraWeapon equip slot with
Alt-click equip, enemy target pools incl. Lyra, save migration. Also caught & fixed:
polish.css was never linked in index.html (v3 styles silently inactive). Differs from prior:
first party member added to an existing zone (retro-content), first caster ally, first save
migration. Run logged at verifier/runs/2026-07-27-lyra-pyromancer.md — all PASS,
Act-I + Stormpeak regressions green.
