# Dragoons of the Fallen Star

A browser RPG that fuses **Legend of Dragoon's** turn-based **Addition** combat
(timed button presses chain attack combos, Dragoon Spirit transformation) with
**Diablo II's** character depth (attributes, branching skill trees, rarity-tiered
affix loot, equipment slots) — built in Three.js.

## Play
Serve `app/` with any static server and open `index.html`:
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
| 1–4 / Q / R | Hotbar skills / HP potion / MP potion |
| C / K / I | Character sheet / Skill tree / Inventory |
| Esc | Close panels / Pause menu |

## The two design pillars
- **Combat (Legend of Dragoon):** touch an enemy → battle arena. Attack plays the
  Addition minigame — a ring shrinks onto the target ring; press Space on beat to
  chain hits (GOOD/PERFECT judgments), each beat faster than the last. Battles fill
  your Spirit meter; at 100% you can transform into **Dragoon form** (+60% damage,
  +2 addition beats, exclusive Dragoon-only skills).
- **Character depth (Diablo II):** 3 classes × 3 skill branches, 4 attributes
  (STR/DEX/VIT/ENE) with a full derived-stat panel, loot in Normal/Magic/Rare/Unique
  tiers with prefix+suffix affix generation, 8 equipment slots, magic/gold find,
  life leech, potions, XP levels with attribute + skill points.

## Game loop
Explore the night forest → slay fiends for XP/loot → 8 kills draws out
**Melbu's Shadow** at the ruined shrine → kill it for the ending (world stays open).

## Repo layout
- `app/` — the game (plain HTML/CSS/JS, zero build step)
- `docs/PLAN.md` — design plan & systems checklist
- `docs/AGENT_BRIEF.md` — per-system build briefs + critic protocol used during development
- `tests/` — Playwright playthrough tests (drive the real game, capture screenshots)
- `scripts/fetch_three.sh` — restores the vendored Three.js r128
