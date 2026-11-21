# Milestone 4: occupation and military logistics

Status: **implemented on branch `feature/economy-engine-m4` (based on the approved Milestone 3 commit `df12eb6`), awaiting owner review.** Nothing outside `economy-engine/` was changed, and the engine is not connected to the playable game. Every number below is a provisional calibration parameter (§4).

## 1. What was built

### 1.1 Economic occupation (R49, R62) and the C2 fix

Every zone now has two countries:
- a **legal owner** (new); and
- a **controller** (the existing owner field).

They differ only while the zone is occupied.

| Area | While a zone is occupied |
|---|---|
| Economic control | The occupier collects the zone's taxes. Its firms sell in the occupier's market, under the occupier's tariffs and sanctions. The occupier's public-firm objectives apply there. The zone's output counts in the occupier's GDP. |
| Front line (C2) | The occupied zone and the zones its legal owner still controls **do not trade at all, in either direction**. In the test this was exactly 0 over 30 weeks, against positive trade before and after. Trade with the occupier and with third countries continues. |
| Legal ownership (R62) | Nothing is nationalised or confiscated. Private profits still go to the zone's households. Firms keep their debts and their lenders. The dividends that public firms owe their legal owner are **withheld**: they stay in the firms and are paid out again after liberation. No state supports these firms during the occupation. |
| Ownership commands | Nationalisation, privatisation, recapitalisation and asset purchases are refused in an occupied zone, for both sides. The occupier has no legal title; the legal owner has no control. |
| Credit | A bank does not lend across the front. Firms that owe money to their legal owner's bank get no new credit until liberation. |
| Politics | Discontent in an occupied zone does not count towards the occupier's own regime stability. It feeds resistance instead (§1.2). |

There are three ways a zone changes hands. Each is reported as an event:
- **`occupy-zone`:** military occupation, with a moderate or intensive policy. Occupying a zone for its own legal owner counts as liberating it.
- **`liberate-zone`:** control returns to the legal owner.
- **`transfer-zone`:** annexation. The legal owner and the controller both change, and there is no front line. Before Milestone 4 this was the only way to model occupation; that is the source of defect C2.

Occupying or liberating a zone moves no plant, cash, debt or money by itself (tested field by field).

### 1.2 Moderate and intensive occupation (R50)

| | Moderate | Intensive |
|---|---|---|
| Occupier's levy, on top of its normal taxes | 20% of firms' profit | 50% of firms' profit and 5% of wages |
| Output lost to disorganisation | 3% | 8% |
| Occupier's spending on the occupied population, compared with its own | 100% | 75% |
| Resistance the policy pushes towards in calm conditions | 0.1 | 0.5 |

**Resistance** (0–1) rises with hardship: deprivation, and unemployment above the natural rate.
- **Persistence:** it builds up within months but fades over more than a year, so past policies leave a memory after a change (R50). After liberation it fades within months.
- **Sabotage:** resistance costs up to 15% of output. Each week an attack may also destroy 3% of one good's plant, with a probability of up to 15% at full resistance, drawn from the seeded random generator. Every attack is a `sabotage` event, and the plant destroyed is exactly the amount reported (tested).
- **Security:** the occupier pays 1% (moderate) or 3% (intensive) of the zone's output per week, plus 5% times resistance. This money goes to its own households as pay for its forces.
- **Revolt:** `occupation-revolt` is reported once when resistance passes 0.7, and `occupation-revolt-ended` when it falls below 0.5. What follows (uprising, independence) is left to the host.

Measured result (Ostmark occupying Norland Coast, 7-good world):

| | Moderate | Intensive |
|---|---|---|
| Levy in the first year | 109 | 299 (2.7×) |
| Levy over three years | 330 | 830 |
| Resistance after 1 / 2 / 3 years | 0.08 / 0.10 / 0.11 | 0.37 / 0.49 / 0.55 |
| Unemployment in the zone after 3 years | 9% | 23% |
| Occupier's real GDP in year 3 (including the zone) | 111.8 | 99.5 (−11%) |
| After 10 years | resistance 0.11, unemployment 7% | resistance 0.65, unemployment about 35%, stable rather than collapsing |

