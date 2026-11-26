import type { CollectiveOrder } from './strategicLand.ts';
import type * as EconomyApi from '../../economy-engine/src/integration/index.ts';
import type { CountryEconomyView, EconomyCommand, EconomyNotice, EconomySession, RegionEconomyView } from '../../economy-engine/src/integration/index.ts';
import type { EuropeScenario } from './europeScenario.ts';
import { advanceTurn } from './advanceTurn.ts';
import type { CountryId, GameState, TurnCommand } from './models.ts';
import type { ReportBaseline } from './reportBaseline.ts';

/**
 * Bridge between the game's weekly turn and the economic engine (INT-01).
 *
 * The economy session is the only authoritative economic state: treasury, revenue,
 * expenditure, debt and policies come from it alone (decision A1). This file holds no
 * economic rule; it only calls the engine's integration API (contract 1.0.0).
 *
 * Only types are imported from the engine here, so importing this file loads nothing:
 * the engine itself arrives with the `EconomyRuntime`, which `economyRuntime.ts` loads
 * lazily for a game or a restricted scenario review.
 */
export type { CountryEconomyView, EconomyCommand, EconomyNotice, EconomySession, RegionEconomyView };

/** The loaded engine API and the pre-built week-1 economy save (text). */
export interface EconomyRuntime {
  api: typeof EconomyApi;
  startingSave: string;
}

export type LoadedEconomy = Pick<EconomyRuntime, 'api'> & { europe?: EuropeScenario };
export type PreviousEconomy = Pick<CountryEconomyView, 'countryId' | 'treasury'> & ReportBaseline;

/** Everything the interface needs after a resolved week. */
export interface EconomySnapshot {
  session: EconomySession;
  player: CountryEconomyView;
  /** The opening treasury and any other prior observations available for the latest report. */
  previous: PreviousEconomy | null;
  /** The week's economic notices, most severe first. */
  notices: EconomyNotice[];
  /** True once the player's regime has been overthrown: the game is over (GAME_DESIGN.md section 6). */
  defeated: boolean;
}

export function economySnapshot(runtime: LoadedEconomy, session: EconomySession, previous: PreviousEconomy | null): EconomySnapshot {
  const playerId = session.playerCountryId;
  if (!playerId) throw new Error('The economy has no player country.');
  return {
    session,
    player: runtime.api.getCountryEconomy(session, playerId),
    previous,
    notices: runtime.api.weeklyEconomyNotices(session),
    defeated: session.summary.playerRegimeFell,
  };
}

/**
 * Start the economy of a new fictional game from the pre-built week-1 save. The game must
 * have a player country and be at week 1; the economy then has the same week number.
 */
export function startEconomy(runtime: EconomyRuntime, game: GameState): EconomySnapshot {
  if (!game.playerCountryId) throw new Error('Select a player country before starting the economy.');
  if (game.week !== 1) throw new Error(`A new economy starts at week 1, not week ${game.week}.`);
  const session = runtime.api.startEconomyFromSave(runtime.startingSave, game);
  return economySnapshot(runtime, session, null);
}

/**
 * One atomic weekly turn of game and economy together (CODEX_HANDOFF.md section 5): the
 * player's economic commands are checked, the game resolves diplomacy, AI and military
 * (`advanceTurn`), then the economy resolves the same week with the regions' new owners
 * (a capture becomes an occupation, never an annexation). Both new states are returned
 * together; if any step throws, nothing is returned and the caller keeps both old states.
 */
export function advanceGameWeek(runtime: LoadedEconomy, game: GameState, economy: EconomySnapshot,
  commands: readonly TurnCommand[], economyCommands: readonly EconomyCommand[] = [], collective: readonly CollectiveOrder[] = []): { game: GameState; economy: EconomySnapshot } {
  if (economy.defeated) throw new Error('The game is over: your regime has been overthrown.');
  const next = runtime.api.advanceWeekTogether({
    game, session: economy.session, advanceGame: state => advanceTurn(state, commands, Boolean(runtime.europe), collective), economyCommands,
  });
  return { game: next.game, economy: economySnapshot(runtime, next.session, economy.player) };
}

/** The economy of one region (controller, legal owner, occupation, sectors) for the interface. */
export function regionEconomy(runtime: LoadedEconomy, economy: EconomySnapshot, regionId: string): RegionEconomyView {
  return runtime.api.getRegionEconomy(economy.session, regionId);
}

/** The economy of any country, for the interface. */
export function countryEconomy(runtime: LoadedEconomy, economy: EconomySnapshot, countryId: CountryId): CountryEconomyView {
  return runtime.api.getCountryEconomy(economy.session, countryId);
}
