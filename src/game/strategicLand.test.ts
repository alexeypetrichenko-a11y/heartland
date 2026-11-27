import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import * as api from '../../economy-engine/src/integration/index.ts';
import { advanceGameWeek, startEconomy } from './economyBridge.ts';
import { createInitialState } from './initialState.ts';
import type { GameState } from './models.ts';
import { emptyDrafts } from './playerDrafts.ts';
import { decodeGameSave, encodeGameSave, restoreGameSave } from './saveFormat.ts';
import { selectCountry } from './selectCountry.ts';
import { militaryEvents, militarySelection, resolveStrategicLand, stageCollective, startStrategicLand, type CollectiveAction, type CollectiveOrder } from './strategicLand.ts';

function fixture(attackers: number, defenders: number, strength = 25000) {
  const game = selectCountry(createInitialState(), 'alden');
  game.regions[1].adjacentRegionIds.push('amber-plain');
  game.regions[2].adjacentRegionIds.push('reed-coast');
  game.divisions = [
    ...Array.from({ length: attackers }, (_, i) => ({ ...game.divisions[0], id: `a${i}`, regionId: i % 2 ? 'reed-coast' : 'alden-vale', manpower: strength })),
    ...Array.from({ length: defenders }, (_, i) => ({ ...game.divisions[1], id: `d${i}`, manpower: strength })),
  ];
  return startStrategicLand(game);
}

function order(game: GameState, ids: string[], action: CollectiveAction = { kind: 'attack', targetRegionId: 'amber-plain' }): CollectiveOrder {
  return { id: ids.join('/'), divisionIds: ids, countryId: game.divisions.find(d => d.id === ids[0])!.ownerId, week: game.week, action };
}

function week(game: GameState, commands: CollectiveOrder[] = [], present?: Parameters<typeof resolveStrategicLand>[2]): GameState {
  return { ...game, ...resolveStrategicLand(game, commands, present), week: game.week + 1 };
}

for (const [a, d, rounds, lossesA, lossesD, capture] of [
  [1, 1, 7, 5583, 4102, false], [1, 2, 4, 5480, 2372, false], [1, 3, 4, 5480, 2367, false],
  [2, 2, 7, 11166, 8204, false], [3, 1, 4, 3132, 5480, true], [3, 2, 6, 9351, 11078, true],
] as const) {
  test(`approved multi-origin calibration ${a} vs ${d}`, () => {
    for (const invert of [false, true]) {
      let game = fixture(a, d);
      if (invert) {
        game = { ...game, strategicLand: undefined, divisions: game.divisions.map(unit => ({ ...unit, id: `renamed-${unit.id}` })).reverse() };
        game = startStrategicLand(game);
      }
      const attackers = game.divisions.filter(unit => unit.ownerId === 'alden').map(unit => unit.id);
      const command = attackers.map(id => order(game, [id]));
      game = week(game, invert ? command.reverse() : command);
      while (game.strategicLand!.fronts.length && game.week <= 12) game = week(game);
      assert.equal(game.week - 1, rounds);
      const sum = (country: string) => game.divisions.filter(unit => unit.ownerId === country).reduce((n, unit) => n + unit.manpower, 0);
      assert.equal(sum('alden'), a * 25000 - lossesA);
      assert.equal(sum('belora'), d * 25000 - lossesD);
      assert.equal(game.regions[2].ownerId === 'alden', capture);
    }
  });
}

test('collective replacement is whole-bundle and rejected staging preserves all prior drafts', () => {
  const game = fixture(3, 1);
  const original = stageCollective(game, [], order(game, ['a0', 'a1'])).drafts;
  const invalid = stageCollective(game, original, order(game, ['a1', 'd0']));
  assert.strictEqual(invalid.drafts, original);
  assert.equal(invalid.reasons[0].divisionId, 'd0');
  const replacement = stageCollective(game, original, order(game, ['a1', 'a2']));
  assert.deepEqual(replacement.drafts.map(bundle => bundle.divisionIds), [['a1', 'a2']]);
  const overlap = week(game, [order(game, ['a0', 'a1']), order(game, ['a1', 'a2'])]);
  assert.equal(overlap.strategicLand!.fronts.length, 0);
  assert.equal(overlap.divisions[0].manpower, 25000);
  assert.deepEqual(militarySelection(game, 'alden', ['d0']), []);
  assert.deepEqual(militaryEvents(overlap, 'belora'), []);
});

