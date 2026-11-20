# Milestone 3: state and ownership

Status: **complete and ready for owner review** on branch `feature/economy-engine-m3` (based on `feature/economy-engine-m2`). Every check below passes. One known limitation remains open, as you decided (decision 5): the economy collapses after about 290 years in two of the three 100,000-week stress worlds (§2.2). Games of the intended lengths (52, 104 and 156 weeks) are stable and consistent (§2.3). Nothing outside `economy-engine/` was changed. Every number below is a provisional calibration parameter.

## 1. What was built

### 1.1 Monetary operations corrected (review decisions 1 and 2)

**Automatic bond purchases are removed.** In Milestone 2 each central bank bought government bonds to make money grow with GDP. That code and its parameters are deleted. Every central-bank operation now answers a real need:

| Operation | When it happens |
|---|---|
| Loan to the state | Only for a financing gap the bond market could not fill. Only while the state has market access. Within the bank's capacity **and** an ordinary limit of 10% of yearly GDP. |
| Loan to a firm | For investment (a share of each project), for working capital it lacks, or to get back above its cash floor. Within its credit limit and the bank's capacity. |
| Repayment | Loans to the state are **always** repaid in instalments over three years: no unlimited rollover. A state that still needs money must borrow again, under the same rules. Firm loans are repaid as the plant securing them wears out. |
| Profit to the treasury | Only profit beyond the capital the bank needs: capital for its loans plus room to lend 10% of yearly GDP. Never the bank's capital itself. |
| Exceptional creation | Only on the player's `create-money` command (unchanged). |

**Why the money stock still grows.** All money now starts as credit money: firms' starting bank debt equals the money held in their country, and normal leverage is 17% of plant value. As the economy's plant grows, firms borrow more, so money grows with real needs and is repaid when those needs shrink.

Three further fixes were needed to make this stable. They were found by running the model, not assumed:

- **Prices no longer follow the policy rate.** Normal prices now include the long-run return on capital, not this week's policy rate. Before, a rate cut lowered "normal" prices, which deepened deflation and invited further cuts: a self-reinforcing spiral.
- **Wages track productivity growth.** Pay now rises with each zone's productivity growth, as well as with labour-market tightness and recent inflation. Without this, unit costs and prices drift down as technology improves. With money now created only against real needs, that drift ended in a debt-deflation collapse after about 75–115 years.
- **Policy rule.** It keeps the gentle coefficients you approved (0.5 on inflation, 0.25 on unemployment). The rate now adjusts faster (10% of the gap per week instead of 3%), and firms' borrowing reacts less strongly to rates (0.5 instead of 2.0). The stronger borrowing response turned the credit cycle into a growing world-wide boom-bust cycle in very long runs.

### 1.2 Public firms (R03 and review decision 3)

**Objective per country and sector**, set by command `set-public-objective`:

| Objective | Production | Investment | Prices and plant |
|---|---|---|---|
| Profitability | As private firms | As private firms | As private firms |
| Maximum production | Served before other owners; keeps producing down to 70% of running cost | Accepts half the normal return | Never closes plant |
| Affordable prices | Keeps producing down to 80% of running cost | Normal | Gives up its return on capital, pulling the local price down in proportion to its share of capacity; no closures for losses |
| Strategic supply | Served before other owners; keeps producing down to 75% of running cost | Accepts half the normal return; rebuilds the zone's capacity towards local use | Never closes plant |

**Support and insolvency:**
- **State support is the default** and can be switched off per sector with `set-public-support`. Support tops up the firm's cash and pays down debt that exceeds what its plant would fetch. It comes from the treasury, limited to 1% of the treasury per zone and week, and is recorded as `firmSupport`.
- **Explicit recapitalisation:** `recapitalize-firm` pays treasury money into a public or mixed firm, as cash or to repay its bank debt.
- **Public firms can become insolvent.** Distress is judged after any support. Without enough support they are liquidated like private firms. Losses that result from the objective the state gave them don't count as chronic distress while the state pays for them.

### 1.3 Liquidation keeps recoverable assets (R31, R32)

- **Plant nobody buys at once is not scrapped.** The creditor bank takes it over and holds it for sale, booked at no more than it is still owed. Only the uncovered remainder is written off.
- **Held plant ages,** which is a loss for the bank.
- **Healthy private or mixed firms buy it** at its book price once there is demand for the capacity.
- **The state can buy it** with `acquire-assets` (R32), without taking over the old debt; the plant joins the public firms' average tier.
- **Visible to the game:** held plant appears in the zone view (`plantForSale`) and in the central-bank report (`assetsHeld`).

