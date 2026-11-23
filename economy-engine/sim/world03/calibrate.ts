/**
 * WORLD-03 step 3 (offline, deterministic): calibrate the European scenario on the UNCHANGED engine.
 *
 *   node --experimental-strip-types economy-engine/sim/world03/calibrate.ts
 *
 * Reads scenarios/europe-2023/build/inputs.json and geography.json. Builds the engine world directly through
 * the engine's public interface (createEconomy on a WorldSpec, 31-good catalogue via toCatalogueSpec), because
 * the integration API cannot yet carry country fiscal values or separate maritime lanes (proposal in
 * docs/world/WORLD-03-HANDOFF.md). Each round: build (160-week warm-up) + resolve week 1 exactly as
 * createEconomySession does (autopilot for every country), measure, and adjust only these inputs:
 *   - zone `technology`              -> each zone's share of the scenario's real output = its share of 2023 PPP GDP;
 *   - country tax rates              -> income / consumption / corporate tax revenue as % of GDP;
 *   - country spending shares        -> administration / social / military / infrastructure spending as % of GDP;
 *   - country starting debt          -> debt / yearly GDP.
 * Advantages are set once from data and not fitted (their residuals are reported). No engine formula or
 * parameter is changed. Values the data do not provide stay at the engine default and are listed.
 * Writes scenarios/europe-2023/build/calibration.json, world-spec.json and week1.economy.json.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { advanceEconomy, autopilotCommands, createEconomy, hashEconomy, serializeEconomy, toCatalogueSpec } from '../../src/index.ts';
import type { CountrySpec, EconomyState, LaneSpec, TurnReport, WorldSpec, ZoneSpec } from '../../src/index.ts';

const ROOT = resolve(import.meta.dirname, '../../..');
const BUILD = resolve(ROOT, 'scenarios/europe-2023/build');
const inputs = JSON.parse(readFileSync(resolve(BUILD, 'inputs.json'), 'utf8'));
const geo = JSON.parse(readFileSync(resolve(BUILD, 'geography.json'), 'utf8'));

export const SEED = 2401;
const MAX_ROUNDS = Number(process.env.WORLD03_ROUNDS ?? 12);
const TOL = { outputShareRelative: 0.03, fiscalPoints: 0.01 };
/** Scale of the engine unit: population-weighted mean technology of the 46 provinces (the fictional scenario uses 1.1-1.6). */
const PROVINCE_TECH_MEAN = 1.5;

type Item<T> = { value: T; status: string };
interface Zone { id: string; name: string; kind: string; country: string; population: Item<number>; output_target: Item<number>; advantage: Item<Record<string, number>>; groups: Item<Record<string, number>> }
interface Country { id: string; name: string; kind: string; fiscal: Record<string, Item<number | null>> }
const zones: Zone[] = inputs.zones;
const countries: Country[] = inputs.countries;

const TAXES = [['tax_income', 'taxIncome', 'incomeTax'], ['tax_consumption_engine', 'taxConsumption', 'consumptionTax'], ['tax_corporate', 'taxCorporate', 'corporateTax']] as const;
const SPEND = [['spend_administration', 'spendAdministration', 'administration'], ['spend_social', 'spendSocial', 'social'],
  ['spend_military', 'spendMilitary', 'military'], ['spend_infrastructure', 'spendInfrastructure', 'infrastructure']] as const;

/** Country inputs that come from data (status data/estimate/engine-limit); everything else stays at the engine default. */
function targets(country: Country): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, field] of [...TAXES, ...SPEND].map(([k, f]) => [k, f] as const)) {
    const entry = country.fiscal[key];
    if (entry && entry.value !== null && entry.status !== 'unavailable') out[field] = entry.value;
  }
  const debt = country.fiscal.debt;
  if (debt && debt.value !== null && debt.status !== 'unavailable') out.debtToGdp = debt.value;
  return out;
}

const lanes: LaneSpec[] = [
  ...geo.land.map((l: { a: string; b: string; distance: number }) => ({ id: `land-${l.a}|${l.b}`, from: l.a, to: l.b, distance: l.distance })),
  ...geo.maritime.map((l: { a: string; b: string; distance: number }) => ({ id: `sea-${l.a}|${l.b}`, from: l.a, to: l.b, distance: l.distance })),
];

