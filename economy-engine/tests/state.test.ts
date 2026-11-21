import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { EconomyCommand, EconomyEvent, EconomyState, ExternalEffect, TurnReport } from '../src/index.ts';
import {
  advanceEconomyInPlace, autopilotCommands, cloneEconomy, createConfig, createEconomy, createCatalogueWorldSpec,
  createTestWorldSpec, deserializeEconomy, getCountry, getFirmAggregates, getZone, hashEconomy, serializeEconomy,
  validateEconomy,
} from '../src/index.ts';
import { getModel, getWorkspace } from '../src/core/model.ts';
import { bankEquity, firmLoansByBank, openBanks } from '../src/core/credit.ts';
import * as ownership from '../src/core/ownership.ts';
import { fairValue, nationalize, privatize } from '../src/core/ownership.ts';
import { idx, setTreasury, world, zoneIdx } from './helpers.ts';

/**
 * Milestone 3: public firms (objectives, insolvency, support, recapitalisation),
 * ownership transfers, liquidated assets, central-bank recapitalisation, repeated
 * sovereign defaults, and normal versus exceptional monetary operations.
 */

let catalogueCache: EconomyState | null = null;
const catalogueWorld = () => cloneEconomy(catalogueCache ??= createEconomy(createCatalogueWorldSpec()));
const sum = (values: readonly number[]) => values.reduce((a, b) => a + b, 0);
const run = (s: EconomyState, commands: EconomyCommand[] = [], effects: ExternalEffect[] = []): TurnReport =>
  advanceEconomyInPlace(s, { commands: [...autopilotCommands(s), ...commands], effects }, { audit: true, report: 'full' });
const O = 3, T = 3;

/** Totals of an aggregate pair's plant per good, construction, cash and debt, to check conservation. */
function holdings(s: EconomyState, z: number, sector: number) {
  const m = getModel(s.config);
  const G = m.goodCount;
  let capacity = 0, building = 0, cash = 0, loan = 0, stockShare = 0;
  for (const g of m.sectorGoods[sector]) {
    for (let o = 0; o < O; o++) {
      const ownerIndex = (z * G + g) * O + o;
      for (let t = 0; t < T; t++) capacity += s.firmLine.capacity[ownerIndex * T + t];
      building += s.firmGood.build1[ownerIndex] + s.firmGood.build2[ownerIndex] + s.firmGood.build3[ownerIndex];
      stockShare += s.firmGood.stockShare[ownerIndex];
    }
  }
  for (let o = 0; o < O; o++) {
    const a = (z * m.sectorCount + sector) * O + o;
    cash += s.firm.cash[a];
    loan += s.firm.loan[a];
  }
  return { capacity, building, cash, loan, stockShare };
}
const money = (s: EconomyState) => sum(s.zone.householdMoney) + sum(s.firm.cash) + sum(s.country.treasury);

// --- Public firms (R03) and their insolvency ---------------------------------------------

test('public firms follow their objective: affordable prices lower the local price, at the state’s cost', () => {
  const control = catalogueWorld(), cheap = catalogueWorld();
  const z = zoneIdx(control, 'khazir');
  const G = control.config.goods.length;
  const crude = control.config.goods.findIndex(good => good.id === 'crude_oil');
  for (let week = 1; week <= 104; week++) {
    run(control);
    run(cheap, week === 1 ? [{ type: 'set-public-objective', countryId: 'khazir', sectorId: 'hydrocarbons', objective: 'affordable-prices' }] : []);
  }
  assert.ok(cheap.zoneGood.price[z * G + crude] < 0.97 * control.zoneGood.price[z * G + crude],
    `price ${cheap.zoneGood.price[z * G + crude]} vs ${control.zoneGood.price[z * G + crude]}`);
  assert.equal(getCountry(cheap, 'khazir').policy.publicObjective.hydrocarbons, 'affordable-prices');
  const publicCheap = getFirmAggregates(cheap, 'khazir').find(v => v.sectorId === 'hydrocarbons' && v.ownership === 'public')!;
  const publicNormal = getFirmAggregates(control, 'khazir').find(v => v.sectorId === 'hydrocarbons' && v.ownership === 'public')!;
  assert.ok(publicCheap.health < publicNormal.health, 'lower prices mean lower profits for the public firm');
});

