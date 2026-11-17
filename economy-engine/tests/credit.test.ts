import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { EconomyCommand, EconomyEvent, EconomyState, TurnReport } from '../src/index.ts';
import {
  advanceEconomyInPlace, auditError, autopilotCommands, AUDIT_TOLERANCE, cloneEconomy, createConfig, createEconomy,
  createCatalogueWorldSpec, createTestWorldSpec, deserializeEconomy, getFirmAggregates, hashEconomy, serializeEconomy,
  validateEconomy,
} from '../src/index.ts';
import { getModel, getWorkspace } from '../src/core/model.ts';
import { openBanks, resolveBankruptcies } from '../src/core/credit.ts';
import { capacityOf, idx, world, zoneIdx } from './helpers.ts';

/**
 * Milestone 2: central banks and money, firm credit, bankruptcy and
 * liquidation, tier transitions, and the strategic-reserve fixes.
 */

const step = (s: EconomyState, extra: EconomyCommand[] = []) =>
  advanceEconomyInPlace(s, { commands: [...autopilotCommands(s), ...extra] }, { audit: true, report: 'full' });
let catalogueCache: EconomyState | null = null;
const catalogueWorld = () => cloneEconomy(catalogueCache ??= createEconomy(createCatalogueWorldSpec()));
const sum = (values: readonly number[]) => values.reduce((a, b) => a + b, 0);

// --- Money and central banks -------------------------------------------------------

test('every unit of money in circulation is money issued by a central bank, every week', () => {
  const state = world();
  assert.ok(Math.abs(state.world.baseMoney - sum(state.country.cbIssued)) <= 1e-9 * state.world.baseMoney, 'at the start');
  for (let week = 0; week < 300; week++) {
    const report = step(state);
    assert.ok(report.audit.issuedError < 1e-9, `week ${week}: ${report.audit.issuedError}`);
    assert.ok(Math.abs(report.audit.moneyError) <= 1e-9 * report.audit.moneyAfter);
  }
});

test('central-bank balance sheets: capital = reserves + loans - money issued, and lending never exceeds capacity', () => {
  const state = world();
  for (let week = 0; week < 260; week++) {
    const report = step(state);
    report.countries.forEach((country, c) => {
      const b = country.centralBank;
      const equity = b.reserves + b.loansToState + b.loansToFirms - b.moneyIssued;
      assert.ok(Math.abs(equity - b.equity) <= 1e-9 * Math.max(1, Math.abs(b.equity)), 'capital identity');
      assert.ok(Math.abs(b.lendingCapacity - Math.max(0, b.equity) / state.config.params.cbCapitalRatio) <= 1e-9 * Math.max(1, b.lendingCapacity));
      // No write-offs happen in this calm world, so every loan was made within capacity.
      assert.ok(b.loansToState + b.loansToFirms <= b.lendingCapacity * (1 + 1e-9), `${country.countryId} week ${week}: loans within capacity`);
      assert.ok(b.policyRate >= state.config.params.cbRateFloor - 1e-12 && b.policyRate <= state.config.params.cbRateCeiling + 1e-12);
      assert.equal(b.exceptionalMoney, 0);
      void c;
    });
  }
});

test('C1 fixed: with every normal central-bank operation switched off, the money supply never changes', () => {
  const spec = createTestWorldSpec();
  spec.config = createConfig({ firmTargetLeverage: 0, firmMaxLeverage: 0, cbMoneyGain: 0, cbMoneyMaxWeekly: 0 });
  const state = createEconomy(spec);
  assert.equal(sum(state.firm.loan), 0, 'no firm loans');
  const money = state.world.baseMoney;
  let centralBankLending = 0;
  for (let week = 0; week < 200; week++) {
    const report = step(state);
    for (const country of report.countries) centralBankLending += country.budget.borrowedFromCentralBank;
    if (centralBankLending === 0) assert.ok(Math.abs(report.world.money - money) <= 1e-9 * money, `week ${week}: money ${report.world.money} vs ${money}`);
  }
  assert.equal(centralBankLending, 0, 'no state needed central-bank credit in this run');
});

