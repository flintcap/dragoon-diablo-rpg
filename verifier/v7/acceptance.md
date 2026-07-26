# Verifier v7 — Gear depth: pauldrons, shin guards, amulet gems, unique auras

Created: 2026-07-27. Measures the v7 slice: every remaining equipment slot now has a
visible, rarity-styled representation on the character — in the world AND in battle.

## Acceptance criteria

1. **Pauldrons** — equipping armor adds/restyles shoulder pauldrons: color by rarity
   (normal steel / magic blue / rare gold / unique ember), scale grows with defense.
   Knight's class pauldrons are restyled in place; rogue/sorceress gain pauldrons
   only when armor is worn.
2. **Shin guards** — equipping boots adds rarity-colored guards on the legs
   (in addition to the existing leg tint).
3. **Amulet gem** — equipping an amulet adds a glowing rarity-colored gem at the collar.
4. **Unique aura** — when ANY equipped item is unique, a golden additive ring slowly
   rotates under the hero with a pulsing amber light (animated in the world update loop).
5. **Removal** — unequipping each slot removes exactly its own visuals, no leftovers.
6. **Battle carry-over** — the battle rig (cloneRig) shows the equipped shield,
   tiered helm, and amulet gem; builders exported from World for reuse.
7. **Stability + regression** — zero pageerrors; test_quests.py hard gates still pass.

## How to run
```
cd /mnt/agents/output/app && python3 -m http.server 8123 &
cd /mnt/agents/output && python3 test_gear2.py    # criteria 1-6
python3 test_quests.py                            # criterion 7
```
Screenshots: shots/90_gear_closeup.png (world paperdoll), 91_gear_battle.png (battle carry-over).
