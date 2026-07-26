# Verifier v8 — Mirewood Bounty Board (repeatable town contracts)

Created: 2026-07-27. Measures the v8 slice: a physical bounty board in the town with
rotating kill/elite/salvage contracts, tracked progress, and claimable rewards.

## Acceptance criteria

1. **Board exists in town** — `bounty_board` interactable near the well, hint shows
   `E — Read the Bounty Board`; E opens the bounty modal.
2. **Offers** — 3 contracts generated (2 kill-family + 1 elite-or-items), each with
   count, flavor label, and gold pay; persisted in flags (`bountyOffers`).
3. **Accept** — one active contract at a time; accepting stores the bounty + base
   counters; ACCEPT buttons disable while one is active; tracker (quest HUD) shows
   the active bounty with live progress.
4. **Progress** — kill-family bounties track real engine kills via new per-kind
   counters (`kill_<kind>`, `killname_<name>` in removeEnemy); elite/items variants
   track existing counters; completion fires a one-time `bountyReady` toast.
5. **Claim** — CLAIM REWARD enabled only at full progress; pays gold + a magic item,
   clears the bounty, and posts fresh contracts.
6. **Stability** — zero pageerrors including the 12s-respawn-after-zone-change path
   (pre-existing crash fixed: respawn timer fired in enemy-less zones).
7. **Regression** — test_quests.py hard gates still pass.

## How to run
```
cd /mnt/agents/output/app && python3 -m http.server 8123 &
cd /mnt/agents/output && python3 test_bounty.py    # criteria 1-6
python3 test_quests.py                             # criterion 7
```
Screenshots: shots/95_bounty_board.png, 96_bounty_accepted.png, 97_bounty_claim.png,
98_bounty_paid.png.
