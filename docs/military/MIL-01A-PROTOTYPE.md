# MIL-01A · Synthetic friendly maritime transport

This isolated prototype is based on the approved [MIL-01 design](https://github.com/alexeypetrichenko-a11y/heartland/pull/38). Its fixture reuses existing synthetic economy profiles and diplomacy identifiers with a different seed, a detached island, and a separate initial roster. It runs through a dedicated mobile browser build, a programmatic entry point and a demo. The standard app continues to use the fictional scenario and its existing browser save slot.

From the review checkout with Node.js 24, run:

```sh
npm ci
node scripts/military/demo_mil01a.ts
node --test src/game/mobility.test.ts
npm test
npm run build
```

The demo stages two departures for one slot. It prints the accepted and refused orders, creates and restores an in-memory checkpoint, then prints the arrival next week. The reverse route takes two weeks. Both directions share the configured departure pool. Divisions move whole and transport is free.

While traveling, a division keeps one journey record and is excluded from the regional resolver. The adapter admits a friendly arrival only after checking the opening control snapshot and route availability. An arrived unit may defend. Its land orders can resume the following week. A closed route or lost endpoint can cause a return or waiting. A reopened eligible endpoint lets the unit resume without manpower loss. A pending departure can be removed from the draft before settlement. After departure a return order can redirect the unit. The prototype retains the origin in the legacy division record for checkpoint compatibility, and resolves regional presence from the separate journey record.

Mobility and the existing game/economy turn are returned together. Unexpected settlement failures retain the input snapshot. A versioned synthetic checkpoint wraps SAVE-01 and includes the current journey and pending transport drafts. The fixture and rules are pinned by the synthetic checkpoint version. A normal SAVE-01 load rejects this fixture, and the prototype never writes the public game’s browser save slot.

## Mobile review build

From this branch, run:

```sh
npm ci
npm run build -- --mode mil01a-review
npm run preview -- --mode mil01a-review --host 127.0.0.1 --port 4185 --strictPort
```

Open `http://127.0.0.1:4185/heartland/`. The build writes to ignored `dist-mil01a.local/`, with its own browser entry and without the standard public atlas assets. The review page serves only the synthetic Alden/Reed Island scenario. The ordinary `npm run build` still produces `dist/`.

For a physical iPhone, use a trusted HTTPS endpoint once preview deployment is approved, or serve the generated directory on a private LAN from a trusted local HTTPS server. Map `/heartland/*` to `dist-mil01a.local/` and open `/heartland/` in normal Safari. HTTPS is required for save integrity hashing. The build is prepared for review. Physical Safari validation remains pending.

### iPhone acceptance checklist

1. In portrait, start the maritime scenario. Select each of Alden’s divisions and stage both for Reed Island. Verify a one-week route, shared capacity of one and projected arrival during Week 2. Advance and inspect Week 1’s **Military and territorial control** section for the departure and the capacity refusal.
2. Open **Regional presence** at Alden Vale. Only the division that remained on land should appear. Stage a return for the traveling division, cancel it, tap **Save now**, wait for **Saved locally**, close Safari, reopen the same URL, and resume. The unit should still be traveling. Advance to see it arrive on Reed Island.
3. Rotate to landscape. Select the arrived unit and stage the two-week trip back to Alden Vale. Check the expected week and verify it remains traveling after the first intervening settlement.
4. With a division underway, use **Route availability → Close crossing**. Advance until it is waiting, save, close Safari and resume. Reopen the crossing, stage a return, and check the returning and arrived statuses and their report events. Do a final pass in portrait and landscape for scrolling, touch targets and readable statuses.

Review saves use IndexedDB `heartland-mil01a/saves/active`. The public-fictional slot remains `heartland-game/saves/active`, including if the builds are served sequentially on the same origin. Each uses the same local transaction and stale-tab checks. Closing the browser before the save completes can leave the preceding checkpoint.

International transit, allied staging, military logistics and naval combat remain later milestones. MIL-04 amphibious operations are mandatory. Journey operation and arrival outcome remain distinct, so a future contested arrival can be handled by combat and beachhead rules before any territorial transfer. European integration remains gated on validated WORLD-04 and WORLD-05-FINAL.

## Compatibility plan for PRs #36 and #39

Reviewed against the WORLD-04 head `4924d1c`. PR #36 and this branch stay independent in review.

| Overlap | Integration decision after approval |
|---|---|
| `saveFormat.ts` | Both parameterize validation and the world match. PR #36 uses European manifest identity, a lazy package loader, exact world/content fingerprints and the saved economy fingerprint. PR #39 passes a fixed synthetic fixture into SAVE-01 inside a separate, versioned mobility envelope. Use named options for the fixture and optional Europe loader so they cannot be confused. Verify the outer synthetic marker and version before invoking its fixture path. Dispatch European records by their exact saved identity, then check the package and session fingerprints. Keep ordinary version-1 fictional saves on the existing default fixture path. |
| `saveValidation.ts` | Both replace module-global ID lookups with fixture-derived validation. Keep one fixture-aware validator. Preserve PR #36’s restrictions on the European playable roster, ownership and diplomatic actors. Use the immutable synthetic fixture for its core save and validate journeys, closures and transport drafts in the outer mobility codec. |
| `localSaves.ts` | PR #36 supplies an optional Europe package loader to the normal decoder. PR #39 extracts the existing transaction/CAS behavior into a codec-driven slot. Wire the Europe loader into the normal slot’s decoder and keep the mobility codec in its separate database. Preserve lookup error messages and the current Europe/fictional slot behavior. |
| `vite.config.ts` | Keep distinct review modes, entry points and output directories. Apply the restricted-package guard only to the authorized WORLD-04 review mode. Keep the existing Pages artifact scoped to `dist/`. |

Integration acceptance includes old fictional records with and without report comparisons, exact European identity and incompatible-package rejection, synthetic pending and in-flight replay, a wrong-codec checkpoint rejection for each kind, and same-origin slot isolation. Also exercise concurrent-tab writes, validate current scenario manifests, and scan all outputs for package leakage. Obtain approval before any branch reconciliation.

## Reproduce browser checks

Start the standard preview in a second terminal with `npm run preview -- --host 127.0.0.1 --port 4183 --strictPort`. With the maritime preview also running on 4185, use Playwright and Chromium to run:

```sh
node scripts/military/check_mil01a_ux.cjs
```

Use `HEARTLAND_PLAYWRIGHT_MODULE` for an external Playwright installation and `HEARTLAND_CHROMIUM` for a system Chromium executable.


## Verification results

- App and engine typechecks passed. The game/UI/geography suite passed 162/162, the engine regression suite passed 218/218, and the long engine test passed through 10,000 weeks.
- Standard and maritime production builds passed. A SHA-256 comparison found zero European source/package file matches in either output. The standard bundle excludes the synthetic review, and the synthetic output omits the public atlas and fictional game UI.
- Chromium passed the maritime tests at 390×844 and 844×390, including pending draft and in-transit resume, weekly reports, capacity, both durations, cancellation, recoverable waiting and return. The same-origin test confirmed byte-for-byte preservation of the fictional slot and resumed it successfully. The unchanged SAVE-01 browser suite passed in both orientations.
- GAME-UX-01 reproduced the previously documented intermittent Week 2 report timeout. The isolated retry passed 320×568, 390×844 and 844×390 before timing out at 1440×900. The legacy script was left unchanged.
