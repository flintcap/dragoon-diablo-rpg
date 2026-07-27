# Starforged — Hybrid Action RPG (Three.js)

## Vision
A browser RPG fusing two design pillars:

| Pillar | Source | What we take |
|---|---|---|
| Combat | Original | Turn-based party battles, timed **Addition** combo system (press at the shrinking-ring moment to chain hits), Starforged special attacks, cinematic battle camera |
| Character depth | Modern ARPG standard | Attributes (STR/DEX/VIT/ENE), branching skill trees, item rarity tiers (Normal/Magic/Rare/Unique), random affixes, equipment slots, loot drops, potions, gold, leveling |

## Tech
- Three.js (bundled locally — no CDN dependency at runtime)
- Plain HTML/CSS/JS, single-page app, zero build step
- Target: 60fps at 1080p in a modern browser

## Systems checklist
- [x] 3D overworld: forest zone, day-night-tinted lighting, fog, particles, props
- [x] Player controller (WASD + mouse orbit camera), collision
- [x] Roaming enemies with aggro radius → battle transition
- [x] Battle scene: arena, turn order, attack/defend/skills/items
- [x] Addition system: timed ring minigame, multi-hit chains, damage scaling per successful beat, failure ends the chain
- [x] Starheart (special meter) → Starforged form transformation with enhanced skills
- [x] Classes: Starforged Knight (STR), Shadow Rogue (DEX), Storm Sorceress (ENE)
- [x] Attributes: STR/DEX/VIT/ENE with derived stats (dmg, crit, HP, MP, defense)
- [x] Skill trees: 3 branches per class, point investment, unlock tiers by level
- [x] Items: 4 rarity tiers, affix pools (prefix+suffix), weapons/armor/charms/potions
- [x] Equipment: 8 slots, paper-doll stat recalculation
- [x] Inventory grid + loot drops on ground + pickup
- [x] Save/load via localStorage + JSON export
- [x] HUD: health/mana orbs, XP bar, skill hotbar, minimap
- [x] Audio: procedural WebAudio SFX + ambient music layer

## Controls
- WASD move · mouse drag orbit camera · E interact/pickup
- Click enemy skills via hotbar 1-4 · Space = Addition timing press in battle
- C character sheet · K skill tree · I inventory · Esc menu

## Directory layout
```
/app
  index.html      entry, HUD, menus, all UI overlays
  css/style.css   full UI theme (dark gothic, LOD blue/gold accents)
  js/three.min.js bundled engine
  js/game.js      engine core, world, overworld
  js/battle.js    LOD battle system + Addition minigame
  js/rpg.js       D2 systems: stats, skills, items, affixes, inventory
  js/audio.js     procedural audio
  js/main.js      bootstrap + state machine
/docs
  PLAN.md         this file
  AGENT_BRIEF.md  per-system briefs for the simulated sub-agent passes
```