### 1.4 Nationalisation and privatisation (R02)

- **`nationalize`** buys a share of a zone's private (or mixed) firms in a sector. **`privatize`** sells a share of public firms to the zone's households.
- **Everything moves with the share and is conserved exactly:** plant in every tier, construction, unsold stock, cash, debt (with its lender), running costs, workforce and financial health.
- **The fair price** is plant at 60% of replacement value, plus cash, minus debt (never below zero). For nationalisation it is paid from the treasury to the private owners; for privatisation, from households (at most half their cash) to the treasury.
- **If the buyer cannot afford the whole share,** a correspondingly smaller share changes hands.
- **Limits:** only on the country's own territory. Firms owing different central banks cannot be merged.
- **Not implemented:** expropriation without compensation. It was not specified; that's a decision for you.

### 1.5 Central-bank recapitalisation

`recapitalize-central-bank` pays treasury money to the bank:
- the money **first repays what the state owes the bank**; only the rest becomes capital;
- the money is withdrawn from circulation;
- it is recorded as `centralBankCapital`.

A state therefore cannot borrow from its bank to raise the bank's own capital (tested).

### 1.6 Repeated sovereign defaults (C3)

Each default adds 1 to a default memory that fades over about 10 years. With memory m:
- a new default writes off only 55% ÷ (1 + m)² of the debt, and **nothing while the country is still shut out of markets** after its previous default;
- the stability shock and the reputation premium are multiplied by (1 + m);
- the output shock is multiplied by (1 + m), capped at 25%, and doesn't compound.

Ten declared defaults in five years (Norland):

| | Before Milestone 3 | Now |
|---|---|---|
| Debt / GDP | 82% → 0% | 89% → 29% (control 76%) |
| Debt written off by defaults 2–10 | most of it | nothing |
| Lowest stability | about 63 | 1 |
| Regime changes (defeat) | 0 | 2 |
| Real GDP vs control | −7% | −29% |

A single default works as before.

## 2. Tests, scenarios, stress and benchmarks (all produced by running the code)