export function worldSpec(technology: Record<string, number>, policy: Record<string, Record<string, number>>): WorldSpec {
  const countrySpecs: CountrySpec[] = countries.map(c => ({ id: c.id, name: c.name, ...policy[c.id] }));
  const zoneSpecs: ZoneSpec[] = zones.map(z => ({
    id: z.id, name: z.name, countryId: z.country, population: z.population.value, technology: technology[z.id], advantage: { ...z.advantage.value },
  }));
  return toCatalogueSpec({ seed: SEED, countries: countrySpecs, zones: zoneSpecs, lanes });
}

/** Week 1 as createEconomySession resolves it: the autopilot for every country, full report. */
function weekOne(state: EconomyState): { state: EconomyState; report: TurnReport } {
  const all = state.countries.map(c => c.id);
  return advanceEconomy(state, { commands: autopilotCommands(state, all), effects: [] }, { audit: true, report: 'full' });
}

/** Zone real value added at base prices from the week's output (the engine's own definition, production.ts). */
function zoneRealOutput(state: EconomyState, report: TurnReport): Record<string, number> {
  const goods = state.config.goods;
  const base = new Map(goods.map(g => [g.id, g.basePrice]));
  const unitValue = goods.map(g => g.basePrice - g.inputs.reduce((sum, input) => sum + input.amount * (base.get(input.goodId) ?? 0), 0));
  const out: Record<string, number> = {};
  for (const zone of report.zones) out[zone.zoneId] = zone.output.reduce((sum, units, g) => sum + units * unitValue[g], 0);
  return out;
}

function measure(state: EconomyState, report: TurnReport) {
  const real = zoneRealOutput(state, report);
  const totalReal = Object.values(real).reduce((a, b) => a + b, 0);
  const country: Record<string, Record<string, number>> = {};
  for (const c of report.countries) {
    const b = c.budget as unknown as Record<string, number>;
    const g = c.gdpNominal;
    const row: Record<string, number> = { gdpReal: c.gdpReal, gdpNominal: g };
    for (const [, field, budget] of [...TAXES, ...SPEND]) row[field] = g > 0 ? b[budget] / g : 0;
    const cs = state.country;
    const ci = state.countries.findIndex(x => x.id === c.countryId);
    row.debtToGdp = cs.gdp[ci] > 0 ? cs.debt[ci] / (cs.gdp[ci] * 52) : 0;
    country[c.countryId] = row;
  }
  return { real, totalReal, country };
}

