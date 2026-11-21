# INT-01 — The economic engine connected to the playable game

PR #26 is synchronized with `main` at `6c154c0`, including the owner's merge of MAP-UX PR #25. The single `economy-engine/` tree matches the approved handoff at `a09903d` byte for byte. PR #20's commits are already in that history. The integration uses contract 1.0.0 and awaits physical iPhone review. [PR #26](https://github.com/alexeypetrichenko-a11y/heartland/pull/26)

## What changed for the player

- **One economy.** The economy panel and the treasury in the header now show the economic engine's figures:
  - GDP and growth;
  - inflation and unemployment;
  - political stability;
  - weekly revenue, expenditure and balance;
  - treasury and public debt;
  - the central-bank policy rate;
  - the largest sectors and any shortages;
  - current tax rates and spending shares (read only);
  - the week's economic events.

  Money is in the engine's illustrative units.
- **Unavailable data is labelled.** Growth shows "Unavailable" until 26 weeks of data exist. Before the economy has loaded, the panel says "Preparing the economy…". If loading fails, it explains and offers "Try again".
- **The old Standard / Tax relief choice is gone** (decision A1). The seven direct tax and spending controls follow in INT-02.
- **Weeks are never refused for lack of funds any more.** The engine's approved rules apply instead: spending is cut when cash runs out, governments borrow, and they can default.
- **Next week** now resolves, in one atomic step:
  1. the staged diplomacy;
  2. the AI's decisions;
  3. military orders;
  4. the economic week, with the same week number.

  If anything is invalid, neither the game nor the economy changes, and the drafts stay.
- **Captures are occupations.** A military capture becomes an economic occupation: the captor controls the region's economy, but the region legally remains its owner's. The week's notice says so ("Amber Plain occupied").
- **Defeat.** If the player's regime is overthrown, the game ends. A banner explains it, and Next week is disabled.

## How it works

| Piece | Role |
|---|---|
| `src/game/economyRuntime.ts` | The only place that loads the engine (`economy-engine/src/integration/index.ts`) and the pre-built week-1 save (`economy-engine/scenarios/fictional-week1.economy.json`), by dynamic import, when a fictional game starts |
| `src/game/economyBridge.ts` | Pure turn logic. `startEconomy` uses `startEconomyFromSave` at week 1. `advanceGameWeek` uses `advanceWeekTogether`, running the game's own `advanceTurn` (diplomacy, AI, military) and then the economy with the regions' new owners. It imports only types from the engine. |
| `src/app/App.tsx` | Starts the economy when the player chooses a country. Keeps the session next to the game state. Commits both after each week, or neither. |
| `src/ui/EconomyPanel.tsx`, `src/ui/economyDashboard.ts` | Read-only panel; the dashboard file formats engine figures and computes nothing economic |
| `src/ui/PrototypePage.tsx` | Header treasury from the engine, the loading state, the header alert (critical events for the player, or defeat), Next week disabled while loading or after defeat |

**T06 migration (per `economy-engine/CODEX_HANDOFF.md` §3):**
- `Economy`, `EconomicPolicy`, `Country.economy`, `Country.economicPolicy` and the `set-economic-policy` command were removed from `src/game/models.ts`.
- `src/game/economy.ts` and its tests were deleted.
- The weekly budget and the insufficient-funds rejection were removed from `advanceTurn`.
- The economy fields were removed from the fixture.
- The tests that used the old treasury were updated: they now prove atomicity with invalid military or diplomatic orders.

The game state holds no economic figure at all.

## Verification

| Check | Result |
|---|---|
| `npm test` (game) | **141 / 141 pass** |
| `npm run build` (`tsc --noEmit` + Vite) | passes |
| Engine tests (`cd economy-engine && npm test`) | 190 / 190 pass (unchanged engine) |
| Week-1 save (`cd economy-engine && npm run starting-save -- --check`) | Byte-for-byte match, contract 1.0.0, session format v2 |
| Browser checks (`scripts/economy/check_int01.cjs`, Chromium, production preview) | all pass (below) |

New game tests:
- **`src/game/economyBridge.test.ts`:**
  - all three countries start from the week-1 save, identical to a freshly built economy, at week 1;
  - 52 weeks per country: the game and economy weeks stay identical, and the exact GDP and treasury change every week;
  - no treasury exists in the game state, and the treasury changes only through the engine's budget;
  - a real military capture becomes an occupation (legal owner kept) with a critical notice;
  - invalid military, economic and diplomatic input each reject the week with both states unchanged, and the next valid week is as if they never happened;
  - diplomacy, movement and combat give exactly the same game state as the game's own turn;
  - a defeated player cannot advance.
- **`src/ui/economyDashboard.test.ts`:**
  - the panel shows the engine's figures for each country, with growth explicitly unavailable in week 1;
  - after 30 weeks it shows the settled week and growth, and the figures have changed;
  - money formatting (one decimal, never "-0.0");
  - the news and header-alert rules.
- **`src/ui/economyLoading.test.ts`:** the static import graph from `src/main.tsx` (everything the globe loads) contains no engine module. The engine and the save are reachable only by dynamic `import()` from the runtime loader, which the app calls when a game starts.

