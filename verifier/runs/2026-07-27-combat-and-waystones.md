# Run — 2026-07-27 · v9 · Additions, Affinities, Ailments + the Waystone Network

Served from `app/` on :8123, Chromium + SwiftShader, 1600×900.
Suite: `tests/test_combat_depth.py` (new) plus every live regression suite.

## What was measured and what it did

### Combat depth — `tests/test_combat_depth.py`
| Check | Result |
|---|---|
| Affinity ordering across family × zone × boss | PASS — wraith fire 1.35 / arcane 0.60 · golem phys 0.65 / lightning 1.45 · peaks ice 0.44 vs fire 1.80 · crater fire 0.53 · Stormcaller vs lightning **0.20** |
| Addition gating (1 chain at lv1, 4 at lv15) | PASS |
| Longer chains carry tighter windows | PASS — beats [3,4,5,6], perfect windows [.10,.085,.07,.055] |
| Mastery ladder from use | PASS — levels at 6/16/34 uses → Lv 4, ×1.21 chain damage |
| Battle menu names the equipped chain | PASS — `⚒ Crush Dance · 4 beats · mastery 1/5 · ⚔ finisher` |
| Additions switcher present as a free action | PASS |
| Enemy affinity pips on screen, count matches the table | PASS |
| Full chain fires its elemental finisher | PASS — `Crush Dance finishes for 162 physical damage.` |
| Mastery credited even on a killing chain | PASS |
| Burn applied → chip + DOT tick in a live battle | PASS — 110/turn, chip rendered |
| Burn ticks 3 turns then expires | PASS |
| Ailment modifiers bite | PASS — chill ×0.72, curse ×0.78, shock skips ~35% of turns |
| Resistance affixes cut elemental damage, cap 75% | PASS — resFire .30 + resAll .10 → .40; a 100 fire hit lands for 60 |
| Character sheet shows resistances + mastery | PASS — 4 cells, 4 rows |
| Mastery survives save/load | PASS |

### World flow — same suite
| Check | Result |
|---|---|
| Hub attuned at start, other stones dark | PASS — 7 zones charted |
| Attuning a stone on foot | PASS — hint reads `E — Attune this Waystone` |
| Network gates honestly | PASS — town ready · forest current · coast undiscovered · grotto/dungeon/crater/peaks sealed with their unlock quest named |
| Network round trip, landing on the stone | PASS — forest → town (on the stone) → forest |
| Tracker names the next destination | PASS — `▸ Travel to Whisperwood — Hunt 3 fiends in the Whisperwood` |

### HUD regressions closed this pass
| Check | Result |
|---|---|
| Every party bar has a visible fill | PASS (was broken — see below) |
| Party frames clear the hero HUD | PASS — party y=126, HUD ends y=106 |
| World hotbar hidden during battle | PASS |

### Regression sweep
| Suite | Result |
|---|---|
| `test_quests` — full Act I, Q1 → Melbu | PASS — Herald, Tyrant and Melbu (phase 2 reached) all dead, zero errors |
| `test_peaks` — Stormpeak chain | PASS — lock respected, 3 sigils, Stormcaller dead, s3 complete |
| `test_bounty` | PASS — opens in town, accept → track → claim |
| `test_gear2` | PASS — all slot visuals on and cleanly removed |
| `test_battle_fx` | PASS — chain, dragoon cinematic, death anim, no leaked meshes |
| `test_coast_kael` | PASS — coast, Kael's turn in the cycle, his skills |
| `test_lyra` | Rescue/equip/turn-order PASS; the mid-fight cast assertions still miss because the fight ends before Lyra's phase. **Verified identical on the pre-change baseline** — pre-existing flake, not a regression. |

## Bugs found and fixed in-loop

1. **Serah's and Kael's party bars were invisible.** `.serah-hp-bar div` / `.kael-hp-bar div`
   and their labels had never been given CSS — only Lyra's were defined, back in v5. Both
   party members' HP/MP have been rendering as empty black boxes ever since the frames were
   introduced. Fills and label colours added, and the suite now asserts a non-`none`
   background-image on all three.
2. **The party frame overlapped the hero's own HUD.** `#party-frames` sat at `top:88px`
   while the orb/bar stack runs to `y=106`. Moved to 126 and asserted with a rect check.
3. **The world hotbar sat on top of the battle log.** Both live at the bottom centre. The
   hotbar is now hidden for the duration of a battle via `body.battle-mode`.
4. **`test_quests` was not actually fighting anything.** It clicked
   `#battle-menu .battle-btn[data-action="attack"]`, but `buildMenu()` rebuilds the menu per
   actor and emits no `data-action`. Every `attack_round` silently timed out and no-opped,
   so the "full Act-I chain" regression had been passing without landing a single blow.
   Confirmed by running the suite unchanged against the pre-change baseline: identical stall
   at the Herald. Selector fixed; the chain now runs green with real combat.
5. **Waystone arrival landed outside its own interaction radius**, so the network could not
   be reopened on arrival. Spawn offsets pulled onto the steps.
6. **The finisher log line was being overwritten in the same tick** by the ailment line.
   Split by a beat — better to read, and observable.

## Judgement calls

- Chain damage was rebalanced (`0.45 + totalMult*0.42`, then × the chain's own weight ×
  mastery). The starter chain now hits for less than the old generic addition; the payoff
  comes from unlocking and mastering longer chains. This is deliberate — the old curve gave
  a level-1 hero a one-turn kill on most roamers.
- Humanoids were given a sharper table (ice 1.28 / arcane 0.75) after the first pass left
  them fully neutral, which made the most common family the least interesting to fight.
- Allies inherit half the leader's resistances rather than rolling their own gear. They have
  only a weapon slot; giving them nothing would have made elemental party-wide specials
  unanswerable.
