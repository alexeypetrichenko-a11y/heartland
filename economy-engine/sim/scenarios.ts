import type { CountryId, EconomyState, TurnInput, TurnReport } from '../src/index.ts';
import { cloneEconomy, createEconomy, createTestWorldSpec, KELL_STRAIT_LANES } from '../src/index.ts';
import type { SimulationResult } from './runner.ts';
import { argMin, mean, maximum, minimum, runSimulation } from './runner.ts';

/**
 * The ten mandatory scenarios.
 *
 * Every scenario runs twice from the identical starting state: a control run
 * (no event) and the scenario run. All governments are steered by the same
 * rule-based fiscal autopilot in both, so a difference between the two runs is
 * caused by the event and by the economy's reaction, not by a human player.
 * Each scenario reports measured indicators, checks that the expected
 * mechanism really appeared, and a plain-language explanation.
 */

export interface Indicator { label: string; value: number | string; unit?: string; note?: string }
export interface Check { name: string; pass: boolean; detail: string }
export interface ScenarioResult {
  id: number;
  title: string;
  setup: string;
  weeks: number;
  indicators: Indicator[];
  /** Rows of selected weeks for the most telling series. */
  table: { caption: string; headers: string[]; rows: (string | number)[][] };
  mechanisms: string[];
  checks: Check[];
  observations: string[];
  runtimeMs: number;
}
export interface ScenarioDef { id: number; title: string; run: (ctx: Context) => ScenarioResult }

const SHOCK = 53;
const pct = (x: number, digits = 1) => `${(x * 100).toFixed(digits)}%`;
const f = (x: number, digits = 2) => x.toFixed(digits);

/** Shared starting state; every run works on its own copy. */
export class Context {
  readonly start: EconomyState;
  private readonly controls = new Map<string, SimulationResult>();
  constructor(start?: EconomyState) { this.start = start ?? createEconomy(createTestWorldSpec()); }
  copy(): EconomyState { return cloneEconomy(this.start); }
  control(weeks: number, state: EconomyState = this.start, key = 'main'): SimulationResult {
    const id = `${key}:${weeks}`;
    let result = this.controls.get(id);
    if (!result) { result = runSimulation(cloneEconomy(state), { turns: weeks, autopilot: true, audit: true }); this.controls.set(id, result); }
    return result;
  }
}

function idx(state: EconomyState, countryId: CountryId): number {
  return state.countries.findIndex(country => country.id === countryId);
}

/** Mean of scenario/control for a country series over weeks [from, to] (1-based, inclusive). */
function ratio(run: SimulationResult, ctl: SimulationResult, countryId: CountryId, metric: 'gdpReal' | 'consumptionPerCapita' | 'gdpRealPerCapita' | 'exports' | 'imports',
  from: number, to: number): number {
  const a = mean(run.series.countries[countryId][metric], from - 1, to);
  const b = mean(ctl.series.countries[countryId][metric], from - 1, to);
  return b > 0 ? a / b : 0;
}
function goodRatio(run: SimulationResult, ctl: SimulationResult, countryId: CountryId, goodId: string, from: number, to: number): number {
  const a = mean(run.series.countries[countryId].buyPrice[goodId], from - 1, to);
  const b = mean(ctl.series.countries[countryId].buyPrice[goodId], from - 1, to);
  return b > 0 ? a / b : 0;
}

/** First week at or after `from` from which `values` stays at or above `level` for `hold` weeks. */
function recoveryWeek(values: readonly number[], from: number, level: number, hold = 13): number | null {
  for (let i = from; i + hold <= values.length; i++) {
    let ok = true;
    for (let k = 0; k < hold; k++) if (values[i + k] < level) { ok = false; break; }
    if (ok) return i + 1;
  }
  return null;
}

/** Collects bilateral trade flows between countries per named period. */
function tradeMonitor(state: EconomyState, goodId: string, periods: { name: string; from: number; to: number }[]) {
  const flows = periods.map(() => new Map<string, number>());
  const zoneCountry = state.zones.map((_, z) => state.countries[state.zone.owner[z]].id);
  const production = periods.map(() => new Map<string, number>());
  const stocks = new Map<number, number[]>();
  const g = state.config.goods.findIndex(good => good.id === goodId);
  const G = state.config.goods.length;
  const wanted = new Set<number>();
  for (const period of periods) { wanted.add(period.from - 1); wanted.add(period.to); }
  return {
    flows, production, stocks,
    onReport(report: TurnReport, current: EconomyState) {
      periods.forEach((period, p) => {
        if (report.turn < period.from || report.turn > period.to) return;
        for (const flow of report.trade ?? []) {
          if (flow.goodId !== goodId) continue;
          const key = `${zoneCountry[current.zones.findIndex(zone => zone.id === flow.fromZoneId)]}>${zoneCountry[current.zones.findIndex(zone => zone.id === flow.toZoneId)]}`;
          flows[p].set(key, (flows[p].get(key) ?? 0) + flow.quantity);
        }
        for (const country of report.countries) production[p].set(country.countryId, (production[p].get(country.countryId) ?? 0) + country.output[g]);
      });
      if (wanted.has(report.turn)) {
        const perCountry = new Array<number>(current.countries.length).fill(0);
        for (let z = 0; z < current.zones.length; z++) perCountry[current.zone.owner[z]] += current.zoneGood.stock[z * G + g];
        stocks.set(report.turn, perCountry);
      }
    },
  };
}
function flowBetween(flows: Map<string, number>, from: readonly string[], to: readonly string[]): number {
  let total = 0;
  for (const [key, quantity] of flows) {
    const [a, b] = key.split('>');
    if (from.includes(a) && to.includes(b) && a !== b) total += quantity;
  }
  return total;
}

function scenarioRun(ctx: Context, weeks: number, script: (week: number, s: EconomyState) => TurnInput | undefined,
  extra: { tradeDetail?: boolean; onReport?: (r: TurnReport, s: EconomyState) => void; state?: EconomyState } = {}): SimulationResult {
  return runSimulation(extra.state ?? ctx.copy(), { turns: weeks, autopilot: true, audit: true, script, tradeDetail: extra.tradeDetail, onReport: extra.onReport });
}

const at = (weeks: number[], values: (week: number) => (string | number)[]) => weeks.map(values);

// ---------------------------------------------------------------------------
// 1. Stable world over a long period
// ---------------------------------------------------------------------------
function scenario1(ctx: Context): ScenarioResult {
  const t0 = performance.now();
  const weeks = 1040;
  const r = ctx.control(weeks);
  const s = r.series;
  const years = [1, 5, 10, 15, 20];
  const growth = Math.pow(s.world.gdpReal[weeks - 1] / s.world.gdpReal[0], 52 / weeks) - 1;
  const infl = mean(s.world.inflation);
  const worstUnemployment = Math.max(...Object.values(s.countries).map(c => maximum(c.unemployment)));
  const meanUnemployment = mean(Object.values(s.countries).map(c => mean(c.unemployment)));
  const maxDebt = Math.max(...Object.values(s.countries).map(c => maximum(c.debtToGdp)));
  const regimeChanges = r.events.filter(e => e.type === 'regime-change').length;
  const defaults = r.events.filter(e => e.type === 'sovereign-default').length;
  return {
    id: 1, title: 'Stable global economy over an extended period', weeks,
    setup: 'No event. Nine countries, eleven production zones, all governments on the fiscal autopilot, 20 simulated years.',
    indicators: [
      { label: 'World real GDP growth', value: pct(growth), unit: 'per year', note: 'technology trend plus catch-up of poorer zones' },
      { label: 'World inflation (mean)', value: pct(infl), note: 'monetary rule targets 2%' },
      { label: 'Unemployment (mean of countries)', value: pct(meanUnemployment) },
      { label: 'Unemployment (worst country-week)', value: pct(worstUnemployment) },
      { label: 'Highest public debt / GDP', value: pct(maxDebt, 0) },
      { label: 'Sovereign defaults', value: defaults },
      { label: 'Regime changes', value: regimeChanges },
      { label: 'Worst conservation error', value: r.worstAuditError.toExponential(1), note: 'goods, money and bonds, every week' },
    ],
    table: {
      caption: 'World aggregates at the end of selected years',
      headers: ['Year', 'World GDP (real)', 'Inflation', 'Interest rate', 'Money supply', 'Public debt'],
      rows: at(years, y => { const i = Math.min(weeks, y * 52) - 1; return [y, f(s.world.gdpReal[i], 1), pct(s.world.inflation[i]), pct(s.world.interestRate[i]), f(s.world.money[i], 0), f(s.world.debt[i], 0)]; }),
    },
    mechanisms: [
      'Firms plan output from smoothed sales, stock cover and price/cost margins; households spend a share of expected income; prices adjust to inventory gaps; wages follow unemployment and inflation.',
      'The world monetary rule creates just enough money for real growth plus 2% inflation, so prices drift slowly while money, GDP and debt grow together instead of diverging.',
      'Autopilot governments keep budgets near balance, so debt/GDP drifts to a comfortable level rather than exploding or vanishing.',
    ],
    checks: [
      { name: 'Real GDP grows (no stagnation or collapse)', pass: growth > 0.003 && growth < 0.04, detail: `${pct(growth)} per year` },
      { name: 'Inflation stays moderate', pass: infl > -0.02 && infl < 0.06, detail: pct(infl) },
      { name: 'No sovereign default or regime change without a shock', pass: defaults === 0 && regimeChanges === 0, detail: `${defaults} defaults, ${regimeChanges} regime changes` },
      { name: 'Debt ratios stay bounded', pass: maxDebt < 1.2, detail: pct(maxDebt, 0) },
      { name: 'Conservation holds every week', pass: r.worstAuditError < 1e-9, detail: r.worstAuditError.toExponential(1) },
    ],
    observations: [],
    runtimeMs: performance.now() - t0,
  };
}

