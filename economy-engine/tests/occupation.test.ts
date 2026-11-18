import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { EconomyEvent, EconomyState, TurnInput, TurnReport } from '../src/index.ts';
import {
  advanceEconomyInPlace, autopilotCommands, cloneEconomy, createCatalogueWorldSpec, createConfig, createEconomy, createTestWorldSpec, deserializeEconomy,
  getZone, hashEconomy, serializeEconomy, validateEconomy,
} from '../src/index.ts';
import { applyActions, resolveInput } from '../src/core/commands.ts';
import { getModel, getWorkspace, OWNERSHIP_COUNT, PUBLIC, TIER_COUNT } from '../src/core/model.ts';
import { updateOccupation } from '../src/core/occupation.ts';
import { allNumbers, idx, world, zoneIdx } from './helpers.ts';

/**
 * Milestone 4: occupation (R49, R50, R62) and the C2 fix. Norland Coast (Norland)
 * is occupied by Ostmark in most tests.
 */

const occupy = (policy: 'moderate' | 'intensive' = 'moderate'): TurnInput =>
  ({ effects: [{ type: 'occupy-zone', zoneId: 'norland-coast', occupierId: 'ostmark', policy }] });
const liberate: TurnInput = { effects: [{ type: 'liberate-zone', zoneId: 'norland-coast' }] };

/** One week with the autopilot for every government and the audit on (it throws on any conservation error). */
function week(state: EconomyState, input: TurnInput = {}, tradeDetail = false): TurnReport {
  return advanceEconomyInPlace(state, { effects: input.effects ?? [], commands: [...autopilotCommands(state), ...(input.commands ?? [])] },
    { audit: true, report: 'full', tradeDetail });
}

function weeks(state: EconomyState, count: number, onReport?: (report: TurnReport) => void): void {
  for (let k = 0; k < count; k++) {
    const report = week(state, {}, onReport !== undefined);
    onReport?.(report);
  }
}

/** Trade value this week between two zones, in both directions. */
function tradeBetween(report: TurnReport, a: string, b: string): number {
  let value = 0;
  for (const flow of report.trade ?? []) {
    if ((flow.fromZoneId === a && flow.toZoneId === b) || (flow.fromZoneId === b && flow.toZoneId === a)) value += flow.value;
  }
  return value;
}

test('occupation moves economic control, not legal ownership; liberation gives control back', () => {
  const state = world();
  const z = zoneIdx(state, 'norland-coast');
  const report = week(state, occupy());
  assert.equal(state.zone.owner[z], idx(state, 'ostmark'));
  assert.equal(state.zone.sovereign[z], idx(state, 'norland'));
  const event = report.events.find(e => e.type === 'zone-occupied');
  assert.ok(event && event.type === 'zone-occupied' && event.countryId === 'ostmark' && event.sovereignId === 'norland' && event.policy === 'moderate');
  const view = getZone(state, 'norland-coast');
  assert.equal(view.ownerId, 'ostmark');
  assert.equal(view.sovereignId, 'norland');
  assert.equal(view.occupied, true);
  assert.equal(view.occupationPolicy, 'moderate');
  assert.equal(report.occupations.length, 1);
  weeks(state, 10);
  const back = week(state, liberate);
  assert.equal(state.zone.owner[z], idx(state, 'norland'));
  assert.equal(getZone(state, 'norland-coast').occupied, false);
  assert.ok(back.events.some(e => e.type === 'zone-liberated' && e.countryId === 'norland' && e.formerOccupierId === 'ostmark'));
  assert.equal(back.occupations.length, 0);
});

test('occupying or liberating a zone moves no firm, plant, debt, cash or money by itself', () => {
  const state = world();
  for (const input of [occupy('intensive'), liberate, { effects: [{ type: 'transfer-zone' as const, zoneId: 'norland-coast', ownerId: 'ostmark' }] }]) {
    const before = cloneEconomy(state);
    applyActions(state, getWorkspace(state), resolveInput(state, input), []);
    for (const group of ['firm', 'firmGood', 'firmLine', 'zoneGood', 'country', 'countryGood', 'countrySector'] as const) {
      assert.deepEqual(state[group], before[group], `${group} unchanged`);
    }
    assert.deepEqual(state.bonds, before.bonds);
    assert.deepEqual(state.zone.householdMoney, before.zone.householdMoney);
  }
});

test('C2: an occupied zone and its legal owner\'s zones do not trade; trade resumes on liberation', () => {
  const state = world();
  let before = 0;
  for (let k = 0; k < 8; k++) before += tradeBetween(week(state, {}, true), 'norland-coast', 'norland-core');
  assert.ok(before > 0, 'the two Norland zones trade before the occupation');
  let during = 0;
  let withOccupier = 0;
  for (let k = 0; k < 30; k++) {
    const report = week(state, k === 0 ? occupy() : {}, true);
    during += tradeBetween(report, 'norland-coast', 'norland-core');
    withOccupier += tradeBetween(report, 'norland-coast', 'ostmark');
  }
  assert.equal(during, 0, 'nothing crosses the front line, in either direction');
  assert.ok(withOccupier > 0, 'the occupied zone trades with the occupier');
  let after = 0;
  for (let k = 0; k < 8; k++) after += tradeBetween(week(state, k === 0 ? liberate : {}, true), 'norland-coast', 'norland-core');
  assert.ok(after > 0, 'trade resumes after liberation');
});

