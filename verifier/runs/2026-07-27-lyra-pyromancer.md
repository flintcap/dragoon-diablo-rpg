# Verifier run — v5 Lyra the Pyromancer — 2026-07-27

Command: `python3 test_lyra.py` (headless chromium, swiftshader) — exit 0.

## Results against verifier/v5/acceptance.md

| # | Criterion | Result | Evidence |
|---|-----------|--------|----------|
| 1 | Rescue earned (wardenDead gate) | PASS | `rescue blocked while Warden alive: True`; hint `E — Break the rusted cell lock`; after flag: `lyra joined after rescue: True` |
| 2 | 4-actor turn cycle | PASS | `turn cycle: DRAGOON KNIGHT:True SERAH:True KAEL:True LYRA:True` |
| 3 | Stats & skills | PASS | `on lyra turn for cast test: True`; `emberbolt mp spent: 6`; log `Lyra's Emberbolt hits for 49`; shot 72 shows fire FX on cast + impact |
| 4 | Party integration | PASS | `lyra bars visible in battle: True`; shot 71: 4 distinct models (staff Lyra) + 3 ally frame rows + dungeon-amber arena |
| 5 | Equipment | PASS | `alt-click equips weapon to Lyra: True` (`Titan's Sword`, second run `Dragon's Broadsword of Greed`); load() migration added |
| 6 | Stability | PASS | `ERRORS: (none)`; node --check OK rpg/battle/main |
| 7 | Regression | PASS | test_quests.py: HERALD dead, TYRANT dead, STAR KEY, MELBU PHASE 2 + dead, `ERRORS: (none)`; test_peaks.py: full chain incl. stormcaller dead + s3, `ERRORS: (none)` |

## In-loop fixes this iteration
- Test needed weak player stats — buffed stats one-shot enemies before the party cycle could advance.
- Cast-test enemy made temporarily unkillable (hpCur override) so Lyra's turn could be reached.
- rpg.js: `lyraStats()` self-heals missing `player.lyra`; `load()` backfills serah/kael/lyra for old saves.
- Enemy-turn target model lookup generalized (lyra was falling through to the player model).
- Found & fixed: `polish.css` was never linked in index.html (party frames panel + vignette
  styles silently inactive since v3) — link added, panel now renders (shot 73).
