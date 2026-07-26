# Verifier v6 — Battle Animation 2.0

Created: 2026-07-27. Measures the v6 slice: escalating per-beat Addition impacts,
a Dragoon transformation cinematic, per-family enemy death animations, kind-specific
attack sounds — plus a critical turn-cycle bug it uncovered.

## Acceptance criteria

1. **Per-beat Addition FX** — every landed beat produces an escalating spark burst
   (count grows with chain index, color ramps gold→orange, PERFECT = ice-blue +
   expanding shockwave ring + FOV micro-punch on beats ≥3) and a slash arc per beat.
2. **Dragoon transformation cinematic** — camera FOV push-in, spirit-fire pillar
   (spins, fades over ~2s), periodic shockwave rings, 30-feather burst, shake,
   `transform` SFX layered under the classic `dragoon` roar; wings + glow follow
   exactly as before; no orphan objects left in the scene afterward.
3. **Per-family death animations** — wraith dissolves upward into motes (with
   `dissolve` SFX), golem bursts into tumbling debris + topples, wolf crumples
   sideways, humanoid staggers then falls; every boss death also detonates a gold
   shockwave. `end(true)` timing preserved (slightly longer for bosses).
4. **Kind-specific attack sounds** — wolf growl / golem stomp / wraith whoosh /
   humanoid swing on basic attacks; new SFX (growl, stomp, whoosh, transform,
   dissolve) exist and play without errors.
5. **Turn-cycle regression fixed** — with only Serah in the party (no Kael/Lyra),
   the player MUST get a turn every cycle (bug: currentActor never reset on the
   no-kael fallback path, locking the player out permanently).
6. **Stability** — zero pageerrors across the scripted FX flow.
7. **Regression** — test_quests.py (Act I), test_lyra.py (4-actor cycle), and
   test_peaks.py (Stormpeak) all pass their hard gates.

## How to run
```
cd /mnt/agents/output/app && python3 -m http.server 8123 &
cd /mnt/agents/output && python3 test_battle_fx.py   # criteria 1-6
python3 test_quests.py && python3 test_lyra.py && python3 test_peaks.py  # 7
```
Screenshots: shots/80_beat_fx.png, 81_dragoon_cinematic.png, 82_dragoon_wings.png,
83_death_results.png, 84_beat_impact.png, 85_beat_perfect.png.