// ---------------------------------------------------------------------------
// 2. Oil embargo between several countries
// ---------------------------------------------------------------------------
function scenario2(ctx: Context): ScenarioResult {
  const t0 = performance.now();
  const weeks = 260, end = 156;
  const exporters = ['khazir', 'halcyon'], targets = ['norland', 'ostmark'];
  const sanctions = (imports: boolean, exports: boolean): TurnInput['commands'] => exporters.flatMap(countryId => targets.map(targetId => (
    { type: 'set-sanction' as const, countryId, targetId, goodIds: ['energy'], imports, exports })));
  const state = ctx.copy();
  const monitor = tradeMonitor(state, 'energy', [{ name: 'before', from: 1, to: SHOCK - 1 }, { name: 'embargo', from: SHOCK, to: end }]);
  const ctl = ctx.control(weeks);
  const run = scenarioRun(ctx, weeks, w => w === SHOCK ? { commands: sanctions(false, true) } : w === end + 1 ? { commands: sanctions(false, false) } : undefined,
    { state, tradeDetail: true, onReport: monitor.onReport });
  const [before, during] = monitor.flows;
  const direct = flowBetween(during, exporters, targets);
  const beforeDirect = flowBetween(before, exporters, targets) / (SHOCK - 1);
  const others = state.countries.map(c => c.id).filter(id => !exporters.includes(id) && !targets.includes(id));
  const toTargetsBefore = flowBetween(before, others, targets) / (SHOCK - 1);
  const toTargetsDuring = flowBetween(during, others, targets) / (end - SHOCK + 1);
  const exportersToOthersBefore = flowBetween(before, exporters, others) / (SHOCK - 1);
  const exportersToOthersDuring = flowBetween(during, exporters, others) / (end - SHOCK + 1);
  // Laundering test: a third country can only sell energy it produced itself or held in stock.
  const sundaraExports = [...during].filter(([key]) => key.startsWith('sundara>') && key !== 'sundara>sundara').reduce((total, [, q]) => total + q, 0);
  const sundaraProduction = monitor.production[1].get('sundara') ?? 0;
  const stockStart = monitor.stocks.get(SHOCK - 1)?.[idx(state, 'sundara')] ?? 0;
  const stockEnd = monitor.stocks.get(end)?.[idx(state, 'sundara')] ?? 0;
  const allowance = sundaraProduction + stockStart - stockEnd;
  const peak = (id: CountryId) => maximum(run.series.countries[id].buyPrice.energy.map((v, i) => v / ctl.series.countries[id].buyPrice.energy[i]), SHOCK, end);
  const gdpTargets = targets.map(id => ratio(run, ctl, id, 'gdpReal', SHOCK, end));
  const gdpExporters = exporters.map(id => ratio(run, ctl, id, 'gdpReal', SHOCK, end));
  const peaks = targets.map(peak);
  return {
    id: 2, title: 'Oil embargo between several countries', weeks,
    setup: `Weeks ${SHOCK}-${end}: Khazir and Halcyon (energy exporters) forbid energy exports to Norland and Ostmark (importers). The embargo is lifted in week ${end + 1}.`,
    indicators: [
      { label: 'Direct energy flow exporters → targets', value: f(direct, 3), note: `was ${f(beforeDirect, 2)} per week before` },
      { label: 'Energy supplied to targets by other countries', value: `${f(toTargetsDuring, 2)} per week`, note: `was ${f(toTargetsBefore, 2)} before (redirection)` },
      { label: 'Exporters\' sales to other buyers', value: `${f(exportersToOthersDuring, 2)} per week`, note: `was ${f(exportersToOthersBefore, 2)} before` },
      { label: 'Peak energy price, Norland / Ostmark', value: `${f(peaks[0], 2)}x / ${f(peaks[1], 2)}x`, note: 'versus control' },
      { label: 'Real GDP of targets during embargo', value: `${pct(gdpTargets[0] - 1)} / ${pct(gdpTargets[1] - 1)}`, note: 'Norland / Ostmark vs control' },
      { label: 'Real GDP of exporters during embargo', value: `${pct(gdpExporters[0] - 1)} / ${pct(gdpExporters[1] - 1)}`, note: 'Khazir / Halcyon vs control' },
      { label: 'Third-country (Sundara) energy exports vs own supply', value: `${f(sundaraExports, 1)} ≤ ${f(allowance, 1)}`, note: 'no re-export of embargoed energy' },
    ],
    table: {
      caption: 'Energy price paid and real GDP relative to the control run',
      headers: ['Week', 'Norland price', 'Ostmark price', 'Norland GDP', 'Khazir GDP', 'Khazir unemployment'],
      rows: at([SHOCK - 1, SHOCK + 4, SHOCK + 13, SHOCK + 52, end, end + 13, end + 52, weeks], w => [w,
        `${f(goodRatio(run, ctl, 'norland', 'energy', w, w))}x`, `${f(goodRatio(run, ctl, 'ostmark', 'energy', w, w))}x`,
        pct(ratio(run, ctl, 'norland', 'gdpReal', w, w)), pct(ratio(run, ctl, 'khazir', 'gdpReal', w, w)), pct(run.series.countries.khazir.unemployment[w - 1])]),
    },
    mechanisms: [
      'Sanctions are enforced on the physical flow: the embargoed pair is removed from the supplier list, so no energy moves between them whatever prices do.',
      'Buyers automatically redirect orders to the next cheapest allowed suppliers; the delivered price (producer price + freight + tariff) decides the split, so the price rises by the extra freight and by the scarcity of non-embargoed supply.',
      'Exporters lose their large customers, their stocks build up and local prices fall, which cuts revenue, profits and employment in the oil sector.',
      'Energy is bought from producers\' own stock, so a third country cannot launder embargoed oil: whatever it imports is consumed, buffered or turned into other goods, never re-sold.',
    ],
    checks: [
      { name: 'Embargo is strictly enforced (zero direct flow)', pass: direct === 0, detail: `flow ${direct}` },
      { name: 'Trade is redirected to other suppliers', pass: toTargetsDuring > toTargetsBefore * 1.02, detail: `${f(toTargetsBefore, 2)} → ${f(toTargetsDuring, 2)} per week` },
      { name: 'Targets pay more for energy', pass: peaks.every(v => v > 1.03), detail: peaks.map(v => f(v, 2) + 'x').join(' / ') },
      { name: 'Exporters are hurt more than the world is', pass: gdpExporters.every(v => v < 0.99), detail: gdpExporters.map(v => pct(v - 1)).join(' / ') },
      { name: 'No laundering through a third country', pass: sundaraExports <= allowance * 1.001 + 1e-6, detail: `${f(sundaraExports, 2)} ≤ ${f(allowance, 2)}` },
    ],
    observations: [],
    runtimeMs: performance.now() - t0,
  };
}

