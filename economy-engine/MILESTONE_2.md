# Milestone 2: central banks, firm credit, bankruptcy and tier transitions

Status: **implemented on branch `feature/economy-engine-m2` (based on `feature/economy-engine-m1`), awaiting owner review.** Nothing outside `economy-engine/` was changed. Every number below is a provisional parameter, not an approved game rule.

## 1. What was built

### 1.1 Money and central banks (R07, R08, R09, R61)

Every unit of money in circulation is now a liability of a national central bank. The four quantities you asked to keep apart are separate fields in the state and in every weekly report (`CountryReport.centralBank`):

| Quantity | Meaning | Where |
|---|---|---|
| **Money supply** | Cash held by households, firms and treasuries. It always equals the sum of money issued by all central banks (checked every week). | `world.baseMoney`, report `world.money` |
| **Money issued** | The bank's liability: money it has put into circulation and not taken back. | `country.cbIssued` |
| **Reserves** | The bank's non-circulating assets (gold and foreign reserves). They back the money that was not created by lending. | `country.cbReserves` |
| **Outstanding loans** | Loans to its own state (`cbStateLoans`) and to firms (`firm.loan`, with the lending bank in `firm.lender`). | state and report |
| **Capital (equity)** | Reserves + loans − money issued. It sets the lending capacity: total loans ≤ capital ÷ 10% (R61). | report `equity`, `lendingCapacity` |

**Accounting entries.** Money changes **only** through these recorded operations, and the weekly audit checks that money in circulation equals money issued, to within 1e-9:

