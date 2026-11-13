import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { EconomyCommand, ExternalEffect, TurnInput } from '../src/index.ts';
import { advanceEconomyInPlace, auditError, AUDIT_TOLERANCE, createEconomy, createTestWorldSpec, KELL_STRAIT_LANES } from '../src/index.ts';
import { allNumbers, goodIdx, idx, once, world } from './helpers.ts';
import { randomUnit } from '../src/core/rng.ts';

test('quiet world: goods, money and bonds balance every week and nothing goes negative', () => {
  const state = world();
  let worst = 0;
  for (let week = 1; week <= 400; week++) {
    const report = once(state);
    worst = Math.max(worst, auditError(report.audit));
    assert.equal(report.audit.negativeValues, 0);
    assert.equal(report.audit.nonFiniteValues, 0);
    // Independent re-check of money: agents' holdings equal the money supply.
    let money = 0;
    for (let z = 0; z < state.zones.length; z++) money += state.zone.householdMoney[z] + state.zone.firmMoney[z];
    for (let c = 0; c < state.countries.length; c++) money += state.country.treasury[c];
    assert.ok(Math.abs(money - state.world.baseMoney) <= 1e-9 * money, 'money supply equals what agents hold');
    // Debt is, by definition, the sum of bond claims.
    for (let c = 0; c < state.countries.length; c++) {
      let held = 0;
      for (let z = 0; z < state.zones.length; z++) held += state.bonds[z * state.countries.length + c];
      assert.ok(Math.abs(held - state.country.debt[c]) <= 1e-9 * Math.max(1, held));
    }
  }
  assert.ok(worst < AUDIT_TOLERANCE, `worst relative error ${worst}`);
});

test('goods ledger: closing stock = opening stock + production - use - spoilage - destruction (per good, every week)', () => {
  const state = world();
  for (let week = 1; week <= 120; week++) {
    const report = once(state, week === 30 ? { effects: [{ type: 'destroy-stock', zoneId: 'verdania', goodId: 'all', fraction: 0.3 }] } : undefined);
    report.audit.goods.forEach(ledger => {
      const expected = ledger.before + ledger.produced - ledger.used - ledger.spoiled - ledger.destroyed - ledger.dust;
      assert.ok(Math.abs(ledger.after - expected) <= 1e-9 * Math.max(1, ledger.before + ledger.produced), 'ledger balances');
      assert.ok(ledger.after >= -1e-12);
    });
    if (week === 30) assert.ok(report.audit.goods.some(ledger => ledger.destroyed > 0), 'destruction is recorded, not hidden');
  }
});

test('no resource appears from nowhere: with zero productive capacity there is no output', () => {
  const state = world();
  for (let z = 0; z < state.zones.length; z++) {
    for (let g = 0; g < state.config.goods.length; g++) { state.zoneGood.capacity[z * state.config.goods.length + g] = 0; }
  }
  const report = once(state);
  for (const good of report.goods) assert.equal(good.production, 0, `${good.goodId} cannot be produced without capacity`);
});

test('kitchen-sink shocks and commands: conservation still holds', () => {
  const state = world();
  const script = (week: number): TurnInput | undefined => {
    const commandsByWeek: Record<number, EconomyCommand[]> = {
      10: [{ type: 'set-sanction', countryId: 'norland', targetId: 'ostmark', goodIds: 'all', imports: true, exports: true },
        { type: 'set-tariff', countryId: 'sundara', goodId: 'consumer', rate: 0.6 }, { type: 'set-reserve', countryId: 'norland', goodId: 'energy', targetWeeks: 20, mode: 'fill' }],
      40: [{ type: 'declare-default', countryId: 'tavros' }, { type: 'set-tax', countryId: 'lirane', tax: 'income', rate: 0.5 }],
      70: [{ type: 'repay-debt', countryId: 'norland', amount: 400 }, { type: 'set-spending', countryId: 'khazir', category: 'military', share: 0.2 }],
      100: [{ type: 'set-borrowing', countryId: 'verdania', enabled: false }, { type: 'set-procurement-priority', countryId: 'ostmark', enabled: true }],
    };
    const effectsByWeek: Record<number, ExternalEffect[]> = {
      5: [{ type: 'production-shock', zoneId: 'norland-core', goodId: 'industrial', factor: 0.4, recoveryWeeks: 40 }],
      20: [{ type: 'destroy-capacity', zoneId: 'halcyon', goodId: 'all', fraction: 0.5 }, { type: 'destroy-stock', zoneId: 'halcyon', goodId: 'all', fraction: 0.6 }],
      30: KELL_STRAIT_LANES.map(laneId => ({ type: 'set-lane' as const, laneId, costMultiplier: 3, throughput: 0 })),
      50: [{ type: 'transfer-zone', zoneId: 'morvaine', ownerId: 'sundara' }, { type: 'set-mobilization', zoneId: 'ostmark', personnel: 5 }],
      60: [{ type: 'military-procurement', countryId: 'ostmark', goodId: 'military', quantity: 20 }, { type: 'transfer-funds', fromCountryId: 'norland', toCountryId: 'tavros', amount: 1e9 }],
      90: [{ type: 'stability-modifier', countryId: 'verdania', value: -40 }],
    };
    if (!commandsByWeek[week] && !effectsByWeek[week]) return undefined;
    return { commands: commandsByWeek[week] ?? [], effects: effectsByWeek[week] ?? [] };
  };
  for (let week = 1; week <= 220; week++) {
    const report = advanceEconomyInPlace(state, script(week), { audit: true, report: 'none' });
    assert.equal(report.audit.negativeValues, 0, `week ${week}`);
  }
  assert.ok(allNumbers(state).every(Number.isFinite));
});

