# WORLD-02 — Engine performance feasibility

| | |
|---|---|
| **Engine measured** | The current `main` engine (ECON-07 merged, `84f8a53`), unmodified. No optimisation was made. |
| **Target** | Provisional: one weekly turn completed in ≤ 0.5 s on the reference iPhone |
| **Reproduce** | `node --expose-gc --experimental-strip-types economy-engine/sim/world02-bench.ts <dir>` (Node). Then `node economy-engine/sim/world02-browser-bench.cjs <dir> --html <dir>/world02-iphone-bench.html --rates 1,4,6` (Chromium, and the iPhone page). Results: [`data/world02-bench-node.json`](data/world02-bench-node.json), [`data/world02-bench-browser.json`](data/world02-bench-browser.json) |

## 1. What was measured

**Five synthetic worlds** shaped like the proposed scenario (`economy-engine/sim/world02-bench-worlds.ts`): six playable countries with several provinces each, single-zone simulated countries and single-zone blocs.

| World | Playable provinces | Simulated countries | Blocs | Lanes |
|---|---:|---:|---:|---:|
| 30 zones | 22 | 4 | 4 | 65 |
| 45 zones | 33 | 7 | 5 | 100 |
| **60 zones** (the proposed scenario) | **45** | **10** | **5** | **128** |
| 75 zones | 56 | 13 | 6 | 164 |
| 60 zones, dense links | 45 | 10 | 5 | **194** (to test sensitivity to trade links) |

- **Synthetic inputs.** Population, productivity and advantages are drawn from a seeded random generator. They are not data about any country; they only give the engine the right number and mix of zones and trade links. Real calibration may change costs somewhat (for example, larger price adjustments in early weeks).
- **Production path, through the public integration API:**
  1. Build the world offline.
  2. Save week 1.
  3. Start a game from that save (`startEconomyFromSave`, as the game does).
  4. Play 155 weekly turns through `advanceEconomyWeek`: copy, week and weekly summary, with the AI autopilot steering every non-player country.
  5. Save and restore (`saveEconomySession`, `loadEconomySession`).

## 2. Results (all measured)
### 2.1 Node.js (desktop, measured)

Node v22.23.4, linux x64, 4 vCPU container. Same synthetic worlds, seed 2401.

| Configuration | Zones | Lanes | Build world (s) | Week median (ms) | Week p95 (ms) | Week max (ms) | 52 weeks (s) | 104 weeks (s) | 156 weeks (s) | Heap after 156 weeks (MB) | Week-1 save, raw / gzip (KB) | Week-156 save, raw / gzip (KB) | Start from save (ms) | Save (ms) | Restore (ms) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---:|---:|---:|
| 30 zones | 30 | 65 | 5.0 | 15.5 | 26.4 | 90 | 1.1 | 2.0 | 2.7 | 13 | 804 / 288 | 1062 / 414 | 5.7 | 8 | 7 |
| 45 zones | 45 | 100 | 8.7 | 28.5 | 40.9 | 94 | 1.5 | 3.1 | 4.7 | 16 | 1194 / 432 | 1506 / 584 | 7.8 | 11 | 9 |
| 60 zones | 60 | 128 | 14.5 | 45.4 | 72.8 | 85 | 2.6 | 5.5 | 8.0 | 18 | 1590 / 577 | 1938 / 750 | 13.9 | 14 | 12 |
| 75 zones | 75 | 164 | 20.4 | 69.9 | 110.7 | 119 | 3.9 | 7.6 | 11.7 | 20 | 2007 / 730 | 2407 / 931 | 12.3 | 20 | 20 |
| 60 zones, dense links | 60 | 194 | 13.9 | 46.0 | 77.5 | 87 | 2.5 | 5.2 | 7.9 | 20 | 1594 / 578 | 1944 / 752 | 9.1 | 20 | 17 |

### 2.2 Headless Chromium with CPU throttling (measured; a proxy, not an iPhone)

