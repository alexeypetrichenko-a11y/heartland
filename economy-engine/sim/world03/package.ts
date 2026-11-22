/**
 * WORLD-03 step 4 (offline, deterministic): assemble the versioned scenario package.
 *
 *   node --experimental-strip-types economy-engine/sim/world03/package.ts
 *
 * 1. Rebuilds the calibrated world from calibration.json (technology and country inputs) and checks that the
 *    rebuilt week-1 economy is bit-identical to the calibration run (determinism).
 * 2. Produces the week-1 starting save in the integration session format (SESSION_VERSION 2) through the
 *    public API only: week 1 is resolved by advanceEconomyWeek with the autopilot's commands for every country,
 *    which equals createEconomySession's week 1 (checked by state hash). The save's worldFingerprint is the
 *    scenario's own fingerprint, so the CURRENT startEconomyFromSave (which fingerprints the fictional
 *    GameWorldInput) refuses it: the package cannot be loaded by the game by accident.
 * 3. Writes scenarios/europe-2023/<version>/: scenario.json (regions, connectivity, countries, profiles, policy,
 *    military draft, territories), provenance.json, calibration-report.json, world-spec.json,
 *    week1.session.json and manifest.json (file hashes, content fingerprint).
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { autopilotCommands, createEconomy, hashEconomy } from '../../src/index.ts';
import { advanceEconomyWeek, INTEGRATION_CONTRACT_VERSION, saveEconomySession, SESSION_FORMAT, SESSION_VERSION, withPlayerCountry } from '../../src/integration/index.ts';
import type { EconomySession } from '../../src/integration/index.ts';
import { SEED, worldSpec } from './calibrate.ts';

export const SCENARIO_ID = 'europe-2023';
export const SCENARIO_VERSION = '1.0.0-draft.1';
const ROOT = resolve(import.meta.dirname, '../../..');
const BUILD = resolve(ROOT, 'scenarios/europe-2023/build');
const OUT = resolve(ROOT, `scenarios/europe-2023/${SCENARIO_VERSION}`);
const read = (path: string) => JSON.parse(readFileSync(path, 'utf8'));
const sha256 = (text: string | Buffer) => createHash('sha256').update(text).digest('hex');
const json = (value: unknown) => JSON.stringify(value, null, 1) + '\n';

const inputs = read(resolve(BUILD, 'inputs.json'));
const geo = read(resolve(BUILD, 'geography.json'));
const cal = read(resolve(BUILD, 'calibration.json'));

function csv(path: string): Record<string, string>[] {
  const [head, ...lines] = readFileSync(path, 'utf8').trim().split('\n');
  const split = (line: string) => { const out: string[] = []; let cur = ''; let q = false; for (const ch of line) { if (ch === '"') q = !q; else if (ch === ',' && !q) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out; };
  const keys = split(head);
  return lines.map(line => Object.fromEntries(split(line).map((v, i) => [keys[i], v])));
}

function territories() {
  const text = readFileSync(resolve(ROOT, 'docs/world/WORLD-02-TERRITORIES.md'), 'utf8');
  const rows = text.split('\n').filter(line => line.startsWith('|') && line.includes('**(b)**'));
  return rows.map(line => {
    const cells = line.split('|').map(c => c.trim());
    return { name: cells[1].replace(/\*\*/g, ''), naturalEarth: [...cells[5].matchAll(/`([^`]+)`/g)].map(m => m[1]).filter(c => /^[A-Z0-9-]+$/.test(c)), handling: '(b) labelled, non-playable' };
  });
}

function main() {
  const technology = Object.fromEntries(cal.zones.map((z: { id: string; technology: number }) => [z.id, z.technology]));
  const policy: Record<string, Record<string, number>> = {};
  for (const f of cal.fiscal) {
    policy[f.id] = {};
    for (const r of f.rows) if (r.input !== null && r.input !== undefined) policy[f.id][r.field] = r.input;
  }
  const spec = worldSpec(technology, policy);
  const start = createEconomy(spec);
  const crosswalk = csv(resolve(ROOT, 'docs/world/data/world02-admin1-to-province.csv'));
  const membership = csv(resolve(ROOT, 'docs/world/data/world02-economic-membership.csv'));
  const zoneKind: Record<string, string> = Object.fromEntries(inputs.zones.map((z: { id: string; kind: string }) => [z.id, z.kind]));
  const neighboursOf = (id: string, links: { a: string; b: string }[]) => links.filter(l => l.a === id || l.b === id).map(l => (l.a === id ? l.b : l.a)).sort();
  const diplomatic = inputs.countries.filter((c: { kind: string }) => c.kind !== 'bloc').map((c: { id: string }) => c.id);
  const relations: { countryIds: [string, string]; value: number }[] = [];
  for (let i = 0; i < diplomatic.length; i++) for (let j = i + 1; j < diplomatic.length; j++) relations.push({ countryIds: [diplomatic[i], diplomatic[j]], value: 0 });
  const scenario = {
    id: SCENARIO_ID, version: SCENARIO_VERSION, status: cal.met ? 'review-draft' : 'review-draft: calibration targets not all met (see calibration-report.json)',
    referenceYear: 2023, seed: SEED,
    engine: { integrationContract: INTEGRATION_CONTRACT_VERSION, sessionFormat: SESSION_FORMAT, sessionVersion: SESSION_VERSION, catalogue: '31-good catalogue (toCatalogueSpec)' },
    countries: inputs.countries.map((c: { id: string; name: string; kind: string; iso3?: string }) => ({
      id: c.id, name: c.name, kind: c.kind === 'neighbour' ? 'simulated' : c.kind, iso3: c.iso3 ?? null,
      diplomacy: c.kind !== 'bloc', attackable: c.kind === 'playable', divisions: c.kind === 'playable',
    })),
    regions: inputs.zones.map((z: { id: string; name: string; kind: string; country: string; statistical_units?: string[]; members?: string[] }) => ({
      id: z.id, name: z.name, ownerId: z.country, kind: z.kind,
      landAdjacentRegionIds: neighboursOf(z.id, geo.land),
      maritimeLinkedRegionIds: neighboursOf(z.id, geo.maritime),
      movementAdjacentRegionIds: neighboursOf(z.id, geo.movement),
      naturalEarth: z.kind === 'province'
        ? { admin1: crosswalk.filter(r => r.province_id.toLowerCase() === z.id).map(r => r.ne_admin1_id).sort() }
        : z.kind === 'neighbour' ? { admin0: [z.id.replace('-all', '').toUpperCase()] } : { admin0: (z.members ?? []).slice().sort() },
      statisticalUnits: z.statistical_units ?? null,
    })),
    links: {
      land: geo.land.map((l: { a: string; b: string; distance: number }) => ({ a: l.a, b: l.b, laneId: `land-${l.a}|${l.b}`, distance: l.distance })),
      maritime: geo.maritime.map((l: { a: string; b: string; kind: string; crossing: string; status: string; rule: string; distance: number }) => ({ a: l.a, b: l.b, laneId: `sea-${l.a}|${l.b}`, kind: l.kind, crossing: l.crossing, status: l.status, rule: l.rule, distance: l.distance, movement: false })),
      movement: geo.movement,
      rules: 'land = economic road lanes and land borders; maritime = economic sea lanes only (never army movement); movement = land movement between playable provinces only (simulated countries and blocs cannot be entered in v1)',
    },
    economy: {
      regions: Object.fromEntries(inputs.zones.map((z: { id: string; population: { value: number }; advantage: { value: Record<string, number> } }) => [z.id, {
        population: z.population.value, technology: technology[z.id], populationGrowth: 0, advantage: z.advantage.value }])),
      countries: Object.fromEntries(inputs.countries.map((c: { id: string }) => [c.id, { ...policy[c.id], stability: 'engine default (70, neutral)', tariff: 'engine default' }])),
    },
    startingRelations: { rule: 'neutral: every pair of diplomatic actors at 0; blocs have no diplomacy', relations },
    military: {
      status: 'draft, not for gameplay until approved (M-2); placement of divisions is a game decision and is not set here',
      parameter: inputs.military.parameter_personnel_equivalents_per_division,
      countries: inputs.military.countries,
    },
    territories: { policy: 'WORLD-02 T-1: (b) labelled, non-playable; economy only through the bloc or none', entries: territories(),
                   noEconomy: membership.filter(r => r.tier === 'none').map(r => r.adm0_a3).sort() },
    overseas: { 'fra-om': 'French overseas departments (NUTS FRY): visible as French territory, not simulated in v1, excluded from France\'s economic totals' },
  };
  void zoneKind;
  const scenarioText = json(scenario);
  const worldFingerprint = sha256(scenarioText).slice(0, 16);
  // Week 1 through the public integration API: player = first country, its commands = the autopilot's, so every
  // country is steered by the autopilot exactly as in createEconomySession; then no player is selected.
  const first = start.countries[0].id;
  const week0 = { format: SESSION_FORMAT, worldFingerprint, playerCountryId: first, state: start, summary: null, week: 0 } as unknown as EconomySession;
  const week1 = withPlayerCountry(advanceEconomyWeek(week0, { playerCommands: autopilotCommands(start, [first]) }), null);
  const stateHash = hashEconomy(week1.state);
  if (stateHash !== cal.week1StateHash) throw new Error(`Rebuilt week-1 economy ${stateHash} differs from the calibration run ${cal.week1StateHash}.`);
  const session = saveEconomySession(week1);
  mkdirSync(OUT, { recursive: true });
  const { config: _config, ...specWithoutConfig } = spec;
  const files: Record<string, string> = {
    'scenario.json': scenarioText,
    'provenance.json': json({ note: 'Every economic input with its sources, method and status; the source snapshots are in ../sources/.', ...inputs }),
    'calibration-report.json': json(cal),
    'world-spec.json': json({ note: 'Engine WorldSpec without its goods config; rebuild with toCatalogueSpec(createCatalogueConfig) as in economy-engine/sim/world03/calibrate.ts', spec: specWithoutConfig }),
    'week1.session.json': session,
  };
  const manifestFiles = Object.entries(files).map(([path, text]) => ({ path, bytes: Buffer.byteLength(text), sha256: sha256(text) })).sort((a, b) => a.path.localeCompare(b.path));
  const contentFingerprint = sha256(manifestFiles.map(f => `${f.path}:${f.sha256}\n`).join(''));
  for (const [path, text] of Object.entries(files)) writeFileSync(resolve(OUT, path), text);
  writeFileSync(resolve(OUT, 'manifest.json'), json({
    id: SCENARIO_ID, version: SCENARIO_VERSION, immutable: true, status: scenario.status, referenceYear: 2023,
    worldFingerprint, week1EconomyHash: stateHash, contentFingerprint, files: manifestFiles,
    compatibility: 'New scenario. Fictional saves are unaffected: their scenario and fingerprints are unchanged. The current startEconomyFromSave refuses this package (different world fingerprint) until the proposed scenario loader exists.',
  }));
  console.log(`${SCENARIO_ID} ${SCENARIO_VERSION}: world ${worldFingerprint}, week-1 economy ${stateHash}, content ${contentFingerprint.slice(0, 16)}; session ${(Buffer.byteLength(session) / 1024).toFixed(0)} KB`);
}

main();