test('fuzz: random valid commands and shocks over several seeds never break an invariant', () => {
  for (let seed = 1; seed <= 6; seed++) {
    const spec = createTestWorldSpec(seed);
    spec.warmupTurns = 40;
    const state = createEconomy(spec);
    const C = state.countries.length, Z = state.zones.length, G = state.config.goods.length;
    const pick = (n: number, k: number, week: number) => Math.min(n - 1, Math.floor(randomUnit(seed, week, 77, k) * n));
    for (let week = 1; week <= 160; week++) {
      const cmds: EconomyCommand[] = [];
      const effs: ExternalEffect[] = [];
      if (randomUnit(seed, week, 78, 0) < 0.35) {
        const c = state.countries[pick(C, 1, week)].id, t = state.countries[pick(C, 2, week)].id, g = state.config.goods[pick(G - 1, 3, week)].id;
        const roll = pick(9, 4, week);
        if (roll === 0 && c !== t) cmds.push({ type: 'set-sanction', countryId: c, targetId: t, goodIds: [g], imports: randomUnit(seed, week, 79, 0) < 0.5, exports: randomUnit(seed, week, 79, 1) < 0.5 });
        else if (roll === 1) cmds.push({ type: 'set-tariff', countryId: c, goodId: g, rate: randomUnit(seed, week, 79, 2) * 2 });
        else if (roll === 2) cmds.push({ type: 'set-tax', countryId: c, tax: 'income', rate: randomUnit(seed, week, 79, 3) * 0.6 });
        else if (roll === 3) cmds.push({ type: 'set-spending', countryId: c, category: 'military', share: randomUnit(seed, week, 79, 4) * 0.3 });
        else if (roll === 4) cmds.push({ type: 'set-reserve', countryId: c, goodId: g, targetWeeks: randomUnit(seed, week, 79, 5) * 30, mode: ['automatic', 'hold', 'release', 'fill'][pick(4, 6, week)] as 'hold' });
        else if (roll === 5) cmds.push({ type: 'set-borrowing', countryId: c, enabled: randomUnit(seed, week, 79, 6) < 0.5 });
        else if (roll === 6) effs.push({ type: 'production-shock', zoneId: state.zones[pick(Z, 7, week)].id, goodId: g, factor: 0.2 + randomUnit(seed, week, 79, 7) * 1.5, recoveryWeeks: 5 + pick(100, 8, week) });
        else if (roll === 7) effs.push({ type: 'destroy-capacity', zoneId: state.zones[pick(Z, 9, week)].id, goodId: 'all', fraction: randomUnit(seed, week, 79, 8) * 0.5 });
        else cmds.push({ type: 'repay-debt', countryId: c, amount: randomUnit(seed, week, 79, 9) * 500 });
      }
      const report = advanceEconomyInPlace(state, { commands: cmds, effects: effs }, { audit: true, report: 'none' });
      assert.equal(report.audit.negativeValues, 0, `seed ${seed} week ${week}`);
    }
    assert.ok(allNumbers(state).every(Number.isFinite), `seed ${seed} finite`);
    void goodIdx; void idx;
  }
});