test('maximum production: public firms keep producing at prices that stop private firms', () => {
  const control = catalogueWorld(), push = catalogueWorld();
  const effects: ExternalEffect[] = [];
  for (let week = 1; week <= 60; week++) {
    run(control, [], effects);
    run(push, week === 1 ? [{ type: 'set-public-objective', countryId: 'verdania', sectorId: 'all', objective: 'maximum-production' }] : [], effects);
  }
  const employed = (s: EconomyState) => getFirmAggregates(s, 'verdania').filter(v => v.ownership === 'public').reduce((t, v) => t + v.employment, 0);
  assert.ok(employed(push) >= employed(control) * 0.999, `public employment ${employed(push)} vs ${employed(control)}`);
});

test('strategic supply: public firms rebuild destroyed capacity faster than profit-seeking ones', () => {
  const rebuilt = (objective: 'profitability' | 'strategic-supply') => {
    const s = catalogueWorld();
    const z = zoneIdx(s, 'norland-core'), G = s.config.goods.length, g = s.config.goods.findIndex(good => good.id === 'electricity');
    const publicCapacity = () => { let t = 0; for (let k = 0; k < T; k++) t += s.firmLine.capacity[((z * G + g) * O + 1) * T + k]; return t; };
    const start = publicCapacity();
    for (let week = 1; week <= 156; week++) {
      const commands: EconomyCommand[] = week === 1 ? [{ type: 'set-public-objective', countryId: 'norland', sectorId: 'electricity', objective }] : [];
      const effects: ExternalEffect[] = week === 2 ? [{ type: 'destroy-capacity', zoneId: 'norland-core', goodId: 'electricity', fraction: 0.5 }] : [];
      run(s, commands, effects);
    }
    return publicCapacity() / start;
  };
  const normal = rebuilt('profitability'), strategic = rebuilt('strategic-supply');
  assert.ok(strategic > normal + 0.05, `strategic ${strategic} vs profitability ${normal}`);
});

test('a public firm in deep, lasting losses survives while the state supports it, at a real fiscal cost', () => {
  const state = catalogueWorld();
  const v = idx(state, 'verdania');
  let support = 0;
  const failures: string[] = [];
  for (let week = 1; week <= 160; week++) {
    const effects: ExternalEffect[] = week === 1 ? [{ type: 'production-shock', zoneId: 'verdania', goodId: 'electricity', factor: 0.05, recoveryWeeks: 0 }] : [];
    const report = run(state, [], effects);
    support += report.countries[v].budget.firmSupport;
    for (const e of report.events) if (e.type === 'firm-bankruptcy' && e.zoneId === 'verdania' && e.sectorId === 'electricity') failures.push(e.ownership);
  }
  assert.ok(support > 0, 'the treasury pays for the support');
  assert.ok(!failures.includes('public'), `the public firm is not liquidated (failures: ${failures.join(', ')})`);
  assert.ok(failures.includes('private'), 'unsupported private firms in the same sector fail');
  const publicFirm = getFirmAggregates(state, 'verdania').find(view => view.sectorId === 'electricity' && view.ownership === 'public')!;
  assert.ok(publicFirm.health < -0.5, 'it is still losing money');
});

