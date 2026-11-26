# WORLD-04 · First Playable Europe

**Review only.** Base `49ae6d53e146ebfe2fe1b974f942931c663f7db5` contains PRs #31–#35 and has the same Git tree as the reviewed PR #35 head. Both immutable packages remain byte-for-byte unchanged. The restricted package used here is `europe-2023/1.0.0-draft.2`.

## Playable scope

- **Fictional World** retains Alden, Belora and Cyrin, the fictional economy and the existing local save format.
- **Europe 2023 (experimental)** offers France, Germany, the United Kingdom, Italy, Poland and Türkiye. Choose a country, inspect the 46 playable provinces, open the dashboard, propose fiscal changes across all seven controls, stage diplomacy, advance weekly turns and resume a saved game with pending decisions.
- The European map uses existing Natural Earth Admin-1 geometry grouped by the approved province crosswalk. The whole-Europe view and country framing show the playable areas. Clicking a province or choosing it from the list exposes its controller and the separate land, maritime trade and military movement connections. Corsica is its own province. The existing atlas remains accessible through **Scenario menu → Return to globe** and retains its camera.
- Draft.2 supplies the week-one GDP, debt, fiscal policy and treasury. The loader checks the manifest, SHA-256 for all listed files, the aggregate content and world fingerprints, the engine’s opening economy fingerprint, country/province IDs and starting ownership. The existing atomic weekly turn settles the game and economy together and uses the existing regime-defeat rule.
- Europe reuses the existing cautious diplomacy policy for the 15 eligible AI diplomatic actors. The five economic blocs have no diplomatic actions. Relationships use the package’s neutral opening values. The engine still simulates all 61 economic zones.
- SAVE-01 keeps one local slot per browser origin. European records carry the exact scenario ID, version, content and world fingerprints and the engine’s economic session fingerprint. Restore also checks the roster, ownership, selected country, week, defeat state and pending decisions. Older fictional saves continue through their existing format. Starting a replacement game still requires confirmation when a save exists. A failed package load leaves that save in place.

## Limits

- Türkiye’s starting military force is unresolved. Draft forces for the other five countries have no approved placement. Europe disables military operations and displays this limitation in setup, Military and Scenario information. The movement graph excludes maritime trade edges. There is no naval transport or amphibious invasion.
- Europe’s gameplay map shows playable provinces. Nonplayable countries appear as atlas background and the full atlas remains available. Overseas, disputed and nonplayable territory inspection continues in the reference atlas, outside the 46-province gameplay map. The UI does not represent a historically complete or militarily balanced simulation.
- The local build needs a secure browser context for integrity hashing and SAVE-01. The game uses browser storage and inherits its eviction and storage-clearing behavior. Saves do not transfer between different origins.
- Physical iPhone Safari is pending. The 61-zone benchmark uses a France game with no player decisions. Timings include package loading/validation, atomic game-plus-economy turns and encoding, decoding and restoring a save in memory. Browser storage and rendering are exercised separately by the mobile browser checks.

## Local installation and verification

Use Node.js 24. Run from the WORLD-04 checkout.

```sh
npm ci
npm run build -- --mode world04-local
npm run preview -- --mode world04-local --host 127.0.0.1 --port 4174 --strictPort
```

Open `http://127.0.0.1:4174/heartland/`, choose **New game → Europe 2023 (experimental)** and select a country. The review build writes to the ignored `dist-world04.local/` folder. The package manifest declares `distributable: false`. Keep that folder local. The regular `npm run build` writes the public fictional build to `dist/` and never copies the European package. The existing Pages workflow uses only that regular build.

For the browser checks, start the regular build on loopback in another terminal:

```sh
npm run build
npm run preview -- --host 127.0.0.1 --port 4173 --strictPort
```

With Playwright and Chromium available, run `node scripts/economy/check_world04.cjs`. An external Playwright installation can be set with `HEARTLAND_PLAYWRIGHT_MODULE`. Set `HEARTLAND_CHROMIUM` for a system Chromium binary and `HEARTLAND_BROWSER_OUTPUT` to a private local screenshot directory. The script checks both origins and does not publish evidence.

### Physical iPhone Safari procedure

