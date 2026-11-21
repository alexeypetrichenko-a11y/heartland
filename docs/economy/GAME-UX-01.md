# GAME-UX-01 — Weekly turn report

**Next week** opens the report after the game and economy commit together. At the first advance, the game enters week 2 and opens **Week 1 report**. A rejected turn leaves the week, drafts, and last successful report in place. Close the report with **Back**, or use the game navigation. **Open weekly report** is available in the scenario menu and in the Economy panel after a turn settles.

## What the report uses

- The economy integration API supplies weekly real GDP, treasury, budget, debt, inflation, unemployment, stability, and the goods it identifies as scarce. The report uses the reported debt-to-GDP ratio and shows annualised GDP growth when the engine has enough observations. Money is in illustrative units.
- The change labels compare two settled observations. Rate differences use percentage points. An occupation or loss of control changes which territory the GDP figure covers, so the report calls out the changed coverage.
- Applied fiscal rates compare the engine's before-and-after policy. The report also lists the tax rates and GDP spending shares that stayed in force after the week. The budget and indicator movements describe the same week without attributing them to an individual rate change.
- Priority alerts use the engine's own event severity for defaults, credit market disruption, unrest, defeat, and occupation. Further events and significant shortages are available in the expandable sections. The diplomacy section respects bilateral offer visibility. Combat and movement use the existing military records. Region links show current control in the fictional game.

## History and save compatibility

The latest and up to three earlier reports can be reopened during the same game session. Reloading reconstructs the latest report from the saved game, economy summary, and prior figures. Earlier reports are retained in memory for the active session.

The original SAVE-01 envelope stays at version 1. Its `previous` record accepts an optional `comparison` with its own version and a small set of previous observations from `CountryEconomyView`. With an older save, the opening treasury and settled events are available. Missing prior rates and indicators are left out of comparisons. Unsupported comparison data leaves the playable save intact. Economy engine serialization still uses its integration API. [Local save format](../saves/SAVE-01.md)

## Verification

- All 155 game tests, 190 economy-engine tests, the 10,000-week engine check, and the production build passed. Report tests cover observed figures, accepted and rejected decisions, diplomacy visibility, occupation, engine alert severity, defeat, missing data, and older saves.
- Production Chromium checks exercised the report at 320×568, 390×844, 844×390, and 1440×900, including expanding details, revisiting earlier reports, refreshing a saved game, following an occupation link, and viewing restored defeat. The fiscal, save, and geographic browser regressions also passed.
- Physical iPhone Safari review is pending.

## iPhone acceptance

1. Open the isolated build in Safari. Start or resume the fictional scenario. In **Economy → Fiscal policy**, change two rates and tap **Next week**.
2. Confirm the report opens for the week just completed. Compare the applied rates with the drafts and expand **Economy** to inspect the budget and indicators. In landscape, check that the report scrolls inside the viewport and **Back** is accessible.
3. Close the report and propose an out-of-range rate. Tap **Next week**. The game should keep the same week and display the validation message. Open the last report through **Scenario menu → Open weekly report**.
4. Clear the invalid draft, stage a diplomatic action or military order, and advance again. Inspect the outcome and use **Recent reports** to revisit the earlier fiscal decision.
5. Wait for **Saved locally** in the scenario menu and refresh. Resume from the globe, then reopen the latest report. Confirm that its figures, applied rates, and events match the saved week.
