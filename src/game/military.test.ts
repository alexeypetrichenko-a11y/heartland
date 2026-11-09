import assert from 'node:assert/strict';
import { test } from 'node:test';
import { advanceTurn } from './advanceTurn.ts';
import { createInitialState } from './initialState.ts';
import { selectCountry } from './selectCountry.ts';
import type { GameState, MilitaryCommand, MilitaryOrder, TurnCommand } from './models.ts';

const start = (id = 'alden') => selectCountry(createInitialState(), id);
const command = (order: MilitaryOrder, divisionId = 'alden-first', countryId = 'alden'): MilitaryCommand => ({ type: 'set-military-order', countryId, divisionId, order });
const move = (id: string) => command({ kind: 'move', targetRegionId: id });
const attack = (id = 'amber-plain') => command({ kind: 'attack', targetRegionId: id });
const defend = command({ kind: 'defend' });
const unit = (state: GameState, id = 'alden-first') => state.divisions.find(division => division.id === id)!;
const owner = (state: GameState, id = 'amber-plain') => state.regions.find(region => region.id === id)!.ownerId;

function freeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

test('each country can move to an adjacent friendly region once, then defend there', () => {
  for (const [country, target] of [['alden', 'reed-coast'], ['belora', 'silver-hills'], ['cyrin', 'dawn-ridge']]) {
    const initial = freeze(start(country));
    const division = initial.divisions.find(division => division.ownerId === country)!;
    const commands = freeze([command({ kind: 'move', targetRegionId: target }, division.id, country)]);
    const result = advanceTurn(initial, commands);
    assert.equal(unit(result, division.id).regionId, target);
    assert.equal(unit(result, division.id).manpower, 1000);
    assert.deepEqual(unit(result, division.id).order, { kind: 'defend' });
    assert.deepEqual(result.militaryResults, [{ kind: 'moved', divisionId: division.id, fromRegionId: division.regionId, targetRegionId: target }]);
    assert.deepEqual(result.regions, initial.regions);
    assert.deepEqual(advanceTurn(result).divisions, result.divisions);
    assert.deepEqual(advanceTurn(result).militaryResults, []);
    assert.deepEqual(initial, start(country));
  }
});

test('defend holds the current region and stops an unfinished standing attack', () => {
  const fighting = freeze(advanceTurn(start(), [attack()]));
  const result = advanceTurn(fighting, [defend]);
  assert.equal(unit(result).regionId, 'alden-vale');
  assert.equal(unit(result).manpower, 750);
  assert.equal(unit(result, 'belora-first').manpower, 500);
  assert.deepEqual(unit(result).order, { kind: 'defend' });
  assert.deepEqual(advanceTurn(result).divisions, result.divisions);
  assert.deepEqual(result.militaryResults, []);
});