**Browser checks** (`npm run build`, `npx vite preview --host 127.0.0.1 --port 4173`, then `node scripts/economy/check_int01.cjs`):
- Opening the globe and the country-selection screen made **no** request for economy code. Starting a game downloaded exactly the runtime, engine and save chunks.
- All three countries played **52 weeks** at 390×844 (touch), plus Alden at 844×390, Belora at 1440×900 and Cyrin at 320×568 (12 weeks):
  - every press advanced exactly one week, and the panel reported every settled week;
  - the displayed treasury or GDP changed in 45–50 of 52 weeks. At one decimal place a small weekly change can round away; the exact values change every week, per the bridge test;
  - growth appeared after half a year;
  - Alden's attack captured Amber Plain and was reported as an occupation;
  - no runtime errors and no horizontal overflow.

Additional production-build checks compared the displayed GDP, inflation, unemployment, treasury and public debt against the API for all three countries. Each session retained its week and values after returning to the globe and resuming. At 844×390, a test-only invalid tax command rejected the week, retained the military draft and preserved both states. The next valid attempt resolved the draft. The capture notice kept Belora as Amber Plain's legal owner, and the division moved back to Alden Vale on a later week.

A controlled test supplied the engine's existing stability effect through the test runner. The engine reported Alden's regime overthrow at week 28. The app showed defeat, disabled **Next week** and kept the final state available after returning to the globe. These checks used the built application and its real engine, with the invalid input and stability effect supplied only by the browser test.

The browser runner uses the military panel's Back button and recognizes Chromium's request for the app's absent default favicon. Other console errors still fail the run.

## Performance

| Measure | Result |
|---|---|
| App entry bundle | 239.2 KB (74.9 KB gzip) |
| Downloaded when a game starts | runtime 0.3 KB, engine and API 158 KB (51 KB gzip), week-1 save 186 KB (65 KB gzip) |
| Economy start (from "Start local scenario" to engine figures on screen, Chromium, local server) | 119–142 ms at 1× CPU, 304 ms at 4×, 480 ms at 6× |
| Next week (press to updated screen, median / worst) | 43–57 / 93–116 ms at 1×, 125 / 291 ms at 4×, 184 / 489 ms at 6× |

Chromium loaded the globe in 1.6–1.8 seconds on the local production server with software WebGL. Belora's retained JavaScript heap at weeks 1, 14, 27, 40 and 53 was 5.17, 7.11, 7.44, 7.70 and 7.81 MiB after garbage collection. DOM node counts stayed at 929 from week 14 onward. These samples cover one 52-turn session. Safari memory, GPU memory and device timings require physical testing. A cold game start fetches about 116 KB of economy code and save data when gzip is available.

## Limitations

- **Read only.** The panel is read-only: the seven fiscal controls are INT-02. Players cannot yet change taxes or spending, so the AI-free player country keeps its starting policy.
- **Starting adjustment.** In the first weeks the engine shows a price adjustment: annualised inflation of about 7–11% in week 1, settling later.
- **GDP and territory.** GDP and growth include occupied regions, so a capture raises the occupier's GDP and growth. The growth row says so.
- **Not saved.** Reloading the page resets the fictional game and its economy, as before; there is no save yet.
- **Invented data.** The economy's region profiles for the fictional world are invented illustrations (`economy-engine/src/integration/scenario.ts`). If the fixture in `src/game/initialState.ts` changes, the starting save stops fitting and must be regenerated in `economy-engine/`.

## iPhone review

GitHub Pages publishes `main`. The existing economy review site can host this branch through the connected Sites account. That upload requires owner approval for one short-lived Sites Git credential. Physical Safari review is still pending.

To test on an iPhone over a private Wi-Fi network, run these commands on a Mac or PC with Git and Node.js 24.

```sh
git clone --branch task/int-01-economy-integration https://github.com/alexeypetrichenko-a11y/heartland.git heartland-int01-review
cd heartland-int01-review
npm ci
npm run build
npm run preview -- --host 0.0.0.0 --port 4180 --strictPort
```

With the computer and iPhone on the same Wi-Fi, open the **Network** URL printed by Vite in Safari, including `/heartland/`. Keep the Terminal window open while testing.

1. Confirm the globe appears first. Tap **Fictional game**, choose a country, then tap **Start local scenario** and **Economy**.
2. Check the week-1 engine figures. Tap **Next week** once and confirm the header and Economy panel show week 2. Rotate the phone to landscape and inspect the values and controls.
3. Open **Scenario menu**, tap **Return to globe**, then **Resume game**. Confirm the same week and treasury.
4. As Alden, stage an attack on Amber Plain from **Military**. Advance until the occupation notice appears and confirm it names Belora as the legal owner.

Automated integration checks passed. Physical Safari review remains the merge gate.

## INT-02 proposal: the seven fiscal controls

**Scope.** In the Economy panel, replace the read-only "Fiscal policy" rows with controls:
- income, consumption and corporate profit tax rates;
- administration, social, military and infrastructure spending shares of GDP.

**Behaviour:**
- Start from `view.fiscal`. The limits come from `fiscalLimits` (0–70% for taxes, 0–50% of GDP for spending).
- Drafts are kept like other drafts and listed in the header drafts line.
- Build the commands with `fiscalCommands(player, changes)` for the changed controls only, check them with `checkEconomyCommands` on every edit (showing the engine's message), and send them as `advanceGameWeek(..., economyCommands)` with Next week.
- After the week, show the new values as current.

There are no other economic commands and no mappings from the old presets.

**Tests:**
- each control reaches `view.fiscal` the next week;
- an out-of-range value shows the engine's message and blocks the week only if it is sent;
- drafts survive section navigation;
- a refused week keeps the fiscal drafts;
- iPhone layout at 320–390 px with 44 px targets.

**Acceptance:** `npm test`, `npm run build`, browser checks at the usual sizes, and owner testing on iPhone.
