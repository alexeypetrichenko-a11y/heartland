# MIL-01-DESIGN · Strategic military mobility

Design study for owner review. The proposed rules are for Heartland’s fictionalized strategic simulation. The owner has approved the 25,000 personnel-equivalent division scale, frontier-weighted placement, the Turkish calculation subject to licensing, and future maritime mobility and land transit. The owner also approved Approach B as the target, beginning with Approach A, whole divisions, configurable one- or two-week journeys, limited capacity, zero prototype monetary cost, friendly destinations first, explicit international transit authorization, Channel Tunnel deferral, deterministic settlement, backward-compatible saves and the phased roadmap below. Individual routes and rollout gates remain review decisions.

## 1. Current architecture and dependencies

| Area | Current behavior | Design implication |
|---|---|---|
| Military | `src/game/military.ts` validates friendly origin and adjacent destination. Move requires friendly control. Attack requires opposing control and may repeat until combat ends. `advanceTurn` accepts orders for one player and the military resolver works in stable division-ID order. | Keep ordinary adjacency and the existing land resolver as the default. A unit traveling between regions needs an explicit location and must be excluded from land combat until it arrives. |
| Geography | WORLD-04 assigns military adjacency from the package’s movement graph and shows land borders, maritime trade and military movement separately. Its draft.2 disables European military operations. | Author military routes separately. Commercial trade connectivity supplies no authority to move divisions. Coastal access and destination eligibility are game rules. |
| Economy and control | The bridge uses `advanceWeekTogether`. Game control changes feed the economy’s occupation effects, with legal ownership tracked by the engine. The engine has freight lanes and transport requisitions. | Transport must leave ownership alone. Add explicit movement costs through the engine’s settlement interface once supported. Civilian freight and requisitions remain separate from division transport capacity in the first release. |
| Diplomacy and play | Current diplomacy has goodwill, condemnation and cooperation proposals with a bilateral score. The local prototype has one human controller and no treaty permissions or formal war state. | Add explicit agreement types and a turn input keyed by actor when multiplayer arrives. A relationship score, existing cooperation offer or economic bloc is insufficient authority to cross a border. |
| Saves and reports | SAVE-01 checks the game against a fixed scenario fixture. WORLD-04 adds exact package identity and economy fingerprint checks. GAME-UX-01 renders the latest military results and a short in-session report history. | Version mobility state and validate its references against the pinned rules and package. Extend military results so transport failures have the same visibility as completed orders. |

