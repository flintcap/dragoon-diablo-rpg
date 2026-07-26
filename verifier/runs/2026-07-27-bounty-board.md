# Verifier run — v8 Mirewood Bounty Board — 2026-07-27

Command: `python3 test_bounty.py` (headless chromium, swiftshader) — exit 0.

## Results against verifier/v8/acceptance.md

| # | Criterion | Result | Evidence |
|---|-----------|--------|----------|
| 1 | Board in town | PASS | `reached town: True`; hint `E — Read the Bounty Board`; shot 95-97 modal opens |
| 2 | Offers | PASS | `offers: ['kill:wraith:120', 'kill:wolf:113', 'elite:1:220']` (3 generated, randomized) |
| 3 | Accept | PASS | `bounty accepted: True`; `tracker shows bounty: True` (📜 line with live progress) |
| 4 | Progress | PASS | `wolf kills tracked: kills 2 base 0`; `bountyReady: True` after 2 real engine kills |
| 5 | Claim | PASS | `gold 50->170 (+120)`; `cleared=True`; `newOffers=3`; magic item granted |
| 6 | Stability | PASS | `ERRORS: (none)` — after fixing TWO bugs (see below) |
| 7 | Regression | PASS | test_quests.py: TYRANT dead, STAR KEY, MELBU dead, `ERRORS: (none)` |

## In-loop fixes this iteration
- **F() boolean coercion**: offers array access used the boolean-coercing `F()` helper —
  `F('bountyOffers')` returned `true`, crashing `for..of` (`F is not iterable`). Raw
  `RPG.player.flags.*` used for object values (accept, render, tracker).
- **Pre-existing respawn crash**: the 12s enemy respawn timer in `removeEnemy` fired
  after the player traveled to an enemy-less zone (town) — `Z.enemies[rndi(0,-1)]` was
  `undefined` → `addEnemy` crashed on `t.scale`. Guard: safe havens spawn nothing.
  Root-caused via tagged window-error stack capture.
