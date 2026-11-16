import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { EconomyConfig, EconomyState } from '../src/index.ts';
import {
  advanceEconomyInPlace, auditError, autopilotCommands, AUDIT_TOLERANCE, CATALOGUE_GOODS, CATALOGUE_SECTORS, cloneEconomy,
  createCatalogueConfig, createEconomy, createCatalogueWorldSpec, deserializeEconomy, getFirmAggregates,
  hashEconomy, rescaleMoney, serializeEconomy, validateConfig, validateEconomy,
} from '../src/index.ts';
import { getModel, getWorkspace } from '../src/core/model.ts';
import { planPrivateSector } from '../src/core/planning.ts';
import { capacityOf, world } from './helpers.ts';

/**
 * Milestone 1: sectors separated from goods, firm aggregates by zone x sector x
 * ownership, three performance tiers, the 31-good catalogue with multi-input
 * recipes, and the accounting invariants that must hold for all of it.
 */

let cached: EconomyState | null = null;
/** Fresh copy of the calibrated 31-good Meridian world (built once per process). */
function catalogueWorld(): EconomyState {
  cached ??= createEconomy(createCatalogueWorldSpec());
  return cloneEconomy(cached);
}
const O = 3, T = 3;
const step = (s: EconomyState, audit = true) => advanceEconomyInPlace(s, { commands: autopilotCommands(s) }, { audit, report: 'full' });

// --- Catalogue -----------------------------------------------------------------

test('catalogue: ten sectors, about 30 goods (at most 35), every sector produces something', () => {
  assert.equal(CATALOGUE_SECTORS.length, 10);
  assert.ok(CATALOGUE_GOODS.length >= 28 && CATALOGUE_GOODS.length <= 35, `${CATALOGUE_GOODS.length} goods`);
  for (const sector of CATALOGUE_SECTORS) assert.ok(CATALOGUE_GOODS.some(good => good.sectorId === sector.id), `${sector.id} has goods`);
  assert.deepEqual(CATALOGUE_SECTORS.map(s => s.id), ['agriculture', 'mining', 'hydrocarbons', 'electricity', 'heavy_industry',
    'manufacturing', 'consumer_goods', 'military_industry', 'construction', 'services']);
});

test('catalogue: the approved distinctions R66-R71 exist, and chemicals are not split (R72 not approved)', () => {
  const ids = new Set(CATALOGUE_GOODS.map(good => good.id));
  for (const id of ['coal', 'crude_oil', 'natural_gas', 'fuels', 'electricity', 'cereals', 'other_agri', 'processed_food',
    'uranium', 'strategic_minerals', 'aluminium', 'semiconductors', 'electronic_components']) assert.ok(ids.has(id), id);
  assert.equal(CATALOGUE_GOODS.filter(good => good.id.includes('chemical')).length, 1);
  const electricity = CATALOGUE_GOODS.find(good => good.id === 'electricity')!;
  assert.equal(electricity.spoilage, 1, 'electricity cannot be stored between weeks');
  const sectorOf = (id: string) => CATALOGUE_GOODS.find(good => good.id === id)!.sectorId;
  assert.equal(sectorOf('cereals'), 'agriculture');
  assert.equal(sectorOf('processed_food'), 'consumer_goods');
  assert.equal(sectorOf('uranium'), 'mining');
});

test('catalogue: production recipes have several inputs and form real supply chains', () => {
  const inputs = (id: string) => CATALOGUE_GOODS.find(good => good.id === id)!.inputs.map(input => input.goodId);
  assert.ok(CATALOGUE_GOODS.filter(good => good.inputs.length >= 4).length >= 20, 'most goods need four or more inputs');
  assert.ok(inputs('steel').includes('iron_ore') && inputs('steel').includes('coal'));
  assert.ok(inputs('electronic_components').includes('semiconductors'));
  assert.ok(inputs('semiconductors').includes('strategic_minerals'));
  assert.ok(inputs('fuels').includes('crude_oil'));
  assert.ok(inputs('electricity').includes('uranium') && inputs('electricity').includes('natural_gas'));
  assert.ok(inputs('processed_food').includes('cereals') && inputs('processed_food').includes('other_agri'));
  const model = getModel(createCatalogueConfig());
  // Electricity is made before the services that consume it in the same week.
  const order = model.madeToOrderOrder.map(g => CATALOGUE_GOODS[g].id);
  assert.ok(order.indexOf('electricity') < order.indexOf('general_services'));
  assert.ok(order.indexOf('general_services') < order.indexOf('tech_services'));
});

