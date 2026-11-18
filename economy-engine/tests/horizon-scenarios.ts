import type { EconomyEvent, EconomyState, TurnInput } from '../src/index.ts';
import { advanceEconomyInPlace, auditError, autopilotCommands, cloneEconomy, createCatalogueWorldSpec, createEconomy, createTestWorldSpec } from '../src/index.ts';

/**
 * Games of the intended lengths (52, 104 and 156 weekly turns), calm and adverse,
 * shared by tests/horizon.test.ts. Every government runs on the autopilot; the
 * scripted shocks and commands below come on top, exactly as a player's would.
 */

export const HORIZONS = [52, 104, 156] as const;
export type WorldKind = '7-good' | '31-good';

let cache7: EconomyState | null = null;
let cache31: EconomyState | null = null;
export function freshWorld(kind: WorldKind): EconomyState {
  if (kind === '7-good') return cloneEconomy(cache7 ??= createEconomy(createTestWorldSpec()));
  return cloneEconomy(cache31 ??= createEconomy(createCatalogueWorldSpec()));
}

export interface HorizonScenario {
  name: string;
  /** Whether the scenario is calm (no shock and no intervention). */
  calm: boolean;
  /** Scripted input for the week about to be resolved (1 = first week). */
  script: (week: number, kind: WorldKind) => TurnInput | undefined;
}

const energyGood = (kind: WorldKind) => (kind === '7-good' ? 'energy' : 'crude_oil');

const capacityDestruction = (week: number): TurnInput | undefined =>
  week === 10 ? { effects: ['sundara-delta', 'sundara-inland'].map(zoneId => ({ type: 'destroy-capacity' as const, zoneId, goodId: 'all' as const, fraction: 0.35 })) } : undefined;

const supplyShock = (week: number, kind: WorldKind): TurnInput | undefined => {
  if (week === 20) {
    return {
      effects: [
        ...['khazir', 'ostmark', 'verdania'].map(zoneId => ({ type: 'production-shock' as const, zoneId, goodId: energyGood(kind), factor: 0.4, recoveryWeeks: 52 })),
        { type: 'set-lane' as const, laneId: 'ocean-east', costMultiplier: 1, throughput: 0 },
      ],
      commands: ['norland', 'verdania', 'halcyon'].map(countryId => ({ type: 'set-sanction' as const, countryId, targetId: 'ostmark', goodIds: 'all' as const, imports: true, exports: true })),
    };
  }
  if (week === 72) {
    return {
      effects: [{ type: 'set-lane' as const, laneId: 'ocean-east', costMultiplier: 1, throughput: 1 }],
      commands: ['norland', 'verdania', 'halcyon'].map(countryId => ({ type: 'set-sanction' as const, countryId, targetId: 'ostmark', goodIds: 'all' as const, imports: false, exports: false })),
    };
  }
  return undefined;
};

const fiscalCrisis = (week: number): TurnInput | undefined => {
  if (week === 5) return { commands: [{ type: 'set-spending', countryId: 'tavros', category: 'social', share: 0.3 }] };
  if (week === 40) return { commands: [{ type: 'declare-default', countryId: 'tavros' }] };
  if (week === 100) return { commands: [{ type: 'declare-default', countryId: 'tavros' }] };
  return undefined;
};

const stateIntervention = (week: number): TurnInput | undefined => {
  if (week === 15) {
    return {
      commands: [
        { type: 'nationalize', countryId: 'norland', zoneId: 'norland-core', sectorId: 'heavy_industry', share: 0.5 },
        { type: 'set-public-objective', countryId: 'norland', sectorId: 'all', objective: 'maximum-production' },
        { type: 'set-public-support', countryId: 'norland', sectorId: 'all', enabled: true },
        { type: 'set-public-objective', countryId: 'sundara', sectorId: 'all', objective: 'affordable-prices' },
      ],
    };
  }
  if (week === 60) return { commands: [{ type: 'recapitalize-central-bank', countryId: 'norland', amount: 1 }] };
  if (week === 90) return { commands: [{ type: 'privatize', countryId: 'norland', zoneId: 'norland-core', sectorId: 'heavy_industry', share: 0.5 }] };
  return undefined;
};

function merge(...inputs: (TurnInput | undefined)[]): TurnInput | undefined {
  const present = inputs.filter((input): input is TurnInput => !!input);
  if (present.length === 0) return undefined;
  return { commands: present.flatMap(input => input.commands ?? []), effects: present.flatMap(input => input.effects ?? []) };
}

