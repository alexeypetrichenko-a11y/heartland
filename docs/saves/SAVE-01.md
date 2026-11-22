# SAVE-01 — Local single-player saves

Heartland opens on the 3D globe. **Resume game** restores the last committed save. In the game, **Scenario menu** shows the last saved week, offers **Save now** and saves again when leaving through **Return to globe**. **New game** asks before replacing the slot. The previous slot remains available until the new scenario is ready and its first save commits.

## Storage format

IndexedDB database `heartland-game`, schema version 1, stores one JSON string at key `active` in the `saves` object store. The `heartland-local-game` envelope contains its own format version (1), a serialized payload and a SHA-256 checksum of the UTF-8 payload for corruption detection. The payload includes:

| Field | Contents |
| --- | --- |
| `game` | Scenario seed, chosen country, week, country and region records, divisions and their orders, standing orders, diplomatic relationships and messages, and the latest military results |
| `economy` | The complete string from `saveEconomySession`, including the engine's fiscal policies, treasury, debt, economic history and current weekly summary |
| `drafts` | Staged military and diplomatic commands and raw fiscal inputs, including values the player still needs to correct |
| `previous` | The opening treasury displayed on the latest weekly receipt, or `null` in week 1. GAME-UX-01 adds an optional, independently versioned `comparison` record for the latest report. |
| `defeated` | Whether the player's regime has fallen, checked against the engine's weekly summary |

The app checks the SHA-256 checksum and game records after the globe finishes loading. It loads the economy only when the player resumes or starts a game. On resume, `loadEconomySession` performs the engine's format validation. The app verifies that both halves use the same week, player and scenario, and checks territorial control against the engine's controllers and legal owners. Unsupported or unreadable saves stay in the slot until the player chooses to replace them. Format 1 supports the current fictional scenario. Future schema or scenario changes may require a migration.

Saves containing only the original opening treasury still load. The latest report can use that treasury and the current economic snapshot. Additional comparisons appear after resolving another week. [Weekly reporting and save compatibility](../economy/GAME-UX-01.md)

Autosave schedules the complete state after each successful turn and saves draft edits on a brief schedule. The page attempts to finish pending work when it goes into the background or is closed. Each replacement uses one IndexedDB transaction. A failed or interrupted write retains the previous committed record. The transaction compares the prior record before writing so a stale tab cannot overwrite a newer save. A rejected turn keeps the current week and the player's drafts.

## Browser limits

The slot belongs to the website origin and browser profile. The production website and a Sites preview have separate slots. Clearing website data, private browsing, or Safari reclaiming local storage can erase a save. If storage is blocked or full, the game can still run in memory and reports that it could not save. Force-closing Safari before a write finishes can lose the latest unsaved changes. Check **Saved locally** in the scenario menu before closing.

## iPhone Safari review

1. Open the versioned preview and check its **SAVE-01** build identifier. Confirm the globe opens first.
2. Start **Alden**. In **Economy → Fiscal policy**, propose an income tax rate of **23.175%** and press **Next week**. Record the week, treasury and applied rate.
3. Propose another fiscal rate and stage a military or diplomatic order. In **Scenario menu**, choose **Save now** and wait for **Saved locally**. Return to the globe, refresh, and tap **Resume game**. Verify the week, treasury, applied rate and pending changes.
4. Switch tabs, lock and unlock the iPhone, then close and reopen Safari. Go to the same preview URL and resume. Repeat in landscape. Press **Next week** and check the pending decisions apply once.
5. From the globe, tap **New game** and cancel the confirmation. Confirm that **Resume game** still restores the same slot.

## Automated verification

- Game tests restore saves after 1, 10, 52 and 104 completed turns, including changed fiscal policies, diplomatic messages, standing orders, military occupation and defeat. A 20-week continuation matches the uninterrupted game's economy and game state with identical commands.
- Production Chromium checks at 390×844 and 844×390 cover touch input, return to the globe, refresh, profile close and reopen, multiple tabs, backgrounding events, replacement confirmation, rejected turns, corrupted records, unsupported versions, blocked storage, quota errors and a transaction interrupted before commit.
- Physical iPhone Safari and iOS suspension behavior still require device validation.
