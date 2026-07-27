# Starforged of the Fallen Star

A browser RPG that is built on timed-press **Addition** combat
(timed button presses chain attack combos, Starheart transformation) with
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
| M | **Waystone network** (when standing at a waystone) |
| Shift-click weapon | Give to **Serah** · Ctrl-click weapon → **Kael** |
| Esc | Close panels / Pause |

## The world — 7 zones, one road
You begin in **Mirewood Hollow**, the safe haven: three merchants with buy/sell
shops, five wandering NPCs, a quest-aware Elder, the bounty board — and the hub
**waystone**. From there the journey runs:

> **Mirewood Hollow** → **Whisperwood** *(forest, river, the ruined shrine)* →
> *side road:* **Emberstrand Coast** → **The Sunken Grotto** *(crystal caves)* →
> *side road:* **The Hollow Deep** *(torch-lit prison, the Warden)* →
> **The Star Crater** *(Act-I finale)* → **Stormpeak Ascent** *(post-Act ascent,
> live snowfall and lightning)*

Each zone is reached by the **portal at the end of the previous one**, and every
portal is **quest-gated** — the network panel tells you exactly which quest still
bars each way. Every zone also holds one **waystone**: stand at it once to attune
it, and from then on you can travel between any two attuned zones from anywhere,
arriving on the destination's steps. Death returns you to the hub.

You are never left guessing where to go: the quest tracker prints a **NEXT ▸** line
naming the objective and the zone it lives in, and the minimap rides a **gold
chevron** on its rim pointing at it. Every battle arena re-tints itself to match
the zone you fight in.

## ACT I — "The Fallen Star" (full depth)
Six main quests with unique mechanics, three side quests, four mini-bosses and
a two-phase Act boss:

1. **Awakening** — slay 3 fiends, then claim the Spirit Shard at the shrine
2. **The Sylvani's Trial** — riddle puzzle: attune 3 crystals in the verse's order
   (wrong order resets; each attunement ambushes you)
3. **Herald of Shadows** — the Herald is 85%-shielded until you destroy 3 Shadow
   Anchors; then the mini-boss fight (unlocks **Kael the Lancer**, 3rd party member)
4. **Drowned Relics** — find 4 relics across the Sunken Grotto; the Tyrant only
   surfaces when all 4 are found
5. **The Tyrant** — mini-boss with an enrage phase below 30% HP
6. **The Fallen Star** — forge the Star Key, enter the crater, destroy
   **MALVETH** — two-phase Act boss (shadow form → Dragon Avatar at 50% HP)

Side quests: **Elite Hunter**, **Hoarder**, and **Echoes of the Storm** — the
post-Act ascent of Stormpeak: attune 3 Storm Sigils *in any order* (each
ambushes you), then face **The Stormcaller** at the summit shrine (enrage +
party-wide **Chain Lightning** unique, guaranteed Unique drop).

## Systems
- **LOD combat:** **named Addition chains** — four per class, each with its own
  beat count, timing window, ring speed and elemental finisher, from the
  forgiving 3-beat *Whirlwind Sting* to the 6-beat *Blazing Dynamo*, whose
  PERFECT window is barely half as wide.
  Chains **level from use** (Mastery 1–5, +7% damage a level), switch as a free
  action mid-battle, and a chain that lands every beat detonates its finisher.
  Plus the Spirit meter and Starforged transformation (+60% dmg, +2 beats,
  Starforged-only skills, energy wings)
- **Elemental affinity:** every hit has a school, and affinity multiplies through
  **family × zone × boss** — wraiths burn but shrug off arcane, golems resist
  steel but conduct lightning, the crater is fireproof, the Stormcaller is all
  but immune to its own storm. Hits report **WEAK**/**RESIST**, and the enemy's
  affinities sit above the arena all fight
- **Ailments:** burn · poison · bleed · chill · shock · curse, ticking on the
  enemy *and* the party — damage over time, weakened blows, lost turns — with
  live chips on every party frame. Healers cure what they are good for
- **Resistances:** four elemental ward affixes plus all-resist and
  Addition-damage rolls, three uniques built around them, 75% cap, allies
  inherit half the leader's wards
- **Full party control:** you, **Serah** (bow, Sylvan Light heal, Tailwind),
  **Kael** (spear, Bulwark, Dragonslayer) and **Lyra** (fire caster, Cauterize,
  Immolation) each take controlled turns with their own chains, skills and
  KO/revive — and their own equipment slots
- **Enemy unique attacks:** Savage Bite, Void Bolt, Seismic Slam, Cursed
  Flourish, Chain Lightning — per family and per boss, with banners/anim/SFX
- **D2 depth:** 3 classes × 3 skill branches, STR/DEX/VIT/ENE with derived
  stats, Normal/Magic/Rare/Unique loot with prefix+suffix affixes, 8+2 equip
  slots, elites/champions, magic/gold find, life leech, potions, save/load
- **Gear on characters:** equipped weapons (sword/dagger/staff/spear), shields,
  tiered helms (cap → great helm → winged Starforged helm), boots/armor rarity
  tints — all live on the 3D model, in and out of battle
- **World life:** procedural texture factory (grass/snow/stone/wood/water…),
  day-mood lighting per zone, falling leaves, gulls, torch flicker, cave drips,
  snowfall + lightning storms, NPC wander AI, minimap, quest tracker, zone
  title cards, item-compare tooltips

## Repo layout
- `app/` — the game (plain HTML/CSS/JS, zero build step). `js/combat.js` holds the
  shared rules engine — affinity tables, ailments and Addition definitions — kept
  out of `battle.js` so the maths can be tested without a live scene
- `docs/PLAN.md`, `docs/AGENT_BRIEF.md` — design plan & per-system briefs
- `tests/` — Playwright suites: full Act-I quest-chain, coast/Kael/party, Lyra,
  gear visuals, battle FX, bounty board, the Stormpeak endgame chain, and
  `test_combat_depth.py` (Additions, affinity, ailments, waystone network)
- `verifier/` — versioned acceptance criteria (v1–v9) + timestamped run logs
- `scripts/fetch_three.sh` — restores vendored Three.js r128