**Calibration note.** My first version levied 20% of sales revenue, which is more than most firms' margins. Intensive occupation then reached 100% unemployment within a year. The levy is now taken from profits, so it can never turn a profit into a loss by itself.

### 1.3 Transport capacity and military requisition (R45, R46, R63)

- **Lane capacity.**
  - Every lane now has a physical capacity per week, measured in freight units (quantity × base price × bulkiness).
  - It is set at world creation to **twice the traffic the settled economy wants to move over it**, never below a quarter of the average lane.
  - It then grows with the economy's productive potential (population × technology). It never shrinks in a slump and never rises because of a requisition.
  - In a calm 10-year game no lane goes above 58% of its capacity.
- **Requisition by itinerary.**
  - The command `set-transport-requisition` names a country, a strategic origin, a destination and a volume.
  - The engine finds the cheapest open itinerary using only lanes whose zones that country controls. Sea and other junctions count as open.
  - The order stands until it is changed. Volume 0 cancels it, which is always allowed, even after a zone has been lost.
  - It is refused if no such itinerary exists.
- **Military priority.**
  - Military freight is served first on every lane of the itinerary, up to the lane's physical capacity. A partial blockade reduces what military traffic can get through.
  - The state pays the normal freight rate to transport workers at both ends of the route (a budget line). It cannot buy more than its treasury holds.
- **Civilian traffic gets what is left.**
  - Each route's civilian orders are first scaled to the share of its usual demand that its tightest lane can carry.
  - Lanes expected to be more than half full are then checked exactly, good by good, and are never over capacity (tested every week).
  - Unsent goods stay with their sellers. Buyers turn to other suppliers or go short, and prices react (delayed deliveries).
- **Smallest-change design.** The existing route and blockade model is unchanged. Lane capacity only matters when a lane is close to full, so a game with no occupation and no requisition is **bit-identical to Milestone 3** in every economic variable (verified after 672 weeks in both test worlds).

Measured result (Norland rail link between Norland Core and Norland Coast; capacity 64.5 freight units):

| Requested military volume | Military served | Civilian freight on the link | Shortage index in Norland Coast | Norland GDP, first year |
|---|---|---|---|---|
| 0 | 0 | 31.6 | 0.000 | 145.7 |
| 30 | 30 | 31.6 (fits alongside) | 0.000 | 145.8 |
| 60 | 60 | 3.8 | 0.139 | 143.3 |
| 100 | 63.8 (capped by capacity) | 0.0 | 0.149 | 141.9 |

### 1.4 Review of repeated regime changes against the defeat rule

**The engine is consistent with the rule; no change was made.**
- **The rule.** Your rule (GAME_DESIGN.md §6) says the first regime overthrow immediately defeats a human player.
- **What the engine does.** It does not know which countries are human. It keeps simulating every country and reports every regime change.
- **How the host finds the first one.** Each `regime-change` event carries the country's running count. The first overthrow is always `regime: 1` (tested), and the host must end that player's game there. Any later changes in the same country only concern AI countries.

The scenarios with several regime changes are all the war-scale capacity-destruction case:
- **7-good world:** Sundara's government falls at weeks 20, 46, 72, 98 and 124.
- **31-good world:** it falls at weeks 35, 61 and 87.

For a human player in Sundara the game would end at week 20 (7-good) or week 35 (31-good). The later falls happen **every 26 weeks**: the new government inherits the same crisis and falls again as soon as its 26-week immunity ends. That is acceptable for AI countries, but it may look mechanical (decision 4).

## 2. Tests, scenarios, stress and benchmarks (all produced by running the code)

| Check | Result |
|---|---|
| Type-check (full and core-only) | pass |
| Engine fast suite `npm test` | **174 / 174 pass**: the 146 of Milestone 3, plus 28 new (13 occupation, 8 transport, 1 regime, 6 new 52/104/156-week games) |
| Engine long test (10,000 weeks, save/restore at 5,000) | pass (unchanged) |
| Ten mandatory scenarios | **10 / 10, every check passes**; only scenario 5 changed (§2.2) |
| Calm game against Milestone 3 | bit-identical in every shared field after 672 weeks (7-good and 31-good worlds) |
| Stress harness `npm run stress` (100,000 weeks) | Results identical to Milestone 3 (§2.4). The harness's own checks pass; the documented long-run collapse remains. |
| Browser benchmark | same fingerprint at every CPU throttle |
| Full report `npm run test:report` (includes main game `npm test` and `npm run build`) | **all checks pass**: main game 63 / 63 tests, build succeeds (`reports/TEST_RESULTS.md`) |

