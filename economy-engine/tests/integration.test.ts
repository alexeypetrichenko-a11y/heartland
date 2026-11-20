import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import type { EconomyCommand, EconomySession } from '../src/integration/index.ts';
import {
  advanceEconomyWeek, checkEconomyCommands, createEconomySession, economyFingerprint, fictionalGameWorld, FICTIONAL_REGION_PROFILES,
  getCountryEconomy, getRegionEconomy, legacyEconomyView, loadEconomySession, regionControlEffects, roadLaneId, saveEconomySession,
  validateGameWorld, withPlayerCountry, worldSpecFromGame,
} from '../src/integration/index.ts';
import { getCountry } from '../src/index.ts';
// The game's own fixture (read only): the mapping must hold for the real data, not just for a copy of it.
import { createInitialState } from '../../src/game/initialState.ts';
import { selectCountry } from '../../src/game/selectCountry.ts';

/**
 * ECON-05: the integration API on the game's fictional scenario (Alden, Belora, Cyrin).
 * One session is built once and reused (copies are free: every API call is pure).
 */
const base = createEconomySession(fictionalGameWorld('alden'));
const weeks = (session: EconomySession, count: number, input = {}) => {
  let current = session;
  for (let k = 0; k < count; k++) current = advanceEconomyWeek(current, input);
  return current;
};

test('initialisation: one economy for the game\'s three countries and six regions, on the 31-good catalogue, at game week 1', () => {
  assert.equal(base.week, 1);
  assert.equal(base.state.turn, 1, 'the economy\'s first week is resolved before the first player decision');
  assert.equal(base.state.config.goods.length, 31);
  assert.equal(base.state.config.sectors.length, 10);
  assert.deepEqual(base.summary.countries.map(view => view.countryId), ['alden', 'belora', 'cyrin']);
  assert.deepEqual(base.summary.regions.map(view => view.regionId), ['alden-vale', 'reed-coast', 'amber-plain', 'silver-hills', 'cedar-basin', 'dawn-ridge']);
  assert.equal(getCountryEconomy(base, 'alden').controller, 'player');
  assert.equal(getCountryEconomy(base, 'belora').controller, 'ai');
  for (const view of base.summary.countries) {
    assert.equal(view.sectors.length, 10);
    for (const value of [view.gdpReal, view.gdpNominal, view.treasury, view.debt, view.population, view.budget.revenue, view.budget.expenditure]) {
      assert.ok(Number.isFinite(value) && value > 0, `${view.countryId} has positive, finite figures`);
    }
    assert.equal(view.gdpGrowth, null, 'growth needs half a year on record');
  }
});

test('mapping: the real game fixture maps one-to-one, with the same ids, owners and one road per adjacent pair', () => {
  const game = selectCountry(createInitialState(), 'alden');
  // A real GameState is accepted as it is.
  const spec = worldSpecFromGame(game);
  assert.deepEqual(spec.countries.map(country => country.id), game.countries.map(country => country.id));
  assert.deepEqual(spec.zones.map(zone => [zone.id, zone.countryId]), game.regions.map(region => [region.id, region.ownerId]));
  assert.equal(spec.lanes.length, 7);
  for (const region of game.regions) {
    for (const other of region.adjacentRegionIds) assert.ok(spec.lanes.some(lane => lane.id === roadLaneId(region.id, other)));
  }
  // The copy used by the example is the same world.
  const copy = fictionalGameWorld('alden');
  assert.deepEqual(copy.regions.map(region => [region.id, region.ownerId, [...region.adjacentRegionIds]]),
    game.regions.map(region => [region.id, region.ownerId, region.adjacentRegionIds]));
  // Every game region has a profile, and each country's regions are the ones it owns in the game.
  for (const region of game.regions) assert.ok(FICTIONAL_REGION_PROFILES[region.id]);
  for (const country of game.countries) {
    assert.deepEqual(getCountryEconomy(base, country.id).regionIds, game.regions.filter(region => region.ownerId === country.id).map(region => region.id));
  }
});

test('mapping errors are explicit', () => {
  const world = fictionalGameWorld();
  const broken = (change: (w: ReturnType<typeof fictionalGameWorld>) => void) => {
    const copy = structuredClone(world);
    change(copy);
    return () => validateGameWorld(copy, FICTIONAL_REGION_PROFILES);
  };
  assert.throws(() => validateGameWorld(world, {}), /No economic profile/);
  assert.throws(broken(w => { (w.regions as unknown as { ownerId: string }[])[0].ownerId = 'atlantis'; }), /unknown country/);
  assert.throws(broken(w => { (w.regions as unknown as { adjacentRegionIds: string[] }[])[0].adjacentRegionIds = ['dawn-ridge']; }), /not symmetric/);
  assert.throws(broken(w => { (w.regions as unknown as { id: string }[])[1].id = 'alden-vale'; }), /duplicated/);
  assert.throws(broken(w => { (w.countries as { id: string; name: string }[]).push({ id: 'drava', name: 'Drava' }); }), /has no region/);
  assert.throws(broken(w => { w.playerCountryId = 'drava'; }), /Unknown player country/);
});

