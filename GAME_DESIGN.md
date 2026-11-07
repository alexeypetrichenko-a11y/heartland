# Heartland — Game Design Document

**Version:** 1.0 — approved concept baseline  
**Date:** 2026-11-07  
**Status:** Design reference, **not** a claim that these mechanics are implemented.  
**Owner approval:** Rules recorded here reflect the decisions made in the design discussions. Unresolved balancing and technical details are explicitly marked.  
**Development philosophy:** Deliver a small playable vertical slice early; expand in controlled stages. Codex must not interpret this entire document as an instruction to implement everything at once.

## 1. Vision and pillars

Heartland is a modern geopolitical grand-strategy game centered on statecraft, economics, diplomacy, national power and warfare. It is broader than a pure military wargame: economic and diplomatic choices matter significantly, **without losing the substantive military component**.

- Playable in a browser and eventually as an installable Progressive Web App (PWA). iPhone is the first-priority interface; Android, iPad and desktop browsers are also supported.
- A single-player simulation against AI should be capable of running locally without an internet connection once installed/offline assets are available. This is a *target*, not a feature already implemented.
- Later, 2–4 people play simultaneous weekly turns together via invitation links; internet connectivity is required to synchronize online matches. No cloud LLM is necessary for AI decision-making.
- Sessions should generally be approachable in roughly 1–2 hours, but the selected number of turns and timer can make matches longer. Do not promise a fixed real-time duration.
- Private autonomous activity and standing orders reduce repetitive micromanagement. Player choices emphasize strategic priorities.

### Design versus implementation

**Approved design:** Rules specified in this document.  
**Initial playable slice:** Only the narrow features explicitly scheduled in `TASKS.md`.  
**Future/full experience:** Remaining approved systems added incrementally; there is no permission to implement them proactively.

The existing repository uses React + TypeScript + Vite and GitHub Pages at `/heartland/`. Respect `AGENTS.md`, existing code and deployment configuration.

## 2. Players, countries and initial world

- A multiplayer match supports **2–4 human players**. Each human chooses a distinct country. All unselected countries are governed by AI.
- Country selection is unrestricted by power; show an informational comparison and warning if starting capabilities are substantially different. This warning must not prevent selection.
- Begin in an **alternative contemporary world** approximating modern geography, borders, population, economic sectors, industrial potential, resources and military capability. The match starts **without active wars**. Initial diplomatic relations are simplified; historical wars do not automatically resume.
- Territorial disputes and disputed borders in the neutral-start data set are **open design/data questions** and must not be silently settled by Codex.
- All governments are treated as regimes/dictatorships for game-mechanical purposes; there is no electoral cycle. The player represents the survival of the ruling regime.
- AI countries act proactively based on national interests and risk/benefit assessment. Their activity includes economic policy, investment priorities, military development, trade and diplomacy, potential wars and peace proposals. They do **not** need a cloud language model.

## 3. Turn structure, timing and persistence

- **One turn equals one in-game week.** Human players issue orders simultaneously; the week's outcomes are resolved together.
- At match creation choose **52, 104 or 156 turns**, equivalent to one, two or three in-game years. The proposed default is 104 turns; default selection is a UI setting, not a separately approved balancing rule.
- Turn timers are selectable: **30, 60, 90, 120 seconds or unlimited**. Suggested default is 60 seconds (not independently approved). If every active human presses Ready, the week resolves immediately. Otherwise it resolves when the configured timer expires. Unlimited mode waits for readiness.
- Orders already in effect persist automatically across turns unless completed, cancelled or changed: production, research, construction, logistics, trade policy and movement/operations.
- A pause requires agreement of all active human players; pauses stop the timer and resolution. Matches can be saved and resumed later; the full state must be preserved. Auto-checkpoints after completed turns are a proposed implementation convention.
- Temporary connectivity loss is **not** elimination; standing orders continue. A player who deliberately **permanently quits** is eliminated from competition and their country transitions to AI control, retaining its assets and diplomatic relationships. They cannot reclaim that seat during the same match.
- Online multiplayer: host creates a match and invites others via link; all choose distinct countries, confirm readiness and then play. State synchronization, reconnection and saves need an authoritative common simulation state. Decide client-hosted vs lightweight server synchronization only at the online implementation stage.

## 4. Map, regions, strategic points and transport

- Main map consists of **regions** with demographic and economic attributes, combined with **strategic points** (cities, ports, airports, major transport junctions and military installations).
- Cities are generally points; megacities can occupy larger strategic zones when necessary. Strategic points may change hands independently of the surrounding region.
- Map needs zoom and touch navigation appropriate for iPhone. Avoid assuming desktop hover or mouse-only input.
- Transport is multi-level: road, rail, maritime/ports and air/airports. Networks have differing capacities and constraints.
- Logistics is automatic by default, but players can change national priorities. Civilian and military goods compete for finite transport capacity. Routes, infrastructure damage, blockades and enemy control affect delivered supplies and local availability.
- Do not begin with an unapproved massive global map data import. The initial slice can use a clearly labeled small **illustrative, fictional test map**; this does not replace the future realistic world map.