test('without state support a public firm can become insolvent and be liquidated; its plant is kept for sale, not destroyed', () => {
  const state = catalogueWorld();
  const z = zoneIdx(state, 'verdania');
  const G = state.config.goods.length;
  const e = state.config.goods.findIndex(good => good.id === 'electricity');
  const failures: Extract<EconomyEvent, { type: 'firm-bankruptcy' }>[] = [];
  for (let week = 1; week <= 160; week++) {
    const commands: EconomyCommand[] = week === 1 ? [{ type: 'set-public-support', countryId: 'verdania', sectorId: 'all', enabled: false }] : [];
    const effects: ExternalEffect[] = week === 1 ? [{ type: 'production-shock', zoneId: 'verdania', goodId: 'electricity', factor: 0.05, recoveryWeeks: 0 }] : [];
    const report = run(state, commands, effects);
    for (const ev of report.events) if (ev.type === 'firm-bankruptcy' && ev.zoneId === 'verdania' && ev.sectorId === 'electricity') failures.push(ev);
  }
  const publicFailure = failures.find(ev => ev.ownership === 'public');
  assert.ok(publicFailure, 'the public firm was liquidated');
  assert.ok(publicFailure!.assetsHeld > 0 || publicFailure!.assetsSold > 0, 'its plant was sold or kept for sale');
  assert.ok(state.zoneGood.idleCapacity[z * G + e] > 0 && state.zoneGood.idleHolder[z * G + e] === idx(state, 'verdania'),
    'the creditor bank holds the plant');
  assert.ok(getZone(state, 'verdania').goods[e].plantForSale > 0);
});

test('the state can recapitalise a public firm: real treasury money becomes firm cash or repays its bank debt', () => {
  const state = catalogueWorld();
  for (let week = 0; week < 5; week++) run(state);
  const z = zoneIdx(state, 'khazir');
  const k = idx(state, 'khazir');
  const S = state.config.sectors.length;
  const sector = state.config.sectors.findIndex(entry => entry.id === 'hydrocarbons');
  const a = (z * S + sector) * O + 1;
  setTreasury(state, k, state.country.treasury[k] + 100);
  const commandReport = advanceEconomyInPlace(state, { commands: [
    { type: 'recapitalize-firm', countryId: 'khazir', zoneId: 'khazir', sectorId: 'hydrocarbons', ownership: 'public', amount: 30 },
    { type: 'recapitalize-firm', countryId: 'khazir', zoneId: 'khazir', sectorId: 'hydrocarbons', ownership: 'public', amount: 20, use: 'debt' },
  ] }, { audit: true, report: 'full' });
  assert.ok(commandReport.countries[k].budget.firmSupport >= 50 - 1e-9, 'through the command path it is a budget cost');
  // The command path is checked in the budget; the exact flows are checked directly below.
  const fresh = catalogueWorld();
  for (let week = 0; week < 5; week++) run(fresh);
  setTreasury(fresh, k, fresh.country.treasury[k] + 100);
  const t0 = fresh.country.treasury[k], c0 = fresh.firm.cash[a], l0 = fresh.firm.loan[a], i0 = fresh.country.cbIssued[k], m0 = money(fresh);
  const ws = getWorkspace(fresh);
  ownership.recapitalizeFirm(fresh, ws, k, a, 30, false);
  ownership.recapitalizeFirm(fresh, ws, k, a, 20, true);
  assert.ok(Math.abs(fresh.country.treasury[k] - (t0 - 50)) < 1e-9);
  assert.ok(Math.abs(fresh.firm.cash[a] - (c0 + 30)) < 1e-9);
  assert.ok(Math.abs(fresh.firm.loan[a] - (l0 - 20)) < 1e-9);
  assert.ok(Math.abs(fresh.country.cbIssued[k] - (i0 - 20)) < 1e-9, 'debt repaid to the bank leaves circulation');
  assert.ok(Math.abs(money(fresh) - (m0 - 20)) < 1e-9, 'no money is created');
  assert.ok(Math.abs(ws.spentFirmSupport[k] - 50) < 1e-9, 'it is recorded as a fiscal cost');
});

// --- Ownership transfers (R02) and liquidated assets (R32) ----------------------------------

