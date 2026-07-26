# Dragoons of the Fallen Star

A browser RPG that fuses **Legend of Dragoon's** turn-based **Addition** combat
(timed button presses chain attack combos, Dragoon Spirit transformation) with
**Diablo II's** character depth (attributes, branching skill trees, rarity-tiered
affix loot, equipment slots) — built in Three.js, structured as a linear
**4-Act storyline**. **Act I is fully playable.**

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
| E | Interact (quest objects, portals) |
| 1–4 / Q / R | Hotbar skills / HP potion / MP potion |
| C / K / I / J | Character / Skills / Inventory / **Quest log** |
| Esc | Close panels / Pause |

## ACT I — "The Fallen Star" (full depth)
Three zones, six main quests with unique mechanics, two side quests,
two mini-bosses and a two-phase Act boss:

1. **Awakening** — slay 3 fiends, then claim the Spirit Shard at the shrine
2. **The Wingly's Trial** — riddle puzzle: attune 3 crystals in the verse's order
   (wrong order resets; each attunement ambushes you)
3. **Herald of Shadows** — the Herald is 85%-shielded until you destroy 3 Shadow
   Anchors (each spawns shadow adds); then the mini-boss fight
4. **Drowned Relics** — find 4 relics hidden across the Sunken Grotto (guarded,
   ambushes); the Tyrant only surfaces when all 4 are found
5. **The Tyrant** — mini-boss with an enrage phase below 30% HP
6. **The Fallen Star** — forge the Star Key (boss trophies + meteor shard hunt),
   enter the Star Crater, and destroy **MELBU FRAHMA** — two-phase Act boss
   (shadow form → Dragon Avatar at 50% HP, damage + heal surge)

Side quests: **Elite Hunter** (slay 3 gold-ringed elites → Unique) and
**Hoarder** (pick up 6 items → potion cache). Acts II–IV are roadmap stubs in
the quest log (J).

## Systems
- **LOD combat:** Addition timed-combo chains (GOOD/PERFECT), Spirit meter,
  Dragoon transformation (+60% dmg, +2 beats, Dragoon-only skills), plus an
  AI companion (Serah the Wingly) who takes her own turn — attacks with her own
  additions, heals you when you're low
- **D2 depth:** 3 classes × 3 skill branches, STR/DEX/VIT/ENE with derived stats,
  Normal/Magic/Rare/Unique loot with prefix+suffix affixes, 8 equipment slots,
  elites/champions, magic/gold find, life leech, potions, save/load
- **World:** 3 zones (Whisperwood, Sunken Grotto, Star Crater), quest-gated
  portals, ambushes, boss shields/enrages/phase transitions, minimap, quest tracker

## Repo layout
- `app/` — the game (plain HTML/CSS/JS, zero build step)
- `docs/PLAN.md`, `docs/AGENT_BRIEF.md` — design plan & per-system briefs
- `tests/` — Playwright suites: smoke playthrough, gameplay, boss, and the full
  Act I quest-chain end-to-end run
- `scripts/fetch_three.sh` — restores vendored Three.js r128
