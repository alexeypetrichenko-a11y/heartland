import type { EconomyEvent, EconomyState, OccupationPolicy } from '../types.ts';
import type { Model, Workspace } from './model.ts';
import { clamp, DUST, OWNERSHIP_COUNT, TIER_COUNT } from './model.ts';
import { RANDOM_STREAM, randomUnit } from './rng.ts';

/**
 * Military occupation (Milestone 4: R49, R50, R62, defect C2).
 *
 * A zone has a legal owner (`zone.sovereign`) and a controlling country
 * (`zone.owner`). They differ while the zone is occupied. The occupier then
 * controls the zone's economy: it collects its taxes, its firms' production is
 * sold in the occupier's market (with the occupier's trade policy), and it
 * spends there as far as its occupation policy says. Firms keep their legal
 * owners: nothing is confiscated or nationalised, private profits still go to
 * the zone's households, and the public firms' dividends owed to the legal
 * owner are withheld (kept by the firms) until liberation. The occupied zone and
 * the zones its legal owner still controls cannot trade with each other: the
 * front line is closed (C2).
 *
 * Two policies (R50), both provisional:
 * - moderate: a levy on a fifth of firms' profits, little disorganisation,
 *   the occupier spends there as at home; resistance stays low;
 * - intensive: a levy on half of firms' profits and 5% of wages, more
 *   disorganisation, less spending on the occupied population; resistance,
 *   sabotage and security costs rise, and output suffers in the long run.
 * Resistance builds up in months and fades over more than a year, so a past
 * policy is felt long after it is changed.
 *
 * Every change of control is reported as an event, and occupation never creates
 * or destroys money or goods. Sabotage destroys plant only through a reported
 * `sabotage` event; the levy and security costs are budget lines.
 */

export const OCCUPATION_POLICIES: readonly OccupationPolicy[] = ['moderate', 'intensive'];

export function isOccupied(s: EconomyState, z: number): boolean {
  return s.zone.owner[z] !== s.zone.sovereign[z];
}

/**
 * True when zones a and b are on opposite sides of a front line: one of them is
 * occupied and the other is controlled by its legal owner. They do not trade.
 */
export function acrossFrontLine(owner: readonly number[], sovereign: readonly number[], a: number, b: number): boolean {
  return (owner[a] !== sovereign[a] && owner[b] === sovereign[a]) || (owner[b] !== sovereign[b] && owner[a] === sovereign[b]);
}

/** Take control of zone z for `occupier` (or give it back when `occupier` is the legal owner). */
export function occupyZone(s: EconomyState, z: number, occupier: number, policy: number, events: EconomyEvent[]): void {
  const zone = s.zone;
  if (occupier === zone.sovereign[z]) { liberateZone(s, z, events); return; }
  zone.owner[z] = occupier;
  zone.occupationPolicy[z] = policy;
  events.push({
    type: 'zone-occupied', turn: s.turn + 1, countryId: s.countries[occupier].id, zoneId: s.zones[z].id, occupierId: s.countries[occupier].id,
    sovereignId: s.countries[zone.sovereign[z]].id, policy: OCCUPATION_POLICIES[policy],
  });
}

/** Control returns to the legal owner. Resistance fades from now on. */
export function liberateZone(s: EconomyState, z: number, events: EconomyEvent[]): void {
  const zone = s.zone;
  if (!isOccupied(s, z)) return;
  const former = zone.owner[z];
  zone.owner[z] = zone.sovereign[z];
  zone.occupationPolicy[z] = 0;
  zone.revolt[z] = 0;
  events.push({
    type: 'zone-liberated', turn: s.turn + 1, countryId: s.countries[zone.sovereign[z]].id, zoneId: s.zones[z].id, sovereignId: s.countries[zone.sovereign[z]].id,
    formerOccupierId: s.countries[former].id,
  });
}

/** Annexation: the zone legally and economically becomes `owner`'s; any occupation ends. */
export function annexZone(s: EconomyState, z: number, owner: number, events: EconomyEvent[]): void {
  const zone = s.zone;
  const former = zone.sovereign[z];
  zone.owner[z] = owner;
  zone.sovereign[z] = owner;
  zone.occupationPolicy[z] = 0;
  zone.revolt[z] = 0;
  if (former !== owner) {
    events.push({ type: 'zone-annexed', turn: s.turn + 1, countryId: s.countries[owner].id, zoneId: s.zones[z].id, ownerId: s.countries[owner].id, formerOwnerId: s.countries[former].id });
  }
}

/**
 * Start of the week: how much of the controller's spending reaches each zone, and
 * what share of normal output each occupied zone can still deliver.
 */
export function prepareOccupation(s: EconomyState, w: Workspace): void {
  const p = s.config.params;
  const zone = s.zone;
  for (let z = 0; z < s.zones.length; z++) {
    const c = zone.owner[z];
    let weight = 1;
    let factor = 1;
    if (isOccupied(s, z)) {
      const policy = zone.occupationPolicy[z];
      weight = p.occupationCivilianSpending[policy];
      factor = 1 - p.occupationDisorder[policy] - p.sabotageOutputLoss * zone.resistance[z];
    } else w.politicsPopulation[c] += zone.population[z];
    w.spendWeight[z] = weight;
    w.occupationFactor[z] = factor;
    w.spendPopulation[c] += zone.population[z] * weight;
  }
}

