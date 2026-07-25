# Agent Briefs (simulated sub-agent passes)

Each system was built as an isolated pass, then put through a critic loop:
**build → run → screenshot → harsh visual review → fix → repeat** until the
reviewer has no blocking notes left.

## Pass 1 — World Agent
Goal: forest overworld that reads instantly as a moody gothic-fantasy zone.
Acceptance: layered fog, 3-point lighting, animated sky, ground detail, props
(trees/rocks/crystals/ruins), player character with idle/run animation,
smooth orbit camera, no z-fighting, no visible seams.

## Pass 2 — Battle Agent (LOD)
Goal: turn-based battle with the Addition timed-combo system as centerpiece.
Acceptance: cinematic camera moves, shrinking-ring timing UI with hit/perfect
judgment, chain counter, damage numbers with juice (scale/pop), enemy telegraphs,
Dragoon transformation state, victory/defeat flow, XP+loot results screen.

## Pass 3 — RPG Systems Agent (D2)
Goal: Diablo II character depth at modern ARPG polish.
Acceptance: 4 attributes with live derived-stat panel, 3-branch skill tree per
class with prerequisites and point costs, item generator producing
Normal/Magic/Rare/Unique with affixes, 8-slot equipment paper-doll, inventory,
ground loot with rarity-colored beams, potions, gold.

## Pass 4 — UI/UX Agent
Goal: one coherent dark-gothic theme across every screen.
Acceptance: consistent palette + typography, HP/MP orbs, hotbar with cooldowns,
minimap, character sheet, skill tree, inventory, all reachable by hotkeys,
responsive layout, no dead buttons — every control does something.

## Critic protocol
For each pass the reviewer asks, blind: *"If this screenshot sat next to a
screenshot from a shipped game, would it look broken or placeholder?"*
Any 'yes' is a blocking note and gets fixed before the pass closes.
Known limits (declared honestly): assets are procedural (no hand-drawn art),
so the bar is 'cohesive stylized game' not 'AAA studio asset quality'.