## 5. Economy, sectors and regional markets

- Model sectoral economic activity (such as energy, agriculture, raw materials, manufacturing, transport and consumer supplies), not manual control of every firm.
- **Private enterprises operate autonomously**, expanding/investing and adjusting production in response to profitability, demand, inputs, available finance, capacity and infrastructure.
- Governments manage fiscal and strategic levers: taxation, public spending, infrastructure investment, policies, state procurement, and strategic reserves.
- Prices form in **interconnected regional commodity markets**, reflecting local supply/demand, transport cost/capacity, customs duties and scarcity. This explicitly replaces the obsolete idea of a single frictionless global market.
- Private inventories are automatic. Governments set targets/priorities for public strategic reserves such as fuel or food.
- Player may spend beyond revenue and borrow. Interest rates and debt service constrain future budgets. A sovereign default has serious economic/political consequences but **does not by itself eliminate the player**.
- Economic distress, scarcity, unemployment, famine and poor policy may produce regional unrest. Public expenditure and reforms can mitigate some risks, at fiscal cost.
- Game industries must be consistent with physical input/output constraints and logistics, but detailed equations and commodity lists are **deferred balancing work**.

## 6. Domestic politics, regime survival and unrest

- Regions are political/economic units, not separately micro-managed subnational governments. **No elections.** Internal instability is represented by public discontent, protests, strikes, rebellions and possible regime change.
- Regime overthrow = **immediate defeat** for the human player. Territorial loss, military capitulation, debt default and a deteriorating economy are **not automatically** defeat as long as independent governing power survives.
- An earlier conceptual example set crisis-episode regime collapse risks of **15% stable / 50% widespread protests / 100% catastrophic collapse**. These are **tentative balancing illustrations**, not final per-turn probabilities. A regime-collapse roll is assessed by **crisis episode**, not repeated every week of the same episode.
- Recently conquered or annexed regions can protest, strike or rebel. Conditions depend on living standards, economic activity, government policies, local security and relevant historical tensions. A prior foreign owner does not automatically create endless resistance.
- An uprising that succeeds can **create an independent state or restore a former country**. Newly emerged states are AI-controlled. Previously eliminated human players do not automatically return.
- Oppressive security policies, unrest escalation, armed separatist war, integration costs and the specific balance parameters are left for later implementation decisions.

## 7. Military — ground forces and equipment

- Primary land formation is a **division**, with manpower, equipment, experience, organization/readiness, morale and supply.
- Players form divisions, reinforce them and issue standing orders such as move, defend and attack. Combat may persist for multiple weekly turns, consuming supplies and inflicting losses over time. Retreat/repositioning can occur.
- New forces require actually available recruits, equipment, training time, industrial capacity and money.
- Equipment has **categories and technology generations**. The principal UI actions are **Produce** and **Upgrade**. Upgrade encompasses (1) research of newer generations and (2) physical modernization of already-built equipment, both with time/resource requirements. Existing equipment does not upgrade automatically.
- Defense equipment is manufactured by private industry in response to government contracts. Military exports require authorization from the supplying country's government.
- Supply routes matter: an encircled division consumes remaining supplies, deteriorates and may attempt a breakout or evacuation if feasible. It **surrenders automatically when morale falls below a critical threshold** rather than after an arbitrary set number of weeks. Prisoners of war are counted and may later be exchanged or repatriated; returned personnel rejoin available manpower.
- Strategic sites may be seized separately from regional ownership. Their local battles/sieges persist as required; detailed urban combat remains deferred.

## 8. Aviation and air defense

- Aircraft operate as air formations based at airfields. Missions include air superiority, close air support, strikes against infrastructure/airfields and naval targets, and reconnaissance where available.
- Aircraft can be shot down by hostile fighters and **ground-based air defense**. Lost planes and trained crews must be replaced.
- Surface-to-air/ground air-defense units are stationed at strategic points and protect an operating radius that may cross region boundaries. Their effectiveness depends on ammunition, technology and readiness.
- Aircraft may try to suppress or destroy air defenses at risk to themselves; ground forces may seize/destroy their locations.
- Carrier aviation and land-based naval aviation can attack ships and protect fleets subject to range, shipboard defenses and opposing aircraft.

## 9. Navy, commerce, blockades and amphibious assault