test('configuration validation rejects unknown sectors, broken tier shares and loops of non-storable goods', () => {
  const base = createCatalogueConfig();
  const broken = (change: (config: EconomyConfig) => void) => {
    const config: EconomyConfig = JSON.parse(JSON.stringify(base));
    change(config);
    return () => validateConfig(config);
  };
  assert.doesNotThrow(broken(() => {}));
  assert.throws(broken(c => { c.goods[0].sectorId = 'nowhere'; }), /unknown sector/);
  assert.throws(broken(c => { c.sectors[0].tierShares = [0.5, 0.5, 0.5]; }), /tier shares/);
  assert.throws(broken(c => { c.sectors[1].publicShare = 0.8; c.sectors[1].mixedShare = 0.4; }), /ownership/);
  assert.throws(broken(c => { c.sectors.push({ ...c.sectors[0] }); }), /unique/);
  assert.throws(broken(c => { c.params.tierProductivity = [1, 1] as unknown as [number, number, number]; }), /outside its valid range/);
  assert.throws(broken(c => {
    const electricity = c.goods.find(good => good.id === 'electricity')!;
    electricity.inputs.push({ goodId: 'general_services', amount: 0.01 });
  }), /loop/);
});

// --- Starting state ------------------------------------------------------------

test('world builder: starting capacity is split by the sector ownership and tier shares; cash is working capital', () => {
  const state = catalogueWorld();
  const { goods, sectors } = state.config;
  const G = goods.length, S = sectors.length;
  // Calibration trims capacity uniformly, so shares are exact even though levels moved.
  for (let z = 0; z < state.zones.length; z++) {
    for (let g = 0; g < G; g++) {
      const total = capacityOf(state, z, g);
      if (!(total > 0)) continue;
      const sector = sectors.find(entry => entry.id === goods[g].sectorId)!;
      const owners = [1 - sector.publicShare - sector.mixedShare, sector.publicShare, sector.mixedShare];
      for (let o = 0; o < O; o++) {
        for (let t = 0; t < T; t++) {
          const line = state.firmLine.capacity[((z * G + g) * O + o) * T + t];
          assert.ok(Math.abs(line - total * owners[o] * sector.tierShares[t]) <= 1e-9 * total, 'line share');
        }
      }
    }
  }
  for (let a = 0; a < Z_S_O(state); a++) assert.ok(state.firm.cash[a] >= 0 && state.firm.costs[a] >= 0);
  // Every producing aggregate holds cash; aggregates with nothing to do hold none.
  let producing = 0;
  for (let a = 0; a < state.zones.length * S * O; a++) if (state.firm.costs[a] > 0) { producing++; assert.ok(state.firm.cash[a] > 0); }
  assert.ok(producing > state.zones.length * S, 'public and mixed aggregates exist alongside private ones');
});
const Z_S_O = (state: EconomyState) => state.zones.length * state.config.sectors.length * O;

test('the starting point is a resting point: every tier of every active sector covers its running costs', () => {
  const state = catalogueWorld();
  const m = getModel(state.config);
  const p = state.config.params;
  const G = m.goodCount;
  for (let z = 0; z < state.zones.length; z++) {
    const productivity = Math.max(0.05, state.zone.technology[z] * (1 + p.infraProductivity * (state.zone.infrastructure[z] - 1)));
    for (let g = 0; g < G; g++) {
      const index = z * G + g;
      if (!(capacityOf(state, z, g) > 0)) continue;
      let inputs = 0;
      for (let i = 0; i < m.inputGoods[g].length; i++) inputs += m.inputAmounts[g][i] * state.zoneGood.buyPrice[z * G + m.inputGoods[g][i]];
      const labor = m.labor[g] * state.zone.wage[z] / (productivity * state.zoneGood.efficiency[index]);
      for (let t = 0; t < T; t++) {
        const cost = labor / m.tierFactor[t] + inputs;
        assert.ok(state.zoneGood.price[index] >= cost, `${state.zones[z].id} ${state.config.goods[g].id} tier ${t}: price ${state.zoneGood.price[index]} vs running cost ${cost}`);
      }
    }
  }
});

// --- Merit order ----------------------------------------------------------------

test('merit order: within each owner, strong lines are used at least as fully as average ones, and average as fragile', () => {
  const state = catalogueWorld();
  for (let week = 0; week < 30; week++) step(state, false);
  const m = getModel(state.config);
  const w = getWorkspace(state);
  planPrivateSector(state, w, m);
  const G = m.goodCount;
  let partial = 0;
  for (let z = 0; z < state.zones.length; z++) {
    for (let g = 0; g < G; g++) {
      for (let o = 0; o < O; o++) {
        const use: number[] = [];
        for (let t = 0; t < T; t++) {
          const l = ((z * G + g) * O + o) * T + t;
          const capacity = state.firmLine.capacity[l];
          use.push(capacity > 1e-9 ? w.linePlan[l] / capacity : NaN);
        }
        const [strong, average, fragile] = use;
        if (Number.isNaN(strong) || Number.isNaN(average) || Number.isNaN(fragile)) continue;
        assert.ok(strong >= average - 1e-9 && average >= fragile - 1e-9, `${state.zones[z].id} ${state.config.goods[g].id} owner ${o}: ${use.join(' / ')}`);
        if (fragile < strong - 0.05) partial++;
      }
    }
  }
  assert.ok(partial > 0, 'demand below capacity is met by the cheapest lines first somewhere');
});

