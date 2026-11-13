import type { EconomyState } from '../types.ts';
import type { Model, Workspace } from './model.ts';
import { clamp, EPSILON } from './model.ts';
import { RANDOM_STREAM, randomSigned } from './rng.ts';

/**
 * Private-sector plans for the week: what firms want to produce and buy, what
 * households want to consume and how much new capacity firms want to build.
 *
 * Plans are made from what agents can observe (last week's prices, their own
 * stocks and smoothed sales), not from perfect foresight. That is deliberate:
 * behaviour is predictable but imperfectly optimised.
 */
export function planPrivateSector(s: EconomyState, w: Workspace, m: Model): void {
  const p = s.config.params;
  const Z = s.zones.length;
  const C = s.countries.length;
  const G = m.goodCount;
  const zg = s.zoneGood;

  for (let z = 0; z < Z; z++) {
    const c = s.zone.owner[z];
    const base = z * G;
    const tier = s.country.unrestTier[c];
    const strike = tier > 0 ? 1 - p.strikeLoss[tier - 1] : 1;
    const productivity = Math.max(0.05, s.zone.technology[z] * (1 + p.infraProductivity * (s.zone.infrastructure[z] - 1)));
    const wage = s.zone.wage[z];
    const laborSupply = Math.max(0, s.zone.population[z] * p.laborParticipation - s.zone.mobilized[z]);
    w.productivity[z] = productivity;
    w.laborSupply[z] = laborSupply;

    // --- Producers: desired output, limited by capacity and profitability ----
    let laborNeed = 0;
    const spare = w.goodScratchC;
    spare.fill(0);
    for (let g = 0; g < G; g++) {
      const index = base + g;
      const laborPerUnit = m.labor[g] / (productivity * zg.efficiency[index]);
      // A production shock (bad harvest, strike, financial disruption) means the
      // same people produce less: staffing follows normal output, not shocked output.
      const staffPerUnit = laborPerUnit / clamp(zg.yieldFactor[index] * strike, 0.2, 5);
      let cost = laborPerUnit * wage;
      const inputs = m.inputGoods[g];
      const amounts = m.inputAmounts[g];
      for (let i = 0; i < inputs.length; i++) cost += amounts[i] * zg.buyPrice[base + inputs[i]];
      w.unitCost[index] = cost;
      let capacity = zg.capacity[index] * zg.yieldFactor[index] * strike;
      if (p.harvestNoise > 0 && m.resourceBased[g]) {
        capacity *= 1 + p.harvestNoise * randomSigned(s.seed, s.turn, RANDOM_STREAM.harvest, index);
      }
      w.effectiveCapacity[index] = capacity;
      if (!(capacity > EPSILON)) continue;
      const expected = zg.expectedDemand[index];
      // Stock expected to be left after this week's sales, net of spoilage.
      const carry = Math.max(0, zg.stock[index] - expected) * (1 - m.spoilage[g]);
      const adjust = m.spoilage[g] >= 1 ? 1 : p.inventoryAdjust;
      const want = Math.max(0, expected + (expected * m.cover[g] - carry) * adjust);
      // Firms differ in cost: output shrinks smoothly as the price nears unit cost.
      const low = cost * (1 - p.shutdownBand);
      const high = cost * (1 + p.shutdownBand);
      const price = zg.price[index];
      const viable = w.calibrating || price >= high ? 1 : price <= low ? 0 : (price - low) / (high - low);
      let plan = Math.min(want, capacity * viable);
      if (m.madeToOrder[g]) {
        // Made-to-order sectors staff for expected sales; capacity above that is
        // offered only as far as idle workers allow (see below).
        const expectedPlan = Math.min(expected, plan);
        spare[g] = plan - expectedPlan;
        plan = expectedPlan;
      }
      w.want[index] = want;
      w.plan[index] = plan;
      laborNeed += plan * staffPerUnit;
      w.staffPerUnit[index] = staffPerUnit;
    }

    // Workers and cash are finite: scale every plan by the tighter of the two.
    const laborScale = laborNeed > laborSupply ? laborSupply / laborNeed : 1;
    w.laborScale[z] = laborScale;
    let outlay = 0;
    for (let g = 0; g < G; g++) outlay += w.plan[base + g] * laborScale * w.unitCost[base + g];
    const cashLimit = 0.9 * s.zone.firmMoney[z];
    const scale = outlay > cashLimit ? laborScale * (outlay > EPSILON ? cashLimit / outlay : 0) : laborScale;
    let wageReserve = 0;
    let laborUsed = 0;
    let spareLabor = 0;
    for (let g = 0; g < G; g++) {
      const perUnit = w.staffPerUnit[base + g];
      const plan = w.plan[base + g] * scale;
      w.plan[base + g] = plan;
      laborUsed += plan * perUnit;
      spareLabor += spare[g] * scale * perUnit;
    }
    // Spare made-to-order capacity can be staffed from whoever is still idle.
    const idle = Math.max(0, laborSupply - laborUsed);
    const staffed = spareLabor > idle ? idle / spareLabor : 1;
    for (let g = 0; g < G; g++) {
      if (spare[g] > 0) w.plan[base + g] += spare[g] * scale * staffed;
      wageReserve += w.plan[base + g] * w.staffPerUnit[base + g] * wage;
    }
    w.wageReserve[z] = wageReserve;

    // --- Intermediate inputs: this week's needs plus a small on-site buffer --
    let inputCost = 0;
    for (let g = 0; g < G; g++) {
      let need = 0;
      for (let sector = 0; sector < G; sector++) need += m.recipe[sector * G + g] * w.plan[base + sector];
      if (!(need > 0)) continue;
      const target = p.inputBufferWeeks * need * (1 - m.spoilage[g]);
      const demand = Math.max(0, need + (target - zg.inputBuffer[base + g]) * p.inputBufferAdjust);
      w.demandInput[base + g] = demand;
      inputCost += demand * zg.buyPrice[base + g];
    }

    // --- Households: subsistence first, the rest by fixed budget shares ------
    let bondWealth = 0;
    for (let k = 0; k < C; k++) bondWealth += s.bonds[z * C + k];
    const money = s.zone.householdMoney[z];
    const budget = Math.min(
      p.consumeIncome * s.zone.expectedIncome[z] + p.consumeMoney * money + p.consumeBonds * bondWealth,
      p.maxMoneySpendShare * money);
    w.householdBudget[z] = budget;
    const taxed = 1 + s.country.taxConsumption[c];
    const population = s.zone.population[z];
    let subsistenceCost = 0;
    for (let g = 0; g < G; g++) subsistenceCost += m.subsistence[g] * population * zg.buyPrice[base + g] * taxed;
    w.householdNeed[z] = subsistenceCost;
    if (budget >= subsistenceCost) {
      const spare = budget - subsistenceCost;
      for (let g = 0; g < G; g++) {
        w.demandHousehold[base + g] = m.subsistence[g] * population
          + (m.budgetShare[g] > 0 ? m.budgetShare[g] * spare / (zg.buyPrice[base + g] * taxed) : 0);
      }
    } else {
      // Cannot afford the basics: every necessity is cut in the same proportion.
      const ratio = subsistenceCost > EPSILON ? budget / subsistenceCost : 0;
      for (let g = 0; g < G; g++) w.demandHousehold[base + g] = m.subsistence[g] * population * ratio;
    }

    // --- Investment: expand where returns beat the cost of capital -----------
    let capitalPrice = 0;
    for (let g = 0; g < G; g++) capitalPrice += m.investment[g] * zg.buyPrice[base + g];
    const hurdle = s.country.marketRate[c] + p.equityPremium;
    const keep = Math.max(0.05, 1 - s.country.taxCorporate[c]);
    let investCost = 0;
    for (let g = 0; g < G; g++) {
      const index = base + g;
      const pipeline = zg.build1[index] + zg.build2[index] + zg.build3[index];
      const installed = zg.capacity[index] + pipeline;
      const cap = zg.resourceCap[index];
      if (cap >= 0 && installed >= cap) continue;
      const exists = zg.capacity[index] > EPSILON;
      const pressure = exists ? zg.pressure[index] : 1;
      const perUnit = zg.margin[index] * zg.price[index];
      const yearlyReturn = 52 * perUnit * keep * Math.min(1, pressure) / (m.capitalWeeks[g] * capitalPrice)
        - m.depreciationWeekly[g] * 52;
      const appetite = clamp((yearlyReturn - hurdle) / (hurdle * p.investSensitivity), 0, 1);
      const threshold = p.investPressureTrigger * m.normalUtilization[g];
      const trigger = clamp((pressure - threshold) / (1 - threshold), 0, 1.5);
      const mood = 1 + p.behaviorNoise * randomSigned(s.seed, s.turn, RANDOM_STREAM.investment, index);
      // Worn-out capacity is replaced only to the extent the sector still pays.
      const replace = m.depreciationWeekly[g] * clamp(yearlyReturn / hurdle, 0, 1) * clamp(pressure / m.normalUtilization[g], 0, 1);
      let build = installed * (p.investGrowthMax * appetite * trigger * mood + replace);
      // New or tiny sectors grow with the size of the local market, not their own.
      const local = zg.usage[index];
      if (local > EPSILON && installed < local) build += local * p.entryShare * appetite * (1 - installed / local);
      // While starting prices are being found, firms simply replace what wears out.
      if (w.calibrating) build = zg.capacity[index] * m.depreciationWeekly[g];
      if (cap >= 0) build = Math.min(build, cap - installed);
      if (!(build > 0)) continue;
      w.newBuild[index] = build;
      investCost += build * m.capitalWeeks[g] * capitalPrice;
    }
    if (investCost > 0) {
      const spare = Math.max(0, s.zone.firmMoney[z] - wageReserve - inputCost - p.cashFloorWeeks * s.zone.firmCosts[z]);
      const funds = spare * p.investCashShare;
      const funded = investCost > funds ? funds / investCost : 1;
      let units = 0;
      for (let g = 0; g < G; g++) {
        w.newBuild[base + g] *= funded;
        units += w.newBuild[base + g] * m.capitalWeeks[g];
      }
      for (let g = 0; g < G; g++) {
        if (m.investment[g] > 0) w.demandInvestment[base + g] = units * m.investment[g];
      }
    }
  }
}