test('nationalisation and privatisation move plant, construction, stock, cash and debt between owners without loss', () => {
  const state = catalogueWorld();
  for (let week = 0; week < 10; week++) run(state);
  const m = getModel(state.config);
  const z = zoneIdx(state, 'norland-core');
  const c = idx(state, 'norland');
  const sector = state.config.sectors.findIndex(entry => entry.id === 'manufacturing');
  setTreasury(state, c, state.country.treasury[c] + 2 * fairValue(state, m, z, sector, 0));
  const before = holdings(state, z, sector);
  const totalMoney = money(state);
  const treasury = state.country.treasury[c];
  const households = state.zone.householdMoney[z];
  const price = fairValue(state, m, z, sector, 0) * 0.5;
  const w = getWorkspace(state);
  const taken = nationalize(state, w, m, c, z, sector, 0.5, 0);
  assert.equal(taken, 0.5);
  const after = holdings(state, z, sector);
  for (const key of Object.keys(before) as (keyof typeof before)[]) {
    assert.ok(Math.abs(after[key] - before[key]) <= 1e-9 * Math.max(1, Math.abs(before[key])), `${key} conserved`);
  }
  assert.ok(Math.abs(state.country.treasury[c] - (treasury - price)) < 1e-9, 'the state pays the fair price');
  assert.ok(Math.abs(state.zone.householdMoney[z] - (households + price)) < 1e-9, 'to the private owners');
  assert.ok(Math.abs(money(state) - totalMoney) < 1e-9 * totalMoney, 'no money is created');
  const publicNow = getFirmAggregates(state, 'norland-core').find(v => v.sectorId === 'manufacturing' && v.ownership === 'public')!;
  assert.ok(publicNow.lines.length > 0 && publicNow.loan > 0, 'the public firm now owns plant and owes the debt that came with it');
  // Privatise it again: same conservation, money flows back.
  const sold = privatize(state, w, m, c, z, sector, 1, 0);
  assert.ok(sold > 0);
  const back = holdings(state, z, sector);
  for (const key of Object.keys(before) as (keyof typeof before)[]) {
    assert.ok(Math.abs(back[key] - before[key]) <= 1e-9 * Math.max(1, Math.abs(before[key])), `${key} conserved`);
  }
  assert.ok(Math.abs(money(state) - totalMoney) < 1e-9 * totalMoney);
  assert.ok(w.spentOwnership[c] > 0 && w.revenueOwnership[c] > 0, 'both are recorded in the budget');
});

test('a nationalisation the treasury cannot afford transfers only what it can pay for', () => {
  const state = catalogueWorld();
  const m = getModel(state.config);
  const z = zoneIdx(state, 'norland-core');
  const c = idx(state, 'norland');
  const sector = state.config.sectors.findIndex(entry => entry.id === 'manufacturing');
  const price = fairValue(state, m, z, sector, 0);
  setTreasury(state, c, price * 0.2);
  const taken = nationalize(state, getWorkspace(state), m, c, z, sector, 1, 0);
  assert.ok(Math.abs(taken - 0.2) < 1e-9, `share ${taken}`);
  assert.ok(state.country.treasury[c] >= -1e-9);
});

test('ownership commands are validated and only act on the country’s own territory', () => {
  const state = world();
  assert.throws(() => advanceEconomyInPlace(state, { commands: [{ type: 'nationalize', countryId: 'norland', zoneId: 'khazir', sectorId: 'hydrocarbons', share: 0.5 }] }), /not controlled/);
  assert.throws(() => advanceEconomyInPlace(state, { commands: [{ type: 'nationalize', countryId: 'norland', zoneId: 'norland-core', sectorId: 'heavy_industry', share: 2 }] }), /Share/);
  assert.throws(() => advanceEconomyInPlace(state, { commands: [{ type: 'set-public-objective', countryId: 'norland', sectorId: 'all', objective: 'world-domination' as never }] }), /objective/);
  assert.throws(() => advanceEconomyInPlace(state, { commands: [{ type: 'recapitalize-firm', countryId: 'norland', zoneId: 'norland-core', sectorId: 'heavy_industry', ownership: 'private' as never, amount: 1 }] }), /public or mixed/);
  // A whole-sector transfer through the command path keeps the audit clean.
  const report = advanceEconomyInPlace(state, { commands: [{ type: 'nationalize', countryId: 'norland', zoneId: 'norland-core', sectorId: 'heavy_industry', share: 0.3 }] }, { audit: true, report: 'full' });
  assert.ok(report.countries[idx(state, 'norland')].budget.ownershipPurchases > 0);
});