// --- Accounting invariants over a long run --------------------------------------

test('accounting invariants hold every week for 520 weeks of the 31-good world', () => {
  const state = catalogueWorld();
  const G = state.config.goods.length;
  const S = state.config.sectors.length;
  let worst = 0;
  let dividends = 0;
  let support = 0;
  for (let week = 1; week <= 520; week++) {
    // Labour supply is measured before the week's population change.
    const supplies = state.zone.population.map((people, z) => Math.max(0, people * state.config.params.laborParticipation - state.zone.mobilized[z]));
    const report = step(state);
    worst = Math.max(worst, auditError(report.audit));
    // Money: households + firm aggregates + treasuries is the whole money supply.
    let money = 0;
    for (const value of state.zone.householdMoney) money += value;
    for (const value of state.firm.cash) money += value;
    for (const value of state.country.treasury) money += value;
    assert.ok(Math.abs(money - state.world.baseMoney) <= 1e-9 * money, `week ${week}: money supply equals holdings`);
    // Labour: the zone's employment is exactly the sum of its aggregates' employment.
    for (let z = 0; z < state.zones.length; z++) {
      let employed = 0;
      for (let k = 0; k < S * O; k++) employed += state.firm.employment[z * S * O + k];
      const supply = supplies[z];
      const fromRate = (1 - state.zone.unemployment[z]) * supply;
      if (state.zone.unemployment[z] > 0) assert.ok(Math.abs(employed - fromRate) <= 1e-9 * supply, `week ${week} zone ${z} employment`);
    }
    // Ownership of stock: shares are fractions summing to one wherever there is stock.
    for (let i = 0; i < state.zones.length * G; i++) {
      if (!(state.zoneGood.stock[i] > 0)) continue;
      let total = 0;
      for (let o = 0; o < O; o++) total += state.firmGood.stockShare[i * O + o];
      assert.ok(Math.abs(total - 1) < 1e-9, 'stock shares sum to one');
    }
    // Budget identity, including the new flows between the state and its firms.
    for (const country of report.countries) {
      const b = country.budget;
      const revenue = b.incomeTax + b.consumptionTax + b.corporateTax + b.tariffs + b.seigniorage + b.reserveSales + b.fundsReceived + b.firmDividends;
      const spending = b.administration + b.social + b.military + b.infrastructure + b.reservePurchases + b.interest + b.fundsSent + b.firmSupport;
      assert.ok(Math.abs(revenue - b.revenue) <= 1e-9 * Math.max(1, b.revenue) && Math.abs(spending - b.spending) <= 1e-9 * Math.max(1, b.spending));
      dividends += b.firmDividends;
      support += b.firmSupport;
    }
    // Electricity is never stored: no producer stock, no input store, no reserve.
    const e = state.config.goods.findIndex(good => good.id === 'electricity');
    for (let z = 0; z < state.zones.length; z++) {
      assert.equal(state.zoneGood.stock[z * G + e], 0);
      assert.equal(state.zoneGood.inputBuffer[z * G + e], 0);
    }
    assert.equal(report.audit.negativeValues, 0);
    assert.equal(report.audit.nonFiniteValues, 0);
  }
  assert.ok(worst < AUDIT_TOLERANCE, `worst conservation error ${worst}`);
  assert.ok(dividends > 0, 'public and mixed firms pay dividends to their governments');
  assert.ok(support >= 0);
  // The economy stays in a sensible range for ten years without any shock.
  const report = step(state);
  for (const country of report.countries) {
    assert.ok(country.unemployment < 0.2, `${country.countryId} unemployment ${country.unemployment}`);
    assert.ok(country.stability > 40, `${country.countryId} stability ${country.stability}`);
    assert.ok(Number.isFinite(country.gdpReal) && country.gdpReal > 0);
  }
  assert.ok(report.world.gdpReal > state.baseline.realGdp.reduce((a, b) => a + b, 0), 'the world grows');
});

test('a legacy (all-private) world never moves money between firms and treasuries as dividends or rescues', () => {
  const legacy = world();
  for (let week = 0; week < 52; week++) {
    const report = step(legacy);
    for (const country of report.countries) {
      assert.equal(country.budget.firmDividends, 0);
      assert.equal(country.budget.firmSupport, 0);
    }
  }
});

