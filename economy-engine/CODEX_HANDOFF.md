# Codex handoff: connecting the authoritative economy to the game

**Contract version 1.0.0.** Branch `feature/economy-engine-handoff`. Approved decisions:
- **A1:** the engine replaces T06.
- **Retired presets:** `standard` / `tax-relief` are replaced by direct controls.
- **Pre-built starting economy:** the game starts from a ready-made week-1 save.
- **Capture is occupation.**

**Roles.**
- **Codex** owns the game: `src/game`, `src/ui`, `src/geography`, the weekly loop and the UI.
- **Claude** owns `economy-engine/`.

**Rules for Codex:**
- Do not edit `economy-engine/`. If something is missing in the API, ask for it.
- Do not implement any economic rule in the game. Every figure, limit and consequence comes from the API.
- Import only `economy-engine/src/integration/index.ts` and the starting save `economy-engine/scenarios/fictional-week1.economy.json`.

The API reference is [`INTEGRATION_API.md`](INTEGRATION_API.md). A runnable demonstration of every step below is [`examples/fictional-game.ts`](examples/fictional-game.ts) (`npm run example` in `economy-engine/`).

## 1. What is ready

| Item | Where |
|---|---|
| Integration API (pure, atomic, deterministic, typed) | `economy-engine/src/integration/index.ts` |
| Pre-built week-1 economy of the fictional scenario | `economy-engine/scenarios/fictional-week1.economy.json`. Regenerated and checked with `npm run starting-save` (`-- --check`). |
| Direct fiscal controls | `fiscalCommands`, `fiscalLimits`, `CountryEconomyView.fiscal` |
| Combined weekly turn with rollback | `advanceWeekTogether` |
| Event notices and defeat | `weeklyEconomyNotices`, `describeEconomyEvent`, `summary.playerRegimeFell` |
| Tests (engine side) | `tests/integration.test.ts`, `tests/handoff.test.ts` |

## 2. Starting a game

Start the economy **after** the player has chosen a country (`selectCountry`), at week 1, and never just to show the globe. Load both modules lazily:

```ts
// src/game/economyBridge.ts (new, Codex)
import type { EconomySession } from '../../economy-engine/src/integration/index.ts';
import type { GameState } from './models.ts';

export async function startEconomy(game: GameState): Promise<EconomySession> {
  const [economy, save] = await Promise.all([
    import('../../economy-engine/src/integration/index.ts'),
    import('../../economy-engine/scenarios/fictional-week1.economy.json?raw'),   // Vite: the file as text
  ]);
  return economy.startEconomyFromSave(save.default, game);   // ~2 ms desktop, ~8 ms at 6x CPU throttle
}
```

How `startEconomyFromSave` behaves:
- It checks that the save was built for exactly this world (seed, countries, regions, owners, adjacency, region profiles). It then attaches the player's country.
- The result is **identical** to `createEconomySession(game)`, which builds and calibrates the economy from scratch (about 2 s on a slow phone). This is tested for every player country.
- If it throws `This starting economy was built for a different game world`, the fixture in `src/game/initialState.ts` and the engine's copy (`fictionalGameWorld`) have drifted apart. Do not silently fall back: ask Claude to update the scenario and regenerate the save.
- Show a short "Preparing the economy…" state while the modules load. Keep the session in React state next to `gameState` (for example `const [economy, setEconomy] = useState<EconomySession | null>(null)`).
- Invariant: `economy.week === gameState.week` at all times.

## 3. Exact migration from T06 (all in Codex's files)

After this migration the game holds **no** treasury, income, expense or policy value of its own. The only economic state is the session.

| File | Change |
|---|---|
| `src/game/models.ts` | Delete `EconomicPolicy`, `Economy`, `Country.economy`, `Country.economicPolicy` and the `set-economic-policy` member of `TurnCommand`. Keep everything else. |
| `src/game/economy.ts` | Delete it (`ECONOMIC_POLICIES`, `isEconomicPolicy`, `calculateWeeklyBudget`, `resolveWeeklyEconomy`). |
| `src/game/economy.test.ts` | Delete it. The engine's tests cover the economy. |
| `src/game/advanceTurn.ts` | Remove the `economy.ts` import, the `set-economic-policy` validation and handling, and the `countries.map(... resolveWeeklyEconomy ...)` block (which rejected a week for insufficient funds). It still resolves diplomacy, AI diplomacy and military, and returns the next `GameState` (week + 1). Update its comment: weeks are no longer rejected for lack of funds. |
| `src/game/initialState.ts` | Remove `economicPolicy` and `economy` from the three countries. Ids, names, regions and adjacency must stay as they are, or the starting save no longer fits (§2). |
| `src/game/initialState.test.ts`, `advanceTurn.test.ts`, `ai.test.ts`, `diplomacy.test.ts`, `military.test.ts` | Remove assertions on `economy.treasury` and `economicPolicy`, and every `set-economic-policy` command. Tests that used "insufficient funds" to prove a week is atomic should use another invalid input (an invalid military order), or the combined turn's rollback (§5). |
| `src/ui/EconomyPanel.tsx` | Rewrite it to read `getCountryEconomy(session, playerCountryId)` and to edit the fiscal controls (§4). Remove the tax-policy select, `ECONOMIC_POLICIES` and `calculateWeeklyBudget`. |
| `src/ui/PrototypePage.tsx` | Remove `policyChoice` / `nextPolicy` / `set-economic-policy`. The treasury tile shows `view.treasury` from the session. The drafts count includes the fiscal drafts. |
| `src/app/App.tsx` | Create the session at game start (§2). `handleAdvanceTurn` uses the combined turn (§5). |