1. For a physical phone, an authorized reviewer can connect Safari to the local review build through a trusted, access-controlled HTTPS connection to the review machine on a private network. Use an HTTPS endpoint with a certificate trusted by the phone and access control on **all** routes, including `/heartland/review/`. Keep the Vite backend bound to loopback. If that access is unavailable, use loopback on the review computer and leave physical iPhone review pending.
2. Open `/heartland/` in Safari. In portrait, select and start France, open the province list, select Corsica and confirm it has maritime trade links with no military movement links. Rotate to landscape and verify the province sheet and navigation remain usable. Start Türkiye and confirm the unresolved-force message under Military.
3. Open Economy and stage a fiscal change. Use **Scenario menu → Save now** and wait for the saved status. Close and reopen Safari on the same origin. For a home-screen test use Safari’s Share → Add to Home Screen, then start and resume in that same mode. Resume and confirm the country, week and draft. Advance the week and inspect the report and applied rate. Repeat reload after the turn. Run the existing fictional scenario on the same local build after completing the European save checks.
4. On the review machine run `node scripts/economy/bench_world04.cjs`. It writes `benchmark.html` inside the restricted output. On the phone, visit `/heartland/benchmark.html` on the same HTTPS origin, tap **Run 156 turns** and keep Safari in front. Record three fresh runs without other active apps. Compare against median ≤250 ms, p95 ≤500 ms, slowest ≤1,000 ms, validated start ≤1,000 ms and save + restore ≤1,000 ms. Record phone model, iOS version and each timing. The harness leaves the game’s local save alone.

## Path to a licensed public release

1. Obtain written redistribution permission for the Turkish public-finance source or substitute a verified redistributable source with equivalent fiscal coverage.
2. Update the source and licence audit, preserve attribution, and recalibrate in a new immutable scenario version. Keep draft.1 and draft.2 unchanged and retain exact version matching for old saves.
3. Revalidate financial calibration, determinism, the three connection sets, save compatibility and the physical iPhone thresholds. Resolve the military-data and placement decisions before enabling European military operations.
4. After the owner approves the licensed version for distribution, explicitly allow that version in public packaging, verify the output includes only distributable files and obtain deployment authorization. Keep the restricted drafts out of public build artifacts.

## Local verification results

- Engine typecheck passed. Engine tests passed 218/218. Game, UI and geography tests passed 160/160, including all six opening economies, atomic fiscal and diplomatic replay, exact save identity and the Corsica movement restriction.
- Both production builds passed. The public output has no review directory, package files or Europe selector. Injecting a missing European asset in the local browser produced a clear error and the existing Alden save still resumed.
- Draft.2 validation returned 22 passes, one known Turkish source-licensing warning and zero failures. Both package trees match the base. The engine source and Pages workflow also match the base.
- The unchanged SAVE-01 browser suite passed in Chromium at 390×844 and 844×390. The unchanged GAME-UX-01 suite passed at 320×568, 390×844, 844×390 and 1440×900, including restored defeat. An earlier invocation timed out at country setup during a rebuild. The known Week 2 report timeout did not occur. The obsolete baseline `check_economy` script was excluded.
- WORLD-04’s Chromium checks cover all six countries at 390×844 and 844×390. Each case checks the 46 province shapes, seven fiscal controls, draft persistence, a committed Week 1 report and reloading Week 2. The browser checks also inspect Corsica’s connectivity and Türkiye’s military message. Four local screenshots cover the six-country map and the Corsica details in both orientations. The script can reproduce them without uploading them.

### 61-zone benchmark

Chromium 155 completed 156 integrated turns per run and restored the final save with the same game state and economy fingerprint. Timings are milliseconds, rounded.

| Measure | F-1 target | Native Chromium | Chromium at 6× CPU throttling |
|---|---:|---:|---:|
| Validated start | ≤1,000 | 390 | 781 |
| Median week | ≤250 | 28 | 180 |
| 95th-percentile week | ≤500 | 91 | 372 |
| Slowest week | ≤1,000 | 416 | **1,390** |
| Save + restore | ≤1,000 | 196 | **1,851** |

Native Chromium met all five targets. The throttled run exceeded the slowest-week and save/restore targets. Keep the device performance check open until the reference iPhone has been measured. If the reference device fails at 61 zones, review the WORLD-02 50-zone fallback as a separate scenario-version decision.

To reproduce the Chromium comparison with the local preview running, use `node scripts/economy/bench_world04.cjs --browser`. The same script without `--browser` generates the harness for the physical-device procedure.