| Operation | Effect |
|---|---|
| Lending | loans +, money issued + |
| Interest received | money issued −; capital + |
| Repayment | loans −, money issued − |
| Profit paid to the treasury (75% of each week's profit) | money issued +; capital − |
| Bad loan written off | loans −; capital − (no money moves) |
| Exceptional creation on command | money issued +; capital − |

**What each bank does each week:**
- **Policy rate (automatic, R09).** It reacts to inflation and unemployment, and rises when lending capacity is nearly used up.
- **Lending to its own state (R07).** It covers what the bond market could not supply, with the state served before firms, and only while the state still has market access.
- **Lending to firms** from the capacity that remains.
- **Open-market operations.** It buys its own state's bonds from the households that hold them, or sells them back, so that money grows with real output at the 2% inflation target. Households exchange bonds for money; nobody receives anything for nothing.
- **Exceptional creation only on the player's command (R08, R43).** The command is `{ type: 'create-money', countryId, amount }`:
  - it has no ceiling;
  - it is recorded as `moneyCreation` in the budget and as a `money-created` event;
  - it lowers the bank's capital;
  - it raises the country's risk premium, which fades over three years.

  The AI never uses it.

### 1.2 Firm credit and bankruptcy (R31, R57)

**Starting debt.** Each firm aggregate starts with bank debt of 10% of the replacement value of its plant, owed to its national central bank.

**Borrowing.** Firms borrow for three purposes:
- **Investment:** about 10% of every investment is loan-financed; the share is larger when credit is cheap and smaller when it is dear.
- **Working capital:** when a week's wages and inputs would exceed their cash.
- **Cash floor:** to get back above it.

**Limits on credit:**
- debt may not exceed 30% of plant value;
- banks lend less to firms in poor financial health;
- a firm can only borrow if its central bank still has capacity.

**Paying it back:**
- interest is paid weekly, and loans are repaid as fast as the plant securing them wears out;
- debt above normal leverage is repaid before any dividend;
- unpaid interest is added to the debt; there is no automatic restructuring (R31).

**Distress.** An aggregate is in distress in any week when:
- it cannot pay its wages or debt service; or
- it keeps losing money while its debt, net of cash, exceeds what its plant would fetch in a liquidation (balance-sheet insolvency).

Each week of chronic heavy losses also counts as 1/13 of a distress week.

**Liquidation (R31).** After 8 distress weeks:
- At least 20% of the aggregate fails, fragile tier first. A very small aggregate is wound up in one go.
- The failed plant is sold at 30% of its replacement value to other private or mixed firms of the same sector and zone that have spare cash; otherwise it is scrapped.
- The failed firms' cash and the sale proceeds repay the bank as far as they go. The rest of their debt is written off as a loss to the bank's capital.
- Their jobs disappear with the plant, and a `firm-bankruptcy` event records the debt, the amount recovered and the amount written off.

**Owners.** Private owners stop rescuing firms whose health is below −0.5. Public firms are never liquidated: the state keeps supporting them.

### 1.3 Performance-tier transitions (R58)

Each aggregate has a financial-health score from −1 to +1. It combines realised profit against the sector norm, debt pressure and distress. That score moves the aggregate's target tier mix:
- healthy firms modernise towards the strong tier;
- stricken firms slide towards the fragile tier.

Capacity drifts 1% of the way to that target each week, and total capacity is unchanged. Routine replacement keeps a plant in its tier; expansion joins the average tier (as in Milestone 1). At a resting point the target is the sector's normal mix. The Milestone 1 drift is gone: over 100 years the tier mix stays at about 23/52/25, against 22/50/28 at the start.

### 1.4 Strategic reserves (C4) and reporting

- **Storage costs real money (R13).** Stored reserves cost 0.2% of their value per week, paid to warehouse workers in the country, and they age at half the good's normal spoilage.
- **Reserve purchases no longer crowd out the core budget.** They are paid only from cash left after the core budget (administration, social, military, infrastructure, procurement), so filling the stores can no longer cut schools and hospitals.
- **Reserve decisions use what buyers normally pay.** They now compare current prices with a slow average of what buyers pay, freight and tariffs included (new `zoneGood.refBuyPrice`). Before, import-dependent countries were treated as if in permanent scarcity: they never restocked, and their reserves decayed once ageing was added.
- **Better scenario reporting.** Scenario 6B (overspending) now reports multi-year averages, an event count and a chronological timeline instead of relying on a single final snapshot. Timelines appear in `reports/SCENARIO_REPORTS.md`.

Code:
- **New file:** `src/core/credit.ts` (central-bank ledger and policy, firm credit, bankruptcy, tiers).
- **Changed:** `finance.ts`, `planning.ts`, `production.ts`, `market.ts`, `step.ts`, `stats.ts`, `state.ts` (save version 3), `rebase.ts`, `commands.ts`, `selectors.ts`, `model.ts`, `builder.ts`, `defaults.ts`, `types.ts`, `ai/autopilot.ts` (debt now includes central-bank loans), and `sim/scenarios.ts` / `sim/run-scenarios.ts` (reporting).
- **New tests:** `tests/credit.test.ts` (16).

## 2. Confirmed defects

| Defect | Status |
|---|---|
| **C1 Money created without authorisation** (2.9% a year given to treasuries) | **Fixed.** The world money rule is deleted. With all normal bank operations switched off, the money supply stays constant to 1e-9 for 200 weeks (test). Money now grows only through bank lending and bond purchases, which are claims that must be repaid, or through the explicit command. |
| **C4 Reserve cycling "money pump"** | **Diagnosis corrected, real defects fixed.** Re-measured with cash-flow tracking: the reserve operations themselves *lose* money (Sundara: about 5,300 spent on purchases and storage, about 4,700 recovered from sales, a net loss of roughly 500 even counting the larger stock left). Debt fell only because fast purchases caused deficits and the loss of market access, which forced repayment through austerity: GDP −25%, two regime changes, unemployment peaking at 70%. My earlier audit called this a money pump; that was wrong. The genuine flaws behind it are fixed (§1.4), and two regression tests pin the result: reserve operations cannot raise net worth, and large-scale cycling has heavy costs. |
| C2 (occupation), C3 (serial defaults) | Not in Milestone 2; unchanged. C3 is visible in scenario 6B (three defaults in ten years). |

## 3. Tests and benchmarks (all produced by running the code)

| Check | Result |
|---|---|
| Type-check, full and core-only | pass |
| Engine fast suite `npm test` | **112 / 112 pass**: 96 earlier tests (four adapted, below) and 16 new |
| Engine long test (10,000 weeks, save/restore at 5,000) | pass |
| Ten mandatory scenarios | **10 / 10, every check passes** |
| Legacy 7-good world, 20 years, autopilot | inflation −0.7% to 4.6% (mostly 1–2%); average-country unemployment peak 6.7%; scenario 1 (same 20 years): 0 defaults, 0 regime changes; 0 bankruptcies in a separate 10-year count |
| 31-good world, **100 years** | conservation error ≤ 1.4e-14; 0 defaults, 0 regime changes, 0 bankruptcies; inflation −0.9% to 3.6%; worst country-week unemployment 14%; firm debt 13–14% of GDP; banks use about a third of their capacity; save/restore exact |
| Golden fingerprint | re-pinned to `cbae27a2ed468a59`; **identical in Node and headless Chromium** at 1×, 4× and 6× CPU throttle |
| Main game `npm test` / `npm run build` | 63 / 63 pass; build passes (untouched) |

**Adapted tests:**
- **Money-rule test.** The old test asserted the money rule's weekly cap; it now asserts that money changes only through central-bank operations.
- **Budget identity.** It now uses the new budget lines.
- **Treasury edits.** Two finance tests that set a treasury directly now book the change as money issued. Otherwise the new money audit correctly reports money appearing from nowhere.
- **Golden fingerprint** re-pinned.

**Speed** (desktop Node, audit on; `reports/BENCHMARK.md`):

| World | ms/week (Milestone 1 → 2) | Save gzip |
|---|---:|---:|
| 11 zones × 7 goods | 0.70 → 0.95 | 122 KB |
| 11 zones × 31 goods | 2.58 → 3.60 | 239 KB |
| **60 zones × 31 goods** | **36.5 → 42.1** | 759 KB |
| 120 zones × 31 goods | 122 → 154 | 1,390 KB |

Market clearing still takes 76% of the time at 60 zones. iPhone: still not measured. The estimate from CPU-throttled Chromium is roughly 0.15–0.25 s per weekly turn at 60 regions.

## 4. Changes in scenario behaviour (Milestone 1 → Milestone 2)

| Scenario | Change |
|---|---|
| 1 Stable economy | Mean world inflation 1.4% → 1.8%; worst unemployment 11.2% → 9.6%. |
| 3 Harvest collapse | Recovery to within 2% of control: 218 → **211 weeks**, no bankruptcies. The farms borrow through the crisis (debt +35%) and keep paying wages. Recovery is now limited by the shock itself: its yield recovers by 1/78 of the gap per week and is still about 3% short when GDP is back within 2%. **Note:** the farms' distress reached 5.5 of the 8-week threshold. A harvest failure lasting about 9 months longer would liquidate part of them. |
| 6A Default | Return to within 2% of control GDP: 88 → 72 weeks. |
| 6B Overspending | Tavros averages 97%, 96% and 94% of control GDP in years 2–4, 5–7 and 8–10, with stability about 46–52 against 70 and unemployment about 16%. Three defaults, no regime change. The timeline is in the report. |
| 8B Blockade | Consumption per head at 18 months with reserves: −2.7% → −5.3%. Food reserves now age and cost money to keep; they are still released (9.4 units, against 11.9 before). |
| 9 Prolonged crisis | Deeper trough (−52% → −59%), peak unemployment 48% → 55%, but faster return to 99% of control (944 → 898 weeks). Switching off firm credit or bankruptcy does not change the trough, so neither causes it. The likely cause is that treasuries no longer receive free new money in a crisis; **this is not verified**. |
| 2, 4, 5, 7, 10 | Small changes (≤ 2 points in most indicators). |

## 5. Provisional parameters (to approve or adjust)

| Parameter | Value | Note |
|---|---|---|
| Central-bank capital ratio | 10% | lending capacity = capital ÷ 10% |
| Starting headroom | 10% of yearly GDP | extra lending capacity at the start |
| Profit paid to the treasury | 75% | the rest builds capital |
| Policy rate | neutral 3% + 0.5 × (inflation − 2%) − 0.25 × (unemployment − 5%), +4 points when capacity is nearly used, 0.5–25%, moves 3% of the way each week | **Deliberately gentle.** A standard 1.5 / 0.5 rule produced 15% inflation swings and 35% unemployment, because the rate also sets firms' cost of capital. |
| Bond purchases | aim: money grows at 2% + real growth; at most 0.24% of the country's money per week, and half the outstanding bonds | normal monetary policy |
| Firm leverage | normal 10%, maximum 30% of plant value | normal leverage reacts to credit cost (×0.25 to ×2.5) |
| Firm loan rate | policy rate + 2 points | |
| Liquidation | after 8 distress weeks; at least 20% of the plant; sale at 30% of value | chronic losses count 1/13 per week |
| Owners stop rescuing | health below −0.5 | private owners only |
| Tier transitions | 1% of the gap a week; target mix shifts by up to ±40% of the normal shares | |
| Reserve storage | 0.2% of value per week; ageing at half normal spoilage | |
| Exceptional money premium | +0.5 × (recent creation ÷ yearly GDP), fading over 156 weeks | |

## 6. Remaining limitations

- **One shared currency.** National currencies and exchange rates (R36) are not implemented. An exporting country's bank can therefore withdraw more money than it issued, so its "money issued" goes negative. This is a net claim on other banks, documented, and permitted by validation.
- **No commercial banks.** Firms borrow directly from their central bank, as in R07.
- **No recapitalisation.** A bank whose capital is wiped out (large write-offs or a sovereign default on its loans) stops lending until profits rebuild it. Neither the state nor the player can recapitalise it yet.
- **Liquidated plant is mostly scrapped.** Buyers are limited to other private or mixed firms of the same sector and zone, and the state cannot yet buy liquidated assets (R32).
- **Prices ignore yield losses.** Price formation still ignores productivity losses from shocks; this predates Milestone 2. A sector hit by a permanent yield collapse is removed through losses and liquidation, not through higher prices.
- **Public firms behave like private ones apart from their owner.** The player-chosen objectives (R03), nationalisation and privatisation are not implemented.
- **Not implemented:** occupation (R62, C2), transport requisition (R63), energy substitution (R66) and serial-default costs (C3).
- **World building is slow.** A 60-zone world takes about 13 s to build on desktop; ship a pre-built starting state.
- Not verified on a real iPhone or in Safari.

## 7. Decisions for the owner

1. **Open-market operations.** Normal money growth comes from automatic bond purchases and firm lending, both limited by bank capital. Please confirm this counts as normal central-bank credit (R07, R61) and not as "exceptional" creation.
2. **The gentle policy-rate rule** (§5), and its reason.
3. **Liquidation rules:** public firms never liquidated; private owners stop rescuing below health −0.5; two years of chronic heavy losses lead to liquidation.

## 8. Proposed Milestone 3 (for approval; nothing implemented)

**State and ownership**, using the rules you clarified:

1. Public-firm objectives chosen by the player: profitability, maximum production, affordable prices, strategic supply (R03).
2. Nationalisation and privatisation as transfers between ownership aggregates, conserving assets and debts (R02).
3. The state buying liquidated assets without taking over the old debt (R32); recapitalising its central bank.
4. Serial sovereign defaults (C3): repeated defaults must carry growing financial and political costs. Central-bank losses already add some.
5. Tests and benchmark as before.

**Later milestones** (in proposed order): occupation and production control (R62, C2); transport requisition by itinerary (R63); limited energy substitution and electricity networks (R66); national currencies (R36).
