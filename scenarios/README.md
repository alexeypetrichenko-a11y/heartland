# Real-world scenario data (WORLD-03)

**Review draft. Nothing here is loaded by the game.** The fictional scenario, its saves and the engine are unchanged.

## Layout

| Path | What it is |
|---|---|
| `pipeline/` | The data pipeline (Python standard library, plus `pdftotext` for the two Turkish reports in the fetch step) |
| `europe-2023/sources/` | One small snapshot per source dataset, each with:<ul><li>exact query URL and retrieval date</li><li>the publisher's update stamp</li><li>licence and attribution</li><li>only the values used</li></ul> |
| `europe-2023/build/` | Intermediate outputs: `geography.json`, `inputs.json`, `calibration.json`, `world-spec.json`, `week1.economy.json` |
| `europe-2023/build-licensed/` | WORLD-05-FINAL: the licence-clean build for `1.0.0-draft.3` (`--licensed` / `WORLD03_FINANCE=licensed`). It never reads the restricted Turkish snapshots |
| `europe-2023/licences.json` | Licence register: status, licence, attribution and evidence per publisher, plus the OECD dataset table. It produces `NOTICE.md`, `ATTRIBUTION.json` and the manifest's `distributable` flag |
| `europe-2023/1.0.0-draft.1/`, `1.0.0-draft.2/`, `1.0.0-draft.3/` | draft.1 and draft.2 are restricted review drafts (Turkish sources without a reuse licence). draft.3 is licence-clean, with `distributable: true` and `NOTICE.md` / `ATTRIBUTION.json` beside the content files (outside the fingerprint; hashes in the manifest) |
| `europe-2023/1.0.0-draft.1/` | The versioned package (immutable once published; a correction becomes a new version). `manifest.json` lists the SHA-256 of the five content files (`scenario.json`, `week1.session.json`, `world-spec.json`, `provenance.json`, `calibration-report.json`) and the content fingerprint computed over them. The results beside them (`validation-report.json`, `benchmark-*.json`, `REPORT.md`) describe the package and are not part of its fingerprint |

The calibration, packaging and benchmark steps are TypeScript scripts that use the engine. They live in `economy-engine/sim/world03/`, so the engine's typecheck covers them.

## Reproduce

**Step 1 needs the network.** It is the only step that does. Re-run it only to refresh the data; publishers revise their figures, and the snapshot dates and hashes show what changed:

```bash
python3 scenarios/pipeline/fetch_sources.py
```

**Steps 2–4 are offline and deterministic:**

```bash
python3 scenarios/pipeline/build_geography.py
```

```bash
python3 scenarios/pipeline/build_inputs.py
```

```bash
node --experimental-strip-types economy-engine/sim/world03/calibrate.ts
```

```bash
node --experimental-strip-types economy-engine/sim/world03/package.ts
```

**The licence-clean package `1.0.0-draft.3`** (WORLD-05-FINAL). The four Türkiye snapshots come from `fetch_sources.py --only turkey_licensed`. The same method as draft.2, on `build-licensed/`:

```bash
python3 scenarios/pipeline/build_inputs.py --licensed && python3 scenarios/pipeline/build_budget.py --licensed && python3 scenarios/pipeline/build_financing.py --licensed
```

```bash
WORLD03_FINANCE=licensed WORLD03_ROUNDS=24 node --experimental-strip-types economy-engine/sim/world03/calibrate.ts && WORLD03_FINANCE=licensed node --experimental-strip-types economy-engine/sim/world03/package.ts
```

```bash
WORLD05_PACKAGE=1.0.0-draft.3 node --experimental-strip-types economy-engine/sim/world03/final-runs.ts
```

Without `--licensed` / `WORLD03_FINANCE=licensed` every step behaves as before, and draft.1 and draft.2 rebuild byte-for-byte.

**Checks, benchmarks and the report:**

```bash
python3 scenarios/pipeline/validate_scenario.py scenarios/europe-2023/1.0.0-draft.1
```

```bash
node --expose-gc --experimental-strip-types economy-engine/sim/world03/bench.ts scenarios/europe-2023/1.0.0-draft.1 --repeats 2
```

```bash
node economy-engine/sim/world02-browser-bench.cjs scenarios/europe-2023/1.0.0-draft.1 --scenario scenarios/europe-2023/1.0.0-draft.1 --repeats 2 --rates 1,4,6 --html /tmp/world03-iphone-bench.html
```

```bash
python3 scenarios/pipeline/report.py scenarios/europe-2023/1.0.0-draft.1
```

What each step guarantees:
- `build_inputs.py` exits with status 2 and writes nothing if a **mandatory** input is missing (for example, a playable country's debt). It never fills a gap with an invented value.
- `package.ts` refuses to write the package unless the rebuilt week-1 economy has exactly the hash the calibration produced.
- The validator re-runs the WORLD-02 checks too.

## Status values used in `provenance.json`

| Status | Meaning |
|---|---|
| `data` | From a source snapshot (possibly summed or divided, as stated in `method`) |
| `estimate` | Derived with a documented rule because the exact figure is not published |
| `unavailable` | Not published in a verified source. The engine default is used and flagged |
| `engine-limit` | The data value is outside what the engine accepts. The nearest accepted value is used and flagged |
| `design` | A game-scale parameter or rule, not a measurement |
| `derived` | Arithmetic on published values from cleared sources (draft.3), as stated in `method` |
| `assumption` | A documented gameplay value where no cleared source exists (draft.3: Türkiye's starting forces, its dividends) |
