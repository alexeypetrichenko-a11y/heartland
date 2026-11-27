# MIL-00R-DESIGN · Military manpower recovery and replenishment

**Design study for owner review.** This PR changes no production code, scenario package, PR #39 or PR #41. Nothing is merged or deployed.
- **Baseline main:** `6f41cdcb43bd60646e2114eb50327ce9f92d589d`.
- **Combat reference:** PR #41 (MIL-00-ENGINE) at `e24a6136b`. The cross-check gives byte-identical results on its later head `388b69653`, whose resolver (`strategicLand.ts`) is unchanged.
- **P0 numbers:** illustrative proposals. None is adopted until the owner decides (section 7).

## Summary

- **Problem, confirmed on the PR #41 resolver.**
  - A division repelled in the 1 v 1 case keeps 19,417 of its 25,000 personnel equivalents (PE).
  - It never attacks again: at weeks 52, 104 and 156 the engine rejects its attack with "Division is recovering or depleted".
  - Long matches therefore lose offensive capacity for good, even with most personnel still alive.
- **Recommendation: Alternative B, in a compact first version called B1.**
  - Each country keeps a small depot of trained replacements and recruits to replace its losses.
  - Recruits train for 12 weeks. Replacements go to divisions that are out of combat.
  - Replacements cost money (extra military spending) and workers (recruits leave the civilian labour force).
  - Players choose one national setting: **Off**, **Replace losses** or **Surge**. They can also give individual divisions a refit priority.
  - No decision is needed in an ordinary week.
- **What P0 gives in simulation.**
  - **The repelled division** can attack again in week 10 and reaches full strength in week 11. The cost is 1.5% of France's annual military budget.
  - **A three-division offensive** stops after one capture without recovery. With B1 it captures 4, 7 and 11 regions by weeks 52, 104 and 156.
  - **Sustained war:** normal recruitment keeps about one continuous engagement going per playable country (1.0 to 1.6). Surge keeps two to three going.
- **Economic effect** in the draft.3 economy, with France recruiting at full capacity for three years:

  | Setting | Real GDP | Public debt | Labour force withdrawn |
  |---|---:|---:|---:|
  | Replace losses | −0.12% | +0.8 points of GDP | 0.46% |
  | Surge | −0.25% | +2.3 points | 0.91% |

  All money and bond audits passed.
- **Expansion path:**
  - **B2:** returning wounded, new divisions, and a link between the military budget and the size of the army.
  - **Then elements of C:** equipment from the military industry, supply connectivity from MIL-02, and war-weariness.

## 1. Current behaviour

### 1.1 Combat engine (PR #41)

- **Division state.** Each division carries:
  - its manpower;
  - a retained readiness baseline, which is its starting strength, 25,000;
  - an earliest week for a new commitment.
- **New attack or reinforcement.** The division must be at or past that week, and its manpower must be strictly above 80% of the baseline.
- **Retreat.** A side retreats when its total strength falls to 80% or less of its summed baselines, or when progress reaches −100 or +100. Retreat costs one full recovery week: a retreat in week W allows a new attack from week W + 2.
- **No replenishment.** Nothing raises manpower. MIL-00-ENGINE says that MIL-00R "can update available personnel, retained readiness and recommitment eligibility through a future explicit settlement step".

### 1.2 Verified on the PR #41 resolver

`tools/mil00r_engine_check.ts` runs the PR #41 resolver unchanged. A prototype recovery step changes manpower between weekly settlements. Results are in [`MIL-00R-data/engine-check.json`](MIL-00R-data/engine-check.json).

| Check | Result |
|---|---|
| 1 v 1, no recovery | Repelled in week 7 at 19,417. Attack rejected at weeks 52, 104 and 156 ("Division is recovering or depleted") |
| Prototype B1 refit (P0) | Accepted by the engine's own rule (above 80%) in week 9. Reaches the proposed 90% bar in week 10 and full strength in week 11 |
| Refitted division attacks a fresh defender | Repeats the approved result exactly: 7 weeks, 5,583 lost |
| Python mirror (`tools/mil00r_calibrate.py`) | Identical to the resolver on every case checked |

**Re-entry strength decides how long a refitted division lasts.** The retreat floor stays at 80% of the 25,000 baseline, whatever strength the division attacks with.

| Strength at re-entry vs. a fresh defender | Weeks before retreat | PE lost |
|---|---:|---:|
| 20,001 (80.0%, accepted today) | 1 | 862 |
| 21,250 (85%) | 2 | 1,702 |
| 22,500 (90%) | 3 | 2,523 |
| 23,750 (95%) | 5 | 4,101 |
| 25,000 (100%) | 7 | 5,583 |

A division topped up just above 80% is accepted for a new attack but retreats after one week. The readiness bar for a new attack should therefore sit above the retreat floor (decision R-3). The AI should also wait for a fuller refit.