**Do not:**
- map `standard` / `tax-relief` onto tax rates (retired, not mapped);
- keep any copy of the treasury in `GameState`;
- feed engine figures into game arithmetic;
- round figures anywhere except at display.

**Display units.** Money values are decimal "illustrative units". Show them with one decimal and keep the "Illustrative units" caption.

## 4. The fiscal controls (three taxes, four spending categories)

**Current values:** `getCountryEconomy(session, player).fiscal`:

```ts
{ taxes: { income: 0.137, consumption: 0.1, corporate: 0.2 },
  spending: { administration: 0.12, social: 0.1, military: 0.02, infrastructure: 0.02 } }
```

**Limits:** `fiscalLimits(session)` gives `{ maxTaxRate: 0.7, maxSpendingShare: 0.5 }`. The minimum is 0 for every control.

| Control | Command | Meaning (engine rules) |
|---|---|---|
| Income tax | `{ type: 'set-tax', countryId, tax: 'income', rate }` | Share of wages and of dividends paid to households |
| Consumption tax | `{ type: 'set-tax', countryId, tax: 'consumption', rate }` | Added to household purchases |
| Corporate profit tax | `{ type: 'set-tax', countryId, tax: 'corporate', rate }` | Share of firms' positive profits |
| Administration spending | `{ type: 'set-spending', countryId, category: 'administration', share }` | Government purchases of goods, as a share of GDP |
| Social spending | `{ type: 'set-spending', countryId, category: 'social', share }` | Cash transfers to households, as a share of GDP |
| Military spending | `{ type: 'set-spending', countryId, category: 'military', share }` | Share of GDP: 35% pay to households, 65% equipment and goods |
| Infrastructure spending | `{ type: 'set-spending', countryId, category: 'infrastructure', share }` | Public investment goods, as a share of GDP. Raises infrastructure, and with it productivity. |

All values are fractions: `0.22` means 22%. Commands are standing: they apply from the next resolved week and stay until changed. Spending a government cannot pay is cut automatically (`budget.fundedShare` < 1). A government with market access borrows; one that keeps failing to pay defaults. These are the engine's approved rules: the game shows them, it does not reimplement them.

**Build the commands with the helper**, and only for the controls the player changed:

```ts
const draft = fiscalCommands('alden', { taxes: { income: 0.24 }, spending: { social: 0.12, infrastructure: 0.05 } });
// [ { type: 'set-tax', countryId: 'alden', tax: 'income', rate: 0.24 },
//   { type: 'set-spending', countryId: 'alden', category: 'social', share: 0.12 },
//   { type: 'set-spending', countryId: 'alden', category: 'infrastructure', share: 0.05 } ]
const problem = checkEconomyCommands(session, draft);   // null, or e.g. "Tax rate must be a number from 0 to 0.7."
```