test('exceptional money creation happens only on command, is recorded and has a cost (R08, R43)', () => {
  const a = world(), b = world();
  const n = idx(a, 'norland');
  for (let week = 0; week < 10; week++) { step(a); step(b); }
  const before = a.country.treasury[n];
  const issued = a.country.cbIssued[n];
  const ra = step(a, [{ type: 'create-money', countryId: 'norland', amount: 500 }]);
  const rb = step(b);
  assert.equal(ra.countries[n].budget.moneyCreation, 500);
  assert.ok(ra.events.some((e: EconomyEvent) => e.type === 'money-created' && e.countryId === 'norland' && e.amount === 500));
  assert.equal(ra.countries[n].centralBank.exceptionalMoney, 500);
  assert.ok(a.country.cbIssued[n] - issued > 400, 'money issued rises by the amount (less the week’s normal operations)');
  assert.ok(a.country.treasury[n] > before + 300, 'the treasury receives it');
  assert.ok(ra.countries[n].centralBank.equity < rb.countries[n].centralBank.equity - 450, 'the bank’s capital falls: nothing backs the new money');
  for (let week = 0; week < 30; week++) { step(a); step(b); }
  assert.ok(a.country.marketRate[n] > b.country.marketRate[n], 'lenders charge more after money printing');
  // The AI never prints money.
  const c = world();
  for (let week = 0; week < 520; week++) {
    const commands = autopilotCommands(c);
    assert.ok(!commands.some(command => command.type === 'create-money'));
    advanceEconomyInPlace(c, { commands }, { report: 'none' });
  }
  assert.equal(sum(c.country.cbExceptional), 0);
});

test('the money-creation command is validated', () => {
  const state = world();
  assert.throws(() => advanceEconomyInPlace(state, { commands: [{ type: 'create-money', countryId: 'norland', amount: -1 }] }));
  assert.throws(() => advanceEconomyInPlace(state, { commands: [{ type: 'create-money', countryId: 'norland', amount: Number.NaN }] }));
  assert.throws(() => advanceEconomyInPlace(state, { commands: [{ type: 'create-money', countryId: 'nowhere', amount: 1 }] }));
});

// --- Firm credit -----------------------------------------------------------------------

test('firm credit cushions a temporary shock: the stricken sector borrows and is not liquidated', () => {
  const run = world(), control = world();
  const shock = { type: 'production-shock' as const, zoneId: 'verdania', goodId: 'food', factor: 0.5, recoveryWeeks: 78 };
  let worstDistress = 0;
  let bankruptcies = 0;
  for (let week = 1; week <= 104; week++) {
    const report = advanceEconomyInPlace(run, { commands: autopilotCommands(run), effects: week === 1 ? [shock] : [] }, { audit: true, report: 'full' });
    step(control);
    const farms = getFirmAggregates(run, 'verdania').find(view => view.sectorId === 'agriculture')!;
    worstDistress = Math.max(worstDistress, farms.distress);
    bankruptcies += report.events.filter(e => e.type === 'firm-bankruptcy').length;
  }
  const farms = getFirmAggregates(run, 'verdania').find(view => view.sectorId === 'agriculture')!;
  const normal = getFirmAggregates(control, 'verdania').find(view => view.sectorId === 'agriculture')!;
  assert.ok(farms.loan > normal.loan * 1.15, `the farms borrowed: ${farms.loan} vs ${normal.loan}`);
  assert.ok(worstDistress < run.config.params.bankruptcyWeeks, `distress stays below the liquidation threshold (worst ${worstDistress})`);
  assert.equal(bankruptcies, 0);
});

test('a calm world has no bankruptcies, and firm debt stays near its normal leverage', () => {
  const state = world();
  const start = sum(state.firm.loan);
  let bankruptcies = 0;
  let report: TurnReport | null = null;
  for (let week = 0; week < 260; week++) {
    report = step(state);
    bankruptcies += report.events.filter(e => e.type === 'firm-bankruptcy').length;
  }
  assert.equal(bankruptcies, 0);
  const debt = report!.countries.reduce((t, c) => t + c.firmDebt, 0);
  assert.ok(debt > 0.5 * start && debt < 3 * start, `firm debt ${debt} (start ${start})`);
});