**Golden fingerprint.** It was re-pinned (to `6f9bf1a361044b05`) only because the save file gained fields:
- legal owner, occupation policy, resistance and revolt state per zone;
- lane capacities and freight demand per zone pair;
- requisitions;
- save version 5.

Every field shared with Milestone 3 was checked to be bit-identical.

**New tests, by required area:**
- **Occupation and liberation:** events; control versus legal owner; zone view.
- **Legal ownership versus economic control:**
  - the occupation itself moves nothing (checked field by field);
  - loans keep their lenders;
  - public dividends are withheld, then paid again after liberation;
  - ownership commands are refused for both sides;
  - the occupier collects the levy.
- **C2:** zero trade across the front in both directions, trade with the occupier, trade restored after liberation; annexation is not occupation.
- **Moderate versus intensive:** more levy in year 1 (more than twice as much), more resistance and security cost, lower occupier output in year 3, higher unemployment.
- **Resistance and sabotage:**
  - resistance outlasts a policy change and fades after liberation;
  - sabotage destroys exactly the reported plant and nothing without resistance;
  - one revolt event per crossing;
  - unrest in an occupied zone is not counted in the occupier's politics.
- **No goods or money created:** every new test runs with the conservation audit on, which throws on any error.
- **Military priority under saturated infrastructure:** requests at 50%, 90% and 200% of capacity; capacity is never exceeded on any lane in any week; requisition never raises capacity; cancellation restores civilian traffic.
- **Civilian shortages caused by requisition:** civilian freight falls by more than 80%, the coast's shortage index rises, and the cost appears in the budget.
- **Deterministic save/load:** a game saved during an intensive occupation with a requisition continues bit-identically. All 9 seven-good horizon games, saved and restored at weeks 52 and 104, end bit-identical; the combined 31-good game does too.
- **Itinerary:** found through controlled territory, by sea for an occupier, refused when no route exists.
- **Edge case:** a fully occupied one-zone country stays consistent.

### 2.1 Stability over 52, 104 and 156 weeks

Three new games run in both worlds, in addition to the six games from Milestone 3:
- **Norland Coast:** moderate occupation from week 12, intensive from week 40, liberated in week 120.
- **Sundara Inland:** intensive occupation for the whole game.
- **Norland rail link:** 90% of its capacity requisitioned from week 6 to week 90.

The "all adverse shocks combined" game now includes the occupation and the requisition too. At weeks 52, 104 and 156 every game is checked for:
- conservation;
- finite, valid state;
- bounded inflation, output and debt.

Results at 156 weeks:

| World, game | World GDP at end / lowest | Mean inflation (weekly range) | Worst unemployment | Highest debt / GDP | Defaults / regime changes / bankruptcies |
|---|---|---|---|---|---|
| 7-good, Norland Coast occupation | 100.6% / 97.8% | 1.4% (−2.7% to 3.4%) | 18.3% | 143% | 0 / 0 / 0 |
| 7-good, intensive occupation of Sundara Inland | 93.0% / 88.9% | 2.6% (−0.3% to 5.5%) | 13.5% | 88% | 0 / 0 / 1 |
| 7-good, rail requisition | 102.3% / 98.3% | 1.2% (0.0% to 3.1%) | 13.4% | 90% | 0 / 0 / 0 |
| 7-good, all combined | 90.5% / 83.9% | 3.1% (−5.8% to 24.0%) | 49.8% | 132% | 2 / 5 / 1 |
| 31-good, Norland Coast occupation | 97.8% / 96.3% | 4.4% (−0.5% to 12.3%) | 15.6% | 148% | 0 / 0 / 0 |
| 31-good, intensive occupation of Sundara Inland | 94.3% / 94.3% | 4.9% (1.6% to 12.3%) | 16.7% | 99% | 0 / 0 / 5 |
| 31-good, rail requisition | 99.3% / 96.0% | 3.7% (1.6% to 12.2%) | 12.4% | 99% | 0 / 0 / 0 |
| 31-good, all combined | 88.5% / 83.6% | 6.7% (−2.9% to 29.8%) | 45.0% | 138% | 2 / 3 / 0 |

