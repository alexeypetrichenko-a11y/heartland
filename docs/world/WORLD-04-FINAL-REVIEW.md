# WORLD-04-FINAL · Licensed playable Europe

Draft PR #36 is based on main `a8257a70fa1640ef72aa7c2b0d99d64b1ae1fb22`. Its tree matches the reviewed WORLD-05-FINAL head. The three immutable Europe packages are preserved byte for byte. The licensed review uses `europe-2023/1.0.0-draft.3`, world fingerprint `12035be51198e4ee` and opening economy fingerprint `ff1a2f7acb5d4af3`.

## Playable scope

- France, Germany, the United Kingdom, Italy, Poland and Türkiye use the existing dashboard, all seven fiscal controls, diplomacy, atomic weekly settlement and weekly reports. The map shows 46 playable provinces and the economy runs 61 zones. Province color reflects current control, and economic occupation retains the original legal owner.
- The P-1 placement initializes 90 divisions with 25,000 personnel equivalents each. Counts are France 15, Germany 13, UK 14, Italy 15, Poland 13 and Türkiye 20. These are illustrative forces. The Turkish count is a provisional gameplay assumption.
- Existing land move, defend and attack orders run on the approved movement graph. Continental opponents can fight and capture connected provinces. The UK and Türkiye have no land military connection to another playable country. Corsica, Northern Ireland, Sicily and Sardinia stay outside military movement. Military mobility across seas and international transit remain separate milestones.
- Fictional World retains its existing gameplay and SAVE-01 format. Draft.3 records require their exact package and economy identity. A draft.1 or draft.2 checkpoint displays a version-specific error and remains in storage. Use the original version’s build for an older save where available. A separate review origin is recommended when retaining earlier local saves.

## Licensing and distribution

**W5-L3 completed on 2026-11-25.** The owner supplied confirmation that ChatGPT directly checked Section 3, Data, of the OECD Terms and Conditions. It permits commercial reuse subject to dataset-specific terms, third-party rights, dataset attribution and downstream acknowledgment. WORLD-05 recorded the checks of the individual dataset metadata. This note records completion outside the immutable manifest and notices, which retain their original review wording. [OECD Terms and Conditions](https://www.oecd.org/en/about/terms-conditions.html) · [WORLD-05 report](WORLD-05-REPORT.md)

The review build checks an explicit version and manifest hash allowlist, requires a cleared distributable manifest, and validates each asset’s hash before copying it. The runtime checks the package and validates both licence files. **Scenario menu → Sources and Licences** contains credits, OECD dataset citations and the downstream acknowledgment requirement. It links to the unchanged `NOTICE.md`, `ATTRIBUTION.json` and provenance file. Keep the notices and citations with derivatives and require downstream users to acknowledge the OECD as the source as applicable.

The standard `dist/` output contains no European package or original source snapshot. The local `dist-world04.local/` review contains eight approved draft.3 package files, including its notice and attribution. Draft.1, draft.2, raw source snapshots and research files are excluded from both outputs. The existing GitHub Pages workflow continues to use the standard build. This PR prepares an artifact for review without authorizing deployment.

## Local build and physical iPhone acceptance

Build from the review branch with Node.js 24:

```sh
npm ci
npm run build
npm run build -- --mode world04-local
node scripts/economy/bench_world04.cjs
python3 scripts/economy/audit_world04_artifact.py --archive /tmp/heartland-world04-final-review.zip
npm run preview -- --mode world04-local --host 127.0.0.1 --port 4174 --strictPort
```

The ZIP contains the audited web root. For an authorized private LAN review, serve the extracted files under `/heartland/` on an access-controlled HTTPS server with a certificate trusted by the iPhone. Keep the ordinary Pages domain and prior review origins separate. Use the same review origin for all save/resume steps.

1. In Safari, choose **New game → Europe 2023 (experimental) → France**. In portrait, inspect Corsica and check that it has maritime trade and no military movement links. In landscape, check the map, Military tab and report controls.
2. Open **Military**, verify the illustrative roster and stage a move between adjacent French provinces. Stage an income-tax change and use **Scenario menu → Save now**. Close and reopen Safari, resume and confirm both orders. Advance and inspect the movement and fiscal changes in the weekly report.
3. Open **Sources and Licences**. Confirm the OECD citations and the notice and attribution links. After completing the save test, start Türkiye and confirm the 20-division gameplay-assumption notice.
4. Open `/heartland/benchmark.html`, run 156 turns three times, and record the iPhone model, iOS version and all five timings. The harness checks 61 zones and 90 divisions. Compare against 250 ms median, 500 ms p95 and 1,000 ms each for the slowest week, validated start and save plus restore.

## Verification

- App and engine typechecks passed. Game, UI and geography tests passed **162/162**, engine tests passed **218/218**, and the separate engine stress test passed through 10,000 weeks.
- Standard and review production builds passed. The independent scenario validator returned **25 passes, zero warnings and zero failures** on a temporary copy. Hash checks confirmed that draft.1, draft.2 and draft.3 remain unchanged.
- Chromium passed all six countries at 390×844 and 844×390, including all 46 province shapes, the six military rosters, seven fiscal controls, reports and save/resume. The France run also checked land movement and source links. Focused game tests covered legacy-version refusal, draft persistence, combat, capture and save/restore of occupied territory. A failed package load preserved the fictional save. The unchanged SAVE-01 browser suite passed at both mobile sizes.
- GAME-UX-01 passed its 320×568 case and then hit the known intermittent **Week 2 report** timeout at 390×844. The same assertion previously timed out on a clean baseline. The script and timeouts are unchanged.
- The final archive audit verified 1,057 files, including eight byte-identical draft.3 files. The standard build contained zero scenario package assets. A loopback HTTPS test returned 401 without credentials and byte-identical content with credentials for the app page, benchmark and every scenario file. Archive SHA-256 `50186ae8135c3d19ad3586ca60fcd165cd4be3b47630d6f7074867f78a2317b7`.

### Integrated 156-turn benchmark

Chromium completed 156 turns with **61 economic zones and 90 divisions**, restored the final save to the same state and matched the economy fingerprint. The draft.2 baseline also ran 61 zones, with its military operations disabled. The table compares separate Chromium runs and reports milliseconds rounded to the nearest integer.

| Measure | F-1 target | Draft.2 native | Draft.3 native | Draft.2 6× | Draft.3 6× |
|---|---:|---:|---:|---:|---:|
| Validated start | ≤1,000 | 390 | 172 | 781 | 401 |
| Median week | ≤250 | 28 | 22 | 180 | 152 |
| 95th-percentile week | ≤500 | 91 | 54 | 372 | 225 |
| Slowest week | ≤1,000 | 416 | 217 | 1,390 | 752 |
| Save + restore | ≤1,000 | 196 | 115 | 1,851 | **1,415** |

Draft.3 passed all native targets. At 6× CPU throttling, save plus restore still exceeded the target. Physical iPhone timings remain pending. [Draft.2 reference measurements](WORLD-04-REVIEW.md#61-zone-benchmark)