test('reported indicators are consistent with each other and with the engine', () => {
  const session = weeks(base, 30);
  const state = session.state;
  for (const view of session.summary.countries) {
    const engine = getCountry(state, view.countryId);
    assert.equal(view.treasury, engine.treasury);
    assert.equal(view.debt, engine.debt);
    assert.ok(Math.abs(view.budget.balance - (view.budget.revenue - view.budget.expenditure)) <= 1e-12 * view.budget.revenue);
    // A country's sector output is the sum over the regions it controls.
    for (const sector of view.sectors) {
      const regional = view.regionIds.reduce((total, id) => total + getRegionEconomy(session, id).sectors.find(entry => entry.sectorId === sector.sectorId)!.output, 0);
      assert.ok(Math.abs(sector.output - regional) <= 1e-9 * Math.max(1, sector.output), `${view.countryId} ${sector.sectorId}`);
      assert.ok(sector.utilization >= 0 && sector.utilization <= 1.5);
      assert.ok(sector.shortage >= 0 && sector.shortage <= 1);
    }
    assert.ok(Math.abs(view.population - view.regionIds.reduce((t, id) => t + getRegionEconomy(session, id).population, 0)) <= 1e-9 * view.population);
    assert.ok(view.gdpGrowth !== null && Number.isFinite(view.gdpGrowth));
    assert.ok(view.centralBank.lendingCapacity > 0 && view.centralBank.moneyIssued > 0);
  }
});

test('no double counting: each week every treasury changes by exactly revenue - spending + borrowing - repayment', () => {
  let session = base;
  for (let week = 0; week < 52; week++) {
    const before = session.summary.countries.map(view => view.treasury);
    session = advanceEconomyWeek(session, week === 10 ? { playerCommands: [{ type: 'set-spending', countryId: 'alden', category: 'social', share: 0.2 }] } : {});
    session.summary.countries.forEach((view, c) => {
      const b = view.budget;
      const expected = before[c] + b.revenue - b.expenditure + b.borrowed - b.repaid;
      assert.ok(Math.abs(view.treasury - expected) <= 1e-9 * Math.max(1, b.revenue), `${view.countryId} week ${session.week}`);
      // The legacy panel numbers are the same money, not a second treasury.
      const legacy = legacyEconomyView(view);
      assert.equal(legacy.treasury, view.treasury);
      assert.equal(legacy.weeklyIncome, b.revenue);
      assert.equal(legacy.weeklyExpenses, b.expenditure);
    });
  }
});

