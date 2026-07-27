# v9 acceptance — Additions, Affinities, Ailments + the Waystone Network

Two passes shipped together: a combat-systems pass that gives the LOD and D2 pillars
the depth they were missing, and a world-flow pass that gives the game a spine.

## A. Combat depth

### A1 — Named Additions
- [ ] Each class has **4 named Addition chains** with distinct beat counts, damage
      weights, ring speeds and timing windows; longer chains have *tighter* windows.
- [ ] Only the starter chain is available at level 1; the rest unlock at levels 4 / 9 / 15
      and are announced on the level-up screen and as a toast.
- [ ] The battle menu's first button **names the equipped chain** and shows its beats,
      mastery level and finisher school. A second button switches chains as a **free action**.
- [ ] A chain that lands **all** its beats fires an **elemental finisher** for ~45% of the
      chain damage, with its own banner, FX and (usually) an ailment.
- [ ] Whiffing the opening beat still lands a **glancing blow** — a turn is never fully wasted.

### A2 — Addition mastery
- [ ] Every chain thrown is counted; mastery rises **1→5** at 6 / 16 / 34 / 60 uses,
      worth **+7% chain damage per level**.
- [ ] Mastery is credited even when the chain is the killing blow.
- [ ] A level-up shows a banner + toast, and the counters are listed on the character sheet.
- [ ] `player.additions` and the selected chain survive save/load.

### A3 — Elemental affinity
- [ ] Every point of damage carries a school (phys / fire / ice / lightning / arcane).
- [ ] Affinity multiplies through **family × zone × boss**: wraiths burn but shrug off
      arcane, golems resist steel but conduct, the peaks are frozen through, the crater is
      fireproof, and the Stormcaller is all but immune to lightning.
- [ ] Hits report **WEAK** / **RESIST** on the floater and in the log.
- [ ] The enemy's notable affinities are shown as pips above the arena for the whole fight.

### A4 — Resistances
- [ ] Four resistance affixes plus `of the Bulwark` (all-resist) and `of the Duelist`
      (Addition damage) roll on gear; three new uniques are built around them.
- [ ] Resistances cut incoming elemental damage, cap at 75%, and are shown on the
      character sheet. Allies inherit **half** the leader's wards.

### A5 — Ailments
- [ ] Six ailments — burn, poison, bleed, chill, shock, curse — tick per turn on the
      enemy **and** on the party, with DOT, outgoing-damage multipliers and turn skips.
- [ ] Chips with turn counters render on the enemy strip and on each party frame, and
      stay live regardless of which code path changed them.
- [ ] Enemy specials inflict them (wolf bite → bleed, void bolt → arcane, chain lightning
      → shock); healers cure what they are good for.

## B. World flow — the Waystone Network

### B1 — The game opens in town
- [ ] A new run starts in **Mirewood Hollow**, on the square, facing the well — shops,
      the bounty board and the Elder are the first things on screen.
- [ ] Death returns you to the hub instead of dumping you at a forest coordinate.

### B2 — Waystones
- [ ] Every zone has **one waystone**. Mirewood's is attuned from the first step; the rest
      are dark until you stand at them once and press E.
- [ ] Dormant stones read as dormant (dimmed halo, pulsing light) and as a hollow diamond
      on the minimap; attuned ones are filled.
- [ ] Attunement is stored in `flags.waystones` and survives save/load.

### B3 — The network panel
- [ ] E (or M) at an attuned stone opens a panel charting **all seven zones** in journey
      order with role, level band and state: *you are here* / *travel* / *not yet attuned* /
      *sealed, and exactly which quest unseals it*.
- [ ] Travel lands you **on** the destination stone, inside its interaction radius.
- [ ] Sealed and un-attuned zones cannot be travelled to.

### B4 — Direction
- [ ] The quest tracker prints a **NEXT ▸** line naming the objective, the zone it is in,
      and how to get there.
- [ ] The minimap draws a **gold chevron** on its rim pointing at the current objective —
      the nearest live one for "any of these" objectives (anchors, relics, sigils).
- [ ] Quest interactables and the waystone are marked on the minimap.

## C. Regression
- [ ] Full Act-I chain (Q1 → Melbu, both phases), Stormpeak chain, bounty board, gear
      visuals, battle FX, coast/Kael — all green, zero page errors.