The six Milestone 3 games give exactly the same numbers as before (`MILESTONE_3.md` §2.3).

Two test bounds were widened for the new games. In each case the reason is written in the test:
- **Debt bound for occupation games: 200% (others: 150%).** A country that loses a large zone keeps its whole debt on a smaller economy. Norland goes from about 80% to about 145% of GDP.
- **First-year mean inflation bound for the combined game: 20% (others: 15%).** Adding the occupation and the requisition lifts the 31-good world's first year to 15.6%. The three-year mean is 6.7%.

### 2.2 Changes in the mandatory scenarios

Only **scenario 5 (war disrupting trade routes)** changed. In it, traffic rerouted around the war lanes now meets the capacity of the alternative lanes. All 4 checks still pass.

| Indicator | Milestone 3 | Milestone 4 |
|---|---|---|
| World traded volume during the war | −7% | −11% |
| Norland trade | −9% | −17% |
| Real GDP: Khazir / Halcyon / Norland | 2.5% / −33.6% / 0.3% | 0.7% / −21.6% / 0.4% |
| Sundara's energy price | 1.07× | 1.04× |
| World GDP back within 1% of control | 27 weeks after reopening | 2 weeks after reopening |

The larger fall in world trade is the expected effect. Halcyon's smaller loss and the faster recovery are consistent with competitors' rerouted trade being limited by capacity, but **I have not fully traced that mechanism**.

### 2.3 Performance

| World | ms / week | Save size (gzip) |
|---|---:|---:|
| Meridian, 7 goods | 1.47 | 124 KB |
| Meridian, 31 goods | 4.61 | 245 KB |
| Generated, 30 zones | 14.3 | 424 KB |
| Generated, 60 zones | 49.3 | 816 KB |
| Generated, 120 zones | 167.0 | 1,578 KB |

**Like-for-like overhead against Milestone 3:** 6% (11 zones), 4% (30 zones) and 4% (60 zones). This was measured by running both versions in the same process, alternating week by week; timings on this machine otherwise vary by up to 30% between runs.

**Benchmark correction.** The benchmark's per-phase split had been skipping the credit phases since Milestone 2, so earlier totals were slightly low. It now runs the full turn. (Between my first and final version I also restructured the lane accounting: it had cost up to 56% on the 60-zone world.)

**Save sizes** grow by about 0.5–8%. The largest growth is in big worlds, from the freight demand stored for each zone pair.

**Browser (headless Chromium, 7-good world, 6× CPU throttle):** 2.9 ms per week. The bundle is 149 KB minified (48 KB gzip).

### 2.4 Stress harness

The stress worlds have no occupation or requisition, so their economic results are identical to Milestone 3.
- **Growing and zero-inflation worlds:** still collapse after about 290 years.
- **Stationary world:** still stable for 100,000 weeks.
- **Harness checks:** conservation, finite numbers and exact save/restore still pass, with pass criteria unchanged.

This remains the accepted, documented limitation from Milestone 3.

## 3. Remaining limitations

- **Financial claims across the front.** Loans and bonds across a front line are still serviced: firms in an occupied zone keep paying their legal owner's bank, and the legal owner keeps paying interest to bondholders in the occupied zone. Only new lending stops.
- **Fully occupied country.** A country whose every zone is occupied has no economy left: its debts still fall due (it defaults), and its stability is frozen. This is consistent (tested) but not designed.
- **Liquidation of public firms under occupation.** If a public firm in an occupied zone is liquidated, the state's share of any surplus goes to the legal owner's treasury.
- **Same-week orders.** Commands are checked against the state at the start of the week, so a policy cannot be set for an occupation applied in the same week. The `occupy-zone` effect therefore takes the policy directly.
- **Requisition scope.**
  - A requisition reserves capacity only. It carries no goods, divisions or supplies: military logistics remain the host's (T15).
  - Itineraries run only through territory the requisitioning country controls, plus sea junctions. There is no transit through allied territory.
