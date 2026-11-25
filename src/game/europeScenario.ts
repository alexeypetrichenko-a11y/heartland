import type { EconomySession, LoadedEconomy } from './economyBridge.ts';
import { economySnapshot } from './economyBridge.ts';
import { selectCountry } from './selectCountry.ts';
import type { Division, GameState, Relation } from './models.ts';
import type { GeographicRegionId } from '../geography/types.ts';

import {
  EUROPE_ID, EUROPE_VERSION, EUROPE_MANIFEST_SHA, EUROPE_WORLD as WORLD, EUROPE_OPENING as OPENING_ECONOMY,
  EUROPE_CONTENT as CONTENT, EUROPE_DATA_FILES as files, EUROPE_LICENCE_FILES,
} from './europePackage.ts';

export { EUROPE_ID, EUROPE_VERSION };
export const EUROPE_MILITARY_NOTICE = 'Starting forces and frontier-weighted placement are illustrative. Türkiye’s 20 divisions are a provisional gameplay assumption. Land operations only. The United Kingdom and Türkiye have no land military link to another playable country.';
const expectedDivisions = { fra: 15, deu: 13, gbr: 14, ita: 15, pol: 13, tur: 20 };

interface SourceCredit {
  publisher: string;
  licence: string;
  url: string;
  attribution: string;
}

export interface EuropeAttribution {
  scenario: string;
  version: string;
  publishers: SourceCredit[];
  other: SourceCredit[];
  blockers: string[];
  oecdDatasets: { dataflow: string; title: string; version: string }[];
}

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
  military: {
    countries: Record<string, { status: string; divisions: number }>;
    parameter: { value: number };
    placement: { rule: string; byRegion: Record<string, number> };
  };
}

export interface EuropeScenario {
  identity: EuropeIdentity;
  fixture: GameState;
  countries: { id: string; name: string; iso3: string }[];
  provinces: EuropeProvince[];
  opening: EconomySession;
  attribution: EuropeAttribution;
}

async function sha256(bytes: Uint8Array<ArrayBuffer>) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
}

export function assertEuropeIdentity(value: unknown): asserts value is EuropeIdentity {
  const identity = value as (Partial<Omit<EuropeIdentity, 'version'>> & { version?: string }) | undefined;
  if (identity?.id === EUROPE_ID && (identity.version === '1.0.0-draft.1' || identity.version === '1.0.0-draft.2')) {
    throw new Error(`This Europe save requires ${identity.version}. Use its original review build to resume it.`);
  }
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
  if (manifest.immutable !== true || manifest.distributable !== true || manifest.week1EconomyHash !== OPENING_ECONOMY
    || !Array.isArray(manifest.files) || manifest.files.length !== files.length
    || await sha256(manifestBytes) !== EUROPE_MANIFEST_SHA) {
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
  const licenceFiles = await Promise.all(Object.entries(EUROPE_LICENCE_FILES).map(async ([key, path]) => {
    const bytes = await read(path);
    if (manifest[key]?.path !== path || await sha256(bytes) !== manifest[key].sha256) {
      throw new Error(`Europe 2023 integrity check failed for ${path}.`);
    }
    return bytes;
  }));
  const attribution: EuropeAttribution = JSON.parse(decoder.decode(licenceFiles[1]));
  if (attribution.scenario !== EUROPE_ID || attribution.version !== EUROPE_VERSION || attribution.blockers.length) {
    throw new Error('The Europe 2023 attribution does not match the approved review package.');
  }
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
  fixture.divisions = startingDivisions(data, provinces);
  return { identity, fixture, countries, provinces, opening, attribution };
}

function startingDivisions(data: ScenarioData, provinces: EuropeProvince[]): Division[] {
  const { parameter, placement, countries } = data.military;
  const playable = new Map(provinces.map(province => [province.id, province]));
  if (parameter.value !== 25_000 || placement.rule !== 'P-1' || Object.keys(placement.byRegion).length !== provinces.length
    || countries.tur?.status !== 'assumption' || Object.keys(countries).length !== Object.keys(expectedDivisions).length) {
    throw new Error('Europe 2023 military configuration does not match the approved placement.');
  }
  const totals = new Map<string, number>();
  const divisions: Division[] = [];
  for (const region of data.regions) {
    const isProvince = playable.has(region.id);
    const validMovement = region.movementAdjacentRegionIds.every(id => isProvince && region.landAdjacentRegionIds.includes(id)
      && playable.get(id)?.movementAdjacentRegionIds.includes(region.id));
    if (!validMovement) throw new Error(`Invalid land military connections for ${region.name}.`);
    if (!isProvince) continue;
    const count = placement.byRegion[region.id];
    if (!Number.isSafeInteger(count) || count < 0 || count > 20 || (count > 0) !== (region.movementAdjacentRegionIds.length > 0)) {
      throw new Error(`Invalid starting force placement for ${region.name}.`);
    }
    const name = data.countries.find(country => country.id === region.ownerId)?.name;
    if (!name || !Object.hasOwn(expectedDivisions, region.ownerId)) throw new Error('Unknown starting force owner.');
    const earlier = totals.get(region.ownerId) ?? 0;
    for (let index = 1; index <= count; index++) divisions.push({
      id: `${region.id}-division-${index}`, name: `${name} · Division ${earlier + index}`,
      ownerId: region.ownerId, regionId: region.id, manpower: parameter.value, order: { kind: 'defend' },
    });
    totals.set(region.ownerId, earlier + count);
  }
  if (divisions.length !== 90 || Object.entries(expectedDivisions).some(([id, count]) =>
    totals.get(id) !== count || countries[id]?.divisions !== count)) {
    throw new Error('Europe 2023 starting division counts do not match the approved roster.');
  }
  return divisions;
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
