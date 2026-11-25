# WORLD-05 — Scenario specification for the next europe-2023 version (proposal)

**Status:** proposal for owner approval; nothing here is implemented. It specifies what `europe-2023/1.0.0-draft.3` should contain once decisions W5-L1, W5-L2, W5-F1, M-2, M-3 and P-1 ([WORLD-05-REPORT.md](WORLD-05-REPORT.md) §8) are made. It is the coordination point between the scenario pipeline and the game: the game reads these fields and implements no rule that is not listed here. `1.0.0-draft.1` and `1.0.0-draft.2` stay unchanged.

## 1. `scenario.json` → `military`

Today (draft.2) the section holds draft counts for five countries and `tur: unresolved`, and no placement. The proposal:

```jsonc
"military": {
  "status": "illustrative starting forces (approved D3, M-2, M-3, P-1)",
  "parameter": { "personnelEquivalentsPerDivision": 25000, "status": "approved (M-2)" },
  "countries": {
    "tur": {
      "divisions": 16,
      "personnelEquivalents": 407542,
      "method": "Rule W: defence pay / (whole-economy compensation / employees) / 25,000",
      "sources": ["<central budget defence snapshot>", "es_national_d1_tr", "es_lfs_employees_tr"],
      "substitutions": ["central government budget (cash) for COFOG 02 x D1", "LFS employees"],
      "status": "data"
    }
    // fra 15, deu 13, gbr 14, ita 15, pol 13: unchanged values from draft.2
  },
  "placement": {
    "rule": "P-1",
    "byRegion": { "fra-idf": 2, "fra-ne": 3, "fra-cor": 0 /* ... all 46 provinces ... */ },
    "notes": { "fra-cor": "no movement link: no starting division" }
  }
}
```

**Rules the data guarantees** (checked by the validator, new check M2):
- **Counts.** For every playable country, `sum(placement.byRegion) = countries[c].divisions`.
- **No stranded divisions.** A province gets ≥ 1 division if, and only if, it is in its country's main land-movement area. Today that excludes `fra-cor`, `gbr-nir`, `ita-sic` and `ita-sar`, which get 0.
- **Deterministic.** Placement is computed by [`tools/world05_military.py`](tools/world05_military.py) (rule P-1 or P-0), never edited by hand.
- **Uniform manpower.** Every division has `personnelEquivalentsPerDivision` manpower. Divisions have manpower only, as in the current model.

**What the game does with it (Codex, after approval):**
- **Start.** Create `divisions[c]` divisions owned by country `c` in the listed provinces when a European game starts.
- **Rules.** Use the existing move, defend and attack rules on `links.movement`, which is land only.
- **Labelling.** Label the forces "illustrative".
- **Not in scope.** No new mechanic: no equipment, upkeep, readiness or naval transport.

Until the section is approved, WORLD-04's "military operations unavailable" state stays as it is.

## 2. Türkiye's fiscal inputs (route A or B of W5-L1)

The new snapshots go in `scenarios/europe-2023/sources/`, fetched by `scenarios/pipeline/fetch_sources.py`. Their licence fields are filled from the permission letter (route A) or from TurkStat's reuse notice (route B).

| Engine input | Mapping (unchanged from draft.2) | Ministry GFS 2023 line (`docs/world/data/world05-turkiye-inputs.json`) |
|---|---|---|
| `spendSocial` | social benefits / GDP | 27 Sosyal Yardımlar |
| `spendMilitary` | defence by function / GDP | 702 Savunma Hizmetleri |
| `spendInfrastructure` | gross investment ≈ net investment in non-financial assets + consumption of fixed capital | 31 + 23 |
| `spendAdministration` | compensation + goods and services − defence (defence is not split by economic type) | 21 + 22 − 702 |
| outside the engine | subsidies, interest and other expense (draft.2) | 25 + 24 + 28; **proposed:** add 26 grants paid (0.09% of GDP; not in the Court of Accounts extract) |
| balance target (C5) | net lending (W5-F1) | NBV/NBA, or the OECD Economic Outlook balance |
| debt | general government gross debt | per W5-L2 |

Under route C, only the OECD aggregates are data. The four spending lines become documented estimates, marked `status: estimate`.

## 3. Distribution metadata

**`manifest.json`, three fields:**
- **`distributable`:** a boolean that must be present. A missing field means `false`; draft.1 has none.
- **`notDistributableBecause`:** the existing field.
- **`licences`:** new. One entry per publisher, with the licence name, URL, attribution statement and verification date, generated from [`data/world05-licence-evidence.json`](data/world05-licence-evidence.json).

**`NOTICE.md`, a new package file outside the content fingerprint.** It lists the attribution statements required by:
- Eurostat ("Source: Eurostat");
- ONS (the OGL v3 statement);
- the World Bank (CC BY 4.0, with the licence link);
- the OECD;
- TurkStat or the Ministry, per W5-L1.

It adds Natural Earth as a courtesy and says that "values were transformed (calibrated) by Heartland".

**Public packaging rule (for the release build, after deployment authorisation):**
- **Allow-list.** Include a version only if it is explicitly allow-listed by the owner **and** its manifest says `distributable: true`.
- **No exceptions.** Restricted drafts never enter `dist/`.

## 4. Build and acceptance plan for `1.0.0-draft.3`

1. Fetch the new snapshots (§2). Run `world05_licence_audit.py`: it must show **no `restricted` verdict** in draft.3's citations, and no `confirm` verdict once W5-L3 is done.
2. Run `build_inputs.py`, `build_budget.py` and `build_financing.py`, then `WORLD03_FINANCE=final WORLD03_ROUNDS=24 calibrate.ts` writing to a new build folder.
3. Build `package.ts` into a **new folder** `1.0.0-draft.3`. draft.1 and draft.2 must stay byte-identical; `git diff` must be empty for both.
4. Run `validate_scenario.py` on draft.3 with C1–C8, the existing checks and the new M2. Then:
   - P2: `distributable` must agree with the audit;
   - save compatibility (`sim/econ08/compat.ts`);
   - engine and game tests;
   - `final-runs.ts`: the 156-week baseline must have **no default, lost market access, unrest or regime change**, while stress runs still produce them;
   - benchmarks and the physical-iPhone thresholds (F-1).
5. Write the WORLD-05 report section for draft.3 and present it for review. Nothing is deployed without a separate authorisation.