test('reciprocal screening boundary and round limit', () => {
  for (const [weak, clash] of [[6249, false], [6250, true]] as const) {
    let game = fixture(1, 1);
    game = startStrategicLand({ ...game, strategicLand: undefined, divisions: game.divisions.map(d => d.id === 'd0' ? { ...d, manpower: weak } : d) });
    const reverse = order(game, ['d0'], { kind: 'attack', targetRegionId: 'alden-vale' });
    game = week(game, [reverse, order(game, ['a0'])]);
    assert.equal(game.strategicLand!.fronts[0].kind, clash ? 'clash' : 'assault');
  }
  let game = fixture(1, 1, 1);
  game = week(game, [order(game, ['a0']), order(game, ['d0'], { kind: 'attack', targetRegionId: 'alden-vale' })]);
  for (let rounds = 1; rounds < 8; rounds++) {
    assert.equal(game.strategicLand!.fronts[0].rounds, rounds);
    game = week(game);
  }
  assert.equal(game.strategicLand!.fronts.length, 0);
  assert.deepEqual(game.divisions.map(unit => unit.manpower), [1, 1]);
});

test('embarked units never defend or stage orders', () => {
  const game = fixture(1, 1);
  const next = week(game, [order(game, ['a0'])], unit => unit.id !== 'd0');
  assert.equal(next.regions[2].ownerId, 'alden');
  assert.equal(next.divisions[1].manpower, 25000);
  assert.equal(militarySelection(game, 'belora', ['d0'], () => false)[0].status, 'in-transit');
});

test('reinforcement carries progress forward, withdrawal retains baseline and costs a full week', () => {
  let game = fixture(3, 1);
  game = week(game, [order(game, ['a0'])]);
  const front = game.strategicLand!.fronts[0];
  const next = week(game, [order(game, ['a1', 'a2'], { kind: 'reinforce', engagementId: front.id })]);
  const progressed = next.strategicLand!.fronts[0];
  assert.equal(progressed.rounds, 2);
  assert.equal(progressed.progress, front.progress + 20);
  const withdrawn = week(next, [order(next, ['a0'], { kind: 'disengage' })]);
  const readiness = withdrawn.strategicLand!.readiness.a0;
  assert.equal(readiness.baseline, 25000);
  assert.equal(readiness.eligibleWeek, withdrawn.week + 1);
  assert.equal(stageCollective(withdrawn, [], order(withdrawn, ['a0'])).reasons.length, 1);
});

test('nonreciprocal attacks expose origins and settle together', () => {
  let game = fixture(1, 1);
  game.regions[4].ownerId = 'alden';
  const orders = [order(game, ['a0']), order(game, ['d0'], { kind: 'attack', targetRegionId: 'cedar-basin' })];
  game = week(game, orders);
  assert.equal(game.regions[2].ownerId, 'alden');
  assert.equal(game.regions[4].ownerId, 'belora');
  assert.deepEqual(game.divisions.map(d => d.manpower), [25000, 25000]);
});