export const SCENARIOS: readonly HorizonScenario[] = [
  { name: 'calm', calm: true, script: () => undefined },
  { name: 'capacity destruction (35% of Sundara, week 10)', calm: false, script: capacityDestruction },
  { name: 'energy shock, sea lane cut and sanctions (weeks 20-72)', calm: false, script: supplyShock },
  { name: 'fiscal crisis with two defaults (Tavros, weeks 40 and 100)', calm: false, script: fiscalCrisis },
  { name: 'state intervention (nationalisation, objectives, support, privatisation)', calm: false, script: stateIntervention },
  { name: 'all adverse shocks combined', calm: false, script: (week, kind) => merge(capacityDestruction(week), supplyShock(week, kind), fiscalCrisis(week), stateIntervention(week)) },
];

export interface HorizonStats {
  /** World real GDP at the end of the run relative to week 1. */
  gdpRatio: number;
  /** Lowest world real GDP in any week relative to week 1. */
  gdpLow: number;
  /** Mean world inflation (annualised) over the run, and the extreme weekly values. */
  meanInflation: number;
  minInflation: number;
  maxInflation: number;
  /** Worst unemployment of any country in any week. */
  worstUnemployment: number;
  /** Highest debt-to-GDP of any country in any week. */
  maxDebt: number;
  /** Lowest stability of any country in any week. */
  minStability: number;
  /** Weeks recorded so far. */
  weeks: number;
  worstAuditError: number;
  /** Negative or non-finite values found by the weekly audit (summed over weeks). */
  negativeOrNonFinite: number;
  defaults: number;
  regimeChanges: number;
  bankruptcies: number;
  events: EconomyEvent[];
}

/** Play `from`..`to` (inclusive, 1-based weeks) on `state` with the scenario's script, audit on. */
export function play(state: EconomyState, kind: WorldKind, scenario: HorizonScenario, from: number, to: number, stats?: HorizonStats, start?: { gdp: number }): void {
  for (let week = from; week <= to; week++) {
    const scripted = scenario.script(week, kind);
    const report = advanceEconomyInPlace(state, { commands: [...autopilotCommands(state), ...(scripted?.commands ?? [])], effects: scripted?.effects ?? [] }, { audit: true, report: stats ? 'full' : 'none' });
    if (!stats || !start) continue;
    stats.worstAuditError = Math.max(stats.worstAuditError, auditError(report.audit));
    stats.negativeOrNonFinite += report.audit.negativeValues + report.audit.nonFiniteValues;
    const gdp = report.world.gdpReal;
    if (week === 1) start.gdp = gdp;
    stats.gdpLow = Math.min(stats.gdpLow, gdp / start.gdp);
    stats.gdpRatio = gdp / start.gdp;
    stats.weeks++;
    stats.meanInflation += (report.world.inflation - stats.meanInflation) / stats.weeks;
    stats.minInflation = Math.min(stats.minInflation, report.world.inflation);
    stats.maxInflation = Math.max(stats.maxInflation, report.world.inflation);
    for (const c of report.countries) {
      stats.worstUnemployment = Math.max(stats.worstUnemployment, c.unemployment);
      stats.maxDebt = Math.max(stats.maxDebt, c.debtToGdp);
      stats.minStability = Math.min(stats.minStability, c.stability);
    }
    for (const event of report.events) {
      stats.events.push(event);
      if (event.type === 'sovereign-default') stats.defaults++;
      if (event.type === 'regime-change') stats.regimeChanges++;
      if (event.type === 'firm-bankruptcy') stats.bankruptcies++;
    }
  }
}

export function newStats(): HorizonStats {
  return { gdpRatio: 1, gdpLow: Infinity, meanInflation: 0, minInflation: Infinity, maxInflation: -Infinity, worstUnemployment: 0, maxDebt: 0,
    minStability: Infinity, weeks: 0, worstAuditError: 0, negativeOrNonFinite: 0, defaults: 0, regimeChanges: 0, bankruptcies: 0, events: [] };
}

/** Run a scenario from a fresh world for `weeks` weeks and collect its statistics. */
export function runHorizon(kind: WorldKind, scenario: HorizonScenario, weeks: number): { state: EconomyState; stats: HorizonStats } {
  const state = freshWorld(kind);
  const stats = newStats();
  play(state, kind, scenario, 1, weeks, stats, { gdp: 0 });
  return { state, stats };
}