### 1.3 Economy engine (main)

- **Military budget.** The weekly military budget is the country's military share times its budget base. In draft.3 the shares come from COFOG 02 (France 1.82% of GDP).
  - The engine pays 35% of it as personnel pay, which becomes household income.
  - The other 65% buys military goods.
- **Divisions are free.** They cost and consume nothing; the budget pays for a notional force.
- **Two effects exist but are unused.** The game does not use them yet:
  - `set-mobilization` removes personnel from a zone's labour force (capped at 90% of it).
  - `military-procurement` buys goods for the government. These count as military spending, and the economy's funded share scales them down when cash runs short.
- **Same-week delivery.** `advanceWeekTogether` already passes such effects to the economy in the same atomic week.
- **Starting labour force.** `zone.mobilized` is 0 at the start. By this convention the peacetime forces sit inside the labour force, so only extra recruits should be withdrawn from it.

## 2. Three alternatives

**A · Budget-funded replenishment.**
- The player sets a replacement budget, a share of the military budget per year.
- Each week the budget buys replacements at a fixed cost per PE. They go straight to divisions out of combat.
- There is no manpower stock, training delay or labour effect.

**B · National reserves, recruitment, training and budget.**
- **Depot.** Each country has a depot of trained replacements.
- **Recruitment.** Recruitment is limited by a weekly training intake and by a recruitable pool (a share of the population). It is paid as a one-time cost per recruit.
- **Training.** Recruits reach the depot after a training delay.
- **Labour.** Recruits leave the civilian labour force.
- **Pay.** The existing military budget keeps paying the force as it is today.

**C · Detailed accounting.**
- Recruitable cohorts by age, from population structure.
- Casualties split into killed, wounded and missing, with wounded returning after treatment.
- Equipment stocks by type (small arms, vehicles, artillery), fed by military-industry output.
- Training capacity, and replacements that need both a trained recruit and an equipment set.

| Criterion | A | B | C |
|---|---|---|---|
| **Strategic depth** | One trade-off: money for strength | Timing (training delay, depot), money and labour; when to surge; which divisions refit first | Many trade-offs across manpower, equipment, industry and demography |
| **Economic consistency** | Money only. Manpower is unlimited and costs no labour: replacements appear from nowhere | Money and labour, through existing economy channels. The existing military pay is not counted twice | Highest in principle, adding the industrial supply chain |
| **Data availability** | Draft.3 data are enough | Draft.3 data are enough (forces, population, military share, defence pay share). The rest are labelled gameplay assumptions | Age structure exists (Eurostat, cleared). Equipment inventories, reserve strengths and casualty ratios come from IISS or SIPRI (restricted) or would be invented |
| **Implementation complexity**¹ | 1 country field, 1 division field, 4 parameters | 4 country fields, 1 division field, 10 parameters | About 9 country fields, 4 division fields, 18 parameters and coupling to industry |
| **Mobile usability** | One budget control | One three-way setting and an optional priority | Several screens of stocks and pipelines |
| **Large vs. small countries** | Scales with money only: a rich small country can regenerate indefinitely | Scales with each country's own force and population. Small countries refit more slowly and pay a larger share of GDP per front | Scales too, but industry adds a big-country advantage, and an equipment bottleneck can cause a sudden collapse |
| **Repelled division (France, P0)** | Ready week 13, full week 16 | Ready week 10, full week 11 | Ready week 10, full week 11 |
| **3-division offensive: captures by week 52 / 104 / 156** | 3 / 6 / 8 | 4 / 7 / 11 | 5 / 9 / 14 |
| **Three sustained fronts (France, week 156)** | 30% of losses replaced (budget 10% of the military budget a year) | 38% (Replace losses), 74% (Surge) | 34% (limited by equipment) |
| **Sustainability over 52 / 104 / 156 weeks** | Indefinite while money lasts | Bounded by intake and training time; costs and labour build up visibly | Like B, but in one test the defender collapsed by week 156 for lack of equipment (33 captures, against 11 under B) |

¹ Counts from the sketches in this document and in `tools/mil00r_calibrate.py`.

**Recommendation: B, as B1 below.**
- **Against A:** it is simpler, but it produces the free regeneration the brief rules out (unlimited manpower, no labour cost).
- **Against C:** it needs restricted or invented data, more screens and balancing. The simulation also shows it can tip a war into sudden collapse.
- **For B:** it adds real economic cost through the engine's existing channels, with one control and no new data.

**Expansion path:**
1. **B1 (this design):** depot, training pipeline, recruitment settings, refit priority, one-time costs and labour withdrawal.
2. **B2:** returning wounded (a share of losses returns after some weeks), new divisions raised from the depot, and a link between the military budget and the size of the army.
3. **C elements, after MIL-02 and a military-industry design:**
   - replacements need equipment sets delivered by the military industry (the economy already reports arms deliveries);
   - supply connectivity from MIL-02;
   - war-weariness affecting stability.