test('active checkpoint and collective drafts replay with atomic economy settlement', async () => {
  const runtime = { api, startingSave: readFileSync(new URL('../../economy-engine/scenarios/fictional-week1.economy.json', import.meta.url), 'utf8') };
  const game = startStrategicLand(selectCountry(createInitialState(), 'alden'));
  const economy = startEconomy(runtime, game);
  const step = advanceGameWeek(runtime, game, economy, [], [], [order(game, ['alden-first'])]);
  assert.equal(step.game.strategicLand!.fronts[0].rounds, 1);
  const drafts = { ...emptyDrafts(), collective: [order(step.game, ['alden-first'], { kind: 'disengage' })] };
  const encoded = await encodeGameSave(runtime, { ...step, drafts });
  assert.equal(JSON.parse(encoded).version, 2);
  await assert.rejects(() => decodeGameSave(JSON.stringify({ ...JSON.parse(encoded), version: 1 })), /combat rules/);
  const resumed = restoreGameSave(runtime, await decodeGameSave(encoded));
  assert.deepEqual(resumed.game, step.game);
  assert.deepEqual(resumed.drafts, drafts);
  const before = JSON.stringify(step);
  assert.throws(() => advanceGameWeek(runtime, step.game, step.economy, [], [{ type: 'invalid' } as never], drafts.collective));
  const failAfterGame: typeof api.advanceWeekTogether = input => {
    const proposed = input.advanceGame(input.game);
    assert.equal(proposed.week, input.game.week + 1);
    throw new Error('Injected economic settlement failure');
  };
  assert.throws(() => advanceGameWeek({ ...runtime, api: { ...api, advanceWeekTogether: failAfterGame } },
    step.game, step.economy, [], [], drafts.collective), /Injected economic settlement failure/);
  assert.equal(JSON.stringify(step), before);
  assert.deepEqual(
    advanceGameWeek(runtime, resumed.game, resumed.economy, [], [], resumed.drafts.collective),
    advanceGameWeek(runtime, step.game, step.economy, [], [], drafts.collective),
  );
});

test('surrender is symmetric and surviving personnel are distinct from casualties', () => {
  for (const attackerTrapped of [false, true]) {
    let game = fixture(attackerTrapped ? 1 : 3, attackerTrapped ? 3 : 1);
    if (!attackerTrapped) game.regions[2].adjacentRegionIds = ['alden-vale', 'reed-coast', 'cedar-basin'];
    const attackers = game.divisions.filter(d => d.ownerId === 'alden').map(d => d.id);
    game = week(game, [order(game, attackers)]);
    if (attackerTrapped) {
      game.regions[0].ownerId = 'belora';
      game.regions[1].ownerId = 'belora';
    }
    while (game.strategicLand!.fronts.length && game.week < 12) game = week(game);
    const trapped = attackerTrapped ? 'a0' : 'd0';
    assert.equal(game.week - 1, 5);
    assert.equal(game.strategicLand!.readiness[trapped].prisoners, 18349);
    assert.equal(game.divisions.find(d => d.id === trapped)!.manpower, 0);
    assert.equal(militaryEvents(game, attackerTrapped ? 'alden' : 'belora').find(e => e.kind === 'prisoners')?.amount, 18349);
  }
});

test('suspended checkpoint preserves survivors, then resolves a reopened route before renewed orders', async () => {
  const runtime = { api, startingSave: readFileSync(new URL('../../economy-engine/scenarios/fictional-week1.economy.json', import.meta.url), 'utf8') };
  let game = startStrategicLand(selectCountry(createInitialState(), 'alden'));
  let economy = startEconomy(runtime, game);
  ({ game, economy } = advanceGameWeek(runtime, game, economy, [], [], [order(game, ['alden-first'])]));
  const front = game.strategicLand!.fronts[0];
  // Construct a suspended checkpoint on the immutable fictional roster.
  front.progress = 100;
  front.suspended = 1;
  const encoded = await encodeGameSave(runtime, { game, economy, drafts: emptyDrafts() });
  const restored = restoreGameSave(runtime, await decodeGameSave(encoded));
  assert.deepEqual(restored.game, game);
  const resumed = advanceGameWeek(runtime, restored.game, restored.economy, []);
  assert.equal(resumed.game.strategicLand!.fronts.length, 0);
  assert.equal(resumed.game.divisions.find(d => d.id === 'belora-first')!.regionId, 'silver-hills');
  assert.equal(resumed.game.regions.find(r => r.id === 'amber-plain')!.ownerId, 'belora');
  assert.ok(!resumed.game.strategicLand!.events.some(e => e.kind === 'loss'));
});

