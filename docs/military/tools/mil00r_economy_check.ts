/**
 * MIL-00R-DESIGN: what replacement recruitment does to a real economy (europe-2023 1.0.0-draft.3).
 *
 *   node --experimental-strip-types docs/military/tools/mil00r_economy_check.ts [out.json]
 *
 * Runs on main with the unchanged economy engine and the immutable draft.3 week-1 save. France is the
 * subject and runs without the autopilot in every variant, so only the recruitment differs; every other
 * country keeps the autopilot. Recruitment uses two external effects the engine already accepts:
 *  - `set-mobilization` per French province (cumulative recruits, spread by population), which removes
 *    them from the civilian labour force;
 *  - `military-procurement` of land equipment worth the one-time replacement cost (P0: one year of the
 *    week-1 military budget per personnel equivalent, x 1.5 under Surge), bought at last week's prices.
 * The intakes are the MIL-00R P0 capacities for France (937 a week "Replace losses", 1,875 "Surge"), i.e.
 * a war long and heavy enough to use them every week. Money and bond audits run every week.
 * Every parameter is an illustrative proposal for owner review, not an adopted value.
 */
import { writeFileSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { advanceEconomy, autopilotCommands, cloneEconomy, hashEconomy } from '../../../economy-engine/src/index.ts';
import type { EconomyState, ExternalEffect, TurnReport } from '../../../economy-engine/src/index.ts';
import { loadEconomySession } from '../../../economy-engine/src/integration/index.ts';

const ROOT = resolve(import.meta.dirname, '../../..');
const PKG = resolve(ROOT, 'scenarios/europe-2023/1.0.0-draft.3');
const scenario = JSON.parse(readFileSync(resolve(PKG, 'scenario.json'), 'utf8'));
const first = loadEconomySession(readFileSync(resolve(PKG, 'week1.session.json'), 'utf8')).state;
const ID = 'fra';
const FULL = 25000;
const ESTABLISHMENT = scenario.military.countries[ID].divisions * FULL;          // 375,000 on the map
const CHECKPOINTS = [52, 104, 156];
const EQUIPMENT: Record<string, number> = { small_arms: 0.3, munitions: 0.3, military_vehicles: 0.4 };   // illustrative mix

const c = first.countries.findIndex(x => x.id === ID);
const zones = first.zones.map((z, i) => ({ id: z.id, i })).filter(z => first.zone.sovereign[z.i] === c);
const population = zones.reduce((n, z) => n + first.zone.population[z.i], 0);
// Annual military budget at week 1 (the planned weekly line x 52), and its cost per personnel equivalent.
const militaryYear = 52 * first.country.spendMilitary[c] * first.country.spendingBase[c];
const perPe = militaryYear / ESTABLISHMENT;

type Variant = { name: string; intake: number; costFactor: number; labour: boolean; money: boolean };
const VARIANTS: Variant[] = [
  { name: 'baseline', intake: 0, costFactor: 0, labour: false, money: false },
  { name: 'replace (937/week)', intake: 937, costFactor: 1, labour: true, money: true },
  { name: 'replace: labour only', intake: 937, costFactor: 1, labour: true, money: false },
  { name: 'replace: money only', intake: 937, costFactor: 1, labour: false, money: true },
  { name: 'surge (1,875/week, cost x1.5)', intake: 1875, costFactor: 1.5, labour: true, money: true },
  { name: 'illustration: 5,000/week', intake: 5000, costFactor: 1.5, labour: true, money: true },
];

function run(v: Variant) {
  let state = cloneEconomy(first);
  const others = state.countries.map(x => x.id).filter(x => x !== ID);
  let prices: number[] | null = null;
  let recruited = 0;
  let worst = 0;
  const out: Record<string, unknown> = {};
  for (let week = 2; week <= 156; week++) {
    recruited += v.intake;
    const effects: ExternalEffect[] = [];
    if (v.labour && v.intake) {
      for (const z of zones) effects.push({ type: 'set-mobilization', zoneId: z.id, personnel: recruited / 1e6 * state.zone.population[z.i] / population });
    }
    if (v.money && v.intake && prices) {
      const value = v.intake * perPe * v.costFactor;
      for (const [good, share] of Object.entries(EQUIPMENT)) {
        const g = state.config.goods.findIndex(x => x.id === good);
        effects.push({ type: 'military-procurement', countryId: ID, goodId: good, quantity: value * share / prices[g] });
      }
    }
    const result = advanceEconomy(state, { commands: autopilotCommands(state, others), effects }, { audit: true, report: 'full' });
    state = result.state;
    const report: TurnReport = result.report;
    worst = Math.max(worst, Math.abs(report.audit.moneyError), Math.abs(report.audit.bondError));
    const r = report.countries[c];
    prices = r.buyPrices;
    if (CHECKPOINTS.includes(week)) {
      out[`w${week}`] = {
        realGdp: r.gdpReal, unemployment: +r.unemployment.toFixed(4), debtToGdp: +r.debtToGdp.toFixed(4),
        balanceToGdp: +((r.budget.revenue - r.budget.spending) / r.gdpNominal).toFixed(4),
        militaryToGdp: +(r.budget.military / r.gdpNominal).toFixed(5), stability: +r.stability.toFixed(1),
        wage: r.wage, armsDelivered: r.armsDelivered, recruited,
        labourWithdrawn: v.labour ? +(recruited / (population * 1e6 * state.config.params.laborParticipation)).toFixed(5) : 0,
      };
    }
  }
  return { variant: v.name, ...out, audit: worst, hash: hashEconomy(state) };
}

const runs = VARIANTS.map(run);
const base = runs[0] as Record<string, any>;
const table = runs.map(r => {
  const x = r as Record<string, any>;
  return {
    variant: x.variant,
    ...Object.fromEntries(CHECKPOINTS.map(w => [`w${w}`, {
      realGdpVsBaselinePct: +(100 * (x[`w${w}`].realGdp / base[`w${w}`].realGdp - 1)).toFixed(3),
      unemploymentPp: +(100 * (x[`w${w}`].unemployment - base[`w${w}`].unemployment)).toFixed(3),
      debtToGdpPp: +(100 * (x[`w${w}`].debtToGdp - base[`w${w}`].debtToGdp)).toFixed(2),
      balanceToGdpPp: +(100 * (x[`w${w}`].balanceToGdp - base[`w${w}`].balanceToGdp)).toFixed(3),
      militaryToGdpPp: +(100 * (x[`w${w}`].militaryToGdp - base[`w${w}`].militaryToGdp)).toFixed(3),
      wageVsBaselinePct: +(100 * (x[`w${w}`].wage / base[`w${w}`].wage - 1)).toFixed(3),
      stabilityDiff: +(x[`w${w}`].stability - base[`w${w}`].stability).toFixed(1),
      labourWithdrawnPct: +(100 * x[`w${w}`].labourWithdrawn).toFixed(3),
    }])),
    audit: x.audit,
  };
});
// Determinism: the main variant twice gives the same final economy.
const again = run(VARIANTS[1]);
if (again.hash !== (runs[1] as Record<string, any>).hash) throw new Error('Non-deterministic economy run.');
for (const r of runs) if ((r as Record<string, any>).audit > 1e-6) throw new Error(`Audit failed in ${(r as Record<string, any>).variant}`);
const result = { package: '1.0.0-draft.3', country: ID, establishment: ESTABLISHMENT, militaryYearPerPe: perPe, equipmentMix: EQUIPMENT, runs, table };
console.log(JSON.stringify(table, null, 1));
if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(result, null, 1) + '\n');
console.log('Economy check passed: audits clean, deterministic.');