The engine is bundled exactly as the game loads it (`src/integration/index.ts`, 153 KB minified). The game starts from the pre-built week-1 save. The JS heap is Chromium's `performance.memory`.

| Configuration | CPU slowdown | Start from save (ms) | Week median (ms) | Week p95 (ms) | Week max (ms) | 52 weeks (s) | 104 weeks (s) | 156 weeks (s) | Save (ms) | Restore (ms) | JS heap (MB) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 30 zones | 1× | 8 | 8 | 29 | 88 | 0.9 | 1.2 | 1.7 | 8 | 4 | 36 |
| 30 zones | 4× | 44 | 31 | 57 | 342 | 2.4 | 4.2 | 5.8 | 31 | 15 | 21 |
| 30 zones | 6× | 57 | 50 | 86 | 624 | 3.9 | 6.5 | 9.3 | 51 | 30 | 17 |
| 45 zones | 1× | 13 | 13 | 27 | 137 | 1.2 | 1.9 | 2.6 | 11 | 4 | 48 |
| 45 zones | 4× | 46 | 60 | 104 | 525 | 4.5 | 7.7 | 10.8 | 54 | 22 | 33 |
| 45 zones | 6× | 81 | 90 | 155 | 672 | 6.5 | 11.3 | 15.9 | 68 | 37 | 28 |
| 60 zones | 1× | 15 | 21 | 46 | 165 | 1.6 | 2.7 | 3.8 | 12 | 5 | 58 |
| 60 zones | 4× | 62 | 92 | 129 | 508 | 5.8 | 10.8 | 15.6 | 70 | 35 | 38 |
| 60 zones | 6× | 69 | 142 | 212 | 712 | 8.7 | 16.7 | 24.1 | 80 | 39 | 51 |
| 75 zones | 1× | 14 | 28 | 40 | 228 | 2.0 | 3.6 | 5.1 | 15 | 6 | 69 |
| 75 zones | 4× | 60 | 141 | 218 | 617 | 8.3 | 16.1 | 23.8 | 102 | 39 | 33 |
| 75 zones | 6× | 122 | 211 | 301 | 962 | 12.4 | 23.7 | 35.2 | 113 | 46 | 54 |
| 60 zones, dense links | 1× | 19 | 21 | 40 | 217 | 1.7 | 2.8 | 3.9 | 12 | 5 | 38 |
| 60 zones, dense links | 4× | 51 | 93 | 145 | 478 | 6.2 | 11.0 | 16.0 | 58 | 19 | 40 |
| 60 zones, dense links | 6× | 115 | 145 | 216 | 927 | 9.1 | 16.7 | 24.6 | 91 | 36 | 32 |

## 3. Findings

| Question | Answer (measured unless marked) |
|---|---|
| Weekly turn at 60 zones | Node median **45 ms**. Chromium median **21 ms** at 1×, **92 ms** at 4× and **142 ms** at 6× (95th percentile 212 ms). |
| Against the 0.5 s target | **Met at 60 zones** in throttled Chromium for the median and 95th percentile. The single slowest week of 156 reached **0.71 s** at 6×. That is probably a JIT warm-up or garbage-collection outlier; the run did not record which week it was. |
| 75 zones | Median 211 ms and 95th percentile 301 ms at 6×, but the slowest week took **0.96 s**. Feasible, with less margin. |
| Growth with zone count | Median weekly time (Node) goes 15 → 29 → 45 → 70 ms for 30 → 45 → 60 → 75 zones. That is about zones^1.5 in this range, consistent with market clearing being dominated by zone-to-zone trade. |
| Trade links | **Little effect.** 60 zones with 194 lanes instead of 128: median 46 ms vs 45 ms (Node) and 145 ms vs 142 ms (6×). Zone count, not lane count, drives the cost. |
| 52 / 104 / 156-week totals at 60 zones | Node 2.6 / 5.5 / 8.0 s; 6× Chromium 8.7 / 16.7 / 24.1 s of pure simulation, spread over the game's turns |
| Building a world | 5–20 s in Node for 30–75 zones. **Must stay offline**: the game starts from a pre-built save, as it already does for the fictional scenario. |
| Initial scenario loading (start from save) | 60 zones: 14 ms in Node, 69 ms at 6× Chromium. The week-1 save is 1.6 MB raw / 0.58 MB gzip; download time over the network was **not measured**. |
| Save and restore (SAVE-01 economy part) | 60 zones at week 156: save 80 ms and restore 39 ms at 6×; 1.9 MB raw / 0.75 MB gzip. SAVE-01's own SHA-256 checksum and IndexedDB write come on top (**not measured** here). |
| Memory | Node heap 18 MB after 156 weeks at 60 zones. Chromium JS heap 38–58 MB at 60 zones, including the bundle and page. Well within Safari's limits (**estimate**; not measured on iPhone). |
| iPhone | **Not measured.** No physical device was available in this session; see §4. |