// ---------------------------------------------------------------------------
// 3. Sudden 50% collapse of agricultural production in one country
// ---------------------------------------------------------------------------
function scenario3(ctx: Context): ScenarioResult {
  const t0 = performance.now();
  const weeks = 260;
  const ctl = ctx.control(weeks);
  const run = scenarioRun(ctx, weeks, w => w === SHOCK ? { effects: [{ type: 'production-shock', zoneId: 'verdania', goodId: 'food', factor: 0.5, recoveryWeeks: 78 }] } : undefined);
  const v = run.series.countries.verdania, c = ctl.series.countries.verdania;
  const outputLow = minimum(v.output.food.map((x, i) => x / c.output.food[i]), SHOCK);
  const priceHigh = maximum(v.buyPrice.food.map((x, i) => x / c.buyPrice.food[i]), SHOCK);
  const fillLow = minimum(v.householdFill.food, SHOCK);
  const exportsLow = minimum(v.exports.map((x, i) => x / c.exports[i]), SHOCK, SHOCK + 52);
  const gdpLow = minimum(v.gdpReal.map((x, i) => x / c.gdpReal[i]), SHOCK);
  const stabLow = minimum(v.stability, SHOCK);
  const worldFood = maximum(run.series.goods.food.price.map((x, i) => x / ctl.series.goods.food.price[i]), SHOCK);
  const neighbour = maximum(run.series.countries.lirane.buyPrice.food.map((x, i) => x / ctl.series.countries.lirane.buyPrice.food[i]), SHOCK);
  const back = recoveryWeek(v.gdpReal.map((x, i) => x / c.gdpReal[i]), SHOCK, 0.98);
  return {
    id: 3, title: 'Sudden 50% collapse of agricultural production in one country', weeks,
    setup: `Week ${SHOCK}: the yield of Verdania's food sector (its main export) drops by 50% and recovers over 78 weeks.`,
    indicators: [
      { label: 'Verdania food output (lowest, vs control)', value: pct(outputLow, 0) },
      { label: 'Verdania food price (peak, vs control)', value: `${f(priceHigh)}x` },
      { label: 'Share of household food demand met (lowest)', value: pct(fillLow, 0), note: 'households are served first' },
      { label: 'Verdania export earnings (lowest, vs control)', value: pct(exportsLow, 0), note: 'a net food exporter: the shortfall falls on exports' },
      { label: 'Verdania real GDP (lowest, vs control)', value: pct(gdpLow, 0) },
      { label: 'Verdania stability (lowest)', value: f(stabLow, 1), note: `control ${f(mean(c.stability), 1)}` },
      { label: 'World food price (peak, vs control)', value: `${f(worldFood)}x` },
      { label: 'Food price in Lirane (peak, vs control)', value: `${f(neighbour)}x`, note: 'import-dependent buyer' },
      { label: 'Weeks to return within 2% of control GDP', value: back === null ? 'not within horizon' : back - SHOCK },
    ],
    table: {
      caption: 'Verdania relative to control',
      headers: ['Week', 'Food output', 'Food price', 'GDP', 'Unemployment', 'Stability'],
      rows: at([SHOCK - 1, SHOCK + 4, SHOCK + 13, SHOCK + 26, SHOCK + 52, SHOCK + 78, SHOCK + 104, weeks], w => [w,
        pct(v.output.food[w - 1] / c.output.food[w - 1], 0), `${f(v.buyPrice.food[w - 1] / c.buyPrice.food[w - 1])}x`,
        pct(v.gdpReal[w - 1] / c.gdpReal[w - 1], 0), pct(v.unemployment[w - 1]), f(v.stability[w - 1], 1)]),
    },
    mechanisms: [
      'The shock lowers productivity, not employment: farms keep their workers but harvest half as much, so unit costs double and the sector\'s supply curve shifts left.',
      'Verdania is a net food exporter, so the shortfall falls first on exports: domestic households are served from the reduced output (their fill stays near 100%) while export earnings, farm incomes and the trade balance take the hit; importers elsewhere pay more.',
      'Lower farm income, higher food prices and a squeeze on other spending reduce living standards; stability falls, which can open an unrest episode.',
      'Capacity is not destroyed, so as the yield recovers output returns and the economy converges back to the control path.',
    ],
    checks: [
      { name: 'Output falls by roughly half', pass: outputLow < 0.7, detail: pct(outputLow, 0) },
      { name: 'Food gets more expensive locally', pass: priceHigh > 1.05, detail: `${f(priceHigh)}x` },
      { name: 'Exports fall while households stay supplied (the exporter absorbs the shock)', pass: exportsLow < 0.9 && fillLow > 0.97, detail: `exports ${pct(exportsLow, 0)}, household fill ${pct(fillLow, 0)}` },
      { name: 'Society feels it (GDP down, stability down)', pass: gdpLow < 0.97 && stabLow < mean(c.stability) - 2, detail: `GDP ${pct(gdpLow, 0)}, stability ${f(stabLow, 1)}` },
      { name: 'Economy recovers', pass: back !== null, detail: back === null ? 'no recovery' : `${back - SHOCK} weeks` },
    ],
    observations: [],
    runtimeMs: performance.now() - t0,
  };
}

// ---------------------------------------------------------------------------
// 4. Sharp increase in military expenditure
// ---------------------------------------------------------------------------
function scenario4(ctx: Context): ScenarioResult {
  const t0 = performance.now();
  const weeks = 260;
  const ctl = ctx.control(weeks);
  const run = scenarioRun(ctx, weeks, w => w === SHOCK ? { commands: [{ type: 'set-spending', countryId: 'ostmark', category: 'military', share: 0.12 }] } : undefined);
  const o = run.series.countries.ostmark, c = ctl.series.countries.ostmark;
  const late = [weeks - 51, weeks];
  const armsGain = o.armsStock[weeks - 1] / c.armsStock[weeks - 1];
  const consLoss = ratio(run, ctl, 'ostmark', 'consumptionPerCapita', late[0], late[1]);
  const inflPeak = maximum(o.inflation, SHOCK, SHOCK + 52) - mean(c.inflation, SHOCK - 1, SHOCK + 52);
  const taxEnd = o.taxIncome[weeks - 1], taxCtl = c.taxIncome[weeks - 1];
  const indPrice = maximum(o.buyPrice.industrial.map((x, i) => x / c.buyPrice.industrial[i]), SHOCK);
  const milOutput = o.output.military[weeks - 1] / c.output.military[weeks - 1];
  const debtGap = o.debtToGdp[weeks - 1] - c.debtToGdp[weeks - 1];
  const gdpGap = ratio(run, ctl, 'ostmark', 'gdpReal', late[0], late[1]);
  const stabGap = mean(o.stability, late[0] - 1, late[1]) - mean(c.stability, late[0] - 1, late[1]);
  const neighbourPrice = maximum(run.series.countries.norland.buyPrice.military.map((x, i) => x / ctl.series.countries.norland.buyPrice.military[i]), SHOCK);
  return {
    id: 4, title: 'Sharp increase in military expenditure', weeks,
    setup: `Week ${SHOCK}: Ostmark (arms maker) raises military spending from 3.5% to 12% of GDP and keeps it there. The autopilot finances it with taxes.`,
    indicators: [
      { label: 'Ostmark military equipment stock after 4 years', value: `${f(armsGain)}x control` },
      { label: 'Ostmark military output', value: `${f(milOutput)}x control`, note: 'industry expands, with a construction delay' },
      { label: 'Income tax rate at the end', value: `${pct(taxEnd)} vs ${pct(taxCtl)}`, note: 'financing the build-up' },
      { label: 'Peak inflation increase', value: `+${pct(inflPeak)}` },
      { label: 'Industrial goods price (peak, vs control)', value: `${f(indPrice)}x`, note: 'competition for the same inputs' },
      { label: 'Household consumption in the last year', value: pct(consLoss - 1), note: 'crowding out' },
      { label: 'Real GDP in the last year', value: pct(gdpGap - 1) },
      { label: 'Debt/GDP change', value: `${debtGap >= 0 ? '+' : ''}${pct(debtGap, 1)}` },
      { label: 'Stability change', value: f(stabGap, 1) },
      { label: 'Norland arms price (peak, vs control)', value: `${f(neighbourPrice)}x`, note: 'spillover to arms buyers' },
    ],
    table: {
      caption: 'Ostmark relative to control',
      headers: ['Week', 'Arms stock', 'Military output', 'Consumption', 'GDP', 'Income tax', 'Inflation'],
      rows: at([SHOCK - 1, SHOCK + 13, SHOCK + 26, SHOCK + 52, SHOCK + 104, weeks], w => [w,
        `${f(o.armsStock[w - 1] / c.armsStock[w - 1])}x`, `${f(o.output.military[w - 1] / c.output.military[w - 1])}x`,
        pct(o.consumptionPerCapita[w - 1] / c.consumptionPerCapita[w - 1], 0), pct(o.gdpReal[w - 1] / c.gdpReal[w - 1], 0), pct(o.taxIncome[w - 1]), pct(o.inflation[w - 1])]),
    },
    mechanisms: [
      'State orders for military goods (mostly industrial and military equipment) are added to private demand; the same factories, materials and workers are needed, so industrial prices rise and civilian buyers are crowded out.',
      'Private firms respond to the higher margins by investing, but capacity takes about three quarters to build, so early output is limited by existing capacity and the build-up first shows as inflation.',
      'The extra spending is paid with taxes and debt; higher taxes reduce household income, so consumption falls. A militarised economy is richer in weapons and poorer in everyday goods.',
    ],
    checks: [
      { name: 'Equipment stock grows markedly', pass: armsGain > 1.5, detail: `${f(armsGain)}x` },
      { name: 'Military industry expands', pass: milOutput > 1.3, detail: `${f(milOutput)}x` },
      { name: 'Consumption is crowded out', pass: consLoss < 0.995, detail: pct(consLoss - 1) },
      { name: 'Industrial inputs get more expensive', pass: indPrice > 1.01, detail: `${f(indPrice)}x` },
      { name: 'The country pays with taxes and/or debt', pass: taxEnd > taxCtl + 0.005 || debtGap > 0.02, detail: `tax ${pct(taxEnd)} vs ${pct(taxCtl)}, debt ${pct(debtGap)}` },
    ],
    observations: [],
    runtimeMs: performance.now() - t0,
  };
}