test('the state can buy liquidated plant held by its bank, without taking over the old debt (R32)', () => {
  const state = catalogueWorld();
  const z = zoneIdx(state, 'verdania');
  const v = idx(state, 'verdania');
  const G = state.config.goods.length;
  const e = state.config.goods.findIndex(good => good.id === 'electricity');
  for (let week = 1; week <= 160 && !(state.zoneGood.idleCapacity[z * G + e] > 0); week++) {
    const commands: EconomyCommand[] = week === 1 ? [{ type: 'set-public-support', countryId: 'verdania', sectorId: 'all', enabled: false }] : [];
    const effects: ExternalEffect[] = week === 1 ? [{ type: 'production-shock', zoneId: 'verdania', goodId: 'electricity', factor: 0.05, recoveryWeeks: 0 }] : [];
    run(state, commands, effects);
  }
  const units = state.zoneGood.idleCapacity[z * G + e];
  const price = state.zoneGood.idleValue[z * G + e];
  assert.ok(units > 0, 'liquidated plant is held for sale');
  setTreasury(state, v, state.country.treasury[v] + 2 * price + 10);
  const publicCapacity = () => { let t = 0; for (let k = 0; k < T; k++) t += state.firmLine.capacity[((z * G + e) * O + 1) * T + k]; return t; };
  const loansBefore = new Float64Array(state.countries.length); firmLoansByBank(state, loansBefore);
  const capacityBefore = publicCapacity();
  const publicDebt = getFirmAggregates(state, 'verdania').find(view => view.sectorId === 'electricity' && view.ownership === 'public')?.loan ?? 0;
  const report = advanceEconomyInPlace(state, { commands: [{ type: 'acquire-assets', countryId: 'verdania', zoneId: 'verdania', goodId: 'electricity' }] }, { audit: true, report: 'full' });
  assert.equal(state.zoneGood.idleCapacity[z * G + e], 0, 'all of it was bought');
  assert.ok(publicCapacity() > capacityBefore + 0.5 * units, 'it now belongs to the public firm');
  assert.ok(report.countries[v].budget.ownershipPurchases >= price * 0.99, 'the state paid for it');
  const debtNow = getFirmAggregates(state, 'verdania').find(view => view.sectorId === 'electricity' && view.ownership === 'public')?.loan ?? 0;
  assert.ok(debtNow <= publicDebt + 1e-6 + 0.5 * price, 'no old debt was taken over');
});

// --- Central banks: normal versus exceptional operations, exploits ---------------------------

test('normal monetary operations: no automatic bond purchases; money changes only with real loans', () => {
  const state = world();
  const reserves = state.country.cbReserves.slice();
  for (let week = 0; week < 260; week++) {
    const report = run(state);
    for (const country of report.countries) {
      assert.equal(country.budget.moneyCreation, 0);
      assert.equal(country.centralBank.loansToState, 0, 'calm states never need central-bank credit, and none is pushed on them');
    }
  }
  assert.deepEqual(state.country.cbReserves, reserves, 'reserves never move: money comes and goes only through loans');
});

test('a state cannot obtain central-bank credit beyond the ordinary limit, and the credit is repaid, not rolled over for ever', () => {
  const spec = createTestWorldSpec();
  spec.config = createConfig({ lendableShare: 0 });
  const state = createEconomy(spec);
  const t = idx(state, 'tavros');
  const others = () => autopilotCommands(state).filter(command => !('countryId' in command) || command.countryId !== 'tavros');
  let lent = 0;
  for (let week = 1; week <= 208; week++) {
    const commands: EconomyCommand[] = week === 1 ? [{ type: 'set-spending', countryId: 'tavros', category: 'social', share: 0.25 }] : [];
    const report = advanceEconomyInPlace(state, { commands: [...others(), ...commands] }, { audit: true, report: 'full' });
    const cb = report.countries[t].centralBank;
    lent += report.countries[t].budget.borrowedFromCentralBank;
    assert.ok(cb.loansToState <= state.config.params.cbStateLimit * 52 * state.country.gdp[t] * 1.02, `week ${week}: ${cb.loansToState}`);
    assert.ok(cb.loansToState + cb.loansToFirms <= cb.lendingCapacity * (1 + 1e-9));
  }
  assert.ok(lent > 0, 'the state did borrow from its bank');
  assert.ok(lent > 1.5 * state.country.cbStateLoans[t], 'instalments were repaid and had to be borrowed again within the limit');
});