- Warships are organized into task forces operating from ports. Missions: patrol, escort convoys, impose blockade, engage enemy fleets and support amphibious actions.
- Ship classes have technological generations and different naval roles, including surface combatants, submarines, carriers and amphibious ships. Fuel, maintenance, damage and replacement matter.
- Submarines are stealth assets that can threaten merchant shipping and warships; anti-submarine warfare by ships, planes or submarines gives probabilistic detection, not guaranteed omniscience.
- Naval blockades are **partial, not perfect**. Some shipments get through; others are delayed, diverted or destroyed. Escorted convoys and alternative routes help mitigate impact, which then flows through to regional prices and industrial shortages.
- Amphibious attacks require preparation, troop shipping, logistics and naval/air protection. Landings can incur transit and beachhead losses; combat may continue over multiple turns and establishing resupply/port access is important.

## 10. Diplomacy, treaties, assistance and sanctions

- There are **two diplomatic channels**: (1) global public statements/chat visible to everyone and (2) private bilateral chats between the negotiating countries.
- For an AI counterpart, the player communicates via selectable, context-aware proposal options rather than a mandatory internet LLM. The system may generate rule-based replies.
- Diplomacy supports treaties, alliances, ceasefires, peace settlements, demands/ultimatums, coalitions, assistance and sanctions.
- **AI countries always honor treaties**, including required notice periods. Human players may break a treaty, but an immediate violation damages **reputation/trust**, distinct from the bilateral relationship score. A treaty may be ended with proper contractual notice **without a trust violation**, although political relations can still change.
- Countries may supply humanitarian/economic aid (cash or physical goods) and intergovernmental loans with interest, maturity, restructuring or forgiveness. International joint infrastructure projects are postponed.
- Tariffs and sanctions can be targeted to specific goods/sectors and import/export directions. Physical flows should reflect actual policy.
- Sanctioned goods may **not be laundered through third-country re-export** to circumvent the sanction. However, the sanctioned state may legally source equivalent goods from a different, non-sanctioning supplier.
- A state can invite others into a sanctions coalition; each AI country makes its own decision.

## 11. Intelligence, visibility and information

- General economic indicators and public diplomacy are visible to all. Private bilateral diplomacy is known only to its parties.
- Neighboring countries automatically see **stationary military infrastructure within 75 km inward from a shared border**; visibility of infrastructure does **not** reveal exact garrison, aircraft numbers, stored equipment, ammunition or orders.
- Infrastructure beyond that belt is hidden unless detected. Exact unit positions, strength, readiness, logistics and operational plans are normally obscured.
- Large troop concentrations and substantial troop movements in the border area **may be detected automatically**, but the exact force structure and headcount remain uncertain. Detection scales with activity; warnings are informative, not proof of an imminent attack.
- No full espionage/agent/satellite minigame is authorized for the first playable slice.

## 12. War endings, sovereignty and postwar settlement

- Countries can negotiate ceasefires, armistices and peace during hostilities. A country unable to sustain military resistance can be forced to capitulate. **Military capitulation is not identical to the player's regime defeat.**
- Peace terms are freely proposed. Acceptance should follow military/economic conditions, leverage and the substance of demands; do not impose an arbitrary war-score ceiling without owner approval.
- A victor can choose **complete annexation, annexation of selected regions, or a dependent (puppet) state**. A partial annexation settlement can leave a remaining independent or dependent country, as agreed in peace terms.
- Dependent states retain formal country identity and autonomous private-sector operation, but **the suzerain directly controls their foreign policy, economic policy and armed forces**.
- Full subordination of a human-controlled country means that human player **immediately loses**, regardless of whether the territory is annexed or kept as a dependent country. A human who merely makes limited concessions or capitulates while retaining an independent ruling regime can continue.
- AI-controlled countries are subject to the same territorial/economic changes but there is no human elimination event.
- Annexation incorporates territories, facilities, resources and industry into the victor's state; it does not imply immediate public loyalty or risk-free administration.

## 13. Victory and final scoring

### Victory

- **Immediate victory:** only one eligible human player remains; everyone else has been eliminated through regime loss, complete subordination or permanent withdrawal.
- **End-of-duration victory:** if multiple humans remain at turn 52, 104 or 156 (as selected), calculate their final national performance scores and rank surviving players.

### Approved top-level weights

| Scoring dimension | Weight |
|---|---:|
| Economic performance | **35%** |
| Military power | **30%** |
| Diplomatic influence | **20%** |
| Domestic political stability | **15%** |

Within **each** dimension, measure **50% absolute national power / outcome** and **50% progress relative to starting conditions**. Thus absolute economic strength and economic progress each account for 17.5% of the total score, for example.

- Military score needs more than raw unit count: include effectiveness, technology, operational readiness, logistics and meaningful ability to sustain war.
- Prevent absurd progress ratios caused by tiny initial baseline values. The exact normalized indicator definitions, scales, tie-breaking rules and anti-exploit constraints remain **open balancing questions**; Codex must not invent final formulas.
- Players eliminated before the final turn cannot win through the end-game ranking.

