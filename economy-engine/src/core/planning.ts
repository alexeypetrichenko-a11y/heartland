import type { EconomyState } from '../types.ts';
import type { Model, Workspace } from './model.ts';
import { AVERAGE_TIER, clamp, EPSILON, OWNERSHIP_COUNT, PRIVATE, privateHurdle, TIER_COUNT } from './model.ts';
import { RANDOM_STREAM, randomSigned } from './rng.ts';
import { capitalValues, firmBorrow, loanFinancedShare } from './credit.ts';

/**
 * Private-sector plans for the week: what firms want to produce and buy, what
 * households want to consume and how much new capacity firms want to build.
 *
 * Plans are made from what agents can observe (last week's prices, their own
 * stocks and smoothed sales), not from perfect foresight. That is deliberate:
 * behaviour is predictable but imperfectly optimised.
 *
 * Producers are firm aggregates (zone x sector x ownership), each split into
 * strong, average and fragile production lines. A zone's planned output of a
 * good is supplied in merit order: the cheapest (strong) lines first, the
 * fragile ones last. Every aggregate pays for its own staff, inputs and
 * investment from its own cash.
 */
export function planPrivateSector(s: EconomyState, w: Workspace, m: Model): void {
  const p = s.config.params;
  const Z = s.zones.length;
  const C = s.countries.length;
  const G = m.goodCount;
  const S = m.sectorCount;
  const O = OWNERSHIP_COUNT;
  const T = TIER_COUNT;
  const zg = s.zoneGood;
  const lineCapacity = s.firmLine.capacity;
  const firm = s.firm;
  const fg = s.firmGood;
  const tierFactor = m.tierFactor;
  const tierCapacity = [0, 0, 0];
  const tierViable = [0, 0, 0];

  for (let z = 0; z < Z; z++) {
    const c = s.zone.owner[z];
    const base = z * G;
    const aggregateBase = z * S * O;
    const tier = s.country.unrestTier[c];
    const strike = tier > 0 ? 1 - p.strikeLoss[tier - 1] : 1;
    const productivity = Math.max(0.05, s.zone.technology[z] * (1 + p.infraProductivity * (s.zone.infrastructure[z] - 1)));
    const wage = s.zone.wage[z];
    const laborSupply = Math.max(0, s.zone.population[z] * p.laborParticipation - s.zone.mobilized[z]);
    w.productivity[z] = productivity;
    w.laborSupply[z] = laborSupply;
    let capitalPrice = 0;
    for (let g = 0; g < G; g++) capitalPrice += m.investment[g] * zg.buyPrice[base + g];
    // Plant at replacement value is what banks lend against.
    capitalValues(s, w, m, z, capitalPrice);

    // --- Producers: desired output, supplied in merit order across tiers -----
    let laborNeed = 0;
    for (let g = 0; g < G; g++) {
      const index = base + g;
      const laborPerUnit = m.labor[g] / (productivity * zg.efficiency[index]);
      // A production shock (bad harvest, strike, financial disruption) means the
      // same people produce less: staffing follows normal output, not shocked output.
      const staffPerUnit = laborPerUnit / clamp(zg.yieldFactor[index] * strike, 0.2, 5);
      let inputCost = 0;
      const inputs = m.inputGoods[g];
      const amounts = m.inputAmounts[g];
      for (let i = 0; i < inputs.length; i++) inputCost += amounts[i] * zg.buyPrice[base + inputs[i]];
      const laborCost = laborPerUnit * wage;
      const lineBase = index * O * T;
      let total = 0;
      for (let t = 0; t < T; t++) {
        let capacity = 0;
        for (let o = 0; o < O; o++) capacity += lineCapacity[lineBase + o * T + t];
        tierCapacity[t] = capacity;
        total += capacity;
      }
      w.laborCost[index] = laborCost;
      w.inputCost[index] = inputCost;
      // Reference unit cost: that of the average tier, where all new plant starts.
      w.unitCost[index] = laborCost / tierFactor[AVERAGE_TIER] + inputCost;
      w.staffPerUnit[index] = staffPerUnit;
      let usable = zg.yieldFactor[index] * strike;
      if (p.harvestNoise > 0 && m.resourceBased[g]) {
        usable *= 1 + p.harvestNoise * randomSigned(s.seed, s.turn, RANDOM_STREAM.harvest, index);
      }
      const capacity = total * usable;
      w.effectiveCapacity[index] = capacity;
      if (!(capacity > EPSILON)) continue;
      const expected = zg.expectedDemand[index];
      // Stock expected to be left after this week's sales, net of spoilage.
      const carry = Math.max(0, zg.stock[index] - expected) * (1 - m.spoilage[g]);
      const adjust = m.spoilage[g] >= 1 ? 1 : p.inventoryAdjust;
      const want = Math.max(0, expected + (expected * m.cover[g] - carry) * adjust);
      // Each tier produces only while the price covers its own running costs
      // (smoothed over a narrow band so output does not jump on and off).
      const price = zg.price[index];
      let viableCapacity = 0;
      for (let t = 0; t < T; t++) {
        const cost = laborCost / tierFactor[t] + inputCost;
        const low = cost * (1 - p.shutdownBand);
        const high = cost * (1 + p.shutdownBand);
        tierViable[t] = w.calibrating || price >= high ? 1 : price <= low ? 0 : (price - low) / (high - low);
        viableCapacity += tierCapacity[t] * usable * tierViable[t];
      }
      let plan = Math.min(want, viableCapacity);
      let spare = 0;
      if (m.madeToOrder[g]) {
        // Made-to-order sectors staff for expected sales; capacity above that is
        // offered only as far as idle workers allow (see below).
        const expectedPlan = Math.min(expected, plan);
        spare = plan - expectedPlan;
        plan = expectedPlan;
      }
      w.want[index] = want;
      // Merit order: strong lines first, fragile lines last; owners within a tier pro rata.
      let left = plan;
      let spareLeft = spare;
      for (let t = 0; t < T; t++) {
        const offer = tierCapacity[t] * usable * tierViable[t];
        if (!(offer > 0)) continue;
        const take = left < offer ? left : offer;
        left -= take;
        const room = offer - take;
        const extra = spareLeft < room ? spareLeft : room;
        spareLeft -= extra;
        const takeShare = take / offer;
        const extraShare = extra / offer;
        const staff = staffPerUnit / tierFactor[t];
        for (let o = 0; o < O; o++) {
          const l = lineBase + o * T + t;
          const lineOffer = lineCapacity[l] * usable * tierViable[t];
          w.linePlan[l] = lineOffer * takeShare;
          w.lineSpare[l] = lineOffer * extraShare;
          laborNeed += w.linePlan[l] * staff;
        }
      }
    }

    // Workers are finite for the zone, cash for each aggregate: scale plans by the tighter limit.
    const laborScale = laborNeed > laborSupply ? laborSupply / laborNeed : 1;
    w.laborScale[z] = laborScale;
    for (let g = 0; g < G; g++) {
      const index = base + g;
      const a = aggregateBase + m.goodSector[g] * O;
      const lineBase = index * O * T;
      for (let o = 0; o < O; o++) {
        for (let t = 0; t < T; t++) {
          const plan = w.linePlan[lineBase + o * T + t];
          if (plan > 0) w.aggOutlay[a + o] += plan * laborScale * (w.laborCost[index] / tierFactor[t] + w.inputCost[index]);
        }
      }
    }
    let laborUsed = 0;
    let spareLabor = 0;
    for (let g = 0; g < G; g++) {
      const index = base + g;
      const a = aggregateBase + m.goodSector[g] * O;
      const lineBase = index * O * T;
      for (let o = 0; o < O; o++) {
        const outlay = w.aggOutlay[a + o];
        // Short of cash for the week's wages and inputs: borrow working capital first.
        if (outlay > 0.9 * firm.cash[a + o] && g === m.sectorGoods[m.goodSector[g]][0]) {
          firmBorrow(s, w, a + o, c, outlay / 0.9 - firm.cash[a + o]);
        }
        const cashLimit = 0.9 * firm.cash[a + o];
        const scale = outlay > cashLimit ? laborScale * (outlay > EPSILON ? cashLimit / outlay : 0) : laborScale;
        for (let t = 0; t < T; t++) {
          const l = lineBase + o * T + t;
          const staff = w.staffPerUnit[index] / tierFactor[t];
          w.linePlan[l] *= scale;
          w.lineSpare[l] *= scale;
          laborUsed += w.linePlan[l] * staff;
          spareLabor += w.lineSpare[l] * staff;
        }
      }
    }
    // Spare made-to-order capacity can be staffed from whoever is still idle.
    const idle = Math.max(0, laborSupply - laborUsed);
    const staffed = spareLabor > idle ? idle / spareLabor : 1;
    for (let g = 0; g < G; g++) {
      const index = base + g;
      const a = aggregateBase + m.goodSector[g] * O;
      const lineBase = index * O * T;
      let plan = 0;
      for (let o = 0; o < O; o++) {
        let ownerPlan = 0;
        for (let t = 0; t < T; t++) {
          const l = lineBase + o * T + t;
          if (w.lineSpare[l] > 0) w.linePlan[l] += w.lineSpare[l] * staffed;
          ownerPlan += w.linePlan[l];
          w.aggWageReserve[a + o] += w.linePlan[l] * w.staffPerUnit[index] / tierFactor[t] * wage;
        }
        w.saleShare[index * O + o] = ownerPlan;
        plan += ownerPlan;
      }
      w.plan[index] = plan;
      // Made-to-order goods are sold as they are made: sales belong to owners by output.
      for (let o = 0; o < O; o++) w.saleShare[index * O + o] = plan > EPSILON ? w.saleShare[index * O + o] / plan : 0;
    }

    // --- Intermediate inputs: this week's needs plus a small on-site buffer --
    // The input store is shared by the zone's firms; each aggregate orders and
    // pays for its own share of the requirement.
    for (let k = 0; k < G; k++) {
      const inputs = m.inputGoods[k];
      if (inputs.length === 0) continue;
      const amounts = m.inputAmounts[k];
      const a = aggregateBase + m.goodSector[k] * O;
      const lineBase = (base + k) * O * T;
      for (let o = 0; o < O; o++) {
        let ownerPlan = 0;
        for (let t = 0; t < T; t++) ownerPlan += w.linePlan[lineBase + o * T + t];
        if (!(ownerPlan > 0)) continue;
        const row = (a + o) * G;
        for (let i = 0; i < inputs.length; i++) w.aggDemandInput[row + inputs[i]] += amounts[i] * ownerPlan;
      }
    }
    for (let g = 0; g < G; g++) {
      let need = 0;
      for (let sector = 0; sector < G; sector++) need += m.recipe[sector * G + g] * w.plan[base + sector];
      w.inputNeed[base + g] = need;
      if (!(need > 0)) continue;
      const target = p.inputBufferWeeks * need * (1 - m.spoilage[g]);
      const demand = Math.max(0, need + (target - zg.inputBuffer[base + g]) * p.inputBufferAdjust);
      w.demandInput[base + g] = demand;
      const ratio = demand / need;
      for (let so = 0; so < S * O; so++) {
        const row = (aggregateBase + so) * G + g;
        const share = w.aggDemandInput[row];
        if (!(share > 0)) continue;
        w.aggDemandInput[row] = share * ratio;
        w.aggInputCost[aggregateBase + so] += share * ratio * zg.buyPrice[base + g];
      }
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

    // --- Investment: each aggregate expands where returns beat the cost of capital
    const hurdle = privateHurdle(s, c);
    const keep = Math.max(0.05, 1 - s.country.taxCorporate[c]);
    for (let g = 0; g < G; g++) {
      const index = base + g;
      const ownerBase = index * O;
      const lineBase = ownerBase * T;
      let capacity = 0;
      let pipeline = 0;
      for (let o = 0; o < O; o++) {
        for (let t = 0; t < T; t++) capacity += lineCapacity[lineBase + o * T + t];
        pipeline += fg.build1[ownerBase + o] + fg.build2[ownerBase + o] + fg.build3[ownerBase + o];
      }
      const installed = capacity + pipeline;
      const cap = zg.resourceCap[index];
      if (cap >= 0 && installed >= cap) continue;
      const exists = capacity > EPSILON;
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
      const growth = p.investGrowthMax * appetite * trigger * mood + replace;
      let requested = 0;
      for (let o = 0; o < O; o++) {
        let ownerCapacity = 0;
        for (let t = 0; t < T; t++) ownerCapacity += lineCapacity[lineBase + o * T + t];
        const ownerInstalled = ownerCapacity + fg.build1[ownerBase + o] + fg.build2[ownerBase + o] + fg.build3[ownerBase + o];
        let build = ownerInstalled * growth;
        // New or tiny sectors grow with the size of the local market, not their own.
        // Entry is private; the state does not found new firms on its own (no such rule is approved).
        const local = zg.usage[index];
        if (o === PRIVATE && local > EPSILON && installed < local) build += local * p.entryShare * appetite * (1 - installed / local);
        // While starting prices are being found, firms simply replace what wears out.
        if (w.calibrating) build = ownerCapacity * m.depreciationWeekly[g];
        if (!(build > 0)) build = 0;
        w.ownerBuild[ownerBase + o] = build;
        requested += build;
      }
      // A resource ceiling is shared by every owner in the zone.
      if (cap >= 0 && requested > cap - installed) {
        const fit = requested > EPSILON ? Math.max(0, cap - installed) / requested : 0;
        for (let o = 0; o < O; o++) w.ownerBuild[ownerBase + o] *= fit;
      }
      const a = aggregateBase + m.goodSector[g] * O;
      for (let o = 0; o < O; o++) w.aggInvestCost[a + o] += w.ownerBuild[ownerBase + o] * m.capitalWeeks[g] * capitalPrice;
    }
    for (let sector = 0; sector < S; sector++) {
      for (let o = 0; o < O; o++) {
        const a = aggregateBase + sector * O + o;
        const investCost = w.aggInvestCost[a];
        if (!(investCost > 0)) continue;
        // A share of every investment is financed with a bank loan (more when credit is cheap),
        // the rest from spare cash.
        const spare = Math.max(0, firm.cash[a] - w.aggWageReserve[a] - w.aggInputCost[a] - p.cashFloorWeeks * firm.costs[a]);
        const internal = spare * p.investCashShare;
        const share = loanFinancedShare(s, c);
        const planned = Math.min(investCost, internal / (1 - share));
        const borrowed = firmBorrow(s, w, a, c, planned * share);
        const funds = internal + borrowed;
        const funded = investCost > funds ? funds / investCost : 1;
        let units = 0;
        const goods = m.sectorGoods[sector];
        for (let i = 0; i < goods.length; i++) {
          const ownerIndex = (base + goods[i]) * O + o;
          w.ownerBuild[ownerIndex] *= funded;
          units += w.ownerBuild[ownerIndex] * m.capitalWeeks[goods[i]];
        }
        if (!(units > 0)) continue;
        for (let g = 0; g < G; g++) {
          if (!(m.investment[g] > 0)) continue;
          const quantity = units * m.investment[g];
          w.aggDemandInvestment[a * G + g] = quantity;
          w.demandInvestment[base + g] += quantity;
        }
      }
    }
  }
}