test('exploit: borrowing from the central bank to recapitalise it adds no capital', () => {
  const state = world();
  for (let week = 0; week < 5; week++) run(state);
  const n = idx(state, 'norland');
  const w = getWorkspace(state);
  openBanks(state, w);
  const loans = new Float64Array(state.countries.length);
  firmLoansByBank(state, loans);
  const equityBefore = bankEquity(state, n, loans[n]);
  // The state borrows 100 from its bank...
  state.country.cbStateLoans[n] += 100;
  state.country.cbIssued[n] += 100;
  state.country.treasury[n] += 100;
  assert.ok(Math.abs(bankEquity(state, n, loans[n]) - equityBefore) < 1e-9, 'lending does not change capital');
  // ...and pays it back in as "capital": it only repays the loan.
  advanceEconomyInPlace(state, { commands: [{ type: 'recapitalize-central-bank', countryId: 'norland', amount: 100 }] }, { audit: true, report: 'none' });
  firmLoansByBank(state, loans);
  assert.ok(state.country.cbStateLoans[n] < 1e-6, 'the payment repaid the loan first');
  const report = advanceEconomyInPlace(state, undefined, { audit: true, report: 'full' });
  assert.equal(report.countries[n].budget.centralBankCapital, 0);
});

test('recapitalising the central bank with real treasury money raises its capital by exactly that amount', () => {
  const state = world();
  for (let week = 0; week < 5; week++) run(state);
  const n = idx(state, 'norland');
  setTreasury(state, n, state.country.treasury[n] + 200);
  const loans = new Float64Array(state.countries.length);
  firmLoansByBank(state, loans);
  const equity = bankEquity(state, n, loans[n]);
  const totalMoney = money(state);
  const w = getWorkspace(state);
  ownership.recapitalizeBank(state, w, n, 150);
  assert.ok(Math.abs(bankEquity(state, n, loans[n]) - (equity + 150)) < 1e-9);
  assert.ok(Math.abs(money(state) - (totalMoney - 150)) < 1e-9, 'the money leaves circulation: nothing is created');
  assert.equal(w.spentCentralBankCapital[n], 150);
});

test('exceptional money creation is never automatic and always needs the explicit command', () => {
  const state = catalogueWorld();
  for (let week = 0; week < 156; week++) {
    const commands = autopilotCommands(state);
    assert.ok(!commands.some(command => command.type === 'create-money'));
    advanceEconomyInPlace(state, { commands }, { report: 'none' });
  }
  assert.equal(sum(state.country.cbExceptional), 0);
  const report = run(state, [{ type: 'create-money', countryId: 'sundara', amount: 10 }]);
  assert.equal(report.countries[idx(state, 'sundara')].centralBank.exceptionalMoney, 10);
});

// --- Repeated sovereign defaults (C3) ----------------------------------------------------------