test('three weeks of unavailable withdrawal suspend a front without resetting progress', () => {
  let game = fixture(4, 2);
  const reserve = game.divisions.find(d => d.id === 'a3')!;
  reserve.manpower = 75000;
  game.strategicLand!.readiness.a3.baseline = 75000;
  game.divisions.find(d => d.id === 'd1')!.regionId = 'silver-hills';
  game.divisions.find(d => d.id === 'd1')!.manpower = 75000;
  game.strategicLand!.readiness.d1.baseline = 75000;
  game = week(game, [
    order(game, ['a0', 'a1', 'a2']),
    order(game, ['a3'], { kind: 'attack', targetRegionId: 'silver-hills' }),
  ]);
  while (game.week <= 6) game = week(game);
  const front = game.strategicLand!.fronts.find(f => f.target === 'amber-plain')!;
  assert.equal(front.suspended, 6);
  assert.equal(front.progress, 100);
  const surviving = game.divisions.find(d => d.id === 'd0')!.manpower;
  game = week(game);
  assert.equal(game.divisions.find(d => d.id === 'd0')!.manpower, surviving);
  assert.equal(game.regions[2].ownerId, 'belora');
});

test('persistent readiness leaves exhausted formations unavailable at 52, 104 and 156 weeks', () => {
  let game = fixture(1, 1);
  game = week(game, [order(game, ['a0'])]);
  while (game.week <= 156) {
    game = week(game);
    if ([53, 105, 157].includes(game.week)) {
      assert.equal(game.divisions[0].manpower, 19417);
      assert.equal(militarySelection(game, 'alden', ['a0'])[0].status, 'depleted');
      assert.equal(stageCollective(game, [], order(game, ['a0'])).reasons.length, 1);
    }
  }
});

test('displaced units can withdraw to a friendly region without reopening a settled fight', () => {
  const game = fixture(1, 1);
  game.regions[0].ownerId = 'belora';
  assert.equal(militarySelection(game, 'alden', ['a0'])[0].status, 'displaced');
  const withdrawn = week(game, [order(game, ['a0'], { kind: 'disengage', fallbackRegionId: 'reed-coast' })]);
  assert.equal(withdrawn.divisions[0].regionId, 'reed-coast');
  assert.equal(withdrawn.divisions[0].manpower, 25000);
  assert.equal(withdrawn.strategicLand!.readiness.a0.eligibleWeek, 3);
});