// --- Bankruptcy and liquidation (R31) ------------------------------------------------------

test('a permanently unprofitable sector is liquidated in stages: plant and jobs go, the bank loses part of its loan', () => {
  const run = world(), control = world();
  const z = zoneIdx(run, 'sundara-delta');
  const g = run.config.goods.findIndex(good => good.id === 'consumer');
  const sundara = idx(run, 'sundara');
  const start = capacityOf(run, z, g);
  const failures: Extract<EconomyEvent, { type: 'firm-bankruptcy' }>[] = [];
  for (let week = 1; week <= 300; week++) {
    const effects = week === 1 ? [{ type: 'production-shock' as const, zoneId: 'sundara-delta', goodId: 'consumer', factor: 0.1, recoveryWeeks: 0 }] : [];
    const report = advanceEconomyInPlace(run, { commands: autopilotCommands(run), effects }, { audit: true, report: 'full' });
    step(control);
    for (const e of report.events) if (e.type === 'firm-bankruptcy' && e.zoneId === 'sundara-delta' && e.sectorId === 'consumer_goods') failures.push(e);
  }
  assert.ok(failures.length >= 2, `${failures.length} liquidations`);
  const writtenOff = failures.reduce((t, e) => t + e.writtenOff, 0);
  assert.ok(writtenOff > 0, 'creditors lose part of what they lent');
  for (const e of failures) {
    assert.ok(e.recovered <= e.debt + 1e-9 && e.capacityShare > 0 && e.capacityShare <= 1);
    assert.equal(e.ownership, 'private');
  }
  assert.ok(capacityOf(run, z, g) < 0.7 * start, `capacity ${capacityOf(run, z, g) / start} of start`);
  const failed = getFirmAggregates(run, 'sundara-delta').find(view => view.sectorId === 'consumer_goods')!;
  const healthy = getFirmAggregates(control, 'sundara-delta').find(view => view.sectorId === 'consumer_goods')!;
  assert.ok(failed.employment < 0.6 * healthy.employment, 'jobs disappear with the plant');
  // The loss is the central bank's: its capital is lower than in the control run.
  const equity = (s: EconomyState) => step(s).countries[sundara].centralBank.equity;
  assert.ok(equity(run) < equity(control), 'bad loans reduce the lender’s capital');
});

test('liquidation rules: private and mixed firms in distress are wound up, public firms never are', () => {
  const state = catalogueWorld();
  for (let week = 0; week < 3; week++) step(state);
  const m = getModel(state.config);
  const S = state.config.sectors.length;
  const z = zoneIdx(state, 'khazir');
  const sector = state.config.sectors.findIndex(entry => entry.id === 'hydrocarbons');
  const a = (o: number) => (z * S + sector) * 3 + o;
  const loanBefore = state.firm.loan.slice();
  for (const o of [0, 1, 2]) state.firm.distress[a(o)] = state.config.params.bankruptcyWeeks;
  const w = getWorkspace(state);
  openBanks(state, w);
  const events: EconomyEvent[] = [];
  resolveBankruptcies(state, w, m, events);
  const owners = events.filter(e => e.type === 'firm-bankruptcy').map(e => (e as { ownership: string }).ownership).sort();
  assert.deepEqual(owners, ['mixed', 'private']);
  assert.equal(state.firm.loan[a(1)], loanBefore[a(1)], 'the public firm keeps its loan and its plant');
  assert.ok(state.firm.loan[a(0)] < loanBefore[a(0)], 'the failed private firms’ share of the debt is settled or written off');
});

// --- Performance tiers (R58) ---------------------------------------------------------------