test('annexation is not occupation: the annexed zone may trade with its former owner', () => {
  const state = world();
  let trade = 0;
  for (let k = 0; k < 20; k++) {
    trade += tradeBetween(week(state, k === 0 ? { effects: [{ type: 'transfer-zone', zoneId: 'norland-coast', ownerId: 'ostmark' }] } : {}, true), 'norland-coast', 'norland-core');
  }
  const z = zoneIdx(state, 'norland-coast');
  assert.equal(state.zone.sovereign[z], idx(state, 'ostmark'));
  assert.ok(trade > 0);
});

test('the occupier collects taxes and its levy; public firms keep their legal owner, whose dividends wait until liberation', () => {
  // The 31-good world has public firms (the 7-good one has none).
  const state = createEconomy(createCatalogueWorldSpec());
  const z = zoneIdx(state, 'norland-coast');
  const n = idx(state, 'norland');
  const o = idx(state, 'ostmark');
  const lenders = state.firm.lender.slice();
  weeks(state, 4);
  week(state, occupy());
  let levy = 0, norlandLevy = 0, withheld = 0;
  weeks(state, 40, report => {
    levy += report.countries[o].budget.occupationLevy;
    norlandLevy += report.countries[n].budget.occupationLevy;
    withheld += report.occupations[0].withheldDividends;
  });
  assert.ok(levy > 0, 'the occupier levies the zone');
  assert.equal(norlandLevy, 0);
  assert.ok(withheld > 0, 'the legal owner\'s public dividends are withheld, not paid to the occupier');
  // Legal ownership is untouched: the public firms are still there and owe the same banks.
  const S = state.config.sectors.length;
  let publicCapacity = 0;
  for (let g = 0; g < state.config.goods.length; g++) {
    for (let t = 0; t < TIER_COUNT; t++) publicCapacity += state.firmLine.capacity[((z * state.config.goods.length + g) * OWNERSHIP_COUNT + PUBLIC) * TIER_COUNT + t];
  }
  assert.ok(publicCapacity > 0);
  for (let a = z * S * OWNERSHIP_COUNT; a < (z + 1) * S * OWNERSHIP_COUNT; a++) {
    if (state.firm.loan[a] > 0) assert.equal(state.firm.lender[a], lenders[a], 'loans keep their lender');
  }
  // After liberation the legal owner's firms pay it dividends again.
  week(state, liberate);
  let dividends = 0;
  weeks(state, 20, report => { dividends += report.countries[n].budget.firmDividends; });
  assert.ok(dividends > 0);
});

test('ownership commands are refused in an occupied zone, for the occupier and for the legal owner', () => {
  const state = world();
  week(state, occupy());
  const nationalize = (countryId: string) => () => advanceEconomyInPlace(cloneEconomy(state),
    { commands: [{ type: 'nationalize', countryId, zoneId: 'norland-coast', sectorId: 'heavy_industry', share: 0.5 }] });
  assert.throws(nationalize('ostmark'), /occupied/);
  assert.throws(nationalize('norland'), /not controlled/);
  assert.throws(() => advanceEconomyInPlace(cloneEconomy(state),
    { commands: [{ type: 'set-occupation-policy', countryId: 'norland', zoneId: 'norland-coast', policy: 'intensive' }] }), /not controlled/);
  assert.throws(() => advanceEconomyInPlace(cloneEconomy(state),
    { commands: [{ type: 'set-occupation-policy', countryId: 'ostmark', zoneId: 'ostmark', policy: 'intensive' }] }), /not occupied/);
  assert.throws(() => advanceEconomyInPlace(cloneEconomy(state),
    { commands: [{ type: 'set-occupation-policy', countryId: 'ostmark', zoneId: 'norland-coast', policy: 'harsh' as 'intensive' }] }), /moderate or intensive/);
  advanceEconomyInPlace(state, { commands: [{ type: 'set-occupation-policy', countryId: 'ostmark', zoneId: 'norland-coast', policy: 'intensive' }] });
  assert.equal(getZone(state, 'norland-coast').occupationPolicy, 'intensive');
});

test('moderate versus intensive occupation: more extraction now, more resistance and security cost, less output later', () => {
  const run = (policy: 'moderate' | 'intensive') => {
    const state = world();
    const z = zoneIdx(state, 'norland-coast');
    week(state, occupy(policy));
    let levyYear1 = 0, security = 0, outputLate = 0;
    for (let k = 1; k <= 155; k++) {
      const report = week(state);
      const o = report.occupations[0];
      if (k <= 52) levyYear1 += o.levy;
      security += o.securityCost;
      if (k > 130) outputLate += report.countries[idx(state, 'ostmark')].gdpReal;
    }
    return { levyYear1, security, outputLate, resistance: state.zone.resistance[z], unemployment: state.zone.unemployment[z] };
  };
  const moderate = run('moderate');
  const intensive = run('intensive');
  assert.ok(intensive.levyYear1 > 2 * moderate.levyYear1, `levy in year 1: ${moderate.levyYear1} vs ${intensive.levyYear1}`);
  assert.ok(moderate.resistance < 0.2 && intensive.resistance > 0.4, `resistance ${moderate.resistance} vs ${intensive.resistance}`);
  assert.ok(intensive.security > moderate.security, 'security costs more');
  assert.ok(intensive.outputLate < moderate.outputLate * 0.97, `occupier output in year 3: ${moderate.outputLate} vs ${intensive.outputLate}`);
  assert.ok(intensive.unemployment > moderate.unemployment);
});

