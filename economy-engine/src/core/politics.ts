import type { EconomyEvent, EconomyState } from '../types.ts';
import type { Workspace } from './model.ts';
import { clamp, EPSILON } from './model.ts';
import { RANDOM_STREAM, randomUnit } from './rng.ts';

/**
 * Political stability of each regime.
 *
 * Stability (0-100) drifts towards a target set by living conditions and
 * policy. Low stability opens a crisis episode with up to three tiers
 * (protests, mass unrest, collapse). Following GAME_DESIGN.md section 6, the
 * regime is tested once per tier per episode, never every week.
 *
 * The engine only reports a regime change. Whether that defeats a human
 * player is decided by the host game.
 */
export function updatePolitics(s: EconomyState, w: Workspace, events: EconomyEvent[]): void {
  const p = s.config.params;
  const C = s.countries.length;
  const Z = s.zones.length;
  const G = s.config.goods.length;
  const country = s.country;
  const zone = s.zone;
  const inflation = w.countryInflation;
  const unemployment = w.countryUnemployment;
  const deprivation = w.countryDeprivation;
  const shortage = w.countryHouseholdShortage;
  const living = w.countryLiving;

  // Population-weighted living conditions.
  for (let z = 0; z < Z; z++) {
    const c = zone.owner[z];
    const weight = w.population[c] > EPSILON ? zone.population[z] / w.population[c] : 0;
    if (!(weight > 0)) continue;
    inflation[c] += weight * zone.inflation[z] * 52;
    unemployment[c] += weight * zone.unemployment[z];
    deprivation[c] += weight * zone.deprivation[z];
    let unmet = 0;
    let goods = 0;
    for (let g = 0; g < G; g++) {
      if (w.demandHousehold[z * G + g] > EPSILON) { unmet += s.zoneGood.shortage[z * G + g]; goods++; }
    }
    shortage[c] += weight * (goods > 0 ? unmet / goods : 0);
    const reference = zone.livingStandardRef[z];
    living[c] += weight * (reference > EPSILON ? (zone.livingStandard[z] - reference) / reference : 0);
  }

  for (let c = 0; c < C; c++) {
    if (!(w.population[c] > EPSILON)) continue;
    const taxes = w.revenueIncomeTax[c] + w.revenueConsumptionTax[c] + w.revenueCorporateTax[c] + w.revenueTariffs[c];
    const burden = w.countryNominal[c] > EPSILON ? taxes / w.countryNominal[c] : 0;
    const socialGap = country.spendSocial[c] * w.fundedShare[c] - p.socialNorm;
    const target = clamp(
      p.stabilityBase
      - p.stabilityInflationWeight * Math.max(0, inflation[c] - p.inflationTolerance)
      - p.stabilityUnemploymentWeight * Math.max(0, unemployment[c] - p.unemploymentTolerance)
      - p.stabilityDeprivationWeight * deprivation[c]
      - p.stabilityShortageWeight * shortage[c]
      // Falling living standards hurt fully; rising ones help only a little.
      + p.stabilityLivingStandardWeight * (living[c] < 0 ? living[c] : Math.min(0.05, living[c] * 0.5))
      - p.stabilityTaxWeight * Math.max(0, burden - p.taxTolerance)
      + p.stabilitySocialWeight * (socialGap < 0 ? socialGap : socialGap * 0.5)
      - p.stabilityArrearsWeight * country.arrears[c]
      + country.stabilityModifier[c],
      0, 100);
    country.stability[c] = clamp(country.stability[c] + p.stabilityAdjust * (target - country.stability[c]), 0, 100);

    const stability = country.stability[c];
    const tier = stability < p.unrestThresholds[2] ? 3 : stability < p.unrestThresholds[1] ? 2 : stability < p.unrestThresholds[0] ? 1 : 0;
    const id = s.countries[c].id;
    const turn = s.turn + 1;
    if (country.immunityWeeks[c] > 0) country.immunityWeeks[c] -= 1;
    country.unrestTier[c] = tier;

    if (tier > 0) {
      if (country.episodeActive[c] === 0) {
        country.episodeActive[c] = 1;
        country.episodePeakTier[c] = tier;
        country.rolledTier[c] = 0;
        country.tierWeeks[c] = 0;
        events.push({ type: 'unrest-started', turn, countryId: id, tier });
      } else if (tier > country.episodePeakTier[c]) {
        country.episodePeakTier[c] = tier;
        country.tierWeeks[c] = 0;
        events.push({ type: 'unrest-escalated', turn, countryId: id, tier });
      }
      if (tier > country.rolledTier[c]) {
        country.tierWeeks[c] += 1;
        if (country.tierWeeks[c] >= p.unrestGraceWeeks && country.immunityWeeks[c] === 0) {
          // One test per tier per episode. The draw depends only on seed, week, country and tier.
          const probability = p.collapseProbability[tier - 1];
          const draw = randomUnit(s.seed, s.turn, RANDOM_STREAM.regime, c * 4 + tier);
          country.rolledTier[c] = tier;
          country.tierWeeks[c] = 0;
          if (draw < probability) {
            country.regime[c] += 1;
            country.stability[c] = p.postRegimeStability;
            country.unrestTier[c] = 0;
            country.episodeActive[c] = 0;
            country.episodePeakTier[c] = 0;
            country.rolledTier[c] = 0;
            country.immunityWeeks[c] = p.regimeImmunityWeeks;
            events.push({ type: 'regime-change', turn, countryId: id, tier, probability, regime: country.regime[c] });
          } else {
            events.push({ type: 'regime-survived', turn, countryId: id, tier, probability });
          }
        }
      } else country.tierWeeks[c] = 0;
    } else if (country.episodeActive[c] === 1 && stability >= p.unrestEndThreshold) {
      country.episodeActive[c] = 0;
      country.episodePeakTier[c] = 0;
      country.rolledTier[c] = 0;
      country.tierWeeks[c] = 0;
      events.push({ type: 'unrest-ended', turn, countryId: id });
    }
  }
}
