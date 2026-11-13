import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deserializeEconomy, serializeEconomy } from '../src/index.ts';
import { assertPlayerOwns, createHostEconomy, FIXTURE_PROFILES, fixtureHostWorld, runHostTurn, worldSpecFromHost } from '../examples/heartland-adapter.ts';

test('the adapter builds an engine world from the game fixture (3 countries, 6 regions, adjacency lanes)', () => {
  const host = fixtureHostWorld();
  const spec = worldSpecFromHost(host, FIXTURE_PROFILES);
  assert.equal(spec.countries.length, 3);
  assert.equal(spec.zones.length, 6);
  assert.equal(spec.lanes.length, 7, 'seven distinct adjacent pairs');
  assert.throws(() => worldSpecFromHost(host, {}), /No economic profile/);
});

test('a full year through the host interface: player commands, AI autopilot, legacy dashboard numbers, audit on', () => {
  const host = fixtureHostWorld();
  let state = createHostEconomy(host, FIXTURE_PROFILES);
  for (let week = 1; week <= 52; week++) {
    const outcome = runHostTurn(host, state, { playerCommands: week === 3 ? [{ type: 'set-tax', countryId: 'alden', tax: 'income', rate: 0.2 }] : [], effects: [] });
    state = outcome.state;
    assert.equal(outcome.playerRegimeFell, false);
    for (const view of Object.values(outcome.legacy)) {
      assert.ok(Number.isFinite(view.treasury) && view.treasury >= 0);
      assert.ok(view.weeklyIncome > 0 && view.weeklyExpenses > 0);
    }
  }
  assert.equal(state.turn, 52);
});

test('the host must authorise commands: the adapter refuses another country\'s order', () => {
  const host = fixtureHostWorld();
  assert.throws(() => assertPlayerOwns(host, [{ type: 'set-tax', countryId: 'belora', tax: 'income', rate: 0.2 }]), /does not belong/);
  assert.throws(() => assertPlayerOwns(host, [{ type: 'declare-default', countryId: 'cyrin' }]), /does not belong/);
  assert.doesNotThrow(() => assertPlayerOwns(host, [{ type: 'set-borrowing', countryId: 'alden', enabled: true }]));
});

test('a conquest in the game becomes a zone transfer in the economy', () => {
  const host = fixtureHostWorld();
  let state = createHostEconomy(host, FIXTURE_PROFILES);
  state = runHostTurn(host, state, { playerCommands: [], effects: [] }).state;
  host.regions.find(region => region.id === 'amber-plain')!.ownerId = 'alden'; // Alden captures Amber Plain
  const outcome = runHostTurn(host, state, { playerCommands: [], effects: [] });
  const z = outcome.state.zones.findIndex(zone => zone.id === 'amber-plain');
  assert.equal(outcome.state.countries[outcome.state.zone.owner[z]].id, 'alden');
  const alden = outcome.report.countries.find(country => country.countryId === 'alden')!;
  assert.ok(alden.population > 60, 'its population now counts for Alden');
});

test('the economic save is a string the game can store with its own save and restore exactly', () => {
  const host = fixtureHostWorld();
  let state = createHostEconomy(host, FIXTURE_PROFILES);
  for (let week = 0; week < 20; week++) state = runHostTurn(host, state, { playerCommands: [], effects: [] }).state;
  const restored = deserializeEconomy(serializeEconomy(state));
  const a = runHostTurn(host, state, { playerCommands: [], effects: [] }).state, b = runHostTurn(host, restored, { playerCommands: [], effects: [] }).state;
  assert.equal(serializeEconomy(a), serializeEconomy(b));
});

test('ten years on the fixture world stay sane under autopilot', () => {
  const host = fixtureHostWorld();
  let state = createHostEconomy(host, FIXTURE_PROFILES);
  for (let week = 0; week < 520; week++) state = runHostTurn(host, state, { playerCommands: [], effects: [] }).state;
  for (let c = 0; c < state.countries.length; c++) {
    assert.ok(state.country.debt[c] / (52 * state.country.gdp[c]) < 1.5);
    assert.ok(state.country.stability[c] > 30);
  }
});