// ---------------------------------------------------------------------------
// 5. War disrupting several international trade routes
// ---------------------------------------------------------------------------
function scenario5(ctx: Context): ScenarioResult {
  const t0 = performance.now();
  const weeks = 260, end = 156;
  const ctl = ctx.control(weeks);
  const route = (cost: number, throughput: number): TurnInput['effects'] => [
    ...KELL_STRAIT_LANES.map(laneId => ({ type: 'set-lane' as const, laneId, costMultiplier: cost, throughput })),
    { type: 'set-lane' as const, laneId: 'ocean-east', costMultiplier: cost, throughput },
    { type: 'set-lane' as const, laneId: 'north-sea-halcyon', costMultiplier: cost, throughput },
  ];
  const run = scenarioRun(ctx, weeks, w => w === SHOCK ? { effects: route(3, 0.4) } : w === end + 1 ? { effects: route(1, 1) } : undefined);
  const tradeRatio = (id: CountryId, a: number, b: number) => (mean(run.series.countries[id].exports, a - 1, b) + mean(run.series.countries[id].imports, a - 1, b))
    / (mean(ctl.series.countries[id].exports, a - 1, b) + mean(ctl.series.countries[id].imports, a - 1, b));
  const world = (key: 'traded') => Object.values(run.series.goods).reduce((t, g) => t + mean(g[key], SHOCK - 1, end), 0) / Object.values(ctl.series.goods).reduce((t, g) => t + mean(g[key], SHOCK - 1, end), 0);
  const gdp = (id: CountryId) => ratio(run, ctl, id, 'gdpReal', SHOCK, end);
  const prices = (id: CountryId, g: string) => goodRatio(run, ctl, id, g, SHOCK, end);
  const worstId = Object.keys(run.series.countries).reduce((a, b) => gdp(a) < gdp(b) ? a : b);
  const back = recoveryWeek(run.series.world.gdpReal.map((v, i) => v / ctl.series.world.gdpReal[i]), end, 0.99);
  return {
    id: 5, title: 'War disrupting several international trade routes', weeks,
    setup: `Weeks ${SHOCK}-${end}: the Strait of Kell, the east ocean route and the Halcyon sea lane become war zones (3x freight cost, 40% of normal throughput). Routes reopen in week ${end + 1}.`,
    indicators: [
      { label: 'World traded volume during war', value: pct(world('traded') - 1, 0), note: 'vs control' },
      { label: 'Khazir trade (exports + imports)', value: pct(tradeRatio('khazir', SHOCK, end) - 1, 0), note: 'reroutes overland via Morvaine' },
      { label: 'Halcyon trade', value: pct(tradeRatio('halcyon', SHOCK, end) - 1, 0) },
      { label: 'Norland trade (many alternative routes)', value: pct(tradeRatio('norland', SHOCK, end) - 1, 0) },
      { label: 'Real GDP: Khazir / Halcyon / Norland', value: `${pct(gdp('khazir') - 1)} / ${pct(gdp('halcyon') - 1)} / ${pct(gdp('norland') - 1)}` },
      { label: 'Most affected country', value: `${worstId} (${pct(gdp(worstId) - 1)})` },
      { label: 'Energy price in Sundara', value: `${f(prices('sundara', 'energy'))}x`, note: 'importer cut off from the Gulf' },
      { label: 'World real GDP returns within 1% of control', value: back === null ? 'not within horizon' : `${back - end} weeks after reopening` },
    ],
    table: {
      caption: 'Effect of the route closures',
      headers: ['Week', 'World traded volume', 'Khazir GDP', 'Halcyon GDP', 'Sundara energy price', 'World inflation'],
      rows: at([SHOCK - 1, SHOCK + 13, SHOCK + 52, end, end + 26, weeks], w => [w,
        pct(Object.values(run.series.goods).reduce((t, g) => t + g.traded[w - 1], 0) / Object.values(ctl.series.goods).reduce((t, g) => t + g.traded[w - 1], 0), 0),
        pct(ratio(run, ctl, 'khazir', 'gdpReal', w, w), 0), pct(ratio(run, ctl, 'halcyon', 'gdpReal', w, w), 0),
        `${f(goodRatio(run, ctl, 'sundara', 'energy', w, w))}x`, pct(run.series.world.inflation[w - 1])]),
    },
    mechanisms: [
      'A lane\'s effective length is distance × cost multiplier and its throughput caps flows. Trade follows the cheapest open path, so closing the strait pushes cargo to the long southern cape route automatically.',
      'Freight costs rise on every affected pair, which lowers the delivered-price advantage of distant producers; buyers shift orders towards nearer suppliers and domestic output, shrinking total trade.',
      'Countries whose only link to the world runs through the war zone lose revenue and employment and face shortages. Countries with alternative routes reroute or even gain: Khazir\'s rival exporter is cut off, so its overland customers pay more.',
    ],
    checks: [
      { name: 'World trade shrinks', pass: world('traded') < 0.97, detail: pct(world('traded') - 1, 0) },
      { name: 'The country whose only sea lane is cut loses far more than a diversified one', pass: gdp('halcyon') < gdp('norland') - 0.02, detail: `Halcyon ${pct(gdp('halcyon') - 1)} vs Norland ${pct(gdp('norland') - 1)}` },
      { name: 'Prices rise for cut-off importers', pass: prices('sundara', 'energy') > 1.0 || prices('verdania', 'energy') > 1.0, detail: `Sundara ${f(prices('sundara', 'energy'))}x` },
      { name: 'Recovery after the routes reopen', pass: back !== null, detail: back === null ? 'none' : `${back - end} weeks` },
    ],
    observations: [],
    runtimeMs: performance.now() - t0,
  };
}

