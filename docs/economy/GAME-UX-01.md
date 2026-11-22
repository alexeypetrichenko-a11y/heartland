# GAME-UX-01 — Weekly turn report

**Next week** opens the report after the game and economy commit together. At the first advance, the game enters week 2 and opens **Week 1 report**. A rejected turn leaves the week, drafts, and last successful report in place. Close the report with **Back**, or use the game navigation. **Open weekly report** is available in the scenario menu and in the Economy panel after a turn settles.

## What the report uses

- The economy integration API supplies weekly real GDP, treasury, budget, debt, inflation, unemployment, stability, and the goods it identifies as scarce. The report uses the reported debt-to-GDP ratio and shows annualised GDP growth when the engine has enough observations. Money is in illustrative units.
- The change labels compare two settled observations. Rate differences use percentage points. An occupation or loss of control changes which territory the GDP figure covers, so the report calls out the changed coverage.
- Applied fiscal rates compare the engine's before-and-after policy. The report also lists the tax rates and GDP spending shares that stayed in force after the week. The budget and indicator movements describe the same week without attributing them to an individual rate change.
- When ECON-07 reports a treasury surplus returned to households, the report shows the amount under government expenditure. The engine's expenditure total already includes the return. Sovereign default alerts use the engine's wording for voluntary or forced defaults.
- Priority alerts use the engine's own event severity for defaults, credit market disruption, unrest, defeat, and occupation. Further events and significant shortages are available in the expandable sections. The diplomacy section respects bilateral offer visibility. Combat and movement use the existing military records. Region links show current control in the fictional game.

## History and save compatibility

The latest and up to three earlier reports can be reopened during the same game session. Reloading reconstructs the latest report from the saved game, economy summary, and prior figures. Earlier reports are retained in memory for the active session.

The original SAVE-01 envelope stays at version 1. Its `previous` record accepts an optional `comparison` with its own version and a small set of previous observations from `CountryEconomyView`. With an older save, the opening treasury and settled events are available. Missing prior rates and indicators are left out of comparisons. Unsupported comparison data leaves the playable save intact. Economy engine serialization still uses its integration API. [Local save format](../saves/SAVE-01.md)

ECON-07 restores a pre-update economy with its original calibration. The next successful save uses engine state v6 and retains those parameters. Fresh games use the ECON-07 starting save. [ECON-07 integration review](../../economy-engine/ECON_07_REPORT.md#15-final-integration-review-with-save-01-after-owner-approval)

## Verification

- Synchronized with `main` at `84f8a53`. The engine directory matches `main`. The production build, 156 game tests, 205 engine tests, the 10,000-week engine check, type checking and starting-save verification passed.
- The fictional game completed 52 turns for each of Alden, Belora and Cyrin. Checkpoints at week 27 produced the same reports, game state, and economy fingerprints as uninterrupted play through week 53.
- Production Chromium checks covered the report at 320×568, 390×844, 844×390 and 1440×900. Closing and reopening the browser with the same profile restored the latest report and pending drafts. A pre-ECON-07 save kept its original parameters through a rejected turn, a successful turn and reload. A fresh game used the ECON-07 values, and its report matched the engine's saved figures.
- Fiscal controls, local saves, map navigation and country and region selection browser regressions passed.
- Physical iPhone Safari review is pending.

## iPhone acceptance

1. Open the isolated build in Safari. Start or resume the fictional scenario. In **Economy → Fiscal policy**, change two rates and tap **Next week**.
2. Confirm the report opens for the week just completed. Compare the applied rates with the drafts and expand **Economy** to inspect the budget and indicators. In landscape, check that the report scrolls inside the viewport and **Back** is accessible.
3. Close the report and propose an out-of-range rate. Tap **Next week**. The game should keep the same week and display the validation message. Open the last report through **Scenario menu → Open weekly report**.
4. Clear the invalid draft, stage a diplomatic action or military order, and advance again. Inspect the outcome and use **Recent reports** to revisit the earlier fiscal decision.
5. Wait for **Saved locally** in the scenario menu. Close Safari, reopen the same URL, and tap **Resume game**. Reopen the latest report from the scenario menu and confirm that the figures, rates, and events match the saved week.
