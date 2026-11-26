# WORLD-04-FINAL · iPhone acceptance corrections

The owner validated nine of eleven checklist items on a physical iPhone. This round addresses military order clarity and save visibility, with a [separate study of the unchanged combat rules](WORLD-04-COMBAT-STUDY.md).

- The order preview shows the selected unit, strength, origin, destination, execution week, persistence, risk and replacement procedure. Only the player’s own latest combat observations are shown as enemy information. Current defender strength and a current ratio are unavailable under the existing disclosure rules.
- **Continuing attacks** identifies active orders. **Stage stop** replaces the attack with a pending Defend order that applies at the next settlement. Pending orders can be removed individually. The latest results remain separate and flag attacks that are still active.
- The old UI displayed success inside the Scenario menu. That fully explains why a successful save could be missed after leaving the menu. No separate Safari storage defect was reproduced. The global indicator stays visible during play and reports. It shows saving, confirmed success or failure, and retains the last successful week and local time. The optional timestamp is stored inside the checksummed SAVE-01 payload and represents the checkpoint’s save time. Success is emitted only after the IndexedDB transaction completes. Old saves show their week with the time marked unavailable. The database, origin isolation, and stale-tab compare-and-replace logic are unchanged.

## iPhone recheck

1. Start France and open **Military orders**. Pick a division in Nord-Est and choose a land attack. Check the expected week, persistent warning and unavailable enemy ratio before staging. Remove the pending order and stage it again.
2. Advance one week and read the report. If the attack is still active, open **Continuing attacks**, stage a stop and advance. Confirm the order is now Defend and the division did not attack again.
3. Tap **Save now**, leave the Scenario menu and check **Saved locally** with the week and time. Close and reopen Safari on the same review origin and confirm the same checkpoint. Repeat a normal turn in landscape and check the status remains visible during the report.

The preview uses the approved draft.3 package. Existing performance thresholds and the unchanged GAME-UX-01 test still apply.

## Verification

- App and engine typechecks passed. Standard and review production builds passed. Game tests passed 165/165, engine tests passed 218/218 and the 10,000-week engine test passed.
- All six countries passed the Chromium review at 390×844 and 844×390. New browser checks passed at both sizes, covering order preview, pending removal, an active attack and its staged stop, save acknowledgment held until transaction completion, timestamp restoration and a quota failure that retained the last successful receipt.
- SAVE-01 and GAME-UX-01 passed on this run without modifying their scripts or timeouts. The known intermittent Week 2 report timeout remains documented in the [prior review](WORLD-04-FINAL-REVIEW.md).
- Build audit found zero scenario files in the standard output and exactly eight approved draft.3 package assets in the review build. The scenario packages, licensing files, deployment workflow, combat resolver and engine are unchanged.