// ---------------------------------------------------------------------------
// 6. Sovereign default of a major economy
// ---------------------------------------------------------------------------
function scenario6(ctx: Context): ScenarioResult {
  const t0 = performance.now();
  const weeks = 520;
  const ctl = ctx.control(weeks);
  const holdings = (state: EconomyState, debtor: CountryId, outsiders: boolean) => {
    const C = state.countries.length, d = idx(state, debtor);
    let total = 0;
    for (let z = 0; z < state.zones.length; z++) if ((state.zone.owner[z] !== d) === outsiders) total += state.bonds[z * C + d];
    return total;
  };
  let before = 0, after = 0, foreignBefore = 0, foreignAfter = 0;
  const run = scenarioRun(ctx, weeks, w => w === SHOCK ? { commands: [{ type: 'declare-default', countryId: 'norland' }] } : undefined, {
    onReport: (report, state) => {
      if (report.turn === SHOCK - 1) { before = report.countries[idx(state, 'norland')].debt; foreignBefore = holdings(state, 'norland', true); }
      if (report.turn === SHOCK) { after = report.countries[idx(state, 'norland')].debt; foreignAfter = holdings(state, 'norland', true); }
    },
  });
  const n = run.series.countries.norland, c = ctl.series.countries.norland;
  const event = run.events.find(e => e.type === 'sovereign-default');
  const gdpLow = minimum(n.gdpReal.map((x, i) => x / c.gdpReal[i]), SHOCK);
  const rateAfter = n.marketRate[SHOCK + 1], rateCtl = c.marketRate[SHOCK + 1];
  const accessBack = recoveryWeek(n.marketAccess, SHOCK, 1, 1);
  const stabLow = minimum(n.stability, SHOCK);
  const regimes = n.regime[weeks - 1] - n.regime[SHOCK - 2];
  const creditorLoss = foreignBefore > 0 ? 1 - foreignAfter / foreignBefore : 0;
  const worldLow = minimum(run.series.world.gdpReal.map((x, i) => x / ctl.series.world.gdpReal[i]), SHOCK);
  const back = recoveryWeek(n.gdpReal.map((x, i) => x / c.gdpReal[i]), SHOCK, 0.98);
  const debtEnd = n.debtToGdp[weeks - 1];

  // Part B: a default that nobody declares. Tavros starts normally; from week 53 its government
  // spends far beyond its means (no autopilot) and the credit market reacts.
  const heavy = ctx.copy();
  const heavyRun = runSimulation(heavy, {
    turns: 520, audit: true,
    autopilot: ctx.start.countries.map(x => x.id).filter(id => id !== 'tavros'),
    script: w => w === SHOCK ? { commands: [
      { type: 'set-spending', countryId: 'tavros', category: 'social', share: 0.30 },
      { type: 'set-spending', countryId: 'tavros', category: 'military', share: 0.12 },
      { type: 'set-spending', countryId: 'tavros', category: 'infrastructure', share: 0.08 }] } : undefined,
  });
  const forced = heavyRun.events.find(e => e.type === 'sovereign-default' && e.countryId === 'tavros');
  const lost = heavyRun.events.find(e => e.type === 'market-access-lost' && e.countryId === 'tavros');
  const missed = heavyRun.events.filter(e => e.type === 'missed-payment' && e.countryId === 'tavros').length;
  const t = heavyRun.series.countries.tavros;
  const hc = ctx.control(520).series.countries.tavros;
  return {
    id: 6, title: 'Sovereign default by a major economy', weeks,
    setup: `Part A: week ${SHOCK}: Norland (largest economy, debt ${pct(c.debtToGdp[SHOCK - 2], 0)} of GDP) declares default. Part B: Tavros (no autopilot) raises social, military and infrastructure spending to 50% of GDP in week ${SHOCK} without raising taxes, to show a default emerging by itself.`,
    indicators: [
      { label: 'A: debt written off', value: event && event.type === 'sovereign-default' ? `${f(event.debtWrittenOff, 0)} (${pct(event.haircut, 0)})` : 'none', note: `debt ${f(before, 0)} → ${f(after, 0)}` },
      { label: 'A: loss borne by foreign creditors', value: `${f(foreignBefore - foreignAfter, 0)} (${pct(creditorLoss, 0)} of their holdings)`, note: 'households abroad hold Norland bonds' },
      { label: 'A: Norland borrowing rate one week after', value: `${pct(rateAfter)} vs ${pct(rateCtl)}` },
      { label: 'A: weeks until market access returns', value: accessBack === null ? 'not within horizon' : accessBack - SHOCK },
      { label: 'A: Norland real GDP (lowest, vs control)', value: pct(gdpLow - 1, 1) },
      { label: 'A: Norland stability (lowest)', value: `${f(stabLow, 1)} (control ${f(mean(c.stability), 1)})` },
      { label: 'A: regime changes (defeat condition)', value: regimes, note: 'default alone does not end the player' },
      { label: 'A: world real GDP (lowest, vs control)', value: pct(worldLow - 1, 1), note: 'contagion through creditors and trade' },
      { label: 'A: weeks to return within 2% of control GDP', value: back === null ? 'not within horizon' : back - SHOCK },
      { label: 'A: Norland debt/GDP at the end', value: pct(debtEnd, 0), note: `control ${pct(c.debtToGdp[weeks - 1], 0)}` },
      { label: 'B: market access lost / forced default (week)', value: `${lost ? lost.turn : 'never'} / ${forced ? forced.turn : 'never'}`, note: `${missed} missed payments before the default` },
      { label: 'B: borrowing rate peak / debt-to-GDP peak', value: `${pct(maximum(t.marketRate))} / ${pct(maximum(t.debtToGdp), 0)}`, note: `control debt ${pct(maximum(hc.debtToGdp), 0)}` },
      { label: 'B: Tavros real GDP at the end (vs control)', value: pct(t.gdpReal[519] / hc.gdpReal[519], 0) },
    ],
    table: {
      caption: 'Part A - Norland relative to control',
      headers: ['Week', 'Debt/GDP', 'Market access', 'Borrowing rate', 'GDP', 'Stability', 'Unemployment'],
      rows: at([SHOCK - 1, SHOCK + 1, SHOCK + 13, SHOCK + 52, SHOCK + 104, SHOCK + 208, weeks], w => [w, pct(n.debtToGdp[w - 1], 0), n.marketAccess[w - 1] ? 'yes' : 'no', pct(n.marketRate[w - 1]),
        pct(n.gdpReal[w - 1] / c.gdpReal[w - 1], 1), f(n.stability[w - 1], 1), pct(n.unemployment[w - 1])]),
    },
    mechanisms: [
      'A default writes off a fixed share of the debt (provisional 55%). Because the engine records exactly who holds each country\'s bonds, the loss lands on those households, at home and abroad, reducing their wealth and spending.',
      'The defaulter is shut out of credit markets for about 18 months (longer for repeat offenders) and carries a reputation premium that fades over three years; its government can only spend what it collects.',
      'Financial disruption costs the economy a few percent of output for a year; stability takes a one-off hit. None of this is a defeat by itself: only a regime change, which needs a crisis episode to cross its thresholds, would end a human player.',
      'Part B: when a deficit-running government is already near the market-access limit, interest costs and missed payments feed on each other until the forced default.',
    ],
    checks: [
      { name: 'Default writes off debt as designed', pass: !!event && event.type === 'sovereign-default' && Math.abs(after / before - 0.45) < 0.03, detail: `${f(after / Math.max(1e-9, before), 3)} of debt remains` },
      { name: 'Foreign creditors lose money', pass: creditorLoss > 0.1, detail: pct(creditorLoss, 0) },
      { name: 'Market access is lost, then restored', pass: n.marketAccess[SHOCK + 1] === 0 && accessBack !== null, detail: accessBack === null ? 'never' : `${accessBack - SHOCK} weeks` },
      { name: 'Output dips but the country survives and recovers', pass: gdpLow < 0.99 && back !== null && regimes === 0, detail: `low ${pct(gdpLow - 1)}, recovery ${back === null ? 'none' : back - SHOCK + ' weeks'}, regime changes ${regimes}` },
      { name: 'Stability falls after default', pass: stabLow < mean(c.stability) - 5, detail: f(stabLow, 1) },
      { name: 'A default can emerge without any command', pass: !!forced && !!lost && lost.turn < forced.turn, detail: `lost access week ${lost?.turn ?? '-'}, default week ${forced?.turn ?? '-'}` },
    ],
    observations: [],
    runtimeMs: performance.now() - t0,
  };
}

// ---------------------------------------------------------------------------
// 7. International coalition imposing economic sanctions
// ---------------------------------------------------------------------------
function scenario7(ctx: Context): ScenarioResult {
  const t0 = performance.now();
  const weeks = 260;
  const members = ['norland', 'sundara', 'verdania', 'halcyon', 'tavros'];
  const goods = ['industrial', 'military', 'materials'];
  const outsiders = ['khazir', 'lirane', 'morvaine'];
  const commands = members.map(countryId => ({ type: 'set-sanction' as const, countryId, targetId: 'ostmark', goodIds: goods, imports: true, exports: true }));
  const ctl = ctx.control(weeks);
  const stateA = ctx.copy();
  const monitors = goods.map(good => tradeMonitor(stateA, good, [{ name: 'before', from: 1, to: SHOCK - 1 }, { name: 'during', from: SHOCK, to: weeks }]));
  const run = scenarioRun(ctx, weeks, w => w === SHOCK ? { commands } : undefined, { state: stateA, tradeDetail: true, onReport: (r, s) => monitors.forEach(m => m.onReport(r, s)) });
  const direct = monitors.map(m => flowBetween(m.flows[1], members, ['ostmark']) + flowBetween(m.flows[1], ['ostmark'], members));
  const outsiderBefore = monitors.reduce((t, m) => t + flowBetween(m.flows[0], outsiders, ['ostmark']) + flowBetween(m.flows[0], ['ostmark'], outsiders), 0) / (SHOCK - 1);
  const outsiderDuring = monitors.reduce((t, m) => t + flowBetween(m.flows[1], outsiders, ['ostmark']) + flowBetween(m.flows[1], ['ostmark'], outsiders), 0) / (weeks - SHOCK + 1);
  const gdp = (id: CountryId) => ratio(run, ctl, id, 'gdpReal', SHOCK + 13, weeks);
  const memberLoss = mean(members.map(id => gdp(id) - 1));
  const outsiderGain = mean(outsiders.map(id => gdp(id) - 1));
  const indPrice = goodRatio(run, ctl, 'ostmark', 'industrial', SHOCK + 13, weeks);
  const milPrice = goodRatio(run, ctl, 'ostmark', 'military', SHOCK + 13, weeks);
  const memberPrice = mean(members.map(id => goodRatio(run, ctl, id, 'industrial', SHOCK + 13, weeks)));
  const tradeOst = (mean(run.series.countries.ostmark.exports, SHOCK - 1) + mean(run.series.countries.ostmark.imports, SHOCK - 1))
    / (mean(ctl.series.countries.ostmark.exports, SHOCK - 1) + mean(ctl.series.countries.ostmark.imports, SHOCK - 1));
  return {
    id: 7, title: 'International coalition imposing economic sanctions', weeks,
    setup: `Week ${SHOCK}: a five-country coalition (${members.join(', ')}) bans all trade with Ostmark in industrial goods, military equipment and raw materials, in both directions. Non-members keep trading.`,
    indicators: [
      { label: 'Coalition ↔ Ostmark flow in sanctioned goods', value: direct.map(v => f(v, 3)).join(' / '), note: 'industrial / military / materials; must be 0' },
      { label: 'Non-members ↔ Ostmark flow', value: `${f(outsiderDuring, 2)} per week`, note: `was ${f(outsiderBefore, 2)} before (trade diversion)` },
      { label: 'Ostmark real GDP (from week 66, vs control)', value: pct(gdp('ostmark') - 1) },
      { label: 'Ostmark total trade', value: pct(tradeOst - 1, 0), note: 'vs control' },
      { label: 'Ostmark prices: industrial / military', value: `${f(indPrice)}x / ${f(milPrice)}x`, note: 'export goods lose their markets, so they get cheaper at home' },
      { label: 'Industrial price in coalition countries (mean)', value: `${f(memberPrice, 3)}x` },
      { label: 'Coalition members\' real GDP (mean)', value: pct(memberLoss), note: 'sanctions are costly for senders too' },
      { label: 'Non-members\' real GDP (mean)', value: pct(outsiderGain) },
      { label: 'Ostmark stability (mean, from week 66)', value: f(mean(run.series.countries.ostmark.stability, SHOCK + 12), 1), note: `control ${f(mean(ctl.series.countries.ostmark.stability, SHOCK + 12), 1)}` },
    ],
    table: {
      caption: 'Real GDP relative to control',
      headers: ['Week', 'Ostmark', 'Norland (member)', 'Sundara (member)', 'Khazir (non-member)', 'Morvaine (non-member)'],
      rows: at([SHOCK - 1, SHOCK + 13, SHOCK + 52, SHOCK + 104, weeks], w => [w, ...['ostmark', 'norland', 'sundara', 'khazir', 'morvaine'].map(id => pct(ratio(run, ctl, id, 'gdpReal', w, w), 1))]),
    },
    mechanisms: [
      'Each member\'s ban is applied to the exact buyer-seller pair and good, in both directions, so every sanctioned flow disappears at the border of the transaction; there is no path through which goods can still arrive from a member.',
      'Because goods are drawn from producers\' own stock and never forwarded, a non-member that buys from Ostmark cannot resell those goods to a member as "its own": there is no re-export channel to close.',
      'Ostmark must buy substitutes from non-members at higher delivered prices and sell its output to fewer, more distant buyers; its terms of trade worsen, margins shrink and employment falls.',
      'Members pay too: they lose Ostmark\'s cheaper machinery and have to rebuy from other suppliers, so their prices rise slightly and the gap is partly captured by non-members.',
    ],
    checks: [
      { name: 'Sanctions are strictly enforced (no coalition ↔ Ostmark flow)', pass: direct.every(v => v === 0), detail: direct.join(' / ') },
      { name: 'Ostmark is hurt', pass: gdp('ostmark') < 0.99, detail: pct(gdp('ostmark') - 1) },
      { name: 'Trade is diverted to non-members', pass: outsiderDuring > outsiderBefore * 1.05, detail: `${f(outsiderBefore, 2)} → ${f(outsiderDuring, 2)}` },
      { name: 'Senders bear some cost, much smaller than the target', pass: memberLoss > gdp('ostmark') - 1, detail: `members ${pct(memberLoss)} vs target ${pct(gdp('ostmark') - 1)}` },
      { name: 'Ostmark\'s terms of trade worsen (its export goods lose their markets and get cheaper at home)', pass: indPrice < 0.97 && milPrice < 0.97, detail: `industrial ${f(indPrice)}x, military ${f(milPrice)}x` },
      { name: 'Coalition buyers pay more for the goods they used to import', pass: memberPrice > 1.0, detail: `${f(memberPrice, 3)}x` },
    ],
    observations: [],
    runtimeMs: performance.now() - t0,
  };
}