The UI keeps the draft values (like today's pending policy). It validates them on every edit with `checkEconomyCommands`, showing the returned text when they are refused. It sends them with **Next week**, and shows "Pending" until the week resolves, after which `view.fiscal` holds the new values.

Other engine commands exist (tariffs, reserves, borrowing, default, public firms; see `INTEGRATION_API.md` §3). They are not part of this step.

## 5. Weekly-turn sequencing and rollback

The combined turn is pure. On **Next week**, `App.handleAdvanceTurn` should do:

```ts
function handleAdvanceTurn(commands: readonly TurnCommand[], economyCommands: readonly EconomyCommand[]) {
  if (!gameState?.playerCountryId || !economy) return false;
  try {
    const next = advanceWeekTogether({
      game: gameState, session: economy,
      advanceGame: game => advanceTurn(game, commands),   // diplomacy, AI, military (T06 removed)
      economyCommands,
    });
    setGameState(next.game);                               // commit both together...
    setEconomy(next.session);                              // ...only after both succeeded
    setTurnError(null);
    return true;
  } catch (error) {
    setTurnError(error instanceof Error ? error.message : 'Unable to advance this week.');
    return false;                                          // nothing was committed: drafts stay as they are
  }
}
```

`advanceWeekTogether` runs these steps in order. Any throw refuses the whole week.

| Step | What happens | On failure |
|---|---|---|
| 1 | The weeks must agree. The player's economic commands are checked. | throws before anything runs |
| 2 | `advanceGame(game)`: the game's turn (diplomacy, AI diplomacy, military) | throws: the economy does not run |
| 3 | The game turn must advance exactly one week | throws |
| 4 | The economy resolves the same week, with the player's commands, the AI autopilot for the other countries, and the regions' owners after the military moves (`regionControl`). A capture becomes an **occupation** (moderate policy); the legal owner retaking it becomes a liberation. Annexation is never inferred. | throws: neither new state is returned |
| 5 | Both new states are returned. The caller commits them together. | — |

**Rollback guarantee.** The old `gameState` and session are never modified. After a refused week the player can correct the draft and press Next week again, and the result is as if the refused attempt never happened (tested).

**Commands and the player.** Economic commands must carry the player's `countryId`; others are refused. AI countries' economies are run by the engine (autopilot). The game must not send economic commands for them.

**Legal ownership.** Keep region `ownerId` as the military controller, as today. The economy keeps the legal owner itself (`RegionEconomyView.legalOwnerId`, `occupied`). Show "Occupied by X" on regions where `occupied` is true. A region the player legally owns but has lost remains the player's, legally.

## 6. Displaying economic events and defeat

After each committed week, take `weeklyEconomyNotices(session)`: one notice per event, sorted most severe first. Each has `severity`, `title`, `message`, `countryId`, `regionId`, `concernsPlayer`, `week` and the original `event`.

| Severity | Events | How to show |
|---|---|---|
| `defeat` | The player's `regime-change` (also `summary.playerRegimeFell === true`) | **End the game.** Show a full-screen result ("Your regime has been overthrown"), disable Next week, and keep the final state viewable. GAME_DESIGN.md §6: the first overthrow is a defeat. |
| `critical` | `regime-change` of another country, `sovereign-default`, `market-access-lost`, `unrest-escalated` to tier 3, `zone-occupied`, `zone-annexed`, `occupation-revolt` | A banner or toast when `concernsPlayer`, and always in the weekly log |
| `warning` | `unrest-started`, `unrest-escalated` (tiers 1–2), `regime-survived`, `missed-payment`, `money-created`, `firm-bankruptcy`, `sabotage` | Weekly log, plus a badge on the economy tab when `concernsPlayer` |
| `info` | `market-access-restored`, `unrest-ended`, `zone-liberated`, `occupation-revolt-ended` | Weekly log only |

**Rules for the event display:**
- **A sovereign default is not a defeat.** Show it as `critical`, and the game continues.
- **Region names.** Messages already contain country and region names. Link `regionId` to the region panel where one is given.
- **Tone.** The game may rephrase a notice's text in its own tone. It must not change a notice's severity or what triggers it.
- **Unknown event types.** If an engine update adds an event type, `describeEconomyEvent` throws until Claude adds it; there is no silent fallback.

**Figures to show on the economy panel**, all from `getCountryEconomy(session, player)`:
- `gdpReal`, and `gdpGrowth` (show "—" while it is `null`, during the first half year);
- `inflation`, `unemployment`, `stability` (with `unrestTier`);
- `budget.revenue`, `budget.expenditure`, `budget.balance`;
- `treasury`, `debt` and `debtToGdp`;
- `centralBank.policyRate`.

GDP and growth include every region a country currently controls. After a capture or a loss, show a short note ("includes occupied regions") rather than presenting the jump as growth.

## 7. Tests Codex should add on the game side

1. **Single treasury:** after the migration, `GameState` has no `economy` / `economicPolicy` field (a type-level and runtime check on `createInitialState()`). The treasury the UI shows equals `getCountryEconomy(session, player).treasury`.
2. **Start:** `startEconomy(selectCountry(createInitialState(), id))` succeeds for each country, at week 1.
3. **Lock-step:** after N combined turns, `gameState.week === session.week`. A military capture gives `getRegionEconomy(session, id).occupied === true`, with the legal owner unchanged.
4. **Rollback:** an invalid economic command, or an invalid military order, leaves both states unchanged and the error is shown.
5. **Fiscal controls:** a draft of each of the 7 controls is sent and appears in `view.fiscal` the next week. An out-of-range value shows the engine's message.
6. **Defeat:** forcing the player's regime to fall (in a test, with a `stability-modifier` effect in `advanceWeekTogether`'s `effects`) ends the game.
7. **Lazy loading:** the globe and the start screen do not load the economy modules (check the build's chunks).
8. `npm test` and `npm run build`, then a check on an iPhone.

The engine side already verifies, in `economy-engine/tests/handoff.test.ts`:
- the starting save is deterministic and matches a fresh build, for every player;
- saves for a different world or week are refused;
- the fiscal controls and their limits;
- every rollback case of the combined turn;
- treasury and debt reconcile every week with the budget, through deficits, missed payments and a default, and all money is central-bank money;
- every event has a notice, and defeat comes first;
- save and load are equivalent at any week.

## 8. When to ask Claude

- The fixture (`src/game/initialState.ts`) changes ids, names, owners or adjacency. Claude updates `fictionalGameWorld` and its profiles, and regenerates the starting save.
- A figure, command or event the UI needs is not in the API.
- `describeEconomyEvent` throws for a new event type.
- Any change of economic behaviour. The game must not work around the engine.