function main() {
  const totalTarget = zones.reduce((s, z) => s + z.output_target.value, 0);
  const share = Object.fromEntries(zones.map(z => [z.id, z.output_target.value / totalTarget]));
  // Initial technology: output per person relative to the provinces' population-weighted mean, scaled.
  const perCapita = Object.fromEntries(zones.map(z => [z.id, z.output_target.value / z.population.value]));
  const provinces = zones.filter(z => z.kind === 'province');
  const provMean = provinces.reduce((s, z) => s + perCapita[z.id] * z.population.value, 0) / provinces.reduce((s, z) => s + z.population.value, 0);
  let technology = Object.fromEntries(zones.map(z => [z.id, PROVINCE_TECH_MEAN * perCapita[z.id] / provMean]));
  const goal = Object.fromEntries(countries.map(c => [c.id, targets(c)]));
  let policy: Record<string, Record<string, number>> = JSON.parse(JSON.stringify(goal));
  const rounds: unknown[] = [];
  let best: { score: number; technology: typeof technology; policy: typeof policy; state: EconomyState; report: TurnReport; m: ReturnType<typeof measure> } | null = null;
  let previous: { technology: typeof technology; policy: typeof policy } | null = null;
  let failures = 0;
  for (let round = 1; round <= MAX_ROUNDS; round++) {
    const t0 = performance.now();
    let start: EconomyState;
    try {
      start = createEconomy(worldSpec(technology, policy));
    } catch (error) {
      // The builder refuses worlds it cannot bring to a resting point. Step back halfway towards the last
      // accepted inputs and try again (never more than 4 times in a row).
      failures++;
      rounds.push({ round, refused: (error as Error).message });
      console.log(`round ${round}: builder refused (${(error as Error).message}); stepping back`);
      if (!previous || failures > 4) throw error;
      const prev = previous;
      technology = Object.fromEntries(Object.keys(technology).map(id => [id, Math.sqrt(technology[id] * prev.technology[id])]));
      policy = Object.fromEntries(Object.keys(policy).map(id => [id, Object.fromEntries(Object.keys(policy[id]).map(f => [f, (policy[id][f] + prev.policy[id][f]) / 2]))]));
      continue;
    }
    failures = 0;
    previous = { technology, policy };
    const { state, report } = weekOne(start);
    const m = measure(state, report);
    // Residuals
    const zoneRes = zones.map(z => ({ id: z.id, target: share[z.id], achieved: m.real[z.id] / m.totalReal }));
    const worstZone = Math.max(...zoneRes.map(r => Math.abs(r.achieved / r.target - 1)));
    let worstFiscal = 0;
    let worstFlow = 0;
    for (const c of countries) for (const [field, target] of Object.entries(goal[c.id])) {
      const gap = Math.abs(m.country[c.id][field] - target);
      worstFiscal = Math.max(worstFiscal, gap);
      if (field !== 'debtToGdp') worstFlow = Math.max(worstFlow, gap);
    }
    // Best round = closest on output shares, taxes and spending; debt is reported separately because the
    // engine cannot hold 2023 debt levels at its starting point (see the calibration report).
    // Score = number of targets missed (zones, taxes and spending, debt), then the largest normalised miss.
    let missed = zoneRes.filter(r => Math.abs(r.achieved / r.target - 1) > TOL.outputShareRelative).length;
    for (const c of countries) for (const [f, t] of Object.entries(goal[c.id])) if (Math.abs(m.country[c.id][f] - t) > TOL.fiscalPoints) missed++;
    const score = missed + Math.min(0.999, Math.max(worstZone / TOL.outputShareRelative, worstFlow / TOL.fiscalPoints) / 1000);
    const failing = countries.flatMap(c => Object.entries(goal[c.id]).filter(([f]) => f !== 'debtToGdp')
      .map(([f, t]) => ({ country: c.id, field: f, gap: m.country[c.id][f] - t })).filter(x => Math.abs(x.gap) > TOL.fiscalPoints))
      .sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap)).slice(0, 8).map(x => `${x.country}.${x.field} ${(x.gap * 100).toFixed(1)}`);
    rounds.push({ round, seconds: (performance.now() - t0) / 1000, worstZoneShareRelative: worstZone, worstTaxSpendPoints: worstFlow, worstFiscalPoints: worstFiscal, failing });
    if (round % 5 === 0) console.log('   failing (pp):', failing.join(', '));
    console.log(`round ${round}: worst zone share ${(worstZone * 100).toFixed(2)}% | worst tax/spending ${(worstFlow * 100).toFixed(2)} pp | worst incl. debt ${(worstFiscal * 100).toFixed(2)} pp | ${((performance.now() - t0) / 1000).toFixed(1)} s`);
    if (!best || score < best.score) best = { score, technology, policy, state, report, m };
    if (worstZone <= TOL.outputShareRelative && worstFiscal <= TOL.fiscalPoints) break;
    // Updates: damped, multiplicative, each step bounded to a factor of 1.5, within the engine's own limits.
    const bound = (x: number) => Math.min(1.5, Math.max(1 / 1.5, x));
    const next = { ...technology };
    for (const r of zoneRes) next[r.id] = technology[r.id] * bound(Math.pow(r.target / Math.max(1e-12, r.achieved), 0.8));
    const scale = PROVINCE_TECH_MEAN * provinces.reduce((s, z) => s + z.population.value, 0) / provinces.reduce((s, z) => s + next[z.id] * z.population.value, 0);
    for (const id of Object.keys(next)) next[id] *= scale;
    technology = next;
    const nextPolicy: typeof policy = {};
    for (const c of countries) {
      nextPolicy[c.id] = { ...policy[c.id] };
      for (const [field, target] of Object.entries(goal[c.id])) {
        const achieved = m.country[c.id][field];
        // Debt: the INPUT stays the 2023 value. The engine's sovereign-spread rules make 2023 debt levels drift during
        // the builder's warm-up and afterwards (see the calibration report); fitting the input to hide that drift
        // would misstate the starting position, so the residual is reported instead (owner decision W3-D1).
        if (field === 'debtToGdp') {
          nextPolicy[c.id][field] = target;
        } else if (achieved > 1e-6) nextPolicy[c.id][field] = Math.min(field.startsWith('tax') ? 0.7 : 0.5, policy[c.id][field] * bound(Math.pow(target / achieved, 0.8)));
      }
    }
    policy = nextPolicy;
  }
  const b = best!;
  // Final residual report from the best round.
  const zoneTable = zones.map(z => ({
    id: z.id, kind: z.kind, country: z.country, technology: b.technology[z.id],
    targetShare: share[z.id], achievedShare: b.m.real[z.id] / b.m.totalReal, relativeError: (b.m.real[z.id] / b.m.totalReal) / share[z.id] - 1,
  }));
  const countryTarget: Record<string, number> = {};
  const countryAchieved: Record<string, number> = {};
  for (const z of zoneTable) { countryTarget[z.country] = (countryTarget[z.country] ?? 0) + z.targetShare; countryAchieved[z.country] = (countryAchieved[z.country] ?? 0) + z.achievedShare; }
  const fiscalTable = countries.map(c => ({
    id: c.id, kind: c.kind,
    rows: [...TAXES, ...SPEND].map(([key, field]) => ({ field: field as string, target: goal[c.id][field] ?? null, status: c.fiscal[key]?.status ?? 'unavailable', input: b.policy[c.id][field] ?? null, achieved: b.m.country[c.id][field] }))
      .concat([{ field: 'debtToGdp', target: goal[c.id].debtToGdp ?? null, status: c.fiscal.debt?.status ?? 'unavailable', input: b.policy[c.id].debtToGdp ?? null, achieved: b.m.country[c.id].debtToGdp }]),
  }));
  // Sector groups: achieved output shares by engine group vs data (informational, advantages are not fitted).
  const goods = b.state.config.goods;
  const groupOf: Record<string, string> = {};
  const ORIGIN: Record<string, string> = { cereals: 'food', other_agri: 'food', processed_food: 'food', crude_oil: 'energy', natural_gas: 'energy', fuels: 'energy',
    iron_ore: 'materials', nonferrous_ore: 'materials', strategic_minerals: 'materials', uranium: 'materials', coal: 'materials', cement: 'materials', construction_materials: 'materials',
    steel: 'industrial', aluminium: 'industrial', chemicals: 'industrial', machinery: 'industrial', electronic_components: 'industrial', semiconductors: 'industrial', vehicles: 'industrial',
    everyday_goods: 'consumer', durable_goods: 'consumer' };
  goods.forEach(g => { groupOf[g.id] = ORIGIN[g.id] ?? 'other'; });
  const base = new Map(goods.map(g => [g.id, g.basePrice]));
  const unitValue = goods.map(g => g.basePrice - g.inputs.reduce((s, i) => s + i.amount * (base.get(i.goodId) ?? 0), 0));
  const groupTable = b.report.zones.map(zr => {
    const totals: Record<string, number> = {};
    zr.output.forEach((units, g) => { const k = groupOf[goods[g].id]; totals[k] = (totals[k] ?? 0) + units * unitValue[g]; });
    const sum = Object.values(totals).reduce((x, y) => x + y, 0);
    const z = zones.find(x => x.id === zr.zoneId)!;
    return { id: zr.zoneId, data: z.groups.value, engine: Object.fromEntries(['food', 'energy', 'materials', 'industrial', 'consumer'].map(k => [k, (totals[k] ?? 0) / sum])) };
  });
  mkdirSync(BUILD, { recursive: true });
  const spec = worldSpec(b.technology, b.policy);
  const { config: _config, ...specWithoutConfig } = spec;
  writeFileSync(resolve(BUILD, 'world-spec.json'), JSON.stringify({ note: 'Engine WorldSpec without its goods config: rebuild with toCatalogueSpec() from the legacy zone advantages, or use createCatalogueConfig().',
    legacyZones: zones.map(z => ({ id: z.id, advantage: z.advantage.value })), spec: specWithoutConfig }, null, 1) + '\n');
  writeFileSync(resolve(BUILD, 'week1.economy.json'), serializeEconomy(b.state));
  writeFileSync(resolve(BUILD, 'calibration.json'), JSON.stringify({
    engine: 'economy-engine (unchanged)', seed: SEED, provinceTechnologyMean: PROVINCE_TECH_MEAN, tolerances: TOL, rounds,
    met: b.score < 1, targetsMissed: Math.floor(b.score), week1StateHash: hashEconomy(b.state),
    zones: zoneTable,
    countries: Object.keys(countryTarget).map(id => ({ id, targetShare: countryTarget[id], achievedShare: countryAchieved[id], relativeError: countryAchieved[id] / countryTarget[id] - 1 })),
    fiscal: fiscalTable, groups: groupTable,
  }, null, 1) + '\n');
  console.log(`best round: ${Math.floor(b.score)} targets missed; week-1 state hash ${hashEconomy(b.state)}`);
}

if (import.meta.main ?? process.argv[1]?.endsWith('calibrate.ts')) main();