test('economic commands take effect through the weekly turn; checks run without changing anything', () => {
  const commands: EconomyCommand[] = [
    { type: 'set-tax', countryId: 'alden', tax: 'income', rate: 0.25 },
    { type: 'set-spending', countryId: 'alden', category: 'infrastructure', share: 0.06 },
    { type: 'set-public-objective', countryId: 'alden', sectorId: 'electricity', objective: 'affordable-prices' },
  ];
  const fingerprint = economyFingerprint(base);
  assert.equal(checkEconomyCommands(base, commands), null);
  assert.equal(economyFingerprint(base), fingerprint, 'checking changes nothing');
  const next = advanceEconomyWeek(base, { playerCommands: commands });
  const policy = getCountry(next.state, 'alden').policy;
  assert.equal(policy.taxIncome, 0.25);
  assert.equal(policy.spendInfrastructure, 0.06);
  assert.equal(policy.publicObjective.electricity, 'affordable-prices');
  assert.match(checkEconomyCommands(base, [{ type: 'set-tax', countryId: 'alden', tax: 'income', rate: 5 }]) ?? '', /Tax rate/);
  assert.match(checkEconomyCommands(base, [{ type: 'set-tax', countryId: 'belora', tax: 'income', rate: 0.2 }]) ?? '', /player's country/);
  assert.match(checkEconomyCommands(base, [{ type: 'set-tax', countryId: 'alden', tax: 'wealth' as 'income', rate: 0.2 }]) ?? '', /Unknown tax/);
});

test('weekly advancement is pure and deterministic', () => {
  const before = economyFingerprint(base);
  const a = weeks(base, 10);
  const b = weeks(base, 10);
  assert.equal(economyFingerprint(base), before, 'the input session is untouched');
  assert.equal(a.week, 11);
  assert.equal(economyFingerprint(a), economyFingerprint(b));
  assert.deepEqual(a.summary, b.summary);
});

test('save and load: a restored game shows the same figures and continues bit-identically', () => {
  const session = weeks(base, 20, { playerCommands: [] });
  const text = saveEconomySession(session);
  const restored = loadEconomySession(text);
  assert.deepEqual(restored.summary, session.summary);
  assert.equal(restored.playerCountryId, 'alden');
  assert.equal(economyFingerprint(weeks(restored, 30)), economyFingerprint(weeks(session, 30)));
  assert.throws(() => loadEconomySession('{'), /not valid JSON/);
  assert.throws(() => loadEconomySession(JSON.stringify({ format: 'other' })), /unknown format/);
  const damaged = JSON.parse(text);
  damaged.summary.week = 3;
  assert.throws(() => loadEconomySession(JSON.stringify(damaged)), /summary does not match/);
  const corrupt = JSON.parse(text);
  corrupt.economy.zone.population[0] = 'many';
  assert.throws(() => loadEconomySession(JSON.stringify(corrupt)), /Invalid economy save/);
});

test('invalid input is refused and rolls back completely: the next valid week is as if it never happened', () => {
  const session = weeks(base, 5);
  const fingerprint = economyFingerprint(session);
  const attempts: (() => unknown)[] = [
    () => advanceEconomyWeek(session, { playerCommands: [{ type: 'set-tax', countryId: 'alden', tax: 'income', rate: 0.2 }, { type: 'set-tax', countryId: 'alden', tax: 'income', rate: -1 }] }),
    () => advanceEconomyWeek(session, { playerCommands: [{ type: 'declare-default', countryId: 'cyrin' }] }),
    () => advanceEconomyWeek(session, { regionControl: [{ id: 'atlantis', ownerId: 'alden' }] }),
    () => advanceEconomyWeek(session, { effects: [{ type: 'destroy-capacity', zoneId: 'alden-vale', goodId: 'all', fraction: 2 }] }),
    () => advanceEconomyWeek(withPlayerCountry(session, null)),
  ];
  for (const attempt of attempts) assert.throws(attempt);
  assert.equal(economyFingerprint(session), fingerprint);
  assert.equal(economyFingerprint(advanceEconomyWeek(session)), economyFingerprint(weeks(base, 6)));
});

test('military control from the game becomes occupation and liberation in the economy', () => {
  const world = fictionalGameWorld();
  const captured = world.regions.map(region => ({ id: region.id, ownerId: region.id === 'amber-plain' ? 'alden' : region.ownerId }));
  assert.deepEqual(regionControlEffects(base, world.regions), [], 'nothing to do while the map and the economy agree');
  assert.deepEqual(regionControlEffects(base, captured), [{ type: 'occupy-zone', zoneId: 'amber-plain', occupierId: 'alden', policy: 'moderate' }]);
  const occupied = weeks(base, 4, { regionControl: captured });
  const amber = getRegionEconomy(occupied, 'amber-plain');
  assert.equal(amber.controllerId, 'alden');
  assert.equal(amber.legalOwnerId, 'belora');
  assert.ok(amber.occupied);
  assert.ok(getCountryEconomy(occupied, 'alden').regionIds.includes('amber-plain'));
  assert.ok(occupied.summary.countries.every(view => Number.isFinite(view.treasury)));
  const freed = advanceEconomyWeek(occupied, { regionControl: world.regions });
  assert.equal(getRegionEconomy(freed, 'amber-plain').controllerId, 'belora');
  assert.ok(freed.summary.events.some(event => event.type === 'zone-liberated'));
});

test('the player\'s first regime change is flagged as the defeat event', () => {
  let session = base;
  let fell = false;
  for (let week = 0; week < 60 && !fell; week++) {
    session = advanceEconomyWeek(session, { effects: [{ type: 'stability-modifier', countryId: 'alden', value: -100 }] });
    fell = session.summary.playerRegimeFell;
  }
  assert.ok(fell, 'collapse of the regime is reported');
  const event = session.summary.events.find(entry => entry.type === 'regime-change');
  assert.ok(event && event.type === 'regime-change' && event.countryId === 'alden' && event.regime === 1);
});

test('ten years of the fictional game under the autopilot stay sane', () => {
  const session = weeks(base, 520);
  for (const view of session.summary.countries) {
    assert.ok(view.debtToGdp < 1.5, `${view.countryId} debt ${view.debtToGdp}`);
    assert.ok(view.stability > 30, `${view.countryId} stability ${view.stability}`);
    assert.ok(view.unemployment < 0.2 && Math.abs(view.inflation) < 0.1);
  }
});

test('importing the integration API runs nothing: every top-level statement is a declaration', () => {
  const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'integration');
  for (const name of readdirSync(dir)) {
    const lines = readFileSync(join(dir, name), 'utf8').split('\n');
    for (const line of lines) {
      if (!/^\S/.test(line) || /^(import|export|\/\/|\/\*|\s?\*|}|\)|]|interface|type|function|const [A-Z_]+(: [^=]+)? = ['{[\d]|const [A-Z_]+ = \{|const \w+ = \([^)]*\) =>)/.test(line)) continue;
      assert.fail(`${name}: top-level statement may run code at import: ${line}`);
    }
  }
});