The study uses [WORLD-04](https://github.com/alexeypetrichenko-a11y/heartland/blob/4924d1c2e224ff6cdaf5952d8cedd5e9ea666bce/docs/world/WORLD-04-REVIEW.md) at `4924d1c` and the [WORLD-05 scenario specification](https://github.com/alexeypetrichenko-a11y/heartland/blob/b40b31924099317f06e7763935b69fca7ea2dff8/docs/world/WORLD-05-SCENARIO-SPEC.md) at `b40b319`. At that WORLD-05 revision, draft.3 is specified and licensing is still open. European gameplay implementation depends on reviewed WORLD-04 scenario/save integration and validated WORLD-05-FINAL initialization, provenance and distribution metadata. A synthetic test fixture can be used to develop the mechanics without either package. The existing disconnected areas are acceptable during prototype review. Before a complete game, each playable country needs at least one plausible route to participate in a conflict without requiring a particular other human player to be present.

## 2. Connection types

| Connection | Authority and scope |
|---|---|
| Land military movement | Existing region adjacency for ordinary movement and land combat. Preserve the prototype rules. If a future ruleset models formal war, require that state for new hostile orders. |
| Civilian maritime trade | Existing economy lane. It continues to carry economic flows regardless of whether a military connection exists. |
| Military maritime transport | Separate authored route between two game embarkation regions. It records eligible direction, division slots per departure, duration in weekly turns, and a cost rule. A reverse direction is explicit even if it shares a capacity pool. |
| Diplomatic land transit | Authored land corridor through a named host, activated by an explicit grant. Units traverse it as one order between eligible endpoints. The host needs diplomacy and corridor availability, with no extra economic zones or military units. |
| Fixed crossing | Separate infrastructure-linked route, illustrated by the Channel Tunnel. Use its own open/closed status and limited capacity. Require approval from the endpoint controllers and any fixed-crossing operator represented in the game. Hostile entry is excluded. |
| Future air transport | Reserve the same departure/arrival state interface. Define airport access, eligible unit classes and separate air capacity in a later design. |

For the Channel Tunnel, compare a faster low-capacity crossing with omitting it from the first release. A fixed crossing adds a distinct diplomatic option without creating a permanent land combat edge. Its closure needs independent state, so a tunnel closure does not close sea transport or trade. Recommendation for first release: leave the fixed crossing out and keep the route type available for a later decision. If added, a friendly endpoint controlled by another country still requires an explicit access arrangement.

A coverage audit should use the actual authored graph when packages are ready. Cover Corsica, Northern Ireland, Sicily and Sardinia as island destinations. Check UK participation through agreed access and Türkiye participation through a negotiated corridor or explicit maritime route. Use alternate legal routes in the game design where one AI refusal would otherwise isolate an entire country. A playable country can have a reachable opportunity subject to diplomacy without a guaranteed route in every war or against every opponent.

## 3. Recommended first maritime model

- **One order per division.** A player selects an eligible route using a division at an active origin under its country’s control. Departure and unloading apply at the weekly boundary. One eligible division takes one slot regardless of its current manpower. No split divisions or ship management.
- **One or two weeks as a tuning starting point.** If an order is accepted while settling Week W and its duration is one, it is traveling at the opening of W+1 and arrives during settlement of W+1. Each UI estimate uses that convention. One departure per unit and no additional land order in an arrival week prevent chain moves.
- **Friendly-controlled destination only in the first release.** The destination must be controlled by the same actor, and permission to pass through a neutral place grants no unloading right. No landing on enemy-controlled territory. MIL-01C adds allied staging under an explicit grant. MIL-04 adds a distinct hostile-coast landing operation under formal war eligibility.
- **Limited lift and zero prototype monetary cost.** One whole division uses one departure slot. Capacity contention leaves unadmitted divisions at origin with a report reason. MIL-02 considers supply and economic accounting separately.
- **Control can invalidate arrival.** Recheck the endpoint and route at settlement. An interrupted journey can start a timed return if the origin is eligible. Withdrawal before departure discards the draft. Cancellation after departure requests return.
- **Recoverable waiting.** If both endpoints are unavailable, retain the entire division in a reported waiting state. An eligible reopened endpoint can resume the journey. Waiting never destroys the division or permanently removes it. A waiting unit has no regional combat presence and consumes no repeated monetary charge.

### Shared operation types

| Operation | Authorization | Arrival |
|---|---|---|
| Friendly transport (MIL-01A) | Own controlled origin and destination, explicit maritime route and capacity | Enter the friendly region after revalidation |
| Allied deployment (MIL-01C) | Explicit staging rights and eligible allied destination | Enter as a guest with a separate presence and authorization check |
| Hostile amphibious landing (MIL-04, required for the complete game) | Explicit hostile-landing operation under formal war eligibility | Emit a contested arrival for combat resolution. Provincial control changes only through a separately resolved territorial outcome. |

Keep journey lifecycle, operation type, eligibility and arrival outcome distinct. The MIL-04 arrival contract must accommodate configurable landing penalties, a temporary beachhead distinct from provincial ownership, maritime supply, reinforcement and evacuation. MIL-03 escorts, interception and blockades can modify journey availability or produce interruption events. Future naval and air combat can act on those same journey and arrival events. MIL-01A implements only friendly arrival semantics.

## 4. Diplomatic land transit

A transit grant is a directional entitlement from the host to a named beneficiary. It lists permitted corridor IDs, starts at a committed week, and has an expiry or explicit revocation. A corridor may require grants from each transit host. Transit permission supplies neither basing rights nor the ability to fight, collect revenue, occupy or change control in the host region. An alliance may simplify the grant decision later. It never silently activates transit.

For the initial transit release, use approved passages with both end regions controlled by the traveling country. This supports connecting separated friendly areas. To make international participation possible in the subsequent stage, add an explicit allied staging grant and a separate movement/combat eligibility check for that location. Transit alone does not permit an isolated country to reinforce a foreign ally. Keep foreign staging and attacks from a staging area gated until the combat model has explicit friendly, hostile and neutral relationships.

A neutral host can grant limited peacetime passage, decline it, or withdraw it. Formal war and neutrality policies are prerequisites for wartime transit. Recommend a default of no authorization through a neutral host during a war unless an explicit conflict-specific grant permits it. The initial AI host can make a deterministic decision from a policy profile, relationship threshold, neutrality and expiry. Show a reason and allow a later reconsideration. No full simulation for the host is required. Resolve expiry and withdrawal before new departures. A division already traveling may finish a still-safe return or use the same waiting/fallback logic as maritime transport. A grant change never causes instant capture or displacement of host territory.

## 5. State and integration

| Layer | Proposed additive contract |
|---|---|
| Scenario | Optional versioned mobility section with stable endpoint and route IDs, mode, direction, duration, shared capacity group, cost-rule ID, eligible host IDs and fallback endpoint IDs. Validate every reference, positive integer duration/capacity, and mode-specific restrictions. Use new immutable package versions for graph or rule changes. Static routes are loaded from scenario data. |
| Game state | Optional mobility block holding one journey per traveling division, endpoint and grant availability, effective weeks, and status. Use an explicit location accessor returning a region or journey so land combat, visibility and ownership never infer presence from a stale region ID. Keep a separate versioned grant record and leave military and economic ownership independent. |
| Commands and queries | Add tagged transport, cancel/return, grant and revoke commands with actor and stable target IDs. Add pure route-option and order-preview queries returning earliest arrival, cost, available slots and reasons. Route previews are provisional until settlement. |
| Weekly settlement | Validate command structure and actor ownership on the opening snapshot. Apply diplomacy and closures, settle existing journeys, then allocate departures using a stable capacity and spending reservation order. Resolve eligible land orders and pass resulting territorial control and transport charges to one game/economy commit. An arrival uses the phase snapshot, so a newly captured region cannot unlock transport in the same settlement. An arrived unit may defend but cannot move or attack until the next week. |
| Contention and rollback | Expected contention, a lost grant or an unavailable endpoint produces an order outcome without blocking the week. Invalid input and engine failure preserve the prior checkpoint and drafts. For shared slots, rotate actor priority by week with a stable division-ID tie-break. Store the selected allocation rule in the ruleset so identical inputs replay identically. |
| Multiplayer | For 2–4 humans, gather one authorized order set per seat and settle one canonical week after the readiness barrier or the match timer. Keep drafts private until the agreed visibility rule applies. Persist committed week, seat-to-country mapping and admitted command IDs so resubmission cannot spend twice. The current single-player bridge and engine player ID require an explicit multi-actor adapter and authorization model before online integration. Use synthetic multi-actor tests first. |
| SAVE-01 | Pin scenario identity, package and economy fingerprints, and mobility rules/schema version. Save journeys, grants, route availability, per-seat drafts where supported, and latest results. Validate one location per division, monotonic weeks, references and legitimate controllers. Load old fictional records as mobility absent with unchanged results. Keep draft.2 and the final WORLD-05 opening compatible with their exact initializers. Reject unknown versions with a message and preserve the stored checkpoint. |
| Reports and visibility | Extend the result union with departed, arrived, refused, delayed, returning and unavailable events. Report cost only when charged and show the reason, unit, destination and revised arrival week. Filter by viewer. Neighboring players can learn their own grant use under the approved visibility policy, without seeing private force composition or plans. |

### Mobile screens

- **Military → Division → Transport** opens a bottom sheet. Show a short list of legal destinations with mode, earliest arrival and slots. Show cost only when a later ruleset introduces one. One **Stage order** button confirms. A map tap can select a destination, with the same action available from the list.
- **Military → In transit** displays one row per division, its arrival week and any change. A return action sits inside the division detail. The map shows an optional route overlay, with line styles and text labels that distinguish it from trade.
- **Diplomacy → Transit** shows grant scope, expiry, and pending requests. Weekly reports group movement changes into one compact summary with expandable exceptions. Standing journeys carry forward without repeated taps.

Measure player decision time with two and four seats over the existing 52/104/156-week options. A one- to two-hour session is a playtest target. A 52-week match can average roughly 70–140 seconds per turn including synchronization and reporting. Longer matches need faster turns or multiple sittings. Record median and p95 turn time and where players stop to inspect the interface before changing the timer or match lengths.

## 6. Gameplay examples

1. **Island resupply.** A division uses a game-authored sea route to friendly-controlled Corsica. The civilian shipping lane continues independently. If the game endpoint closes before the division arrives, the report shows the return or fallback with its estimated week. With one departure slot and two orders, one division leaves and the other receives a capacity reason.
2. **Access and foreign staging.** A UK player aspires to join a mainland conflict. The allied port requires a separate staging grant after that feature exists. A neutral transit offer on its own cannot be used for unloading or to initiate combat. A future fixed crossing is an alternative only when its own permissions and availability pass.
3. **Transit withdrawn.** A simulated neighbor revokes a corridor grant before the week settles. A staged Turkish division remains at its starting region. A division already traveling uses the interruption rule. The neighbor’s territorial and economic control remains its own.

## 7. Alternatives and milestone sequence

| Approach | Depth | Implementation and AI | Phone UI and performance | Saves, extensibility and balance |
|---|---|---|---|---|
| A. Minimal explicit sea routes | Island connections and basic travel choices | Low. Authored routes, simple eligibility, AI can hold or pick a reachable friendly destination | Few controls; indexed lookup and bounded journey updates | Small additive save block. A useful first increment if it uses the shared journey model. Unlimited lift or free travel can erase geographic constraints. |
| B. Capacity-limited transport with transit | Timing, competing lift, diplomacy and access | Medium. Reservations, interruptions, grant lifecycle and deterministic host AI | One order sheet and concise weekly events. Fixed authored routes avoid all-pairs pathfinding | Journeys and grants add versioned save state. Supports fixed crossings, basing and later interception. Balance depends on route coverage, neutral policy and chokepoint capacity. |
| C. Naval and logistical simulation | Escorts, blockade, interception and sustained operations | High. Naval actors, routing, supply and several interacting AI policies | More planning screens and a larger weekly simulation budget | Richer save state, visibility and replay needs. Extensible, with higher risk of overwhelming short sessions or favoring major maritime powers. |

Recommend **B as the target**, beginning with a bounded **A** implementation on the same journey state.

| Milestone | Approved sequence |
|---|---|
| MIL-01A | Friendly maritime transport in an independent synthetic fixture. Establish capacity, timed arrivals, recoverable waiting, replay and save compatibility. |
| MIL-01B | Explicit diplomatic land transit and revocation. |
| MIL-01C | Allied staging with separate authorization and foreign presence rules. |
| MIL-02 | Military logistics and supply. |
| MIL-03 | Naval warfare, escorts, interception and blockades. |
| MIL-04 | Mandatory amphibious operations, contested landings, beachheads and evacuation. |

European integration stays gated on validated WORLD-04 and WORLD-05-FINAL. Validate two- and four-seat synchronization before enabling multiplayer. Channel Tunnel work is deferred.

## 8. Acceptance and test plan

- **Rules and regression.** Re-run engine typecheck/tests, game tests and production build. Replay the fictional fixture and prior SAVE-01 records for identical game/economy outcomes. Run unchanged GAME-UX-01 browser checks and log any known intermittent report timeout. Compare immutable package checksums and verify public packaging includes only explicitly approved distributable content.
- **Transport and diplomacy.** Test friendly departure, shared capacity and actor contention, exact arrival week, cancellation before and after sailing, route and destination closure, occupied origin, recovery when an endpoint reopens, grant expiry/revocation and neutral refusal. Assert trade edges cannot authorize movement. Validate that a journey cannot attack, defend or confer territorial control. Confirm MIL-01A incurs no monetary charge and engine failure rolls back mobility, economy, game state and staged orders together.
- **Save and replay.** Snapshot staged orders, in-flight journeys, interruptions and expired grants. Reopen and replay to identical game/economy hashes, including duplicate submissions and reordered delivery to the canonical weekly resolver. Reject incompatible scenario versions, unknown IDs, duplicate locations and inconsistent weeks while retaining the saved record.
- **Coverage and phone UX.** Verify each island has an approved path to friendly movement and all six playable countries have a plausible route to participate once access and staging are enabled. Exercise keyboard and touch, portrait and landscape, readable reasons, safe-area layout, reload, report visibility and two- and four-player decision pacing. Simulated mobile browser passes and physical iPhone passes are recorded separately.
- **Performance.** Compare the 61-zone WORLD-04 baseline with 156-turn runs under expected and stressed traffic, including four actors, congested routes and simultaneous withdrawals. Record start, weekly median/p95/max, save+restore, serialized size and memory. WORLD-04’s 6× Chromium run already exceeded the max-week and save+restore targets, so investigate the baseline separately from mobility overhead. Run three times on the reference iPhone and use the existing thresholds of 250 ms median, 500 ms p95, and 1,000 ms each for slowest week, start and save+restore. Use indexed route and unit lookups and avoid per-unit global path searches.

## 9. Decisions for later integration and tuning

- Review authored routes, concrete capacities, endpoint availability and shared-capacity policy before enabling a scenario. Preserve the approved one- to two-week configuration range for MIL-01A.
- Confirm grant scope, neutrality and wartime policy in MIL-01B, then approve foreign staging and combat eligibility in MIL-01C.
- Review supply accounting, interception visibility, landing penalties, and beachhead control and evacuation rules within their respective milestones.
- Confirm the multiplayer authorization and readiness model, pacing goals, exact licensed scenario version, and physical iPhone acceptance before rollout.
