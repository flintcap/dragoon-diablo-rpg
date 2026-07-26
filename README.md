# Dragoons of the Fallen Star

A browser RPG that fuses **Legend of Dragoon's** turn-based **Addition** combat
(timed button presses chain attack combos, Dragoon Spirit transformation) with
**Diablo II's** character depth (attributes, branching skill trees, rarity-tiered
affix loot, equipment slots) — built in Three.js, structured as a linear
**4-Act storyline**. **Act I is fully playable**, with a post-Act endgame zone.

## Play
```bash
bash scripts/fetch_three.sh   # one-time: restore vendored three.js r128
cd app && python3 -m http.server 8000
# open http://localhost:8000
```

## Controls
| Input | Action |
|---|---|
| WASD | Move (camera-relative) |
| Mouse drag | Orbit camera |
| Space | **Addition timing press** in battle |
| E | Talk / Interact / Enter portals |
| 1–4 / Q / R | Hotbar skills / HP potion / MP potion |
| C / K / I / J | Character / Skills / Inventory / **Quest log** |
| Shift-click weapon | Give to **Serah** · Ctrl-click weapon → **Kael** |
| Esc | Close panels / Pause |

## The world — 7 zones in Act I
Whisperwood (forest + river/bridge) · **Mirewood Hollow** (town: 3 merchants with
buy/sell shops, 5 wandering NPCs, quest-aware Elder) · **Emberstrand Coast**
(sea, surf, pier, palms, gulls) · **The Sunken Grotto** (crystal caves) ·
**The Hollow Deep** (torch-lit dungeon, prison cells, the Warden) ·
**The Star Crater** (Act-I finale) · **Stormpeak Ascent** (snow-capped mountain
ring, dead pines, live snowfall + lightning storm — unlocked only after Act I).
Portals between zones are **quest-gated**; every battle arena re-tints itself
to match the zone you fight in.

## ACT I — "The Fallen Star" (full depth)
Six main quests with unique mechanics, three side quests, four mini-bosses and
a two-phase Act boss:

1. **Awakening** — slay 3 fiends, then claim the Spirit Shard at the shrine
2. **The Wingly's Trial** — riddle puzzle: attune 3 crystals in the verse's order
   (wrong order resets; each attunement ambushes you)
3. **Herald of Shadows** — the Herald is 85%-shielded until you destroy 3 Shadow
   Anchors; then the mini-boss fight (unlocks **Kael the Lancer**, 3rd party member)
4. **Drowned Relics** — find 4 relics across the Sunken Grotto; the Tyrant only
   surfaces when all 4 are found
5. **The Tyrant** — mini-boss with an enrage phase below 30% HP
6. **The Fallen Star** — forge the Star Key, enter the crater, destroy
   **MELBU FRAHMA** — two-phase Act boss (shadow form → Dragon Avatar at 50% HP)

Side quests: **Elite Hunter**, **Hoarder**, and **Echoes of the Storm** — the
post-Act ascent of Stormpeak: attune 3 Storm Sigils *in any order* (each
ambushes you), then face **The Stormcaller** at the summit shrine (enrage +
party-wide **Chain Lightning** unique, guaranteed Unique drop).

## Systems
- **LOD combat:** Addition timed-combo chains (GOOD/PERFECT), Spirit meter,
  Dragoon transformation (+60% dmg, +2 beats, Dragoon-only skills, energy wings)
- **Full party control:** you, **Serah** (bow, Wingly Light heal, Tailwind) and
  **Kael** (spear, Bulwark, Dragonslayer) each take controlled turns with their
  own additions, skills, KO/revive — and their own equipment slots
- **Enemy unique attacks:** Savage Bite, Void Bolt, Seismic Slam, Cursed
  Flourish, Chain Lightning — per family and per boss, with banners/anim/SFX
- **D2 depth:** 3 classes × 3 skill branches, STR/DEX/VIT/ENE with derived
  stats, Normal/Magic/Rare/Unique loot with prefix+suffix affixes, 8+2 equip
  slots, elites/champions, magic/gold find, life leech, potions, save/load
- **Gear on characters:** equipped weapons (sword/dagger/staff/spear), shields,
  tiered helms (cap → great helm → winged dragoon helm), boots/armor rarity
  tints — all live on the 3D model, in and out of battle
- **World life:** procedural texture factory (grass/snow/stone/wood/water…),
  day-mood lighting per zone, falling leaves, gulls, torch flicker, cave drips,
  snowfall + lightning storms, NPC wander AI, minimap, quest tracker, zone
  title cards, item-compare tooltips

## Repo layout
- `app/` — the game (plain HTML/CSS/JS, zero build step)
- `docs/PLAN.md`, `docs/AGENT_BRIEF.md` — design plan & per-system briefs
- `tests/` — Playwright suites: smoke, gameplay, boss, full Act-I quest-chain,
  coast/Kael/party, and the Stormpeak endgame chain
- `verifier/` — versioned acceptance criteria (v1–v4) + timestamped run logs
- `scripts/fetch_three.sh` — restores vendored Three.js r128
