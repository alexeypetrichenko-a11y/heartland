import type { EconomySession, LoadedEconomy } from './economyBridge.ts';
import { economySnapshot } from './economyBridge.ts';
import { selectCountry } from './selectCountry.ts';
import type { GameState, Relation } from './models.ts';
import type { GeographicRegionId } from '../geography/types.ts';

export const EUROPE_ID = 'europe-2023';
export const EUROPE_VERSION = '1.0.0-draft.2';
const WORLD = '73db3573d9e4cef4';
const OPENING_ECONOMY = 'e0f18a0898bae961';
const CONTENT = '666abb752e2947517b8dcf1e9fa89c0e2f87c1f5f657a8398b5d1fce130313aa';
const files = ['calibration-report.json', 'provenance.json', 'scenario.json', 'week1.session.json', 'world-spec.json'] as const;
export const EUROPE_MILITARY_NOTICE = 'Military operations are unavailable in this review build. Türkiye’s starting force is unresolved and draft forces for the other five countries have no approved placement. The scenario is militarily incomplete and unbalanced.';

export interface EuropeIdentity {
  id: typeof EUROPE_ID;
  version: typeof EUROPE_VERSION;
  worldFingerprint: string;
  contentFingerprint: string;
}

export interface EuropeProvince {
  id: string;
  name: string;
  ownerId: string;
  kind: string;
  landAdjacentRegionIds: string[];
  maritimeLinkedRegionIds: string[];
  movementAdjacentRegionIds: string[];
  naturalEarth: { admin1?: GeographicRegionId[] };
}

interface ScenarioData {
  countries: { id: string; name: string; iso3: string | null; kind: string }[];
  regions: EuropeProvince[];
  startingRelations: { relations: Relation[] };
  military: { countries: Record<string, { status: string; divisions: number | null }> };
}

export interface EuropeScenario {
  identity: EuropeIdentity;
  fixture: GameState;
  countries: { id: string; name: string; iso3: string }[];
  provinces: EuropeProvince[];
  opening: EconomySession;
}

async function sha256(bytes: Uint8Array<ArrayBuffer>) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
}

export function assertEuropeIdentity(value: unknown): asserts value is EuropeIdentity {
  const identity = value as Partial<EuropeIdentity> | undefined;
  if (identity?.id !== EUROPE_ID || identity.version !== EUROPE_VERSION) {
    throw new Error('This local save requires an unsupported scenario or scenario version.');
  }
  if (identity.worldFingerprint !== WORLD || identity.contentFingerprint !== CONTENT) {
    throw new Error('This local save requires a different Europe 2023 package.');
  }
}

/** The approved package is pinned independently of its manifest. No session fingerprint is rewritten. */
export async function readEuropeScenario({ api }: LoadedEconomy, read: (filename: string) => Promise<Uint8Array<ArrayBuffer>>): Promise<EuropeScenario> {
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const manifestBytes = await read('manifest.json');
  let manifest;
  try { manifest = JSON.parse(decoder.decode(manifestBytes)); }
  catch { throw new Error('The Europe 2023 manifest could not be read.'); }
  if (!manifest || typeof manifest !== 'object') throw new Error('The Europe 2023 manifest is invalid.');
  const identity = { id: manifest.id, version: manifest.version, worldFingerprint: manifest.worldFingerprint, contentFingerprint: manifest.contentFingerprint };
  assertEuropeIdentity(identity);
  if (manifest.immutable !== true || manifest.distributable !== false || manifest.week1EconomyHash !== OPENING_ECONOMY
    || !Array.isArray(manifest.files) || manifest.files.length !== files.length) {
    throw new Error('The Europe 2023 manifest does not match the approved review package.');
  }
  const checked = await Promise.all(files.map(async path => {
    const entry = manifest.files.find((item: { path: string }) => item?.path === path);
    const bytes = await read(path);
    const hash = await sha256(bytes);
    if (entry?.sha256 !== hash || entry.bytes !== bytes.byteLength) throw new Error(`Europe 2023 integrity check failed for ${path}.`);
    return { path, bytes, hash };
  }));
  const fingerprint = await sha256(new TextEncoder().encode(checked.map(({ path, hash }) => `${path}:${hash}\n`).join('')));
  if (fingerprint !== CONTENT || checked.find(entry => entry.path === 'scenario.json')!.hash.slice(0, 16) !== WORLD) throw new Error('Europe 2023 content fingerprint mismatch.');

  const verified = new Map(checked.map(({ path, bytes }) => [path, bytes]));
  const data: ScenarioData = JSON.parse(decoder.decode(verified.get('scenario.json')!));
  const opening = api.loadEconomySession(decoder.decode(verified.get('week1.session.json')!));
  const countries = data.countries.flatMap(country => country.kind === 'playable' && country.iso3 ? [{ ...country, iso3: country.iso3 }] : []);
  const provinces = data.regions.filter(region => region.kind === 'province');
  const fixture: GameState = {
    seed: 2023, week: 1, playerCountryId: null,
    countries: data.countries.map(({ id, name }) => ({ id, name, controller: 'ai' })),
    regions: data.regions.map(({ id, name, ownerId, movementAdjacentRegionIds }) => ({ id, name, ownerId, adjacentRegionIds: movementAdjacentRegionIds })),
    relations: data.startingRelations.relations,
    divisions: [], standingOrders: [], militaryResults: [], diplomaticMessages: [],
  };
  if (opening.worldFingerprint !== WORLD || opening.week !== 1 || opening.playerCountryId !== null
    || api.economyFingerprint(opening) !== OPENING_ECONOMY
    || countries.map(country => country.id).join(',') !== 'fra,deu,gbr,ita,pol,tur'
    || data.military.countries.tur?.status !== 'unresolved' || data.military.countries.tur.divisions !== null
    || provinces.length !== 46 || fixture.regions.length !== 61 || fixture.countries.length !== 21
    || opening.state.zones.length !== fixture.regions.length || opening.state.countries.length !== fixture.countries.length) {
    throw new Error('Europe 2023 opening economy is incompatible with this game.');
  }
  for (const country of fixture.countries) {
    const view = api.getCountryEconomy(opening, country.id);
    if (!opening.state.countries.some(entry => entry.id === country.id) || view.name !== country.name
      || ![view.gdpReal, view.debt, view.treasury, ...Object.values(view.fiscal.taxes), ...Object.values(view.fiscal.spending)].every(Number.isFinite)) {
      throw new Error(`Europe 2023 opening economy is invalid for ${country.name}.`);
    }
  }
  for (const region of fixture.regions) {
    const view = api.getRegionEconomy(opening, region.id);
    const zone = opening.state.zones.findIndex(entry => entry.id === region.id);
    if (zone < 0 || opening.state.countries[opening.state.zone.owner[zone]]?.id !== region.ownerId
      || view.legalOwnerId !== region.ownerId || view.controllerId !== region.ownerId) {
      throw new Error(`Europe 2023 opening ownership is invalid for ${region.name}.`);
    }
  }
  return { identity, fixture, countries, provinces, opening };
}

/** Assign the same playable country to both halves of the opening state. */
export function startEuropeGame(runtime: LoadedEconomy & { europe: EuropeScenario }, countryId: string) {
  const { api, europe } = runtime;
  if (!europe.countries.some(country => country.id === countryId)) throw new Error('Select a playable European country.');
  return {
    game: selectCountry(europe.fixture, countryId),
    economy: economySnapshot(runtime, api.withPlayerCountry(europe.opening, countryId), null),
  };
}