test('resistance outlasts a change of policy and fades after liberation', () => {
  const state = world();
  const z = zoneIdx(state, 'norland-coast');
  week(state, occupy('intensive'));
  weeks(state, 103);
  const peak = state.zone.resistance[z];
  assert.ok(peak > 0.4);
  week(state, { commands: [{ type: 'set-occupation-policy', countryId: 'ostmark', zoneId: 'norland-coast', policy: 'moderate' }] });
  weeks(state, 25);
  const later = state.zone.resistance[z];
  assert.ok(later < peak, 'it falls under the milder policy');
  assert.ok(later > 2 * state.config.params.resistanceBase[0], `but slowly: ${later} after half a year`);
  week(state, liberate);
  weeks(state, 51);
  assert.ok(state.zone.resistance[z] < later * 0.1, 'and fades once the zone is free');
});

test('sabotage destroys plant only through a recorded event, exactly as reported', () => {
  const spec = createTestWorldSpec();
  spec.config = createConfig({ sabotageChance: 1 });
  const state = createEconomy(spec);
  const z = zoneIdx(state, 'norland-coast');
  const m = getModel(state.config);
  week(state, occupy('intensive'));
  let recorded = 0;
  for (let k = 0; k < 20; k++) {
    // Resistance at its maximum: an attack is certain every week.
    state.zone.resistance[z] = 1;
    const before = state.firmLine.capacity.slice();
    const events: EconomyEvent[] = [];
    updateOccupation(state, getWorkspace(state), m, events);
    let lost = 0;
    for (let i = 0; i < before.length; i++) lost += before[i] - state.firmLine.capacity[i];
    const sabotage = events.filter(e => e.type === 'sabotage');
    assert.equal(sabotage.length, 1);
    const reported = sabotage.reduce((total, e) => total + (e.type === 'sabotage' ? e.capacity : 0), 0);
    assert.ok(Math.abs(lost - reported) <= 1e-12 * Math.max(1, reported), `destroyed ${lost}, reported ${reported}`);
    recorded += reported;
    state.turn += 1;
  }
  assert.ok(recorded > 0);
  // Without resistance there is no sabotage at all, even when an attack would otherwise be certain.
  state.zone.resistance[z] = 0;
  const events: EconomyEvent[] = [];
  const before = state.firmLine.capacity.slice();
  updateOccupation(state, getWorkspace(state), m, events);
  assert.equal(events.filter(e => e.type === 'sabotage').length, 0);
  assert.deepEqual(state.firmLine.capacity, before);
});

test('a revolt is reported once when resistance passes the threshold', () => {
  const spec = createTestWorldSpec();
  spec.config = createConfig({ resistanceBase: [0.1, 0.95] });
  const state = createEconomy(spec);
  week(state, occupy('intensive'));
  const revolts: EconomyEvent[] = [];
  weeks(state, 120, report => { for (const e of report.events) if (e.type === 'occupation-revolt') revolts.push(e); });
  assert.equal(revolts.length, 1);
  assert.ok(getZone(state, 'norland-coast').revolt);
});

test('discontent in an occupied zone is not counted in the occupier\'s own politics', () => {
  const state = world();
  week(state, occupy('intensive'));
  let report = week(state);
  for (let k = 0; k < 60; k++) report = week(state);
  // Ostmark's own territory is the single zone "ostmark": its reported unemployment is that zone's alone.
  assert.equal(report.countries[idx(state, 'ostmark')].unemployment, state.zone.unemployment[zoneIdx(state, 'ostmark')]);
});

test('a fully occupied one-zone country stays consistent (no economy left, debts still due)', () => {
  const state = world();
  week(state, { effects: [{ type: 'occupy-zone', zoneId: 'verdania', occupierId: 'norland', policy: 'intensive' }] });
  weeks(state, 104);
  assert.ok(allNumbers(state).every(Number.isFinite));
  validateEconomy(JSON.parse(serializeEconomy(state)));
});

test('a game saved during occupation and requisition continues bit-identically after restoring', () => {
  const state = world();
  week(state, occupy('intensive'));
  week(state, { commands: [{ type: 'set-transport-requisition', countryId: 'ostmark', originZoneId: 'ostmark', destinationZoneId: 'norland-coast', volume: 5 }] });
  weeks(state, 20);
  const restored = deserializeEconomy(serializeEconomy(state));
  weeks(state, 40);
  weeks(restored, 40);
  assert.equal(hashEconomy(restored), hashEconomy(state));
});