| Check | Result |
|---|---|
| Type-check (full and core-only) | pass |
| Engine fast suite `npm test` | **146 / 146 pass**: the 131 tests of the review state, plus 15 new tests for the intended game lengths (§2.3). Golden fingerprint unchanged at `ef7dfc948cbe33b0` (not re-pinned). |
| Engine long test (10,000 weeks, save/restore at 5,000) | pass (kept unchanged) |
| Ten mandatory scenarios | **10 / 10, every check passes** |
| Games of 52, 104 and 156 weeks, calm and adverse, 7-good and 31-good worlds | **pass**, see §2.3 |
| Legacy world, 192 years (10,000 weeks), autopilot | inflation never beyond ±4.4% after year 2; worst country-week unemployment 13.6%; 0 defaults, 0 regime changes, 0 bankruptcies |
| 31-good world, 100 years | inflation within ±4.0%; worst unemployment 14.1%; 0 defaults, 0 regime changes, 0 bankruptcies |
| Very large shock (35% of Sundara's capacity destroyed) | settles: inflation volatility 2.8% in the first five years, 0.3% after 25 years |
| Stress harness `npm run stress` (100,000 weeks) | The harness's own checks pass in every world (conservation, finite numbers, exact save/restore). **Economically, 2 of 3 worlds collapse** after about 290 years: an unresolved limitation, see §2.2. |
| Benchmark `npm run bench`, browser bench | done, see §2.4 |
| Full check report `npm run test:report` (includes main game `npm test` and `npm run build`) | **all checks pass**: main game 63 / 63 tests, build succeeds (`reports/TEST_RESULTS.md`) |

**Golden fingerprint.** The review state failed this test only because an unused experimental wage parameter (`wageTargetAnchor`, default 0) was part of the saved settings. The parameter has been removed. The test passes again with the original pinned value, which confirms that no behaviour changed.

**New tests** (`tests/state.test.ts`, plus one in `tests/credit.test.ts`):
- **Public firms:**
  - each objective's effect: affordable prices, maximum production, strategic rebuilding;
  - insolvency under state support (survives, with a fiscal cost);
  - insolvency without support (liquidated; plant held by the bank);
  - explicit recapitalisation, with exact accounting.
- **Ownership and assets:**
  - nationalisation and privatisation conserve plant, construction, stock, cash and debt exactly, and create no money;
  - an unaffordable nationalisation transfers only the affordable share;
  - territory and validation rules;
  - the state's purchase of liquidated plant without old debt.
- **Normal versus exceptional money:**
  - no automatic bond purchases and unchanged bank reserves in a calm run;
  - money creation only on command.
- **Central-bank exploits:**
  - state credit never exceeds the ordinary limit and is repaid, not rolled over;
  - borrowing from the bank to recapitalise it adds no capital;
  - real recapitalisation raises capital exactly and withdraws the money.
- **Repeated defaults:** write-offs collapse after the first; growing costs; the memory fades.
- **Saves:** replay of state and ownership operations after save/restore is bit-identical, and validation covers the new fields (save version 4).

**Replaced test.** The Milestone 2 test "public firms are never liquidated" was replaced by "any aggregate in prolonged distress is wound up, public firms included", as required by your decision 3.

### 2.1 Changes in scenario behaviour (Milestone 2 → 3)

| Scenario | Change |
|---|---|
| 1 Stable economy | Mean inflation 1.8% → 0.2%; mean unemployment 2.7% → 5.6% (the natural rate is 5%); worst country-week unemployment 9.6% → 13.6%, in fast-growing Morvaine in year 4. Milestone 2's automatic money growth kept the world slightly overheated; without it the economy runs at its natural rate. The early rise in catch-up economies already existed before Milestone 1 (Morvaine 11% in year 5). |
| 3 Harvest collapse | Recovery 211 → 212 weeks. |
| 6A Default | Return to within 2% of control: 72 → 86 weeks. |
| 6B Overspending | Averages of 98%, 95% and 95% of control GDP in years 2–4, 5–7 and 8–10; 3 defaults; now **1 regime change** (repeat defaults cost more). |
| 8B Blockade | Real GDP after 18 months: −15.6% → −19.6% with reserves (−24.8% without). |
| 9 Prolonged crisis | Return to 99% of control GDP much faster (898 → 481 weeks); 7 regime changes (6 before). |
| 2, 4, 5, 7, 10 | Small changes. |

### 2.2 Stress harness (100,000 weeks): unresolved limitation

Results from `npm run stress` on the final Milestone 3 code (full table in `reports/STABILITY_REPORT.md`):

| World | Up to 10,000 weeks (192 years) | 100,000 weeks |
|---|---|---|
| Growing | passes: 0 defaults, 0 regime changes, worst unemployment 13.5% | **fails**: after about 290 years prices fall, debt explodes (max debt/GDP astronomically high), unemployment reaches 100% in places, 104,696 defaults and 16,184 regime changes in total |
| Stationary (no growth) | passes | **passes**: 0 defaults, 0 regime changes, inflation 0.00%, worst unemployment 6.4% |
| Zero-inflation target | passes, but prices drift down (price index 0.64 at 10,000 weeks) | **fails** in the same way: 22,677 defaults, 3,546 regime changes |

In every world, conservation (worst error 8.7e-12), bit-exact save/restore, finite numbers and bounded memory (state at most 354 KB, heap growth at most 2.6 MB) still hold.

**Cause.** Without automatic bond purchases, money grows only when firms and the state borrow for real needs. Over centuries this does not anchor prices firmly enough. Once prices start to fall, real debt burdens rise, borrowing shrinks further and the economy spirals down. Milestone 2 passed 1,000,000 weeks; this is a regression.

**Tried without success:** pay settlements anchored to the 2% target (an experimental `wageTargetAnchor` parameter at 0.25 and 0.5, since removed); a faster or stronger rate rule and weaker borrowing sensitivity; an autopilot that does not raise taxes in a slump (reverted).

**Status: accepted temporarily as a documented limitation (owner decision 5).** No automatic bond-purchase facility and no automatic exceptional money creation were added. The harness and its pass criteria are unchanged. Its automatic checks cover conservation, finite numbers and exact save/restore, and those pass. The collapse is visible in its tables (`reports/STABILITY_REPORT.md`, `reports/stability.json`). To reproduce it, run `npm run stress` in `economy-engine/` (about 5 minutes on this machine).

### 2.3 Intended game lengths: 52, 104 and 156 weeks

New tests `tests/horizon.test.ts`, with scenarios in `tests/horizon-scenarios.ts`. Each game runs from the start in both the 7-good and the 31-good world, with every government on the autopilot. Six scenarios:

1. **Calm.**
2. **Capacity destruction:** 35% of all plant in both Sundara zones destroyed in week 10.
3. **Energy shock:** energy output in Khazir, Ostmark and Verdania cut to 40% (recovering over a year), the Ocean East sea lane closed, and Norland, Verdania and Halcyon sanctioning Ostmark, from week 20 to week 72.
4. **Fiscal crisis:** Tavros overspends on social programmes and declares default in weeks 40 and 100.
5. **State intervention:** Norland nationalises half of heavy industry in Norland Core, sets maximum-production objectives and state support, recapitalises its central bank and privatises again in week 90. Sundara sets affordable-price objectives.
6. **All adverse shocks combined.**

Checked at weeks 52, 104 and 156 of every game:
- money, goods and bond ledgers conserved every week (worst error 5.4e-14);
- no negative or non-finite value, and the saved state validates;
- world inflation within −10% to 35% and output never below 75% of its start;
- no country's debt above 150% of GDP.

Calm games must also have no default, regime change or bankruptcy, unemployment below 15% and no deflation. In addition:
- all six 7-good games, saved and restored at weeks 52 and 104, end bit-identical to the uninterrupted game;
- the combined 31-good game does the same and is deterministic;
- in-game nationalisation and privatisation really move plant between owners.

Exact asset conservation in these operations is checked separately in `tests/state.test.ts`.

| World, scenario (156 weeks) | World GDP at end / lowest | Mean inflation (weekly range) | Worst unemployment | Defaults / regime changes / bankruptcies |
|---|---|---|---|---|
| 7-good, calm | 101.7% / 99.1% | 1.3% (0.6% to 3.0%) | 12.9% | 0 / 0 / 0 |
| 7-good, capacity destruction | 92.9% / 84.8% | 1.2% (−3.6% to 18.6%) | 48.4% | 0 / 5 / 0 |
| 7-good, energy shock | 101.4% / 93.7% | 1.7% (−2.4% to 8.5%) | 27.6% | 0 / 0 / 0 |
| 7-good, fiscal crisis | 101.2% / 99.1% | 1.3% (0.4% to 3.9%) | 17.4% | 2 / 0 / 0 |
| 7-good, state intervention | 101.0% / 90.4% | 1.5% (−4.2% to 13.6%) | 18.4% | 0 / 0 / 0 |
| 7-good, all combined | 91.8% / 83.4% | 2.6% (−3.3% to 23.0%) | 51.0% | 2 / 5 / 0 |
| 31-good, calm | 98.8% / 96.9% | 3.8% (1.5% to 12.3%) | 12.8% | 0 / 0 / 0 |
| 31-good, capacity destruction | 89.3% / 86.8% | 5.2% (0.1% to 24.6%) | 47.1% | 0 / 3 / 0 |
| 31-good, energy shock | 98.6% / 95.5% | 4.2% (1.1% to 12.3%) | 14.6% | 0 / 0 / 0 |
| 31-good, fiscal crisis | 98.3% / 97.6% | 3.8% (1.1% to 12.3%) | 15.7% | 2 / 0 / 0 |
| 31-good, state intervention | 97.9% / 94.7% | 4.4% (0.8% to 16.0%) | 14.0% | 0 / 0 / 0 |
| 31-good, all combined | 88.4% / 84.5% | 6.2% (−0.1% to 27.0%) | 45.9% | 2 / 3 / 0 |

**Reading the table.** Calm games are stable in both worlds. The 31-good world starts with a price adjustment (first-year mean inflation about 6%, peak 12.3%) that fades by year 3; it was larger in Milestone 2 (peak 18.5%). The war-scale capacity destruction is very harsh: Sundara's unemployment reaches 47–51%, and there are 3–5 regime changes within three years. The same games on the Milestone 2 code gave 43% and 3, so this is existing model behaviour, slightly sharper now that repeated crises cost more, not a new defect. The fiscal crisis costs more than in Milestone 2 (Tavros unemployment 17.4% against 10.5%, lowest stability 38 against 52), as intended by the stronger consequences of repeated defaults.

### 2.4 Performance

| World | ms / week, Milestone 3 | Milestone 2 | Save size (gzip) |
|---|---:|---:|---:|
| Meridian, 7 goods | 1.14 | 0.95 | 122 KB |
| Meridian, 31 goods | 4.50 | 3.60 | 240 KB |
| Generated, 30 zones, 31 goods | 15.4 | 13.9 | 404 KB |
| Generated, 60 zones, 31 goods | 40.5 | 42.1 | 763 KB |
| Generated, 120 zones, 31 goods | 152.9 | 154.4 | 1,405 KB |

Headless Chromium, 7-good world, 6× CPU throttle (a rough phone proxy): 2.9 ms per week without a report (Milestone 2: 2.4) and 1.7 ms with a full report (2.2). The fingerprint after 672 weeks is `ef7dfc948cbe33b0` at every throttle level, the same as in Node. The bundle is 133 KB minified (43 KB gzip).

A 156-week game of the 31-good world takes well under a second of computing on this machine. Small worlds are about 20–25% slower per week than in Milestone 2 (public-firm rules, plant held for sale, default memory); timings vary by about 10% between runs. Full tables: `reports/BENCHMARK.md`, `reports/BROWSER_BENCHMARK.md`.

## 3. Provisional parameters (to approve or adjust)

| Parameter | Value |
|---|---|
| Ordinary limit of central-bank credit to the state | 10% of yearly GDP, never more than the bank's remaining lending capacity (approved provisionally) |
| Bank capital kept before paying profit out | capital for its loans plus room for 10% of yearly GDP |
| Firm normal leverage / credit limit | 17% / 45% of plant value |
| Firms' borrowing response to credit cost | 0.5 (was 2.0) |
| Policy rate | 0.5 × inflation gap, 0.25 × unemployment gap (approved); moves 10% of the way per week (was 3%) |
| Wages track productivity growth | 100% |
| Public-firm price floors (maximum production / affordable / strategic) | 70% / 80% / 75% of running cost |
| Public-firm return accepted (maximum production / strategic) | half the normal hurdle |
| Strategic rebuilding pace | 2% of the gap to local use per week |
| Ownership transfer value of plant | 60% of replacement value |
| Default memory | fades over 520 weeks; haircut 55% ÷ (1 + m)²; shocks × (1 + m); output shock capped at 25% |
| State support limit | 1% of the treasury per zone and week |

## 4. Remaining limitations

- **Long-run collapse after about 290 years** in the growing and zero-inflation stress worlds (§2.2). It is unresolved and accepted for now (decision 5). The game is stable for about two centuries of play, far beyond the intended 52–156 weeks, but not indefinitely. Milestone 2 was stable for 1,000,000 weeks.
- **Inflation averages about 0–1% over the long run, below the 2% target** (accepted for the first playable version, decision 3). The first three years run warmer: about 1–2% in the 7-good world and about 4–6% in the 31-good world during its starting price adjustment.
- **War-scale shocks are harsh:** destroying 35% of a large country's plant gives roughly 50% unemployment and several regime changes within three years (§2.3).
- **Catch-up economies with fast population growth** (Morvaine) see unemployment of 11–14% in their first years. This is structural (labour grows faster than capacity) and predates Milestone 1.
- **Plant held for sale is booked at no more than the bank's claim,** so a buyer can occasionally get plant cheaply. Plant in a zone where another bank already holds plant for sale is scrapped (rare).
- **Mixed firms follow the profitability rules;** only fully public firms take objectives.
- **The AI autopilot** does not use the new commands (objectives, nationalisation, recapitalisation). AI countries behave as before.
- **Still not implemented:** expropriation without compensation (deferred, decision 4), foreign direct investment restrictions (R34), occupation (R62, C2), transport requisition (R63), energy substitution (R66), national currencies (R36).
- **Not measured on an iPhone.**

## 5. Owner decisions (recorded from your review)

1. **Nominal anchor: approved.** Wages track productivity growth; normal prices use a long-run return on capital. These are modelling simplifications, subject to future calibration.
2. **Ordinary limit for central-bank credit to the state: approved provisionally** at 10% of yearly GDP, within the bank's remaining lending capacity (a provisional parameter, §3).
3. **Inflation below target: accepted for the first playable version.** No artificial money creation to reach 2%.
4. **Expropriation without compensation: deferred.** Only compensated nationalisation and privatisation exist.
5. **Long-run stability: accepted temporarily as a documented limitation.** No automatic bond-purchase facility and no automatic exceptional money creation. The stress failure stays documented and reproducible, with unchanged pass criteria (§2.2).

## 6. Proposed Milestone 4 (for approval; nothing implemented, not started)

**Occupation and war economy** (R49, R50, R62, C2):

1. Occupied regions stop producing for their former owner; firms keep their legal owners while the occupier controls production.
2. Occupation policies (moderate or intensive) with resistance and sabotage.
3. Fix C2: an occupied region still sells to its former owner.
4. Transport requisition by itinerary (R63), with the engine allocating capacity across links.
5. Tests: legal ownership kept through occupation, production control, no sales to the former owner, logistics capacity conserved.