## 14. Rare random events

- Every country, human- or AI-controlled, has an **independent 0.3% chance per in-game week** to trigger a random event.
- Eligible event categories: natural disasters, crop failures, industrial accidents, epidemics and similar realistic shocks.
- On a trigger, choose the specific event and affected region appropriately; scale effects to geography, vulnerability, economic structure and infrastructure.
- The 0.3% is the **country-level weekly trigger rate**, not the rate per region and not a single world-wide roll.
- Approximate probabilities of at least one trigger for a given country: 14.5% over 52 weeks; 26.8% over 104; 37.4% over 156, assuming independent weekly draws.
- Effects should not overwhelm strategy. A seeded pseudo-random source should permit deterministic replay and testing where feasible.

## 15. UX and accessibility

- Prioritize touch-friendly iPhone layouts, readable text, safe areas, context menus and map interaction without hover dependency.
- Make core actions understandable for a non-expert player: state dashboard, region details, orders, economy, diplomacy, current events and next-turn controls.
- Always distinguish **confirmed intelligence**, **estimated intelligence** and **unknown information**.
- Use standing orders, summaries and alerts to keep a 30–120-second turn feasible.
- A player should not need to manually operate individual firms or repeat existing orders every week.
- Keep presentation separate from pure game rules; don't introduce unnecessary graphical or mapping dependencies without an explicit task.

## 16. Development stages and scope boundaries

### Stage 0 — Existing scaffold (verified via repository read on 2026-11-07)

The repository already contains React, TypeScript, Vite, GitHub Pages workflow, responsive starting screen and `AGENTS.md`. The repository README says **gameplay is not yet implemented**. Do not recreate the scaffold or overwrite existing working code.

### Stage 1 — First playable *solo* vertical slice (priority)

A small, explicitly fictional test map with a few regions and countries; country selection; week/turn progression; simple quantified economy and budget; one or two meaningful orders; a basic land-force model; very small diplomatic actions; predictable AI behavior; and a working end-of-match result. Use bounded test data and placeholders where final design details remain unresolved. Implement in small verified increments listed in `TASKS.md`.

**Stage-1 acceptance:** From an iPhone browser, a person can choose a country, issue an action, advance several weekly turns, observe economic/military/diplomatic change and AI reactions, and reach a result or ending. The build and GitHub Pages deployment remain functional.

### Stage 2 — Economic/logistics depth and military completeness

Interconnected regional markets, supply chains, transport constraints, reserves, production generations, research/modernization, persistent combat, strategic locations, internal political crises and refined AI behavior.

### Stage 3 — Air, naval and advanced international systems

Air forces/PVO, naval warfare, convoys and partial blockades, amphibious operations, sophisticated diplomacy, sanctions coalitions, dependency/annexation details, POWs and expanded events/intelligence.

### Stage 4 — Online multiplayer and robust distribution

Invite links, 2–4 player lobby, simultaneous submission/timers, authoritative resolution, persistence, pause voting, reconnect and transfer on permanent withdrawal; eventually installable offline-ready PWA for local single-player. Online multiplayer **requires internet** for synchronization, but not a cloud LLM for AI.

The stage divisions are delivery priorities rather than authorization for Codex to implement an entire stage in one task.

## 17. Explicitly unresolved decisions (do not silently fill in)

1. Exact economic goods/sectors, production/input coefficients and market-price formulas.
2. Precise UI scale, data sourcing and treatment of disputed modern borders.
3. Exact force sizes, casualty/retreat combat model, morale surrender threshold, air/naval balance, and site-capture mechanics.
4. Regime-collapse episode definition, unrest thresholds, uprising mechanics, and possible restoration of independence.
5. Final score normalization, indicator aggregation, tie-breaking and handling of unequal national starting power.
6. AI national priority weights, war thresholds, and diplomatic offer acceptance formulas.
7. Border detection probabilities, spotting geography beyond the infrastructure belt and intelligence upgrade mechanics.
8. Event tables, severities and event-selection distribution after the 0.3% country-level trigger.
9. Actual multiplayer hosting/synchronization method, security, reconnection and offline behavior.
10. UX details of default timer/game length; suggested values are not mandatory design approvals.

## 18. Change control

- `GAME_DESIGN.md` records **approved concept**, not completed features.
- `TASKS.md` is the prioritized, small-step delivery plan; `STATUS.md` reports reality after each development task.
- Codex must follow `AGENTS.md`, read these documents and implement **only the specifically assigned next task**.
- Any new mechanic or significant deviation requires the project owner's explicit approval before coding.
- Preserve working GitHub Pages deployment; run `npm run build`; use a dedicated branch/PR where available; never merge without the owner's instruction.