test('repeated defaults cannot erase debt cheaply: creditors concede far less each time, consequences grow', () => {
  const a = world(), b = world();
  const n = idx(a, 'norland');
  const ratio = (s: EconomyState) => (s.country.debt[n] + s.country.cbStateLoans[n]) / (52 * s.country.gdp[n]);
  const writeOffs: number[] = [];
  const haircuts: number[] = [];
  let stability = 100, gdpA = 0, gdpB = 0;
  for (let week = 1; week <= 260; week++) {
    const commands: EconomyCommand[] = week % 26 === 1 ? [{ type: 'declare-default', countryId: 'norland' }] : [];
    const ra = run(a, commands);
    const rb = run(b);
    for (const e of ra.events) if (e.type === 'sovereign-default' && e.countryId === 'norland') { writeOffs.push(e.debtWrittenOff); haircuts.push(e.haircut); }
    stability = Math.min(stability, ra.countries[n].stability);
    gdpA += ra.countries[n].gdpReal; gdpB += rb.countries[n].gdpReal;
  }
  assert.ok(writeOffs.length >= 5);
  assert.ok(sum(writeOffs.slice(1)) < 0.1 * writeOffs[0], `later defaults write off little: ${writeOffs.map(x => x.toFixed(0)).join(', ')}`);
  for (let i = 1; i < haircuts.length; i++) assert.ok(haircuts[i] <= haircuts[0] / 4 + 1e-12, `haircut ${haircuts[i]}`);
  assert.ok(ratio(a) > 0.15, `debt is not erased: ${ratio(a)}`);
  assert.ok(stability < 20, `severe political cost (lowest stability ${stability})`);
  assert.ok(gdpA < 0.9 * gdpB, 'and a lasting economic cost');
  assert.ok(a.country.defaultMemory[n] > 5, 'the record of defaults is kept');
});

test('the memory of a default fades, so a single default long ago does not weigh for ever', () => {
  const state = world();
  const n = idx(state, 'norland');
  run(state, [{ type: 'declare-default', countryId: 'norland' }]);
  const start = state.country.defaultMemory[n];
  assert.ok(start > 0.99, `memory after the default ${start}`);
  for (let week = 0; week < 520; week++) advanceEconomyInPlace(state, { commands: autopilotCommands(state) }, { report: 'none' });
  assert.ok(state.country.defaultMemory[n] < 0.5 * start, `memory ${state.country.defaultMemory[n]}`);
});

// --- Determinism and saves -----------------------------------------------------------------------

test('state and ownership operations replay identically after save and restore', () => {
  const script = (week: number): EconomyCommand[] => week === 3 ? [{ type: 'set-public-objective', countryId: 'khazir', sectorId: 'hydrocarbons', objective: 'strategic-supply' }]
    : week === 20 ? [{ type: 'nationalize', countryId: 'norland', zoneId: 'norland-core', sectorId: 'manufacturing', share: 0.4 }]
      : week === 60 ? [{ type: 'privatize', countryId: 'norland', zoneId: 'norland-core', sectorId: 'manufacturing', share: 0.5 }]
        : week === 80 ? [{ type: 'recapitalize-central-bank', countryId: 'sundara', amount: 20 }] : [];
  const drive = (s: EconomyState, from: number, to: number) => {
    for (let week = from; week < to; week++) advanceEconomyInPlace(s, { commands: [...autopilotCommands(s), ...script(week)] }, { report: 'none' });
  };
  const reference = catalogueWorld();
  drive(reference, 0, 120);
  for (const cut of [10, 61]) {
    const s = catalogueWorld();
    drive(s, 0, cut);
    const restored = deserializeEconomy(serializeEconomy(s));
    drive(restored, cut, 120);
    assert.equal(hashEconomy(restored), hashEconomy(reference), `cut ${cut}`);
  }
});

test('save validation covers the new fields and rejects older saves', () => {
  const state = world();
  const damaged = (change: (copy: Record<string, any>) => void) => {
    const copy = JSON.parse(serializeEconomy(state));
    change(copy);
    return () => validateEconomy(copy);
  };
  assert.doesNotThrow(damaged(() => {}));
  assert.throws(damaged(copy => { copy.countrySector.publicObjective[0] = 7; }), /publicObjective/);
  assert.throws(damaged(copy => { copy.countrySector.publicSupport[0] = 0.5; }), /publicSupport/);
  assert.throws(damaged(copy => { copy.zoneGood.idleHolder[0] = 99; }), /idleHolder/);
  assert.throws(damaged(copy => { copy.zoneGood.idleCapacity[0] = 1; }), /holder/);
  assert.throws(damaged(copy => { copy.country.defaultMemory[0] = -1; }), /negative/);
  assert.throws(damaged(copy => { copy.version = 3; }), /version 3 is not supported/);
});