## 3. Economic design (B1)

### 3.1 Personnel equivalents are not soldiers

- **What a PE is.** One PE is the defence pay bill of one average whole-economy employee for a year (Rule W: defence compensation of employees ÷ average pay). It measures military labour cost, not people.
- **Why it differs from headcount.** A conscript army pays less than the average wage, so it has more soldiers per PE (Türkiye's count is a documented gameplay assumption).
- **How B1 uses it.** B1 works only in PE. One recruited PE withdraws one average worker from the civilian economy. That keeps costs and labour consistent by construction, whatever the literal headcount.
- **Display.** The interface should say "personnel equivalents" and never claim a soldier count.

### 3.2 Funded strength and the no-double-counting rule

- **Establishment.** The establishment is the force on the map: divisions × 25,000 (France 375,000; Rule W's 382,086 differs only by rounding).
- **Funded strength.** The establishment plus the starting depot (2% of the establishment, P0) is the funded strength.
- **Recurring pay.** The existing military budget keeps paying the funded strength.
  - Losses create vacancies. Vacancies do not lower the budget, so there are no automatic savings.
  - Refilling them adds no new pay.
- **Costs that are added:**
  - a one-time cost per replacement;
  - recurring pay only for personnel kept above the funded strength (the Surge reserve).

### 3.3 National manpower reserve (recruitable pool)

- **Size (gameplay assumption).** The pool is 1% of the population under Replace losses and 2% under Surge (France: 0.66 million and 1.33 million).
- **Depletion.** Recruitment draws the pool down. B1 does not refill it within a match, so it is a safeguard for very long or very heavy wars.
- **Simulation.** In every 156-week run, between 66% and 92% of it remains, depending on the country, setting and number of fronts.
- **Labelling.** The pool is not a fit-for-service estimate. Section 3.10 labels it as a gameplay assumption.

### 3.4 Recruitment, training and the depot

- **Recruitment target.** The aim is funded strength (plus the Surge reserve) minus everything held: divisions, depot, training pipeline and, from B2, returning wounded.
- **Weekly intake.** Intake is the smallest of three limits: that target, the intake capacity and the remaining pool.
  - Capacity under Replace losses is 0.25% of the establishment a week (France 937), about 13% a year. This is a gameplay assumption.
  - Surge doubles it to 0.5% (France 1,875).
- **Training.** Recruits train for 12 weeks (P0) and then join the depot.
- **Handing out replacements.** The depot supplies divisions that may be refitted:
  - at most 10% of the baseline per division per week (2,500 PE);
  - by priority tier, then in proportion to each division's shortfall.
- **Surge reserve.** Surge also keeps an extra trained reserve of 5% of the establishment ready.

### 3.5 Costs

- **One-time cost per replacement (P0).** One year of the country's military budget per PE, measured at week 1 and indexed to the price level. Surge costs 1.5 times as much, for compressed training and overtime.
  - It covers recruiting, training and the equipment lost with the casualties.
  - Replacing a whole division costs 0.08% (Italy) to 0.17% (Poland) of GDP, and 0.6% for the synthetic small country.
- **Recurring cost.** Only personnel above the funded strength (the Surge reserve) are paid on top of the budget.
  - They are paid at the country's defence pay share of military spending.
  - Eurostat and OECD COFOG 02 D1 ÷ total give: France 40%, Germany 32%, United Kingdom 27%, Italy 58%, Poland 41%.
  - Türkiye has no cleared data, so it uses the engine's 35%.
- **Ceiling.** With no ceiling (P0), the cost is bounded by the intake. With intake used every week (three engagements), it is 0.15–0.29% of GDP a year across the playable countries under Replace losses, and 0.46–0.86% under Surge.

### 3.6 Budget constraint and funding

- **How it is paid.** Replacements are extra military spending, paid like any other spending: from the treasury, then by borrowing.
- **When cash runs short.** The economy pays only part of planned spending (its funded share below 1). That share also applies to the replacement purchase. At the next settlement, MIL-00R shrinks that week's training cohort by the same share. The unfunded recruits return to the pool and to the labour force. Money and personnel stay consistent with a one-week lag.
- **Optional ceiling.** A player could cap replacement spending at a share of GDP (decision R-10). P0 has none and relies on the visible deficit and debt.

### 3.7 Opportunity cost: labour and civilian production

- **Labour withdrawal.** Each recruit leaves the civilian labour force when training starts.
  - MIL-00R writes `zone.mobilized` for each of the country's own provinces, in proportion to population. The cumulative count is kept and capped by the economy at 90% of labour.
  - The week-1 value stays 0, so the starting economy is unchanged.
- **Casualties.** They are not returned to the labour force in B1.
- **Effect.** Production loses labour, wages rise slightly and unemployment falls.
- **Measured on the draft.3 economy** (`tools/mil00r_economy_check.ts`; France recruiting every week for three years; all other countries on the autopilot):

| France, change vs. baseline at week 156 | Real GDP | Unemployment | Public debt | Budget balance | Military spending | Labour withdrawn |
|---|---:|---:|---:|---:|---:|---:|
| Replace losses (937 a week) | −0.12% | −0.26 pp | +0.80 pp of GDP | −0.23 pp | +0.21 pp | 0.46% |
| Labour withdrawal only | −0.12% | −0.27 pp | +0.08 pp | +0.04 pp | 0 | 0.46% |
| Money only | −0.01% | +0.01 pp | +0.72 pp | −0.26 pp | +0.21 pp | 0 |
| Surge (1,875 a week, cost × 1.5) | −0.25% | −0.52 pp | +2.31 pp | −0.73 pp | +0.63 pp | 0.91% |
| General mobilisation illustration (5,000 a week) | −0.62% | −1.46 pp | +6.16 pp | −2.00 pp | +1.70 pp | 2.44% |

- **What drives what.** Labour withdrawal drives the output loss; money drives the debt.
- **Finding: stability rises slightly** (+0.3 to +1.9 points), because recruitment reduces unemployment. The engine has no war-weariness, so B1 should not claim a political cost (decision R-16).

### 3.8 No double counting: checklist

- **Recurring pay.** The existing budget pays the funded strength. Refilling vacancies adds no pay, and vacancies save none.
- **One-time costs.** They go through the existing military spending line, never a parallel treasury. The budget totals, debt and audits see them once.
- **Labour.** Peacetime forces stay in the labour force as today. Only recruits are withdrawn.
- **Single writer.** MIL-00R is the only writer of `zone.mobilized`.
- **Displayed values.** Economic values shown in the game come from the economy session, never from a second game-side ledger.

### 3.9 Which divisions can be refitted

Statuses as returned by PR #41's `militarySelection`:

| Status | Refit? | Reason |
|---|---|---|
| Available (friendly region, not engaged) | Yes | |
| Recovering (after a retreat) | Yes, from the settlement after it left combat | The recovery week is the refit window |
| Depleted (out of combat, at or below 80%) | Yes | The main case |
| Engaged (in an active front, either side) | No | Top-ups in battle would change committed strength and thresholds. Fronts stay self-contained |
| In a suspended front | No | The front is frozen and rechecked weekly |
| Encircled (no friendly land exit) | No | Replacements cannot reach it. MIL-02 will replace this test with supply |
| Surrendered (manpower 0, prisoners recorded) | No | The formation has ended. Rebuilding it means raising a new division (B2) |
| In transit (MIL-01A journey) | No | Refit resumes on arrival in a friendly region |
| Displaced (in a region its country controls but does not own) | Only if friendly-controlled land joins it to its own territory | Stands in for a supply line until MIL-02 |
| Prisoners | Never return in B1 | Prisoner exchange would be a diplomacy decision |

### 3.10 Data and labels

| Value | P0 | Status | Source |
|---|---|---|---|
| Full strength | 25,000 PE | design (approved M-2) | MIL-00-DESIGN |
| Establishment | divisions × 25,000 | derived | draft.3 `military.countries` |
| Population | by province | data | draft.3 (Eurostat) |
| Military budget share | per country | data | draft.3 (COFOG 02, Eurostat; OECD for the UK) |
| Defence pay share | D1 ÷ total defence spending | derived | WORLD-02 extract of Eurostat `gov_10a_exp` and OECD; cleared for redistribution |
| Türkiye pay share | 35% | assumption (engine default) | no cleared source |
| Labour participation | 0.48 | engine default | `economy-engine/src/config/defaults.ts` |
| Depot, intake, training time, refit rate, readiness bar, cost, pool, Surge reserve | section 3.3–3.5 | assumption (gameplay) | owner decisions R-2 to R-9 |

No new dataset is introduced and no restricted dataset is read.

## 4. Player decisions

### 4.1 Controls

- **Replacements (one per country):**
  - **Off:** no recruitment; the depot still refits.
  - **Replace losses:** the default.
  - **Surge:** twice the intake, a 5% ready reserve, 1.5 times the cost, and more labour withdrawn.
- **The setting's preview shows:**
  - the cost per week and its share of GDP;
  - recruits in training and the depot;
  - the pool left and the labour withdrawn;
  - the weeks until the next division is ready.
- **Refit priority (optional, per division):** **First**, **Normal** (the default) or **Hold**. It can be set for a whole selection from the shared collective-selection model.
- **No manual replenishment orders** in B1.
- **The existing military budget control is unchanged.** In B1 it does not change the size of the army (decision R-15).

### 4.2 Automatic allocation vs. manual orders

| | Automatic under the chosen setting (proposed) | Manual replenishment orders |
|---|---|---|
| Decisions per week | 0 required; 0–1 typical (a priority change) | One per refitting division per week |
| Mistakes | Hard to waste: replacements go where they are needed | Easy to strand replacements or forget a division |
| Mobile | Fits the overview and the division sheet | Needs a new order type, previews and a list |
| Multiplayer and determinism | One country setting, proportional shares, no ID tie-breaks | More intents to validate and order |

**Recommended:** automatic allocation with optional priorities. A 156-week match gives about 46 seconds per week (MIL-00-DESIGN), so replacement needs no weekly attention.

### 4.3 AI

- In peacetime: Replace losses.
- At war: switch to Surge when the depot cannot cover the current shortfall, and switch back when it can.
- Priority **First** goes to divisions in frontier provinces.
- The AI attacks only once the divisions involved are fully refitted (sections 1.2 and 6.3).
- It sees only its own forces and the same authorised information as players.

## 5. Integration

### 5.1 State (only in matches that opt in)

The new block lives inside `strategicLand`, version-pinned:

```ts
recovery?: {
  rules: 'mil00r-v1';
  countries: Record<CountryId, {
    setting: 'off' | 'replace' | 'surge';
    depot: number;          // integer PE
    pipeline: number[];     // integer PE per remaining training week (length = training weeks)
    pool: number;           // integer PE
    recruited: number;      // cumulative, written to zone.mobilized
    lastCohort: { week: number; intake: number } | null;   // to apply the economy's funded share
  }>;
  priority: Record<DivisionId, 0 | 2>;   // absent = Normal
}
```

Division manpower, retained readiness baselines and eligible weeks stay where PR #41 keeps them.

### 5.2 Weekly settlement order

1. **Freeze** the state at the start of week W: game state, drafts and the economy summary of week W − 1.
2. **`planRecovery(frozen)`** is a pure function. For each country it computes:
   - the funded-share correction of last week's cohort;
   - this week's intake and its one-time cost;
   - the province mobilisation totals.

   It returns the economy effects together with the intake plan.
3. **`advanceWeekTogether({ effects })`**, using the parameter that already exists.
4. **Inside `advanceGame`:**
   - diplomacy;
   - land resolution (MIL-00, unchanged);
   - `applyRecovery(afterLand, plan)`, which applies the correction, moves graduates to the depot, hands out replacements and appends the cohort;
   - report events ("replenished", "cohort reduced: funds").
5. **The economy settles** with regional control and the same effects.
6. **Both commit, or neither does.** A failure anywhere keeps the previous game, economy, reports, save and drafts.

The plan is computed once and given to both sides, so the game and the economy always use the same numbers.

### 5.3 Economy interface

- **Labour:** `set-mobilization`, one absolute value per own province. MIL-00R is its only writer.
- **Money, two options (decision R-14):**
  - **(i) The existing `military-procurement` effect.** Buy land equipment worth the cost at last week's prices. This needs no economy change, and `tools/mil00r_economy_check.ts` uses it.
  - **(ii) A new additive effect, `military-replenishment {countryId, value}`.** It would be spent with the existing military goods mix and the funded share, giving exact value accounting with one effect per country. **Recommended**, as a small additive economy change.
- **Cost basis.** One year of the week-1 military budget per PE, indexed by the price level (nominal ÷ real GDP). A later budget cut therefore does not make replacements cheaper.
- **Reads.** Only the authorised economy summary: funded share, price level and population.

### 5.4 Manpower, readiness and eligibility

- **What a replacement changes.** A replacement raises manpower only.
  - The retained baseline (25,000) and the earliest commitment week do not change.
  - The retreat floor stays at 80% of the baselines.
- **Eligibility for a new attack or reinforcement.** Under recovery rules it requires both of these:
  - the earliest commitment week has been reached;
  - manpower is at least the readiness bar (P0 90%) times the baseline.
- **Engine change.** This adds one parameter to PR #41's eligibility check, used only when recovery is pinned.
- **Defence.** Recovering and depleted divisions still defend, as in MIL-00.
- **Reorganising at a lower strength (resetting the baseline) is not proposed** (decision R-12). It would let worn divisions fight on until they are ground away.

### 5.5 Determinism and replay

- **Arithmetic.** PE are integers. Shares are rounded down, and any remainder stays in the depot.
- **No tie-breaks by identity.** Within a priority tier, replacements are shared in proportion to shortfall. No division ID or submission order decides any amount.
- **Inputs.** All inputs are frozen at the start of the week. Events are sorted by the same key as MIL-00.
- **Tested in this study:**
  - every simulation run is repeatable byte for byte;
  - the economy check reproduces its final economy hash.

### 5.6 Saves and rules identity

- **Which matches use it.** Only new matches that offer recovery pin `recovery.rules = 'mil00r-v1'` at creation.
- **Older saves.**
  - A strategic save without the block (any PR #41 version-2 save) replays exactly, with no recovery.
  - Legacy version-1 saves are untouched.
- **Validation of the block:**
  - known countries and divisions;
  - a pipeline of the pinned length;
  - bounded non-negative integers;
  - a valid setting;
  - a recruited total consistent with `zone.mobilized`.

  An unsupported version is rejected without replacing the existing save.
- **The economy save format does not change** (`zone.mobilized` is already part of it).

### 5.7 Immutable packages and accounting identities

- **Packages.** No scenario package changes. Parameters belong to the rules version. Country inputs are computed at match start from draft.3 (divisions, population) and from the economy (military budget).
- **Accounting.** Replacement spending is military spending:
  - it sits inside total spending;
  - it is financed by the treasury or borrowing;
  - it passes the engine's money and bond audits (checked every week in the economy run).
- **Mobilisation** only reduces labour supply, within the engine's existing cap.

### 5.8 Extension points

| Future system | Hook in B1 |
|---|---|
| **MIL-02 logistics** | A `canRefit(division)` predicate replaces the encircled and displaced rules. Supply throughput can lower the 10% refit rate. Distance from home can add delay |
| **Military industry** | Replacements would need equipment sets, a stock fed by `armsDelivered`, which the economy already reports. The C-lite test shows this can cause collapse, so it needs its own balancing |
| **MIL-01A transport** | Units at sea are excluded through PR #41's presence predicate |
| **MIL-04 beachheads** | Refit only by maritime supply |
| **B2** | Returning wounded (a delayed share of losses, no cost). New divisions raised from the depot at full cost when the establishment allows. The establishment linked to the military budget |
| **Stability** | A war-weariness effect from losses or mobilisation, if the owner wants a political cost |

## 6. Calibration

### 6.1 Method

- **`tools/mil00r_calibrate.py`** (Python standard library) reads the immutable draft.3 package and the cleared WORLD-02 defence extract.
  - Combat copies PR #41's arithmetic, including retreat against the retained baselines.
  - It reproduces the six approved MIL-00 cases exactly and matches the PR #41 resolver.
  - Results: [`MIL-00R-data/calibration.json`](MIL-00R-data/calibration.json), byte-identical on repeat.
- **`tools/mil00r_engine_check.ts`** runs the PR #41 resolver and compares it with the Python results. Output: [`MIL-00R-data/engine-check.json`](MIL-00R-data/engine-check.json).
- **`tools/mil00r_economy_check.ts`** runs the unchanged economy engine on the draft.3 week-1 save. Output: [`MIL-00R-data/economy.json`](MIL-00R-data/economy.json).
- **Settings.** Every case uses P0 unless stated, with France's data. The campaigns are synthetic single-front fixtures: no map, no AI, no other fronts.

### 6.2 Recovering the repelled division (France)

Weeks are the first game week in which an attack order would be accepted.

| Alternative | Engine bar (> 80%) | Proposed bar (90%) | Full strength | Strength at weeks 52 / 104 / 156 | Cost (% of the annual military budget) | Recruits |
|---|---:|---:|---:|---|---:|---:|
| No recovery | never | never | never | 19,417 at each | 0 | 0 |
| A (10% of the budget a year) | 9 | 13 | 16 | 25,000 | 1.49 | not tracked |
| B Off (depot only) | 9 | 10 | 11 | 25,000 | 0 | 0 |
| **B Replace losses** | 9 | 10 | 11 | 25,000 | 1.49 | 5,583 |
| B Surge | 9 | 10 | 11 | 25,000 | 15.4 (building and paying the 5% reserve) | 24,333 |
| C-lite (35% of wounded return after 8 weeks) | 9 | 10 | 11 | 25,000 | 0.97 | 3,633 |

- **All six playable countries:** ready in week 10 and full in week 11. Each depot (6,500–10,000) covers 5,583. The cost is 0.018% (Italy) to 0.038% (Poland) of GDP.
- **The synthetic small country** (3 divisions, 8.6 million people): ready in week 23 and full in week 36, because its depot holds only 1,500 and it trains 187 a week.

### 6.3 Offensive capacity over 52, 104 and 156 weeks

Three divisions attack two fresh defenders each time (the defender has deep reserves), and attack again once fully refitted:

| | Assaults by week 52 / 104 / 156 | Captures by week 52 / 104 / 156 | Attacker cost over 156 weeks (% of the annual military budget) |
|---|---|---|---:|
| No recovery | 1 / 1 / 1 | 1 / 1 / 1 | 0 |
| A | 3 / 6 / 9 | 3 / 6 / 8 | 20.0 |
| B Off | 1 / 1 / 1 | 1 / 1 / 1 | 0 |
| **B Replace losses** | 4 / 7 / 11 | 4 / 7 / 11 | 26.2 |
| B Surge | 6 / 13 / 19 | 6 / 12 / 19 | 83.8 |
| C-lite | 5 / 10 / 14 | 5 / 9 / 14 | 22.7 |

- **Attacking as soon as eligible (90%) instead:** B Replace losses makes 17 assaults but only 2 captures. Under-strength attacks waste men and money.
- **A lone division against an equal defender (1 v 1):** always repelled. With B1 it can try again about every 10 weeks (16 assaults in 156 weeks). Recovery restores the option to attack, not victory.
- **Rotating defenders** (the defender alternates two groups that both refit): A and B give the same results as above. C-lite diverges after week 104, when the defender's equipment production can no longer keep up.

### 6.4 National sustainability (B1, 156 weeks)

- **What an engagement is here.** One engagement means one continuous loss of 798 PE a week (the 1 v 1 attacker average).
- **Sustainable engagements** = weekly intake ÷ 798.

| Country | Divisions | Depot at start | Intake a week (Replace) | Sustainable engagements, Replace / Surge | 1 engagement: losses replaced | 3 engagements: losses replaced, Replace / Surge | Cost at 3 engagements, % of GDP a year, Replace / Surge | Labour withdrawn at 3 engagements, Replace / Surge |
|---|---:|---:|---:|---|---:|---|---|---|
| France | 15 | 7,500 | 937 | 1.17 / 2.35 | 98% | 38% / 74% | 0.23 / 0.71 | 0.46% / 0.92% |
| Germany | 13 | 6,500 | 812 | 1.02 / 2.04 | 97% | 33% / 64% | 0.16 / 0.48 | 0.32% / 0.63% |
| United Kingdom | 14 | 7,000 | 875 | 1.10 / 2.19 | 97% | 35% / 69% | 0.29 / 0.86 | 0.41% / 0.83% |
| Italy | 15 | 7,500 | 937 | 1.17 / 2.35 | 98% | 38% / 74% | 0.15 / 0.46 | 0.51% / 1.03% |
| Poland | 13 | 6,500 | 812 | 1.02 / 2.04 | 97% | 33% / 64% | 0.28 / 0.86 | 0.71% / 1.44% |
| Türkiye (count is an assumption) | 20 | 10,000 | 1,250 | 1.57 / 3.13 | 100% | 50% / 99% | 0.22 / 0.68 | 0.47% / 0.95% |
| Synthetic small country | 3 | 1,500 | 187 | 0.23 / 0.47 | 23% | 8% / 15% | 0.23 / 0.70 | 0.70% / 1.42% |

- **Capacity follows force size.** A country can sustain wars in proportion to its own army, and pays per front in inverse proportion to it. A small country fighting a large one runs short of replacements first.
- **The pool rarely binds within 156 weeks.** 66–92% of it remains.
- **Off (depot only):** the starting depot covers 1–8% of losses at one engagement, and under 3% at three.

### 6.5 Sensitivity (France, B1)

| Variant | Repelled division ready / full (week) | Captures by week 52 / 104 / 156, fresh defenders | Same, rotating defenders | 3 engagements: losses replaced | Cost, % of GDP a year |
|---|---|---|---|---:|---:|
| **P0** | 10 / 11 | 4 / 7 / 11 | 4 / 7 / 11 | 38% | 0.23 |
| Training 6 weeks | 10 / 11 | 5 / 10 / 16 | 5 / 18 / 44 | 39% | 0.23 |
| Training 26 weeks | 10 / 11 | 2 / 4 / 6 | 2 / 4 / 6 | 34% | 0.23 |
| Refit 5% a week | 11 / 13 | 4 / 7 / 11 | 4 / 7 / 11 | 38% | 0.23 |
| Refit 20% a week | 9 / 10 | 4 / 7 / 11 | 4 / 7 / 11 | 38% | 0.23 |
| No starting depot | 18 / 21 | 3 / 5 / 7 | 3 / 5 / 7 | 36% | 0.23 |
| Depot 5% | 10 / 11 | 6 / 11 / 16 | 6 / 21 / 47 | 41% | 0.23 |
| Intake 0.125% a week | 10 / 11 | 3 / 6 / 8 | 3 / 6 / 10 | 20% | 0.12 |
| Intake 0.5% a week | 10 / 11 | 4 / 7 / 11 | 4 / 7 / 11 | 74% | 0.47 |
| Readiness bar 80% / 85% | 9 / 11 | 4 / 7 / 11 | 4 / 7 / 11 | 38% | 0.23 |
| Cost 0.5 years / 2 years | 10 / 11 | 4 / 7 / 11 | 4 / 7 / 11 | 38% | 0.12 / 0.47 |

- **What sets tempo:** the training time and the depot.
- **What sets capacity in a long war:** the intake.
- **The cost parameter** scales the fiscal burden without changing tempo.
- **The refit rate** hardly matters at P0.
- **A short training time with rotating defenders** lets the side with the initiative snowball (44 captures). This is a balance risk to watch in playtests.

### 6.6 Limitations

- **Simplified fixtures.** The campaigns are single-front fixtures with fixed attack policies and no map, AI or third parties.
- **Weekly loss rate.** The national-sustainability runs use a constant 798 PE a week per engagement.
- **One country in the economy run.** It covers France only. Divisions do not consume goods, and no war-weariness is modelled.
- **Python cross-check scope.** The engine cross-check covers the 1 v 1 cases and the B1 timing. The full map, retreat routing and multiplayer remain MIL-00R-ENGINE acceptance tests.
- **Gameplay assumptions.** All P0 values are gameplay assumptions chosen to produce readable results. None is calibrated against real armies.

## 7. Owner decisions required before implementation

| ID | Decision | Options | Proposal (P0) |
|---|---|---|---|
| R-1 | Model | A, B (B1) or C | **B1**, with the B2 and C path above |
| R-2 | Refit rate per division | 5%, 10% or 20% of the baseline a week | 10% (2,500 PE) |
| R-3 | Readiness bar for new attacks and reinforcements under recovery rules | 80% (as now), 85%, 90%, 95% | **90%**: a refitted unit should not retreat after one week |
| R-4 | Training time | 6, 12 or 26 weeks | 12 |
| R-5 | Starting depot | 0%, 2% or 5% of the establishment; optionally a floor for small countries | 2%, no floor |
| R-6 | Training intake | Replace 0.125–0.5% a week; Surge double | Replace 0.25%, Surge 0.5% |
| R-7 | One-time cost per replacement | 0.5, 1 or 2 years of the military budget per PE; Surge multiplier | 1 year; Surge × 1.5; indexed to prices from week 1 |
| R-8 | Recruitable pool | 1% / 2% of the population; refill or not | 1% / 2%, no refill in B1 |
| R-9 | Surge reserve and its pay | 0–10% of the establishment; paid at the country's defence pay share | 5%; Eurostat and OECD pay shares, Türkiye 35% |
| R-10 | Funding | Extra spending (deficit) or within the military budget; optional ceiling | **Extra spending, no ceiling**. Within-budget would be free, because military goods have no effect yet |
| R-11 | Labour withdrawal | On or off | **On**: recruits leave the labour force; casualties do not return in B1 |
| R-12 | Refit restrictions | As in section 3.9; refit from the settlement after leaving combat; no reorganisation at reduced strength; no rebuilding of surrendered divisions | As proposed |
| R-13 | Player controls | Three-way national setting plus per-division priority; manual orders | **Setting plus priority, no manual orders** |
| R-14 | Economy channel | (i) existing `military-procurement` or (ii) a new `military-replenishment` effect | **(ii)**, a small additive economy change |
| R-15 | Military budget and army size | Keep independent in B1, or let the budget set the establishment now | **Independent in B1**; link in B2 with new divisions |
| R-16 | Political cost | None, or war-weariness from losses or mobilisation | **None in B1** (the engine currently shows a small stability gain); a separate design if wanted |
| R-17 | AI policy | As in section 4.3 | As proposed |
| R-18 | Rules identity and sequencing | New matches only (`mil00r-v1`); implement after PR #41 merges; physical iPhone benchmark before rollout | As proposed |

## 8. After approval

1. **MIL-00R-ENGINE**, on top of merged MIL-00-ENGINE:
   - pure `planRecovery` and `applyRecovery`;
   - the save block and its validation;
   - the readiness bar parameter;
   - the economy effect chosen in R-14.
2. **Tests:**
   - the 19,417 case;
   - each restriction in section 3.9;
   - funded-share scaling;
   - ID and order permutations;
   - save and replay of PR #41 saves without the block;
   - rollback after an injected failure;
   - audits.
3. **Benchmarks:** 156 weeks with 61 zones and 90 divisions, in calm and heavy runs, against the existing thresholds.
4. **MIL-00R-UX:**
   - the Replacements setting with its preview;
   - the priority toggle in the division sheet and in collective selection;
   - refit status;
   - weekly report lines.
5. **Physical iPhone check** before rollout.

## Reproduce

From the repository root:

```bash
python3 docs/military/tools/mil00r_calibrate.py --json docs/military/MIL-00R-data/calibration.json
```

```bash
node --experimental-strip-types docs/military/tools/mil00r_economy_check.ts docs/military/MIL-00R-data/economy.json
```

The engine cross-check needs the PR #41 source tree (`e24a6136b` or `388b69653`; the resolver is the same in both):

```bash
git worktree add /tmp/pr41 e24a6136b && cp docs/military/tools/mil00r_engine_check.ts /tmp/pr41/docs/military/tools/
```

```bash
(cd /tmp/pr41 && node --experimental-strip-types docs/military/tools/mil00r_engine_check.ts "$OLDPWD/docs/military/MIL-00R-data/calibration.json")
```

The economy check takes about one minute on the development host. The other two take a few seconds.
