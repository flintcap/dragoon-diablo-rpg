# Verifier v4 — Stormpeak Ascent (mountains biome) + arena theming

Created: 2026-07-27. Measures the v4 slice: the last missing biome from the goal's
environments list (mountains), an earnable post-Act-I quest gated behind the Act-I
finale, and per-zone battle arena moods.

## Acceptance criteria

1. **Zone exists and is reachable only by earning it**
   - `peaks` zone ("Stormpeak Ascent") in ZONES with its own palette/fog/enemy table.
   - Forest portal to peaks is LOCKED (🔒 hint) until `flags.melbuDead`; opens after.
   - Peaks has a working return portal to the forest.
2. **Mountain biome content**
   - Snow-textured ground (new `snow` + `iceRock` procedural textures).
   - Ring of jagged snow-capped peaks, inner crags, dead pines, boulders, drift ridges.
   - Summit shrine: stone platform, standing-stone circle, storm obelisk with animated crystal.
   - Live weather: falling snow particle field + periodic lightning flash with delayed thunder SFX.
   - Four zone-appropriate enemies (Snow Stalker / Frost Revenant / Crag Golem / Storm Cultist).
3. **Quest — "Echoes of the Storm" (s3)**
   - Three Storm Sigil interactables spawn in the peaks; attunable in ANY order
     (per-sigil flags, not count-based resync); each triggers an ambush.
   - After 3 sigils, approaching the summit spawns THE STORMCALLER (boss, enrage at 25%).
   - Boss has a unique special: CHAIN LIGHTNING — party-wide hits with sky flash + thunder.
   - Kill sets `stormcallerDead`, drops a guaranteed unique, shows "THE STORM BREAKS" victory,
     and completes side quest s3 (rewards xp/gold/unique).
4. **Battle arena theming** — arena accent/ring/inlay/floor/flames/embers re-tint per zone
   (forest/town/coast/grotto/dungeon/crater/peaks palettes).
5. **Stability** — zero pageerrors across the full scripted flow; node --check passes on
   all touched JS.
6. **Regression** — full Act-I chain (test_quests.py) still passes its hard gates:
   HERALD dead, TYRANT dead, STAR KEY forged, MELBU phase 2 + dead, zero errors.
7. **Mood review** — screenshot critic: peaks reads as night storm (not daylight);
   peaks battles show the icy arena theme.

## How to run

```
cd /mnt/agents/output/app && python3 -m http.server 8123 &
cd /mnt/agents/output && python3 test_peaks.py    # criteria 1-3, 5
python3 test_quests.py                            # criterion 6
```
Screenshots: shots/60_peaks_vista.png, 61_peaks_sigil.png, 62_stormcaller_arena.png,
63_stormcaller_battle.png, 64_storm_victory.png (criterion 7).