/**
 * End of the week: resistance moves, saboteurs may strike, the occupier pays for
 * security, and open revolts are reported.
 */
export function updateOccupation(s: EconomyState, w: Workspace, m: Model, events: EconomyEvent[]): void {
  if (w.calibrating) return;
  const p = s.config.params;
  const Z = s.zones.length;
  const G = m.goodCount;
  const zone = s.zone;
  const turn = s.turn + 1;
  for (let z = 0; z < Z; z++) {
    if (!isOccupied(s, z)) {
      // Resistance against a former occupier fades once the zone is free (or annexed).
      zone.resistance[z] *= 1 - p.resistanceFallFree;
      if (zone.resistance[z] < 1e-6) zone.resistance[z] = 0;
      continue;
    }
    const c = zone.owner[z];
    const policy = zone.occupationPolicy[z];
    // Hardship feeds resistance on top of what the policy itself provokes.
    const target = clamp(p.resistanceBase[policy] + p.resistanceDeprivationWeight * zone.deprivation[z]
      + p.resistanceUnemploymentWeight * Math.max(0, zone.unemployment[z] - p.naturalUnemployment), 0, 1);
    const resistance = zone.resistance[z];
    zone.resistance[z] = clamp(resistance + (target > resistance ? p.resistanceRise : p.resistanceFall) * (target - resistance), 0, 1);
    const level = zone.resistance[z];

    // Sabotage: plant of one good destroyed, drawn from the seeded generator.
    if (level > 0 && randomUnit(s.seed, s.turn, RANDOM_STREAM.sabotage, z * 2) < p.sabotageChance * level) {
      let present = 0;
      for (let g = 0; g < G; g++) if (zoneCapacityOf(s, z, g) > DUST) present++;
      if (present > 0) {
        let pick = Math.min(present - 1, Math.floor(randomUnit(s.seed, s.turn, RANDOM_STREAM.sabotage, z * 2 + 1) * present));
        let good = -1;
        for (let g = 0; g < G && good < 0; g++) if (zoneCapacityOf(s, z, g) > DUST && pick-- === 0) good = g;
        const lines = OWNERSHIP_COUNT * TIER_COUNT;
        const base = (z * G + good) * lines;
        let destroyed = 0;
        for (let k = 0; k < lines; k++) {
          const lost = s.firmLine.capacity[base + k] * p.sabotageDamage;
          s.firmLine.capacity[base + k] -= lost;
          destroyed += lost;
        }
        events.push({
          type: 'sabotage', turn, countryId: s.countries[c].id, zoneId: s.zones[z].id, occupierId: s.countries[c].id, goodId: s.config.goods[good].id,
          capacity: destroyed, share: p.sabotageDamage,
        });
      }
    }

    // Security is paid by the occupier, as pay to its own households (its forces).
    const cost = (p.securityCost[policy] + p.securityResistanceCost * level) * Math.max(0, w.valueAdded[z]);
    const paid = Math.min(cost, Math.max(0, s.country.treasury[c]));
    if (paid > 0) {
      s.country.treasury[c] -= paid;
      w.spentOccupationSecurity[c] += paid;
      w.occupationSecurity[z] = paid;
      payHomeHouseholds(s, w, c, z, paid);
    }

    if (zone.revolt[z] === 0 && level >= p.revoltThreshold) {
      zone.revolt[z] = 1;
      events.push({ type: 'occupation-revolt', turn, countryId: s.countries[c].id, zoneId: s.zones[z].id, occupierId: s.countries[c].id, resistance: level });
    } else if (zone.revolt[z] === 1 && level < p.revoltEndThreshold) {
      zone.revolt[z] = 0;
      events.push({ type: 'occupation-revolt-ended', turn, countryId: s.countries[c].id, zoneId: s.zones[z].id, occupierId: s.countries[c].id, resistance: level });
    }
  }
}

function zoneCapacityOf(s: EconomyState, z: number, g: number): number {
  const lines = OWNERSHIP_COUNT * TIER_COUNT;
  const base = (z * s.config.goods.length + g) * lines;
  let total = 0;
  for (let k = 0; k < lines; k++) total += s.firmLine.capacity[base + k];
  return total;
}

/** Pay `amount` to the households of the zones country c controls and legally owns (by population). */
function payHomeHouseholds(s: EconomyState, w: Workspace, c: number, fallbackZone: number, amount: number): void {
  const zone = s.zone;
  let population = 0;
  for (let z = 0; z < s.zones.length; z++) if (zone.owner[z] === c && zone.sovereign[z] === c) population += zone.population[z];
  if (!(population > 0)) {
    zone.householdMoney[fallbackZone] += amount;
    w.householdIncome[fallbackZone] += amount;
    return;
  }
  let paid = 0;
  let last = -1;
  for (let z = 0; z < s.zones.length; z++) {
    if (zone.owner[z] !== c || zone.sovereign[z] !== c) continue;
    const part = amount * zone.population[z] / population;
    zone.householdMoney[z] += part;
    w.householdIncome[z] += part;
    paid += part;
    last = z;
  }
  // Rounding remainder to the last zone so no money is lost.
  zone.householdMoney[last] += amount - paid;
  w.householdIncome[last] += amount - paid;
}