### Extrapolation to a physical iPhone (not a measurement)

These are hypotheses for the device test to confirm or reject:
- **Throttled Chromium is only a proxy.** A recent iPhone's JavaScript performance in Safari is usually somewhere between Chromium at 1× and at 4× on this machine.
- **If that holds,** a 60-zone week would take about 20–90 ms at the median.
- **Even at the 6× setting,** the median (142 ms) and 95th percentile (212 ms) stay under 0.5 s.
- **The real risk is the occasional slow week**, not the median.

## 4. iPhone acceptance procedure

1. On a computer with the repository:
   - `npm ci`
   - `node --expose-gc --experimental-strip-types economy-engine/sim/world02-bench.ts /tmp/w02`
   - `node economy-engine/sim/world02-browser-bench.cjs /tmp/w02 --html /tmp/w02/world02-iphone-bench.html --rates 1`

   This writes a single self-contained page (about 1.8 MB) with the engine and the 60-zone save.
2. Make the page reachable from the iPhone over HTTPS, for example through the same private preview hosting used for earlier iPhone reviews. Opening it as a local file works too, if the device allows.
3. On the reference iPhone, in Safari:
   - turn Low Power Mode off and leave the device plugged in;
   - close other tabs;
   - open the page, tap **Run benchmark** and keep the screen on until the results appear (1–3 minutes).
4. Repeat three times. Record the iPhone model, iOS version, and `weekMs.median`, `weekMs.p95`, `weekMs.max`, `startFromSaveMs`, `saveMs` and `restoreMs` from each run.
5. **Acceptance:**

   | Measure | Requirement |
   |---|---|
   | Median week | ≤ 0.25 s |
   | 95th-percentile week | ≤ 0.5 s |
   | Slowest week | ≤ 1.0 s |
   | Start from save | ≤ 1 s |
   | Save + restore | ≤ 1 s |

   The slowest-week requirement is a proposed allowance for one-off warm-up.
6. If the device fails at 60 zones, use the 49-zone fallback (`WORLD-02-PROVINCES.md` §5). The 45-zone results here show its expected cost. Then re-measure.

## 5. Risks

| Risk | Status | Mitigation |
|---|---|---|
| Occasional slow weeks (outliers up to 0.7–1.0 s at 6×) | measured in Chromium; cause not identified | Record per-week times on the device. Show the "resolving week" state in the UI. Investigate only if the device confirms it (no engine change in this milestone) |
| Real calibration costs more than synthetic worlds | unknown | Re-run this benchmark on the calibrated world before release (W4) |
| Save download size (0.6–0.75 MB gzip) on mobile networks | not measured | Lazy loading only when a real-world game starts; future offline caching (PWA) |
| SAVE-01 write time with a 1.9 MB economy | not measured | Measure in W8 (Codex's area); IndexedDB writes are single-transaction |
| Safari JIT and memory differ from Chromium's | not measured | The iPhone procedure above |
| More than 60 zones later (more simulated countries) | measured to 75 | 75 zones roughly doubles the cost of 45; add zones only after a device measurement |
