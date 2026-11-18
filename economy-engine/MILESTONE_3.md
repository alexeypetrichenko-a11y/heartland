# Milestone 3: state and ownership

Status: **work in progress, NOT complete.** Saved on branch `feature/economy-engine-m3` (based on `feature/economy-engine-m2`). All Milestone 3 features are implemented and the fast tests, long test and scenarios pass, but the 100,000-week stress harness fails in two of its three worlds (§2.2). That is a regression against Milestone 2 and still needs a fix and an owner decision (§5, decision 5). Nothing outside `economy-engine/` was changed. Every number below is a provisional calibration parameter.

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
| Engine fast suite `npm test` | **130 / 131 pass** in the saved state (19 new; one Milestone 2 test replaced, see below). The one failure is the golden fingerprint, see note below. |
| Engine long test (10,000 weeks, save/restore at 5,000) | pass |
| Ten mandatory scenarios | **10 / 10, every check passes** |
| Legacy world, 192 years (10,000 weeks), autopilot | inflation never beyond ±4.4% after year 2; worst country-week unemployment 13.6%; 0 defaults, 0 regime changes, 0 bankruptcies |
| 31-good world, 100 years | inflation within ±4.0%; worst unemployment 14.1%; 0 defaults, 0 regime changes, 0 bankruptcies |
| Very large shock (35% of Sundara's capacity destroyed) | settles: inflation volatility 2.8% in the first five years, 0.3% after 25 years |
| Stress harness `npm run stress` (100,000 weeks) | **FAILS in 2 of 3 worlds**, see §2.2 |
| Benchmark, browser bench, test report, main game `npm test` / `npm run build` | **not yet run** for Milestone 3 |

**Golden fingerprint failure.** An experimental wage parameter (`wageTargetAnchor`, default 0, so it has no effect) was added while investigating the stress failure. The fingerprint covers the whole saved state, settings included, so the extra setting changes it. Checked: with that one setting removed from the saved text, the fingerprint after 672 weeks is exactly the pinned `ef7dfc948cbe33b0`, so engine behaviour is unchanged. The fix is to remove the unused parameter (or re-pin the fingerprint); it was left as it is because no code changes were authorised when this state was saved.

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

### 2.2 Stress harness, benchmark, game

Results from `npm run stress` on the Milestone 3 code (full table in `reports/STABILITY_REPORT.md`):

| World | Up to 10,000 weeks (192 years) | 100,000 weeks |
|---|---|---|
| Growing | passes: 0 defaults, 0 regime changes, worst unemployment 13.5% | **fails**: after about 290 years prices fall, debt explodes (max debt/GDP astronomically high), unemployment reaches 100% in places, 104,696 defaults and 16,184 regime changes in total |
| Stationary (no growth) | passes | **passes**: 0 defaults, 0 regime changes, inflation 0.00%, worst unemployment 6.4% |
| Zero-inflation target | passes, but prices drift down (price index 0.64 at 10,000 weeks) | **fails** in the same way: 22,677 defaults, 3,546 regime changes |

In every world, conservation (worst error 8.7e-12), bit-exact save/restore, finite numbers and bounded memory (state at most 354 KB, heap growth at most 2.6 MB) still hold.

**Cause.** Without automatic bond purchases, money grows only when firms and the state borrow for real needs. Over centuries this does not anchor prices firmly enough. Once prices start to fall, real debt burdens rise, borrowing shrinks further and the economy spirals down. Milestone 2 passed 1,000,000 weeks; this is a regression.

**Tried without success:** pay settlements anchored to the 2% target (`wageTargetAnchor` 0.25 and 0.5); a faster or stronger rate rule and weaker borrowing sensitivity; an autopilot that does not raise taxes in a slump (reverted).

**Candidate fix (needs owner approval under review decision 1):** a central-bank facility that buys bonds only when the policy rate is at its floor and prices are falling, fully accounted for.

The benchmark (`npm run bench`), browser bench, `npm run test:report` and the main game's test/build have not yet been run on the Milestone 3 code.

## 3. Provisional parameters (to approve or adjust)

| Parameter | Value |
|---|---|
| Ordinary limit of central-bank credit to the state | 10% of yearly GDP (plus the bank's capacity) |
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

- **Long-run collapse after about 290 years** in the growing and zero-inflation stress worlds (§2.2). The game is stable for about two centuries of play, not indefinitely.
- **Inflation averages about 0–1%, below the 2% target.** The economy is stable and doesn't drift, but nothing pulls inflation up to target any more. The automatic bond purchases did, and they were not permitted.
- **Catch-up economies with fast population growth** (Morvaine) see unemployment of 11–14% in their first years. This is structural (labour grows faster than capacity) and predates Milestone 1.
- **Plant held for sale is booked at no more than the bank's claim,** so a buyer can occasionally get plant cheaply. Plant in a zone where another bank already holds plant for sale is scrapped (rare).
- **Mixed firms follow the profitability rules;** only fully public firms take objectives.
- **The AI autopilot** does not use the new commands (objectives, nationalisation, recapitalisation). AI countries behave as before.
- **Still not implemented:** expropriation without compensation, foreign direct investment restrictions (R34), occupation (R62, C2), transport requisition (R63), energy substitution (R66), national currencies (R36).
- **Not measured on an iPhone.**

## 5. Decisions for the owner

1. **Nominal anchor.** Wages now track productivity growth, and normal prices use the long-run return on capital rather than the policy rate. These are the changes that made a credit-only money system stable. Please confirm they are acceptable modelling choices.
2. **Ordinary limit for central-bank credit to the state:** 10% of yearly GDP. Is that the right order of magnitude?
3. **Inflation below target.** Inflation now averages about 0–1%. Is price stability near zero acceptable for the first version, or should the target be met by another approved mechanism?
4. **Expropriation without compensation:** should it exist, and with what consequences?
5. **Long-run stability fix.** Approve the liquidity-trap facility (§2.2), name another mechanism, or accept stability of about 200 years as a documented limitation for now.

## 6. Proposed Milestone 4 (for approval; nothing implemented)

**Occupation and war economy** (R49, R50, R62, C2):

1. Occupied regions stop producing for their former owner; firms keep their legal owners while the occupier controls production.
2. Occupation policies (moderate or intensive) with resistance and sabotage.
3. Fix C2: an occupied region still sells to its former owner.
4. Transport requisition by itinerary (R63), with the engine allocating capacity across links.
5. Tests: legal ownership kept through occupation, production control, no sales to the former owner, logistics capacity conserved.