// ---------------------------------------------------------------------------
// 8. Small country heavily dependent on imports
// ---------------------------------------------------------------------------
function scenario8(ctx: Context): ScenarioResult {
  const t0 = performance.now();
  const weeks = 260, blockadeEnd = SHOCK + 51;
  const ctl = ctx.control(weeks);
  const freeze = (): NonNullable<TurnInput['commands']> => ['energy', 'food'].map(goodId => ({ type: 'set-reserve' as const, countryId: 'lirane', goodId, targetWeeks: 8, mode: 'hold' as const }));
  const energyShock: NonNullable<TurnInput['effects']> = ['khazir', 'halcyon'].map(zoneId => ({ type: 'production-shock' as const, zoneId, goodId: 'energy', factor: 0.5, recoveryWeeks: 78 }));
  const blockade = (cost: number, throughput: number): NonNullable<TurnInput['effects']> => [{ type: 'set-lane' as const, laneId: 'lirane-link', costMultiplier: cost, throughput }];
  const runs = {
    energy: scenarioRun(ctx, weeks, w => w === SHOCK ? { effects: energyShock } : undefined),
    energyFrozen: scenarioRun(ctx, weeks, w => w === SHOCK ? { effects: energyShock, commands: freeze() } : undefined),
    blockade: scenarioRun(ctx, weeks, w => w === SHOCK ? { effects: blockade(2, 0.5) } : w === blockadeEnd + 1 ? { effects: blockade(1, 1) } : undefined),
    blockadeFrozen: scenarioRun(ctx, weeks, w => w === SHOCK ? { effects: blockade(2, 0.5), commands: freeze() } : w === blockadeEnd + 1 ? { effects: blockade(1, 1) } : undefined),
  };
  const dependency = (id: CountryId) => mean(ctl.series.countries[id].imports, 0, SHOCK - 1) / mean(ctl.series.countries[id].gdpNominal, 0, SHOCK - 1);
  const window = (r: SimulationResult, id: CountryId, metric: 'consumptionPerCapita' | 'gdpReal') => ratio(r, ctl, id, metric, SHOCK, SHOCK + 78) - 1;
  const lowest = (r: SimulationResult, id: CountryId, good: string) => minimum(r.series.countries[id].householdFill[good], SHOCK);
  const stab = (r: SimulationResult, id: CountryId) => minimum(r.series.countries[id].stability, SHOCK);
  const released = (r: SimulationResult, good: string) => r.series.countries.lirane.reserves[good][SHOCK - 2] - minimum(r.series.countries.lirane.reserves[good], SHOCK);
  const priceUp = (r: SimulationResult, id: CountryId, good: string) => maximum(r.series.countries[id].buyPrice[good].map((x, i) => x / ctl.series.countries[id].buyPrice[good][i]), SHOCK);
  const L = 'lirane', S = 'sundara';
  return {
    id: 8, title: 'Small country heavily dependent on imports', weeks,
    setup: `Lirane (6 million people, almost no energy, food or raw materials) is tested twice, with its 8-week strategic reserves usable and frozen. A: world energy supply falls 50% (Khazir and Halcyon) in week ${SHOCK}; Sundara (large, diversified) is the comparison. B: Lirane's only sea link is partly blockaded (2x freight cost, 50% of normal throughput) for 52 weeks.`,
    indicators: [
      { label: 'Imports / GDP before the shock', value: `Lirane ${pct(dependency(L))}, Sundara ${pct(dependency(S))}` },
      { label: 'A (world energy shock): consumption per head, 18 months', value: `Lirane ${pct(window(runs.energy, L, 'consumptionPerCapita'))}, Sundara ${pct(window(runs.energy, S, 'consumptionPerCapita'))}`, note: 'energy is a small share of Lirane\'s basket, so the world price shock is not what exposes it' },
      { label: 'A: energy price paid (peak)', value: `Lirane ${f(priceUp(runs.energy, L, 'energy'))}x, Sundara ${f(priceUp(runs.energy, S, 'energy'))}x` },
      { label: 'B (blockade): consumption per head, 18 months', value: `reserves ${pct(window(runs.blockade, L, 'consumptionPerCapita'))}, frozen ${pct(window(runs.blockadeFrozen, L, 'consumptionPerCapita'))}` },
      { label: 'B: real GDP, 18 months', value: `reserves ${pct(window(runs.blockade, L, 'gdpReal'))}, frozen ${pct(window(runs.blockadeFrozen, L, 'gdpReal'))}` },
      { label: 'B: lowest share of household energy / food demand met', value: `reserves ${pct(lowest(runs.blockade, L, 'energy'), 0)} / ${pct(lowest(runs.blockade, L, 'food'), 0)}; frozen ${pct(lowest(runs.blockadeFrozen, L, 'energy'), 0)} / ${pct(lowest(runs.blockadeFrozen, L, 'food'), 0)}` },
      { label: 'B: food / energy price paid in Lirane (peak)', value: `${f(priceUp(runs.blockade, L, 'food'))}x / ${f(priceUp(runs.blockade, L, 'energy'))}x` },
      { label: 'B: reserves released (energy / food)', value: `${f(released(runs.blockade, 'energy'), 1)} / ${f(released(runs.blockade, 'food'), 1)}` },
      { label: 'B: lowest stability', value: `reserves ${f(stab(runs.blockade, L), 1)}, frozen ${f(stab(runs.blockadeFrozen, L), 1)}`, note: `control ${f(mean(ctl.series.countries[L].stability), 1)}` },
      { label: 'B: Sundara consumption per head (unaffected route)', value: pct(window(runs.blockade, S, 'consumptionPerCapita')) },
    ],
    table: {
      caption: 'B: Lirane under blockade (reserves usable) relative to control',
      headers: ['Week', 'Food price', 'Energy price', 'Consumption', 'GDP', 'Unemployment', 'Stability', 'Food reserve', 'Energy reserve'],
      rows: at([SHOCK - 1, SHOCK + 4, SHOCK + 13, SHOCK + 26, blockadeEnd, blockadeEnd + 26, weeks], w => [w,
        `${f(goodRatio(runs.blockade, ctl, L, 'food', w, w))}x`, `${f(goodRatio(runs.blockade, ctl, L, 'energy', w, w))}x`, pct(ratio(runs.blockade, ctl, L, 'consumptionPerCapita', w, w), 0),
        pct(ratio(runs.blockade, ctl, L, 'gdpReal', w, w), 0), pct(runs.blockade.series.countries[L].unemployment[w - 1]), f(runs.blockade.series.countries[L].stability[w - 1], 1),
        f(runs.blockade.series.countries[L].reserves.food[w - 1], 1), f(runs.blockade.series.countries[L].reserves.energy[w - 1], 1)]),
    },
    mechanisms: [
      'An import-dependent economy has almost no domestic supply to fall back on. A price shock on one commodity is a price-taker problem, but its size depends on that commodity\'s weight in the basket: energy is small, so Lirane is not much worse hit than a large economy.',
      'What truly exposes it is access: when its only sea link is restricted, supply (not just price) falls, households go short of necessities, its production chain loses inputs, and its high-wage, import-heavy structure makes the adjustment costly.',
      'Strategic reserves are bought when prices are low and released automatically when prices or shortages cross thresholds. They buy time for the first months at the cost of tying up public money in stock.',
    ],
    checks: [
      { name: 'Lirane is far more import-dependent', pass: dependency(L) > dependency(S) * 2, detail: `${pct(dependency(L))} vs ${pct(dependency(S))}` },
      { name: 'A blockade hurts the island far more than a price shock hurts a large economy', pass: window(runs.blockadeFrozen, L, 'consumptionPerCapita') < window(runs.energy, S, 'consumptionPerCapita') - 0.005, detail: `blockade ${pct(window(runs.blockadeFrozen, L, 'consumptionPerCapita'))} vs Sundara ${pct(window(runs.energy, S, 'consumptionPerCapita'))}` },
      { name: 'Reserves are released in the blockade', pass: released(runs.blockade, 'energy') + released(runs.blockade, 'food') > 0.5, detail: `${f(released(runs.blockade, 'energy') + released(runs.blockade, 'food'), 1)} units` },
      { name: 'Reserves reduce the damage', pass: window(runs.blockade, L, 'consumptionPerCapita') > window(runs.blockadeFrozen, L, 'consumptionPerCapita') + 0.001, detail: `${pct(window(runs.blockade, L, 'consumptionPerCapita'))} vs ${pct(window(runs.blockadeFrozen, L, 'consumptionPerCapita'))}` },
      { name: 'Lirane\'s necessities go short in the blockade', pass: Math.min(lowest(runs.blockadeFrozen, L, 'food'), lowest(runs.blockadeFrozen, L, 'energy')) < 0.99, detail: `${pct(Math.min(lowest(runs.blockadeFrozen, L, 'food'), lowest(runs.blockadeFrozen, L, 'energy')), 0)}` },
    ],
    observations: [],
    runtimeMs: performance.now() - t0,
  };
}

