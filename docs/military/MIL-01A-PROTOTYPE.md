# MIL-01A · Synthetic friendly maritime transport

This isolated prototype is based on the approved [MIL-01 design](https://github.com/alexeypetrichenko-a11y/heartland/pull/38). Its fixture reuses existing synthetic economy profiles and diplomacy identifiers with a different seed, a detached island, and a separate initial roster. It runs through a dedicated programmatic entry point and demo. The normal application and active browser save slot continue to use the existing fictional scenario.

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

No browser UI is wired up for this preparation milestone. The demo and tests are the review entry points, and physical iPhone gameplay and performance remain unverified. International transit, allied staging, logistics and naval combat are later milestones. Amphibious operations are required in MIL-04. Journey operation type and the arrival outcome are separate, so a later contested arrival can be handled by combat and beachhead rules before any territorial transfer. European integration remains gated on validated WORLD-04 and WORLD-05-FINAL. The prototype consumes no European data.

## Review verification

- The executable demo admitted one division, refused the second for capacity, then landed the admitted division after checkpoint restore.
- The game, UI and geography suite passed 161/161. Five mobility tests cover whole-division capacity, one- and two-week timing, zero monetary cost, unchanged ownership, recoverable return and waiting, deterministic replay, input validation and atomic rollback.
- Production build passed. The standard bundle excludes the synthetic scenario and review package. Git verification confirmed the economic engine, scenario packages and deployment workflow were outside the diff.