test('synthetic sustained load preserves simultaneous fronts across checkpoint and repeated rotations', async t => {
  const roster = selectCountry(createInitialState(), 'alden');
  const frontCount = 8;
  const additions = Array.from({ length: frontCount }, (_, index) => {
    const origin = `origin-${index}`, target = `target-${index}`, exit = `exit-${index}`;
    const regions = [
      { id: origin, name: origin, ownerId: 'alden', adjacentRegionIds: [target, exit] },
      { id: target, name: target, ownerId: 'belora', adjacentRegionIds: [origin, exit] },
      { id: exit, name: exit, ownerId: 'belora', adjacentRegionIds: [origin, target] },
    ];
    const units = (prefix: string, count: number, ownerId: string, regionId: string) => Array.from({ length: count }, (_, i) => ({
      id: `${prefix}-${index}-${i}`, name: `${prefix} ${index} ${i}`, ownerId, regionId,
      manpower: 25000, order: { kind: 'defend' } as const,
    }));
    const ids = (units: { id: string }[]) => units.map(unit => unit.id);
    const initial = units('initial', 12, 'alden', origin);
    const reserve = units('reserve', 12, 'alden', origin);
    const garrison = units('garrison', index === 0 ? 4 : 12, 'belora', target);
    const blockers = units('blocker', 12, 'alden', origin);
    const exitGuards = units('exit-guard', 12, 'belora', exit);
    return { regions, units: [...initial, ...reserve, ...garrison, ...blockers, ...exitGuards],
      initial: ids(initial), reserve: ids(reserve), blockers: ids(blockers), target, exit };
  });
  roster.regions.push(...additions.flatMap(part => part.regions));
  roster.divisions.push(...additions.flatMap(part => part.units));
  let game = startStrategicLand(roster);
  const started = performance.now();
  const attack = (ids: string[], targetRegionId: string) => order(game, ids, { kind: 'attack', targetRegionId });
  game = week(game, additions.flatMap(part => [attack(part.initial, part.target), attack(part.blockers, part.exit)]));
  assert.equal(game.strategicLand!.fronts.length, 16);

  const sharedReserve = additions.flatMap(part => part.reserve.slice(0, 3));
  const defend = order(game, sharedReserve, { kind: 'defend' });
  assert.equal(stageCollective(game, [], defend).drafts[0].divisionIds.length, 24);

  let activeWeeks = 1;
  let reinforcementWeeks = 0;
  let rotationWeeks = 0;
  for (let round = 2; round <= 12; round++) {
    const commands = additions.flatMap((part, index) => {
      if (index === 0) return round === 7 ? [order(game, part.blockers, { kind: 'disengage' })] : [];
      const front = game.strategicLand!.fronts.find(item => item.target === part.target && item.suspended === undefined);
      if (!front) return [];
      const actions: CollectiveOrder[] = [];
      if (round >= 2 && round <= 5) {
        actions.push(order(game, part.reserve.slice((round - 2) * 3, (round - 1) * 3),
          { kind: 'reinforce', engagementId: front.id }));
        const withdrawing = part.initial.slice((round - 2) * 2, (round - 1) * 2).filter(id => front.sides[0].includes(id));
        if (withdrawing.length) actions.push(order(game, withdrawing, { kind: 'disengage' }));
      }
      return actions;
    });
    if (commands.some(bundle => bundle.action.kind === 'reinforce')) reinforcementWeeks++;
    const previous = game;
    game = week(game, commands);
    if (round <= 5 && game.strategicLand!.events.some(event => event.kind === 'retreat')) rotationWeeks++;
    if (round === 6) assert.equal(game.strategicLand!.fronts.find(front => front.target === additions[0].target)?.suspended, 6);
    if (round === 7) {
      assert.ok(!game.strategicLand!.fronts.some(front => front.target === additions[0].target));
      assert.ok(game.strategicLand!.events.some(event => event.kind === 'retreat' && event.regionId === additions[0].exit));
    }
    if (game.strategicLand!.fronts.some(front => front.suspended === undefined)) activeWeeks++;
    if (round === 3) {
      const encoded = JSON.stringify(game);
      const { validateSavedGame } = await import('./saveValidation.ts');
      const resumed = validateSavedGame(JSON.parse(encoded), roster);
      assert.ok(resumed.strategicLand!.fronts.length >= 8);
      assert.deepEqual(week(resumed), week(game));
      game = resumed;
    }
    for (const unit of game.divisions) {
      assert.ok(unit.manpower <= previous.divisions.find(prior => prior.id === unit.id)!.manpower);
      assert.equal(game.strategicLand!.readiness[unit.id].baseline, roster.divisions.find(opening => opening.id === unit.id)!.manpower);
    }
  }
  assert.ok(activeWeeks >= 7);
  assert.equal(reinforcementWeeks, 4);
  assert.equal(rotationWeeks, 4);
  t.diagnostic(`${game.divisions.length} divisions, 16 peak fronts, ${activeWeeks} consecutive active weeks, ${(performance.now() - started).toFixed(1)} ms including assertions and checkpoint`);
});

test('withdrawal never uses an exit captured simultaneously', () => {
  let game = fixture(1, 1);
  game = week(game, [order(game, ['a0'])]);
  const defender = game.divisions[1];
  const origin = game.regions[2];
  const cyan = { ...defender, id: 'fresh-cyrin', ownerId: 'cyrin', regionId: 'dawn-ridge' };
  game.divisions.push(cyan);
  game.strategicLand!.readiness[cyan.id] = { baseline: cyan.manpower, eligibleWeek: 1, prisoners: 0 };
  assert.ok(origin.adjacentRegionIds.includes('silver-hills'));
  game = week(game, [
    order(game, ['d0'], { kind: 'disengage', fallbackRegionId: 'silver-hills' }),
    order(game, [cyan.id], { kind: 'attack', targetRegionId: 'silver-hills' }),
  ]);
  assert.equal(game.regions[3].ownerId, 'cyrin');
  assert.equal(game.divisions.find(unit => unit.id === 'd0')!.regionId, 'amber-plain');
  assert.ok(militaryEvents(game, 'belora').some(event => event.kind === 'blocked'));
});