// ---------------------------------------------------------------------------
// 9. Prolonged crisis followed by gradual recovery
// ---------------------------------------------------------------------------
function scenario9(ctx: Context): ScenarioResult {
  const t0 = performance.now();
  const weeks = 1040;
  const ctl = ctx.control(weeks);
  const zones = ['sundara-delta', 'sundara-inland'];
  const run = scenarioRun(ctx, weeks, w => {
    if (w === SHOCK) {
      return {
        effects: [...zones.flatMap(zoneId => [
          { type: 'destroy-capacity' as const, zoneId, goodId: 'all' as const, fraction: 0.35 },
          { type: 'destroy-stock' as const, zoneId, goodId: 'all' as const, fraction: 0.5 },
          { type: 'set-mobilization' as const, zoneId, personnel: 6 }]),
        { type: 'stability-modifier' as const, countryId: 'sundara', value: -12 }],
      };
    }
    if (w === SHOCK + 104) return { effects: [...zones.map(zoneId => ({ type: 'set-mobilization' as const, zoneId, personnel: 0 })), { type: 'stability-modifier' as const, countryId: 'sundara', value: 0 }] };
    return undefined;
  });
  const s = run.series.countries.sundara, c = ctl.series.countries.sundara;
  const rel = s.gdpReal.map((x, i) => x / c.gdpReal[i]);
  const low = minimum(rel, SHOCK), lowWeek = argMin(rel, SHOCK) + 1;
  const back95 = recoveryWeek(rel, SHOCK, 0.95), back99 = recoveryWeek(rel, SHOCK, 0.99);
  const unempPeak = maximum(s.unemployment, SHOCK), debtPeak = maximum(s.debtToGdp, SHOCK);
  const stabLow = minimum(s.stability, SHOCK);
  const events = run.events.filter(e => 'countryId' in e && e.countryId === 'sundara');
  const regimes = s.regime[weeks - 1] - s.regime[SHOCK - 2];
  const capLow = minimum(zones.length ? s.capacity.industrial.map((x, i) => x / c.capacity.industrial[i]) : [1], SHOCK);
  const capEnd = s.capacity.industrial[weeks - 1] / c.capacity.industrial[weeks - 1];
  const consEnd = s.consumptionPerCapita[weeks - 1] / c.consumptionPerCapita[weeks - 1];
  return {
    id: 9, title: 'Prolonged economic crisis followed by gradual recovery', weeks,
    setup: `Week ${SHOCK}: Sundara (second-largest economy) loses 35% of all productive capacity and half its stocks, mobilises 6 million workers for two years and takes a -12 stability shock. Mobilisation and the shock end in week ${SHOCK + 104}. Horizon: 20 years.`,
    indicators: [
      { label: 'Real GDP trough (vs control)', value: `${pct(low - 1, 0)} in week ${lowWeek}` },
      { label: 'Weeks to reach 95% / 99% of control GDP', value: `${back95 === null ? '> horizon' : back95 - SHOCK} / ${back99 === null ? '> horizon' : back99 - SHOCK}` },
      { label: 'Peak unemployment', value: pct(unempPeak) },
      { label: 'Peak public debt / GDP', value: pct(debtPeak, 0), note: `control ${pct(maximum(c.debtToGdp, SHOCK), 0)}` },
      { label: 'Lowest stability', value: f(stabLow, 1) },
      { label: 'Unrest / regime events', value: `${events.filter(e => e.type.startsWith('unrest')).length} unrest, ${regimes} regime change${regimes === 1 ? '' : 's'}` },
      { label: 'Industrial capacity: lowest / end (vs control)', value: `${pct(capLow, 0)} / ${pct(capEnd, 0)}`, note: 'rebuilt by private investment' },
      { label: 'Consumption per head at the end (vs control)', value: pct(consEnd, 1) },
      { label: 'World real GDP at the trough (vs control)', value: pct(minimum(run.series.world.gdpReal.map((x, i) => x / ctl.series.world.gdpReal[i]), SHOCK) - 1, 1) },
    ],
    table: {
      caption: 'Sundara relative to control',
      headers: ['Year after shock', 'GDP', 'Industrial capacity', 'Unemployment', 'Debt/GDP', 'Stability'],
      rows: at([0, 0.25, 0.5, 1, 2, 3, 5, 8, 12, 16, 19].map(y => SHOCK + Math.round(y * 52) - 1).filter(w => w <= weeks), w => [`${((w + 1 - SHOCK) / 52).toFixed(2)}`,
        pct(rel[w - 1], 0), pct(s.capacity.industrial[w - 1] / c.capacity.industrial[w - 1], 0), pct(s.unemployment[w - 1]), pct(s.debtToGdp[w - 1], 0), f(s.stability[w - 1], 1)]),
    },
    mechanisms: [
      'Capacity loss lowers potential output directly; destroyed stocks create immediate shortages, so prices spike and trade partners are drawn in as suppliers.',
      'Unemployment and falling income reduce tax revenue just when relief is needed: deficits and debt rise, the borrowing rate climbs with the debt ratio, and stability drops with unemployment, shortages and the stability shock.',
      'Recovery is gradual because firms rebuild only when the margin on new plant beats the cost of capital, each plant takes about 3-9 months to build, and construction itself needs industrial goods that are scarce after the destruction.',
      'Once mobilisation ends and capacity returns, wages and prices normalise and the autopilot repays debt: the economy converges back to its prior trend without outside help.',
    ],
    checks: [
      { name: 'A deep recession follows the shock', pass: low < 0.9, detail: pct(low - 1, 0) },
      { name: 'The crisis is prolonged (not a one-quarter blip)', pass: back95 === null || back95 - SHOCK > 26, detail: back95 === null ? 'beyond horizon' : `${back95 - SHOCK} weeks to 95%` },
      { name: 'Recovery happens (95% of control GDP within the horizon)', pass: back95 !== null, detail: back95 === null ? 'no' : `${back95 - SHOCK} weeks to 95%, ${back99 === null ? '99% not reached' : back99 - SHOCK + ' weeks to 99%'}` },
      { name: 'Capacity is rebuilt gradually by private investment', pass: capEnd > capLow + 0.2, detail: `${pct(capLow, 0)} → ${pct(capEnd, 0)}` },
      { name: 'No runaway debt or inflation after the crisis', pass: debtPeak < 2.5 && Math.abs(mean(s.inflation, weeks - 104, weeks)) < 0.08, detail: `peak debt ${pct(debtPeak, 0)}` },
    ],
    observations: [],
    runtimeMs: performance.now() - t0,
  };
}