- **Civilian traffic on full lanes.**
  - Civilian routes are not re-planned around a full lane; they are only cut. Rerouting still happens when a lane closes or its cost changes.
  - A lane expected to be less than half full is not checked good by good; it could overflow only if its civilian traffic more than doubled within one week (not observed).
- **Capacity data.** Capacity is derived from the starting traffic of the fictional world, not from real infrastructure data. Infrastructure investment does not yet raise lane capacity.
- **Sovereign's stability.** Occupation does not by itself lower the legal owner's stability. The host can apply `stability-modifier`.
- **Inherited from Milestone 3:**
  - the 290-year collapse;
  - inflation below target;
  - harsh outcomes from war-scale damage;
  - the AI autopilot does not use the new commands;
  - not measured on an iPhone.

## 4. Provisional parameters (to approve or adjust)

| Parameter | Value |
|---|---|
| Occupier's levy on profits (moderate / intensive) | 20% / 50% |
| Occupier's levy on wages (moderate / intensive) | 0% / 5% |
| Output lost to disorganisation (moderate / intensive) | 3% / 8% |
| Occupier's spending on the occupied population (moderate / intensive) | 100% / 75% |
| Resistance pushed by the policy (moderate / intensive) | 0.1 / 0.5 |
| Extra resistance from hardship | +0.5 × deprivation, +0.5 × unemployment above 5% |
| Resistance build-up / fading per week (share of the gap) | 3% / 1% (after liberation: −5% per week) |
| Output lost to sabotage at full resistance | 15% |
| Sabotage attacks at full resistance | 15% chance per week, 3% of one good's plant |
| Security cost per week (moderate / intensive), share of the zone's output | 1% / 3%, plus 5% × resistance |
| Revolt reported above / ended below | 0.7 / 0.5 resistance |
| Lane capacity | 2 × starting traffic, at least 25% of the average lane; grows with population × technology |
| Lane checked good by good when its expected civilian load exceeds | half of its remaining capacity |
| Requisition cost | normal freight rate at the origin's price level |

## 5. Decisions for the owner

1. **Occupation parameters (§4).** In particular the size of the levy, and whether an intensive occupation should be able to provoke open revolt within three years. With these values it doesn't; it needs harsher conditions.
2. **Financial claims across a front line.** Should loans and bonds between the occupied zone and its legal owner be frozen (no interest or repayment) during the occupation?
3. **Requisition through allied territory.** Should an itinerary be allowed to pass through an ally's territory, with its consent, when diplomacy exists?
4. **Regime changes in AI countries.** A country left in a crisis currently changes government every 26 weeks. Is that acceptable for AI countries, or should a new government get a recovery period? (The defeat rule for humans is unaffected either way.)
5. **Fully occupied countries.** Should a government in exile keep any economy (for example, the treasury only), or should the host remove the country?

## 6. Proposed next milestone: first integration into the playable game (for approval; nothing implemented)

The goal is to connect the engine to the existing game in the smallest safe step, following `ECONOMY_INTEGRATION.md`:

1. Prerequisite owner decisions: A1 (the engine replaces or runs alongside the current treasury rule) and A2/A3 (goods and the region-to-zone mapping), from `DECISIONS_REQUIRING_APPROVAL.md`.
2. A bridge module in the game (`src/game/economyBridge.ts`):
   - create the economy from the game's fictional test map;
   - advance it once per game turn inside `advanceTurn`;
   - map region ownership changes to `transfer-zone` or `occupy-zone`;
   - treat the first `regime-change` of a human player's country as defeat.
3. A minimal economy panel on iPhone (GDP, inflation, unemployment, debt, budget, stability) using the existing UI style, plus one or two orders (tax rate, spending).
4. Save/load of the economy state together with the game state.
5. Tests with the game's fixture, `npm run build`, and validation on an iPhone before adding further screens.

Codex's geography, map and UI code would only be touched there, and only with your explicit approval of that milestone.