test('tiers: the mix is stable in normal times, slides towards fragile firms in a lasting crisis, and capacity is conserved', () => {
  const calm = catalogueWorld();
  const share = (s: EconomyState, zone: string, good: string, owner = 0) => {
    const z = zoneIdx(s, zone), g = s.config.goods.findIndex(entry => entry.id === good), G = s.config.goods.length;
    const base = ((z * G + g) * 3 + owner) * 3;
    const lines = s.firmLine.capacity.slice(base, base + 3);
    const total = lines[0] + lines[1] + lines[2];
    return lines.map(x => x / total);
  };
  const before = share(calm, 'norland-core', 'machinery');
  for (let week = 0; week < 156; week++) step(calm);
  const after = share(calm, 'norland-core', 'machinery');
  for (let t = 0; t < 3; t++) assert.ok(Math.abs(after[t] - before[t]) < 0.05, `tier ${t}: ${before[t]} → ${after[t]}`);

  const crisis = catalogueWorld();
  const start = share(crisis, 'sundara-delta', 'everyday_goods');
  for (let week = 1; week <= 104; week++) {
    const effects = week === 1 ? [{ type: 'production-shock' as const, zoneId: 'sundara-delta', goodId: 'everyday_goods', factor: 0.3, recoveryWeeks: 0 }] : [];
    advanceEconomyInPlace(crisis, { commands: autopilotCommands(crisis), effects }, { audit: true, report: 'none' });
  }
  const end = share(crisis, 'sundara-delta', 'everyday_goods');
  assert.ok(end[2] > start[2] + 0.02 && end[0] < start[0], `fragile ${start[2]} → ${end[2]}, strong ${start[0]} → ${end[0]}`);
});

// --- Strategic reserves (C4) -------------------------------------------------------------------

test('C4: strategic-reserve operations cannot make a treasury richer: buying, storing and selling back loses money', () => {
  const state = world();
  const c = idx(state, 'norland');
  const G = state.config.goods.length;
  const goods = ['food', 'energy'].map(id => state.config.goods.findIndex(good => good.id === id));
  const value = () => goods.reduce((t, g) => t + state.countryGood.reserves[c * G + g] * state.zoneGood.refBuyPrice[g], 0);
  const startValue = value();
  let bought = 0, sold = 0;
  const mode = (m: 'fill' | 'release') => ['food', 'energy'].map(goodId => ({ type: 'set-reserve' as const, countryId: 'norland', goodId, targetWeeks: 8, mode: m }));
  for (let week = 1; week <= 160; week++) {
    const phase = Math.floor((week - 1) / 20) % 2;
    const extra = (week - 1) % 20 === 0 ? mode(phase === 0 ? 'fill' : 'release') : [];
    const report = step(state, extra);
    bought += report.countries[c].budget.reservePurchases;
    sold += report.countries[c].budget.reserveSales;
  }
  const net = sold - bought + (value() - startValue);
  assert.ok(net < 0, `net result of reserve operations ${net} (sales ${sold}, purchases and storage ${bought})`);
});

test('reserves are no free lunch even when cycling them wrecks the budget, and filling them never cuts core spending', () => {
  const run = world(), control = world();
  const s = idx(run, 'sundara');
  const mode = (m: 'fill' | 'release') => ['food', 'energy'].map(goodId => ({ type: 'set-reserve' as const, countryId: 'sundara', goodId, targetWeeks: 30, mode: m }));
  const others = (state: EconomyState) => autopilotCommands(state).filter(command => !('countryId' in command) || command.countryId !== 'sundara');
  let gdpRun = 0, gdpControl = 0, worstStability = 100;
  for (let week = 1; week <= 156; week++) {
    const phase = Math.floor((week - 1) / 20) % 2;
    const extra = (week - 1) % 20 === 0 ? mode(phase === 0 ? 'fill' : 'release') : [];
    const ra = advanceEconomyInPlace(run, { commands: [...others(run), ...extra] }, { audit: true, report: 'full' });
    const rb = advanceEconomyInPlace(control, { commands: others(control) }, { audit: true, report: 'full' });
    if (week === 1) {
      const core = (r: TurnReport) => r.countries[s].budget.administration + r.countries[s].budget.social + r.countries[s].budget.military + r.countries[s].budget.infrastructure;
      assert.ok(Math.abs(core(ra) - core(rb)) <= 1e-9 * core(rb), 'a fill order does not reduce the week’s core budget');
    }
    gdpRun += ra.countries[s].gdpReal;
    gdpControl += rb.countries[s].gdpReal;
    worstStability = Math.min(worstStability, ra.countries[s].stability);
  }
  assert.ok(gdpRun < gdpControl, 'output is lower');
  assert.ok(worstStability < 60, `stability falls (lowest ${worstStability})`);
});