// ---------------------------------------------------------------------------
// 10. Long-term development with structural change
// ---------------------------------------------------------------------------
function scenario10(ctx: Context): ScenarioResult {
  const t0 = performance.now();
  const weeks = 1560;
  const country = 'morvaine';
  const protect = ['industrial', 'consumer', 'military'];
  const strategies: { name: string; commands: (w: number) => NonNullable<TurnInput['commands']> }[] = [
    { name: 'Baseline (autopilot)', commands: () => [] },
    { name: 'Infrastructure push', commands: w => w === 1 ? [{ type: 'set-spending', countryId: country, category: 'infrastructure', share: 0.07 }] : [] },
    // A standing decision: re-issued every week so the autopilot cannot undo it.
    { name: 'Social-first', commands: () => [{ type: 'set-spending', countryId: country, category: 'social', share: 0.17 }] },
    { name: 'Protectionist', commands: w => w === 1 ? protect.map(goodId => ({ type: 'set-tariff' as const, countryId: country, goodId, rate: 0.5 })) : [] },
  ];
  const results = strategies.map(strategy => runSimulation(ctx.copy(), { turns: weeks, autopilot: true, audit: true, script: w => ({ commands: strategy.commands(w) }) }));
  const base = results[0];
  const share = (r: SimulationResult, good: string, w: number) => {
    const c = r.series.countries[country];
    const total = Object.keys(c.output).reduce((t, id) => t + c.output[id][w], 0);
    return c.output[good][w] / total;
  };
  const foodShare = (r: SimulationResult, w: number) => {
    const c = r.series.countries[country];
    const total = Object.keys(c.householdPurchases).reduce((t, id) => t + c.householdPurchases[id][w], 0);
    return c.householdPurchases.food[w] / total;
  };
  const openness = (r: SimulationResult, a: number, z: number) => {
    const c = r.series.countries[country];
    return (mean(c.exports, a, z) + mean(c.imports, a, z)) / mean(c.gdpNominal, a, z);
  };
  const perCap = (r: SimulationResult) => r.series.countries[country].gdpRealPerCapita[weeks - 1] / r.series.countries[country].gdpRealPerCapita[0];
  const cons = (r: SimulationResult) => r.series.countries[country].consumptionPerCapita[weeks - 1] / r.series.countries[country].consumptionPerCapita[0];
  const stab = (r: SimulationResult) => mean(r.series.countries[country].stability);
  const early = (r: SimulationResult) => mean(r.series.countries[country].consumptionPerCapita, 104, 520) / r.series.countries[country].consumptionPerCapita[0];
  const debt = (r: SimulationResult) => maximum(r.series.countries[country].debtToGdp);
  const dispersion = results.map(perCap);
  const best = dispersion.indexOf(Math.max(...dispersion));
  const rows = strategies.map((strategy, i) => [strategy.name, `${f(perCap(results[i]))}x`, `${f(cons(results[i]))}x`, `${f(early(results[i]))}x`, f(stab(results[i]), 1), pct(debt(results[i]), 0), pct(openness(results[i], weeks - 104, weeks), 0),
    pct(share(results[i], 'industrial', weeks - 1) + share(results[i], 'consumer', weeks - 1), 0)]);
  const tailOpenness = openness(base, weeks - 104, weeks), headOpenness = openness(base, 0, 104);
  return {
    id: 10, title: 'Long-term development with structural change in production and consumption', weeks,
    setup: `Thirty years of development of Morvaine (poorest large economy, 80 million people, technology 0.55) under four policy strategies: the autopilot baseline, an infrastructure push (7% of GDP), social-first spending (17% of GDP), and 50% tariffs on industrial, consumer and military goods. All other countries use the autopilot.`,
    indicators: [
      { label: 'Baseline: real GDP per head after 30 years', value: `${f(perCap(base))}x`, note: 'technology growth, catch-up and capital accumulation' },
      { label: 'Baseline: food share of household purchases', value: `${pct(foodShare(base, 0))} → ${pct(foodShare(base, weeks - 1))}`, note: 'consumption shifts to manufactures and services as incomes rise (Engel effect)' },
      { label: 'Baseline: industrial + consumer goods share of output', value: `${pct(share(base, 'industrial', 0) + share(base, 'consumer', 0), 0)} → ${pct(share(base, 'industrial', weeks - 1) + share(base, 'consumer', weeks - 1), 0)}` },
      { label: 'Baseline: services share of output', value: `${pct(share(base, 'services', 0), 0)} → ${pct(share(base, 'services', weeks - 1), 0)}` },
      { label: 'Baseline: trade openness (first / last two years)', value: `${pct(headOpenness, 0)} → ${pct(tailOpenness, 0)}` },
      { label: 'Best strategy for GDP per head', value: strategies[best].name },
      { label: 'Spread between strategies (GDP per head)', value: `${f(Math.min(...dispersion))}x – ${f(Math.max(...dispersion))}x` },
    ],
    table: {
      caption: 'Outcomes after 30 years (Morvaine)',
      headers: ['Strategy', 'GDP/head', 'Consumption/head (end)', 'Consumption/head (years 2-10)', 'Mean stability', 'Peak debt/GDP', 'Openness (last 2 yrs)', 'Industry+consumer share'],
      rows,
    },
    mechanisms: [
      'Technology rises with a world trend plus catch-up for zones behind the frontier; infrastructure raises productivity and growth; capital accumulates where margins beat the cost of capital. Poorer zones therefore grow faster than rich ones, narrowing the gap slowly.',
      'Household budgets have a subsistence core (mostly food) and the rest is split by fixed shares: as income rises the food share of spending falls and manufactures and services gain. Output follows demand and comparative advantage, so the production structure shifts without any scripted transition.',
      'The strategies trade off differently: infrastructure raises long-run productivity but costs stability and debt early; social spending buys stability and consumption but slows capital formation; tariffs raise domestic prices and shield local producers at the cost of efficiency and trade partners.',
    ],
    checks: [
      { name: 'Living standards rise over 30 years', pass: perCap(base) > 1.2, detail: `${f(perCap(base))}x` },
      { name: 'Household food share falls as incomes rise', pass: foodShare(base, weeks - 1) < foodShare(base, 0) - 0.01, detail: `${pct(foodShare(base, 0))} → ${pct(foodShare(base, weeks - 1))}` },
      { name: 'Production structure changes', pass: Math.abs(share(base, 'services', weeks - 1) - share(base, 'services', 0)) + Math.abs(share(base, 'food', weeks - 1) - share(base, 'food', 0)) > 0.01, detail: `food ${pct(share(base, 'food', 0))} → ${pct(share(base, 'food', weeks - 1))}` },
      { name: 'Several strategies are viable (no strategy collapses)', pass: results.every(r => debt(r) < 2 && stab(r) > 40 && perCap(r) > 1.05), detail: dispersion.map(v => f(v) + 'x').join(' / ') },
      { name: 'Strategies differ measurably', pass: Math.max(...dispersion) - Math.min(...dispersion) > 0.01 || new Set(rows.map(r => r[4])).size > 1, detail: `${f(Math.min(...dispersion))}x – ${f(Math.max(...dispersion))}x` },
      { name: 'Protectionism lowers openness', pass: openness(results[3], weeks - 104, weeks) < openness(results[0], weeks - 104, weeks), detail: `${pct(openness(results[3], weeks - 104, weeks), 0)} vs ${pct(openness(results[0], weeks - 104, weeks), 0)}` },
    ],
    observations: [],
    runtimeMs: performance.now() - t0,
  };
}

export const SCENARIOS: ScenarioDef[] = [
  { id: 1, title: 'Stable global economy', run: scenario1 },
  { id: 2, title: 'Oil embargo', run: scenario2 },
  { id: 3, title: 'Agricultural collapse', run: scenario3 },
  { id: 4, title: 'Military spending surge', run: scenario4 },
  { id: 5, title: 'War disrupting trade routes', run: scenario5 },
  { id: 6, title: 'Sovereign default', run: scenario6 },
  { id: 7, title: 'Sanctions coalition', run: scenario7 },
  { id: 8, title: 'Import-dependent small country', run: scenario8 },
  { id: 9, title: 'Prolonged crisis and recovery', run: scenario9 },
  { id: 10, title: 'Long-term development', run: scenario10 },
];
