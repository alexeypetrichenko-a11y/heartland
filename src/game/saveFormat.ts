import { economySnapshot, type EconomySnapshot, type LoadedEconomy, type PreviousEconomy } from './economyBridge.ts';
import { assertEuropeIdentity, type EuropeIdentity, type EuropeScenario } from './europeScenario.ts';
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
  savedAt?: number;
  scenario?: EuropeIdentity & { economyFingerprint: string };
}

async function checksum(payload: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

function validatePayload(value: unknown, europe?: EuropeScenario): SavedGame {
  if (!isSaveObject(value) || typeof value.economy !== 'string' || !value.economy
    || typeof value.defeated !== 'boolean') throw new Error('The local save is incomplete.');
  if (europe && value.scenario === undefined) throw new Error('The European save is missing its scenario identity.');
  let identity: SavedGame['scenario'];
  if (value.scenario !== undefined) {
    assertEuropeIdentity(value.scenario);
    if (!europe) throw new Error('This local save requires the restricted Europe 2023 review build.');
    if (!isSaveObject(value.scenario) || typeof value.scenario.economyFingerprint !== 'string'
      || !/^[a-f0-9]{16}$/.test(value.scenario.economyFingerprint)) throw new Error('The Europe 2023 save has no valid economic fingerprint.');
    identity = { ...europe.identity, economyFingerprint: value.scenario.economyFingerprint };
  }
  const game = validateSavedGame(value.game, europe?.fixture, europe?.countries.map(country => country.id));
  const drafts = validateSavedDrafts(value.drafts, game, Boolean(europe));
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
  const savedAt = typeof value.savedAt === 'number' && Number.isSafeInteger(value.savedAt)
    && value.savedAt > 0 && value.savedAt <= 8.64e15 ? value.savedAt : undefined;
  return { game, drafts, economy: value.economy, defeated: value.defeated, previous, ...(savedAt && { savedAt }), ...(identity && { scenario: identity }) };
}

function validateSession({ api, europe }: LoadedEconomy, { game, economy, drafts }: PlayableSession) {
  const session = economy.session;
  if (game.week !== session.week || game.playerCountryId !== session.playerCountryId
    || session.worldFingerprint !== (europe?.identity.worldFingerprint ?? api.worldFingerprint(scenario))) {
    throw new Error('The game and economy in this local save do not match.');
  }
  if (typeof economy.defeated !== 'boolean' || economy.defeated !== session.summary.playerRegimeFell) {
    throw new Error('The local save has an inconsistent game ending.');
  }
  if (europe && (session.state.countries.length !== game.countries.length || session.state.zones.length !== game.regions.length
    || game.countries.some(country => !session.state.countries.some(entry => entry.id === country.id)
      || api.getCountryEconomy(session, country.id).controller !== country.controller))) {
    throw new Error('The European save’s country or province roster does not match.');
  }
  for (const region of game.regions) {
    const view = api.getRegionEconomy(session, region.id);
    const original = (europe?.fixture ?? scenario).regions.find(entry => entry.id === region.id);
    if (region.ownerId !== view.controllerId || original?.ownerId !== view.legalOwnerId) {
      throw new Error('The game and economy disagree about territorial control.');
    }
    if (europe) {
      const zone = session.state.zones.findIndex(entry => entry.id === region.id);
      if (zone < 0 || session.state.countries[session.state.zone.owner[zone]]?.id !== region.ownerId) {
        throw new Error('The European save’s economy disagrees with geographic ownership.');
      }
    }
  }
  const fields = new Set<string>([...api.TAX_KINDS, ...api.SPENDING_CATEGORIES]);
  if (Object.keys(drafts.fiscal).some(key => !fields.has(key))) {
    throw new Error('The local save includes an unknown fiscal draft.');
  }
}

export async function encodeGameSave(runtime: LoadedEconomy, session: PlayableSession, savedAt?: number): Promise<string> {
  const { game, economy, drafts } = session;
  const previous = economy.previous && {
    countryId: economy.previous.countryId,
    treasury: economy.previous.treasury,
    comparison: { version: COMPARISON_VERSION, values: reportBaseline(economy.previous) },
  };
  const data = { game, drafts, previous, ...(savedAt !== undefined && { savedAt }), defeated: economy.defeated, economy: runtime.api.saveEconomySession(economy.session),
    ...(runtime.europe && { scenario: { ...runtime.europe.identity, economyFingerprint: runtime.api.economyFingerprint(economy.session) } }) };
  validatePayload(data, runtime.europe);
  validateSession(runtime, session);
  const payload = JSON.stringify(data);
  return JSON.stringify({ format: FORMAT, version: VERSION, checksum: await checksum(payload), payload });
}

/** Check the envelope and the game. Only European saves need the review package here. */
export async function decodeGameSave(record: string, loadEurope?: () => Promise<EuropeScenario>): Promise<SavedGame> {
  let envelope: unknown;
  try { envelope = JSON.parse(record); }
  catch { throw new Error('The local save could not be read.'); }
  if (!isSaveObject(envelope) || envelope.format !== FORMAT) throw new Error('The local save format is unrecognized.');
  if (envelope.version !== VERSION) throw new Error('This local save version is unsupported.');
  if (typeof envelope.payload !== 'string' || await checksum(envelope.payload) !== envelope.checksum) {
    throw new Error('The local save is damaged.');
  }
  const payload: unknown = JSON.parse(envelope.payload);
  if (isSaveObject(payload) && payload.scenario !== undefined) {
    assertEuropeIdentity(payload.scenario);
    return validatePayload(payload, await loadEurope?.());
  }
  return validatePayload(payload);
}

export function restoreGameSave(runtime: LoadedEconomy, save: SavedGame): PlayableSession {
  if (runtime.europe && !save.scenario) throw new Error('The European save is missing its scenario identity.');
  if (save.scenario) {
    assertEuropeIdentity(save.scenario);
    if (!runtime.europe) throw new Error('This local save requires the restricted Europe 2023 review build.');
    validateSavedGame(save.game, runtime.europe.fixture, runtime.europe.countries.map(country => country.id));
    validateSavedDrafts(save.drafts, save.game, true);
  }
  const loaded = runtime.api.loadEconomySession(save.economy);
  if (save.scenario && save.scenario.economyFingerprint !== runtime.api.economyFingerprint(loaded)) {
    throw new Error('The European save’s economic session fingerprint does not match.');
  }
  const economy = economySnapshot(runtime, loaded, save.previous);
  if (save.defeated !== economy.defeated) throw new Error('The local save has an inconsistent game ending.');
  const session = { game: save.game, economy, drafts: save.drafts };
  validateSession(runtime, session);
  return session;
}
