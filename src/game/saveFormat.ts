import { economySnapshot, type EconomySnapshot, type LoadedEconomy, type PreviousEconomy } from './economyBridge.ts';
import { createInitialState } from './initialState.ts';
import type { GameState } from './models.ts';
import type { PlayerDrafts } from './playerDrafts.ts';
import { reportBaseline } from './reportBaseline.ts';
import { isSaveObject, validateSavedDrafts, validateSavedGame } from './saveValidation.ts';

const FORMAT = 'heartland-local-game';
const VERSION = 1;
const COMPARISON_VERSION = 1;
const scenario = createInitialState();

export interface PlayableSession {
  game: GameState;
  economy: EconomySnapshot;
  drafts: PlayerDrafts;
}

export interface SavedGame {
  game: GameState;
  drafts: PlayerDrafts;
  economy: string;
  previous: PreviousEconomy | null;
  defeated: boolean;
}

async function checksum(payload: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

function validatePayload(value: unknown): SavedGame {
  if (!isSaveObject(value) || typeof value.economy !== 'string' || !value.economy
    || typeof value.defeated !== 'boolean') throw new Error('The local save is incomplete.');
  const game = validateSavedGame(value.game);
  const drafts = validateSavedDrafts(value.drafts, game);
  const opening = value.previous;
  let previous: PreviousEconomy | null = null;
  if (game.week === 1) {
    if (opening !== null) throw new Error('The local save has an unexpected previous week.');
  } else {
    if (!isSaveObject(opening) || typeof opening.countryId !== 'string' || opening.countryId !== game.playerCountryId
      || typeof opening.treasury !== 'number' || !Number.isFinite(opening.treasury)) {
      throw new Error('The local save is missing its previous treasury figure.');
    }
    const comparison = opening.comparison;
    const baseline = isSaveObject(comparison) && comparison.version === COMPARISON_VERSION ? reportBaseline(comparison.values) : {};
    previous = { countryId: opening.countryId, treasury: opening.treasury, ...baseline };
  }
  return { game, drafts, economy: value.economy, defeated: value.defeated, previous };
}

function validateSession({ api }: LoadedEconomy, { game, economy, drafts }: PlayableSession) {
  const session = economy.session;
  if (game.week !== session.week || game.playerCountryId !== session.playerCountryId
    || session.worldFingerprint !== api.worldFingerprint(scenario)) {
    throw new Error('The game and economy in this local save do not match.');
  }
  if (typeof economy.defeated !== 'boolean' || economy.defeated !== session.summary.playerRegimeFell) {
    throw new Error('The local save has an inconsistent game ending.');
  }
  for (const region of game.regions) {
    const view = api.getRegionEconomy(session, region.id);
    const original = scenario.regions.find(entry => entry.id === region.id);
    if (region.ownerId !== view.controllerId || original?.ownerId !== view.legalOwnerId) {
      throw new Error('The game and economy disagree about territorial control.');
    }
  }
  const fields = new Set<string>([...api.TAX_KINDS, ...api.SPENDING_CATEGORIES]);
  if (Object.keys(drafts.fiscal).some(key => !fields.has(key))) {
    throw new Error('The local save includes an unknown fiscal draft.');
  }
}

export async function encodeGameSave(runtime: LoadedEconomy, session: PlayableSession): Promise<string> {
  const { game, economy, drafts } = session;
  const previous = economy.previous && {
    countryId: economy.previous.countryId,
    treasury: economy.previous.treasury,
    comparison: { version: COMPARISON_VERSION, values: reportBaseline(economy.previous) },
  };
  const data = { game, drafts, previous, defeated: economy.defeated, economy: runtime.api.saveEconomySession(economy.session) };
  validatePayload(data);
  validateSession(runtime, session);
  const payload = JSON.stringify(data);
  return JSON.stringify({ format: FORMAT, version: VERSION, checksum: await checksum(payload), payload });
}

/** Check the envelope and the game without downloading the economic engine. */
export async function decodeGameSave(record: string): Promise<SavedGame> {
  let envelope: unknown;
  try { envelope = JSON.parse(record); }
  catch { throw new Error('The local save could not be read.'); }
  if (!isSaveObject(envelope) || envelope.format !== FORMAT) throw new Error('The local save format is unrecognized.');
  if (envelope.version !== VERSION) throw new Error('This local save version is unsupported.');
  if (typeof envelope.payload !== 'string' || await checksum(envelope.payload) !== envelope.checksum) {
    throw new Error('The local save is damaged.');
  }
  return validatePayload(JSON.parse(envelope.payload));
}

export function restoreGameSave(runtime: LoadedEconomy, save: SavedGame): PlayableSession {
  const economy = economySnapshot(runtime, runtime.api.loadEconomySession(save.economy), save.previous);
  if (save.defeated !== economy.defeated) throw new Error('The local save has an inconsistent game ending.');
  const session = { game: save.game, economy, drafts: save.drafts };
  validateSession(runtime, session);
  return session;
}
