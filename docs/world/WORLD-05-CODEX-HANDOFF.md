# WORLD-05-FINAL — Handoff to Codex: military initialisation for the mobility study

**For:** Codex's separate military-mobility study. **Status:** data only.
- WORLD-05-FINAL changes no game code, UI, movement rule or engine file.
- WORLD-04 (PR #36) keeps European military operations disabled.
- Nothing here enables them; that needs its own approved task.

## 1. What is ready

- **The package:** `scenarios/europe-2023/1.0.0-draft.3/`, immutable and licence-clean, with `manifest.distributable: true` (see NOTICE.md).
  - It carries a complete `military` section: starting counts for all six countries and the P-1 placement on all 46 provinces.
  - The contract and its guarantees are in [WORLD-05-SCENARIO-SPEC.md](WORLD-05-SCENARIO-SPEC.md).
- **Identity:**
  - world fingerprint `12035be51198e4ee`;
  - week-1 economy hash `ff1a2f7acb5d4af3`;
  - content fingerprint `c796f615f0c46840…` (the manifest holds the full value).
- **Compatibility:** draft.1 and draft.2 are unchanged. Their saves stay tied to their exact version, so a draft.3 game is a new game.

## 2. How a game would use it (after approval, not now)

1. **Load and verify.** Load the package with WORLD-04's loader, which checks the manifest, the hashes and the fingerprints. A version allow-list then has to admit `1.0.0-draft.3`; that is a WORLD-04 or release decision.
2. **Create the starting divisions.** For each `(province, n)` in `military.placement.byRegion` with `n > 0`, create `n` divisions:
   - owned by `regions[province].ownerId`;
   - stationed in that province;
   - each with manpower `military.parameter.value` (25,000 personnel equivalents);
   - with the default order, as the fictional scenario's divisions have.
3. **Use the existing movement graph.** Movement uses `regions[].movementAdjacentRegionIds` (= `links.movement`, land only). Maritime links never carry armies (`links.maritime[].movement === false`). Corsica, Northern Ireland, Sicily and Sardinia start with no division and cannot be reached.
4. **Label the forces illustrative** wherever they are shown.
5. **Keep the economy unchanged.** The engine already simulates military spending separately (`spendMilitary`), and divisions do not cost or consume anything in the current model.

## 3. Facts the mobility study needs

| Fact | Value | Source |
|---|---|---|
| Land movement links | 74 | `links.movement` |
| Cross-border links between playable countries | 7: DEU–FRA 2, DEU–POL 3, FRA–ITA 2 | §4 of the spec |
| Theatres | one continental theatre (FRA 8, DEU 7, ITA 4, POL 7 provinces; 56 divisions); Great Britain (7 provinces, 14) and Türkiye (9, 20) isolated; 4 islands isolated | `docs/world/data/world05-military-proposal.json`, `movement_theatres` |
| Divisions on frontiers, P-1 | DEU 4 – FRA 3; DEU 4 – POL 4; FRA 4 – ITA 6 | same file, `frontier_divisions` |

**Isolation (P-2).** Under the current rules, 34 of the 90 divisions (the UK's and Türkiye's) can never engage another country. The owner accepts this for the prototype only, not for the complete game. Options for the mobility study to evaluate are below. **None is approved.**
- a movement link for the Channel Tunnel (`gbr-se`–`fra-ne`), as a fixed link rather than a sea lane;
- naval transport or amphibious movement over existing `links.maritime` lanes;
- strait transit for the Bosporus and Dardanelles, which are internal to `tur-ist` and `tur-mar` today;
- military presence for simulated neighbours, for example Greece and Bulgaria facing Türkiye (WORLD-02 decision D7).

**The placement adapts without manual change.** It is computed only from land movement links, so any of these options just needs a new package version and the same placement function (`scenarios/pipeline/military_placement.py`) re-run.
- **A link to an island** makes that island reachable, and it then receives a division under the same rule.
- **New frontier provinces** receive the frontier weight.

## 4. Open owner decisions that affect the military data

| ID | Decision | Current state |
|---|---|---|
| W5F-M1 | Türkiye's starting count until route C clears M-3: 20 (per-capita proxy, current), 14 (median count) or another value | 20 |
| W5-L1 / M-3 | Türkiye by Rule W (16) once the Ministry gives permission | waiting for permission (letters prepared, not sent) |
| P-2 | Remove the isolation in the complete game | for the mobility study |
| P-1 | Placement stays provisional; P-0 is the documented alternative | P-1 |

## 5. Files

- **Package data:** `scenarios/europe-2023/1.0.0-draft.3/scenario.json`, section `military`.
- **Placement function:** `scenarios/pipeline/military_placement.py`, deterministic and standard library only.
- **Where counts and placement are built:** `scenarios/pipeline/build_inputs.py --licensed`, writing `scenarios/europe-2023/build-licensed/inputs.json`.
- **Summary and P-0 comparison:** `docs/world/tools/world05_military.py`, writing `docs/world/data/world05-military-proposal.json`.
- **Validator:** checks M1 (counts and statuses) and M2 (placement totals, nothing stranded, nothing empty) in `scenarios/pipeline/validate_scenario.py`.