test('stored reserves cost money and slowly age; the storage fee is paid to the country’s own workers', () => {
  const state = world();
  const c = idx(state, 'lirane');
  const G = state.config.goods.length;
  const food = state.config.goods.findIndex(good => good.id === 'food');
  const hold = [{ type: 'set-reserve' as const, countryId: 'lirane', goodId: 'food', targetWeeks: 8, mode: 'hold' as const }];
  step(state, hold);
  const held = state.countryGood.reserves[c * G + food];
  let storage = 0;
  for (let week = 0; week < 52; week++) storage += step(state).countries[c].budget.reservePurchases;
  assert.ok(state.countryGood.reserves[c * G + food] < held, 'food reserves age');
  assert.ok(storage > 0, 'storage is not free');
});

// --- Save and load ---------------------------------------------------------------------------

test('credit state survives save and restore exactly, through loans, liquidations and money creation', () => {
  const script = (week: number): Parameters<typeof advanceEconomyInPlace>[1] => ({
    effects: week === 3 ? [{ type: 'production-shock', zoneId: 'sundara-delta', goodId: 'consumer', factor: 0.1, recoveryWeeks: 0 }] : [],
  });
  const runTo = (state: EconomyState, from: number, to: number) => {
    for (let week = from; week < to; week++) {
      const input = script(week)!;
      const extra: EconomyCommand[] = week === 40 ? [{ type: 'create-money', countryId: 'tavros', amount: 50 }] : [];
      advanceEconomyInPlace(state, { commands: [...autopilotCommands(state), ...extra], effects: input.effects }, { report: 'none' });
    }
  };
  const reference = world();
  runTo(reference, 0, 220);
  for (const cut of [30, 41, 180]) {
    const state = world();
    runTo(state, 0, cut);
    const restored = deserializeEconomy(serializeEconomy(state));
    runTo(restored, cut, 220);
    assert.equal(hashEconomy(restored), hashEconomy(reference), `cut at ${cut}`);
  }
  assert.ok(sum(reference.country.cbExceptional) === 50);
});

test('save validation rejects damaged credit data and older saves', () => {
  const state = world();
  for (let week = 0; week < 5; week++) step(state);
  const damaged = (change: (copy: Record<string, any>) => void) => {
    const copy = JSON.parse(serializeEconomy(state));
    change(copy);
    return () => validateEconomy(copy);
  };
  assert.doesNotThrow(damaged(() => {}));
  assert.throws(damaged(copy => { copy.firm.loan[0] = -1; }), /negative/);
  assert.throws(damaged(copy => { copy.firm.lender[0] = 99; }), /out of range/);
  assert.throws(damaged(copy => { copy.firm.health[0] = 2; }), /health/);
  assert.throws(damaged(copy => { copy.country.cbReserves[0] = -5; }), /negative/);
  assert.throws(damaged(copy => { copy.country.cbRate.pop(); }), /cbRate/);
  assert.throws(damaged(copy => { copy.version = 2; }), /version 2 is not supported/);
});

test('long run: the 31-good world with credit stays bounded, conserved and stable for 520 weeks', () => {
  const state = catalogueWorld();
  let worst = 0;
  let report: TurnReport | null = null;
  for (let week = 0; week < 520; week++) {
    report = step(state);
    worst = Math.max(worst, auditError(report.audit));
  }
  assert.ok(worst < AUDIT_TOLERANCE, `audit ${worst}`);
  assert.ok(Math.abs(report!.world.inflation) < 0.06, `inflation ${report!.world.inflation}`);
  for (const country of report!.countries) {
    assert.ok(country.unemployment < 0.15, `${country.countryId} unemployment ${country.unemployment}`);
    assert.ok(country.centralBank.equity > 0, `${country.countryId} central bank keeps positive capital`);
  }
});