test('the firm aggregate view lists every owner and tier, and adds up to the zone totals', () => {
  const state = catalogueWorld();
  for (let week = 0; week < 10; week++) step(state);
  const z = state.zones.findIndex(zone => zone.id === 'khazir');
  const views = getFirmAggregates(state, 'khazir');
  assert.ok(views.some(view => view.ownership === 'public' && view.sectorId === 'hydrocarbons'));
  const crude = state.config.goods.findIndex(good => good.id === 'crude_oil');
  let total = 0;
  for (const view of views) for (const line of view.lines) if (line.goodId === 'crude_oil') total += line.capacity.strong + line.capacity.average + line.capacity.fragile;
  assert.ok(Math.abs(total - capacityOf(state, z, crude)) <= 1e-12 * total);
  let cash = 0;
  for (const view of views) cash += view.cash;
  let expected = 0;
  const S = state.config.sectors.length;
  for (let k = 0; k < S * O; k++) expected += state.firm.cash[z * S * O + k];
  assert.ok(Math.abs(cash - expected) <= 1e-12 * expected);
});

// --- Shocks on aggregates ---------------------------------------------------------

test('capacity destruction hits every owner and tier by the same share', () => {
  const state = catalogueWorld();
  const G = state.config.goods.length;
  const z = state.zones.findIndex(zone => zone.id === 'ostmark');
  const g = state.config.goods.findIndex(good => good.id === 'steel');
  const before = state.firmLine.capacity.slice(((z * G + g) * O) * T, ((z * G + g) * O + O) * T);
  advanceEconomyInPlace(state, { effects: [{ type: 'destroy-capacity', zoneId: 'ostmark', goodId: 'steel', fraction: 0.4 }] }, { audit: true });
  const after = state.firmLine.capacity.slice(((z * G + g) * O) * T, ((z * G + g) * O + O) * T);
  // One week of wear, scrapping and completed construction also applies, so compare ratios.
  const ratios = before.map((value, k) => value > 0 ? after[k] / value : NaN).filter(Number.isFinite);
  for (const ratio of ratios) assert.ok(ratio > 0.58 && ratio < 0.62, `ratio ${ratio}`);
});

// --- Determinism, save and load --------------------------------------------------

test('31-good world: save/restore at several points continues bit-identically', () => {
  const reference = catalogueWorld();
  for (let week = 0; week < 150; week++) step(reference, false);
  for (const cut of [0, 1, 37, 100]) {
    const state = catalogueWorld();
    for (let week = 0; week < cut; week++) step(state, false);
    const restored = deserializeEconomy(serializeEconomy(state));
    for (let week = cut; week < 150; week++) step(restored, false);
    assert.equal(hashEconomy(restored), hashEconomy(reference), `cut at week ${cut}`);
  }
});

test('31-good world: building it twice gives the same state, and money is a pure unit', () => {
  const a = createEconomy(createCatalogueWorldSpec());
  assert.equal(hashEconomy(a), hashEconomy(catalogueWorld()));
  const b = cloneEconomy(a);
  rescaleMoney(b, 2 ** 40);
  for (let week = 0; week < 80; week++) { step(a); step(b); }
  assert.deepEqual(a.firmLine.capacity, b.firmLine.capacity);
  assert.deepEqual(a.firm.employment, b.firm.employment);
  for (let k = 0; k < a.firm.cash.length; k++) assert.equal(a.firm.cash[k] * 2 ** 40, b.firm.cash[k]);
});

test('save validation rejects damaged firm data and saves from before Milestone 1', () => {
  const state = catalogueWorld();
  const damaged = (change: (copy: Record<string, any>) => void) => {
    const copy = JSON.parse(serializeEconomy(state));
    change(copy);
    return () => validateEconomy(copy);
  };
  assert.doesNotThrow(damaged(() => {}));
  assert.throws(damaged(copy => { copy.firm.cash[3] = -1; }), /negative/);
  assert.throws(damaged(copy => { copy.firmLine.capacity.pop(); }), /firmLine.capacity/);
  assert.throws(damaged(copy => { copy.firmGood.stockShare[0] = 1.5; }), /ownership share/);
  assert.throws(damaged(copy => { copy.firmGood.stockShare[0] = 0.7; copy.firmGood.stockShare[1] = 0.7; }), /more than 1/);
  assert.throws(damaged(copy => { copy.firm.cash[0] = Number.NaN; }), /finite/);
  assert.throws(damaged(copy => { delete copy.firm; }), /firm is missing/);
  assert.throws(damaged(copy => { copy.version = 1; }), /version 1 is not supported/);
});
