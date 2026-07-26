# Verifier v5 — Lyra the Pyromancer (4th controllable party member)

Created: 2026-07-27. Measures the v5 slice: a fourth fully-controlled party member
with her own rescue event, turn phase, skills, KO path, equipment slot, and HUD bars.

## Acceptance criteria

1. **Rescue event is earned**
   - `lyra_rescue` interactable exists in the Hollow Deep ONLY after `wardenDead`.
   - Using it while the Warden lives does nothing (verified blocked).
   - Rescue sets `lyraJoined`, fires a story toast, and triggers a 2-enemy guard ambush.
2. **Full party turn cycle** — battle turn order is
   player → Serah → Kael → **Lyra** → enemy, each with their own controllable menu.
   Verified via turn-indicator text for all four actors in one battle.
3. **Lyra stats & skills** — `lyraStats()` scales from player level (glass-cannon:
   45% HP, 80% MP, chainMax 2); 4 skills (Emberbolt / Cauterize / Cinderstorm /
   Immolation); casting Emberbolt spends 6 MP and logs damage with fire FX.
4. **Party integration**
   - Lyra model (orange robe + glowing staff) spawns in battle only when `lyraJoined`.
   - `lyra-bars` HUD (HP/MP) shows in battle, dims on KO; KO collapse animation path
     exists and prevents her turns.
   - All enemy target pools (single-target, Seismic Slam, Chain Lightning) include Lyra.
   - Post-battle recovery to ≥50% HP like other allies.
5. **Equipment** — `lyraWeapon` slot in the equipment panel (🔥 Lyra);
   **Alt-click** a weapon in inventory equips it to Lyra (Ctrl→Kael unchanged);
   tooltip hint updated; old saves migrated (`player.lyra` backfill in `load()`).
6. **Stability** — zero pageerrors across the scripted flow; node --check passes.
7. **Regression** — test_quests.py (Act-I chain) and test_peaks.py (Stormpeak) still
   pass their hard gates.

## How to run
```
cd /mnt/agents/output/app && python3 -m http.server 8123 &
cd /mnt/agents/output && python3 test_lyra.py     # criteria 1-6
python3 test_quests.py && python3 test_peaks.py   # criterion 7
```
Screenshots: shots/70_lyra_cell.png, 71_lyra_turn.png, 72_lyra_cast.png.