test('reject wrong ownership, unknown or unavailable divisions and unfriendly origins', () => {
  const initial = freeze(start());
  for (const divisionId of ['belora-first', 'cyrin-first']) {
    assert.throws(() => advanceTurn(initial, [command({ kind: 'defend' }, divisionId)]), /own division/);
  }
  assert.throws(() => advanceTurn(initial, [command({ kind: 'defend' }, 'missing')]), /available division/);
  assert.throws(() => advanceTurn(initial, [command({ kind: 'defend' }, 'belora-first', 'belora')]), /selected player country/);
  for (const manpower of [0, -1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    const state = start();
    unit(state).manpower = manpower;
    assert.throws(() => advanceTurn(freeze(state), [defend]), /available personnel/);
  }
  const stranded = start();
  unit(stranded).regionId = 'amber-plain';
  assert.throws(() => advanceTurn(freeze(stranded), [defend]), /friendly region/);
});

test('reject nonadjacent/self/missing targets, enemy movement and friendly attacks atomically', () => {
  const state = freeze(start());
  const badOrders = [move('cedar-basin'), attack('cedar-basin'), move('alden-vale'), attack('alden-vale'),
    move('missing'), attack('missing'), move('amber-plain'), attack('reed-coast')];
  for (const invalid of badOrders) {
    const commands: TurnCommand[] = [{ type: 'set-economic-policy', countryId: 'alden', policy: 'tax-relief' }, move('reed-coast'), invalid];
    assert.throws(() => advanceTurn(state, freeze(commands)), /adjacent|does not exist|friendly target|enemy-controlled/);
    assert.deepEqual(state, start());
  }
});

test('runtime military command validation rejects malformed input and copies accepted orders', () => {
  const state = freeze(start());
  const malformed: unknown[] = [
    { type: 'set-military-order' }, { ...defend, countryId: '' }, { ...defend, divisionId: 1 },
    ...[null, [], {}, 'attack', { kind: 'fly' }, { kind: 'move' }, { kind: 'attack', targetRegionId: '' }, { kind: 'attack', targetRegionId: 1 }].map(order => ({ ...defend, order })),
  ];
  for (const value of malformed) assert.throws(() => advanceTurn(state, [value] as TurnCommand[]), /Invalid (turn command|military order)/);
  const commands = [attack()];
  const result = advanceTurn(state, commands);
  commands[0].order = { kind: 'defend' };
  assert.deepEqual(unit(result).order, { kind: 'attack', targetRegionId: 'amber-plain' });
  assert.deepEqual(unit(advanceTurn(state, [attack(), defend])).order, { kind: 'defend' });
  assert.equal(unit(advanceTurn(state, [attack(), defend])).manpower, 1000);
});

test('equal starting forces resolve simultaneous casualties over three weeks and capture with survivors', () => {
  let state = freeze(start());
  for (const [index, [attacker, defender]] of [[750, 500], [625, 125], [593, 0]].entries()) {
    const previous = state;
    state = advanceTurn(previous, index === 0 ? [attack()] : []);
    assert.equal(unit(state).manpower, attacker);
    assert.equal(unit(state, 'belora-first').manpower, defender);
    assert.equal(unit(previous).manpower, index === 0 ? 1000 : [750, 625][index - 1]);
    assert.equal(owner(state), index === 2 ? 'alden' : 'belora');
    assert.equal(unit(state).regionId, index === 2 ? 'amber-plain' : 'alden-vale');
    assert.equal(state.militaryResults[0].kind, 'combat');
    if (state.militaryResults[0].kind === 'combat') {
      assert.equal(state.militaryResults[0].captured, index === 2);
      assert.equal(state.militaryResults[0].attackerCasualties, [250, 125, 32][index]);
      assert.deepEqual(state.militaryResults[0].defenderCasualties, [{ divisionId: 'belora-first', losses: [500, 375, 125][index] }]);
    }
    freeze(state);
  }
  assert.deepEqual(unit(state).order, { kind: 'defend' });
  assert.deepEqual(advanceTurn(state).divisions, state.divisions);
});

test('an undefended adjacent enemy region is captured without casualties', () => {
  const state = advanceTurn(start(), [move('reed-coast')]);
  const result = advanceTurn(freeze(state), [attack('silver-hills')]);
  assert.equal(owner(result, 'silver-hills'), 'alden');
  assert.equal(unit(result).regionId, 'silver-hills');
  assert.equal(unit(result).manpower, 1000);
  assert.deepEqual(result.militaryResults, [{ kind: 'combat', divisionId: 'alden-first', targetRegionId: 'silver-hills', attackerCasualties: 0, defenderCasualties: [], captured: true }]);
});

test('defeat and simultaneous destruction never create negative manpower or an empty-army capture', () => {
  for (const [attacker, defender] of [[1, 1000], [1, 1]]) {
    const state = start();
    unit(state).manpower = attacker;
    unit(state, 'belora-first').manpower = defender;
    const result = advanceTurn(freeze(state), [attack()]);
    assert.equal(unit(result).manpower, 0);
    assert.equal(unit(result, 'belora-first').manpower, defender - 1);
    assert.equal(owner(result), 'belora');
    assert.equal(unit(result).regionId, 'alden-vale');
    assert.deepEqual(unit(result).order, { kind: 'defend' });
    assert.throws(() => advanceTurn(result, [attack()]), /available personnel/);
    assert.deepEqual(advanceTurn(result).divisions, result.divisions);
  }
});

test('all enemy defenders contribute; damage is capped and allocated in stable defender-ID order', () => {
  const state = start();
  unit(state, 'belora-first').manpower = 100;
  state.divisions.push({ ...structuredClone(unit(state, 'belora-first')), id: 'belora-second', manpower: 600 });
  const result = advanceTurn(freeze(state), [attack()]);
  assert.equal(unit(result).manpower, 825); // ceil((100 + 600) / 4)
  assert.equal(unit(result, 'belora-first').manpower, 0);
  assert.equal(unit(result, 'belora-second').manpower, 200); // remaining 400 of 500 damage
  assert.equal(owner(result), 'belora');
  const reversed = advanceTurn({ ...state, divisions: [...state.divisions].reverse() }, [attack()]);
  assert.deepEqual(reversed.militaryResults, result.militaryResults);
  for (const division of result.divisions) assert.deepEqual(unit(reversed, division.id), division);
});

test('multiple player units resolve by ID; obsolete standing attacks cancel visibly after allied capture', () => {
  const state = start();
  state.divisions.push({ ...structuredClone(unit(state)), id: 'alden-second', name: 'Alden Second Division' });
  const commands = [command({ kind: 'attack', targetRegionId: 'amber-plain' }, 'alden-second'), attack()];
  const result = advanceTurn(freeze(state), freeze(commands));
  assert.equal(owner(result), 'alden');
  assert.equal(unit(result).manpower, 750);
  assert.equal(unit(result, 'alden-second').manpower, 875);
  assert.deepEqual(result.militaryResults.map(result => result.divisionId), ['alden-first', 'alden-second']);
  const next = advanceTurn(result);
  assert.deepEqual(unit(next).order, { kind: 'defend' });
  assert.deepEqual(next.militaryResults, [{ kind: 'cancelled', divisionId: 'alden-first', reason: 'Attack requires an enemy-controlled target region.' }]);
});

test('unselected countries do not move or launch stored attacks autonomously', () => {
  const state = start();
  unit(state, 'belora-first').order = { kind: 'attack', targetRegionId: 'alden-vale' };
  const result = advanceTurn(freeze(state));
  assert.deepEqual(result.divisions, state.divisions);
  assert.deepEqual(result.regions, state.regions);
  assert.deepEqual(result.militaryResults, []);
});

test('economic policies continue during combat, and a budget failure rejects all military outcomes', () => {
  const commands: TurnCommand[] = [attack(), { type: 'set-economic-policy', countryId: 'alden', policy: 'tax-relief' }];
  const result = advanceTurn(start(), commands);
  assert.equal(unit(result).manpower, 750);
  assert.equal(result.countries[0].economy.treasury, 98);
  assert.equal(result.countries[0].economicPolicy, 'tax-relief');
  assert.equal(advanceTurn(result).countries[0].economy.treasury, 96);
  const exhausted = start();
  exhausted.countries[0].economy.treasury = 0;
  const snapshot = structuredClone(exhausted);
  assert.throws(() => advanceTurn(freeze(exhausted), freeze(commands)), /Insufficient funds/);
  assert.deepEqual(exhausted, snapshot);
});

test('invalid defender headcounts and unsafe totals reject the whole turn', () => {
  for (const manpower of [-1, 0.5, NaN, Infinity]) {
    const state = start();
    unit(state, 'belora-first').manpower = manpower;
    const snapshot = structuredClone(state);
    assert.throws(() => advanceTurn(freeze(state), [attack()]), /manpower must/);
    assert.deepEqual(state, snapshot);
  }
  const state = start();
  unit(state, 'belora-first').manpower = Number.MAX_SAFE_INTEGER;
  state.divisions.push({ ...structuredClone(unit(state, 'belora-first')), id: 'belora-second' });
  assert.throws(() => advanceTurn(freeze(state), [attack()]), /safe integer limit/);
});

test('military/economic replay including invalid turns, capture, defence and movement survives JSON round trips', () => {
  const script: TurnCommand[][] = [
    [attack(), { type: 'set-economic-policy', countryId: 'alden', policy: 'tax-relief' }],
    [attack('cedar-basin')], [], [defend], [attack()], [], [move('alden-vale')], [],
  ];
  const replay = (serialize: boolean) => {
    let state = start();
    return script.map(commands => {
      if (serialize) state = JSON.parse(JSON.stringify(state));
      try {
        state = advanceTurn(freeze(state), freeze(commands));
        return { state, error: null };
      } catch (error) { return { state, error: (error as Error).message }; }
    });
  };
  const history = replay(false);
  assert.deepEqual(replay(false), history);
  assert.deepEqual(replay(true), history);
  assert.match(history[1].error!, /adjacent/);
  assert.equal(owner(history[4].state), 'alden');
  assert.equal(unit(history[6].state).regionId, 'alden-vale');
  assert.ok(history.every(entry => entry.state.seed === 2401));
});
