import type { EconomyState } from '../types.ts';
import type { Model, Workspace } from './model.ts';
import { capitalCharge, clamp, DUST, EPSILON, privateHurdle } from './model.ts';

/**
 * Production, incomes and the weekly adjustment of prices, wages,
 * expectations and capacity.
 */

/**
 * For one zone: how much of each input is on site, and which share of the
 * week's planned requirement that covers (1 = fully covered).
 */
export function inputRatios(s: EconomyState, w: Workspace, m: Model, z: number, available: Float64Array, ratio: Float64Array): void {
  const G = m.goodCount;
  const base = z * G;
  for (let g = 0; g < G; g++) {
    let need = 0;
    for (let sector = 0; sector < G; sector++) need += m.recipe[sector * G + g] * w.plan[base + sector];
    available[g] = s.zoneGood.inputBuffer[base + g] + w.gotInput[base + g];
    ratio[g] = need > EPSILON ? Math.min(1, available[g] / need) : 1;
  }
}

/** Firms turn the inputs they obtained into output and pay their workers and owners. */
export function produce(s: EconomyState, w: Workspace, m: Model): void {
  const p = s.config.params;
  const Z = s.zones.length;
  const G = m.goodCount;
  const zg = s.zoneGood;
  const available = w.goodScratchA;
  const ratio = w.goodScratchB;
  const used = w.goodScratchC;

  for (let z = 0; z < Z; z++) {
    const c = s.zone.owner[z];
    const base = z * G;
    inputRatios(s, w, m, z, available, ratio);
    used.fill(0);

    let employment = 0;
    let valueAdded = 0;
    let valueAddedReal = 0;
    for (let sector = 0; sector < G; sector++) {
      const index = base + sector;
      const plan = w.plan[index];
      // Unsold stock spoils, then this week's output is added.
      const unsold = zg.stock[index];
      const spoiled = unsold * m.spoilage[sector];
      w.ledgerSpoiled[sector] += spoiled;
      if (!(plan > 0)) { zg.stock[index] = unsold - spoiled; continue; }
      const inputs = m.inputGoods[sector];
      const amounts = m.inputAmounts[sector];
      let output: number;
      if (m.madeToOrder[sector]) {
        // Made to order: what was sold this week is what was produced.
        output = w.sold[index];
      } else {
        // A recipe needs every input: the scarcest one limits output.
        let scale = 1;
        for (let i = 0; i < inputs.length; i++) if (ratio[inputs[i]] < scale) scale = ratio[inputs[i]];
        output = plan * scale;
      }
      w.output[index] = output;
      let inputValue = 0;
      let inputReal = 0;
      for (let i = 0; i < inputs.length; i++) {
        const quantity = amounts[i] * output;
        used[inputs[i]] += quantity;
        inputValue += quantity * zg.buyPrice[base + inputs[i]];
        inputReal += quantity * m.basePrice[inputs[i]];
      }
      employment += output * w.staffPerUnit[index];
      valueAdded += output * zg.price[index] - inputValue;
      valueAddedReal += output * m.basePrice[sector] - inputReal;
      zg.stock[index] = m.madeToOrder[sector] ? 0 : unsold - spoiled + output;
      w.ledgerProduced[sector] += output;
    }
    w.employment[z] = employment;
    w.valueAdded[z] = valueAdded;
    w.valueAddedReal[z] = valueAddedReal;

    // Unused inputs stay on site (perishable ones are lost).
    for (let g = 0; g < G; g++) {
      const left = Math.max(0, available[g] - used[g]);
      const spoiled = left * m.spoilage[g];
      zg.inputBuffer[base + g] = left - spoiled;
      w.ledgerSpoiled[g] += spoiled;
      w.useInput[g] += used[g];
      w.ledgerUsed[g] += used[g];
    }

    // Investment goods become capacity under construction.
    let fill = 1;
    let invested = false;
    for (let g = 0; g < G; g++) {
      const demand = w.demandInvestment[base + g];
      if (demand > EPSILON) {
        invested = true;
        fill = Math.min(fill, w.gotInvestment[base + g] / demand);
      }
      w.useInvestment[g] += w.gotInvestment[base + g];
      w.ledgerUsed[g] += w.gotInvestment[base + g];
    }
    w.investFill[z] = invested ? fill : 0;
    if (invested && fill > 0) {
      for (let g = 0; g < G; g++) zg.build1[base + g] += w.newBuild[base + g] * fill;
    }

    // Wages, with income tax withheld.
    const incomeTax = s.country.taxIncome[c];
    const wages = Math.min(s.zone.wage[z] * employment, Math.max(0, s.zone.firmMoney[z]));
    s.zone.firmMoney[z] -= wages;
    s.zone.householdMoney[z] += wages * (1 - incomeTax);
    s.country.treasury[c] += wages * incomeTax;
    w.revenueIncomeTax[c] += wages * incomeTax;
    w.householdIncome[z] += wages * (1 - incomeTax);
    w.wageBill[z] = wages;
    const supply = w.laborSupply[z];
    s.zone.unemployment[z] = supply > EPSILON ? clamp(1 - employment / supply, 0, 1) : 0;

    // Corporate tax on the week's operating surplus.
    const surplus = w.firmRevenue[z] - w.firmPurchases[z] - wages;
    const corporate = Math.min(Math.max(0, surplus) * s.country.taxCorporate[c], Math.max(0, s.zone.firmMoney[z]));
    s.zone.firmMoney[z] -= corporate;
    s.country.treasury[c] += corporate;
    w.revenueCorporateTax[c] += corporate;

    // Owners take out spare cash, or put cash in when the firms run dry.
    s.zone.firmCosts[z] += p.costSmoothing * (wages + w.firmPurchases[z] - s.zone.firmCosts[z]);
    const target = p.workingCapitalWeeks * s.zone.firmCosts[z];
    const floor = p.cashFloorWeeks * s.zone.firmCosts[z];
    if (s.zone.firmMoney[z] > target) {
      const dividend = (s.zone.firmMoney[z] - target) * p.dividendSpeed;
      s.zone.firmMoney[z] -= dividend;
      s.zone.householdMoney[z] += dividend * (1 - incomeTax);
      s.country.treasury[c] += dividend * incomeTax;
      w.revenueIncomeTax[c] += dividend * incomeTax;
      w.householdIncome[z] += dividend * (1 - incomeTax);
    } else if (s.zone.firmMoney[z] < floor) {
      const call = Math.min(floor - s.zone.firmMoney[z], p.capitalCallShare * Math.max(0, s.zone.householdMoney[z]));
      s.zone.firmMoney[z] += call;
      s.zone.householdMoney[z] -= call;
    }
  }
}

/** Prices, wages, expectations, living standards and capacity react to the week. */
export function adjust(s: EconomyState, w: Workspace, m: Model): void {
  const p = s.config.params;
  const Z = s.zones.length;
  const G = m.goodCount;
  const zg = s.zoneGood;
  const zone = s.zone;

  for (let z = 0; z < Z; z++) {
    const c = zone.owner[z];
    const base = z * G;
    const population = zone.population[z];
    const taxed = 1 + s.country.taxConsumption[c];

    // Consumer price index, chained with this week's basket.
    let oldCost = 0;
    let newCost = 0;
    for (let g = 0; g < G; g++) {
      const quantity = w.gotHousehold[base + g] > EPSILON ? w.gotHousehold[base + g] : m.subsistence[g] * population * 1e-6;
      oldCost += quantity * w.previousConsumerPrice[base + g];
      newCost += quantity * zg.buyPrice[base + g] * taxed;
    }
    const weekly = oldCost > EPSILON ? clamp(newCost / oldCost - 1, -0.5, 1) : 0;
    zone.cpi[z] *= 1 + weekly;
    zone.inflation[z] += p.inflationSmoothing * (weekly - zone.inflation[z]);

    // Living standard and unmet basic needs.
    const real = population > EPSILON ? w.householdReal[z] / population : 0;
    zone.livingStandard[z] += p.livingStandardSmoothing * (real - zone.livingStandard[z]);
    zone.livingStandardRef[z] += (zone.livingStandard[z] - zone.livingStandardRef[z]) / p.livingStandardRefWeeks;
    let deprivation = 0;
    if (m.essentialTotal > 0) {
      for (let g = 0; g < G; g++) {
        const need = m.subsistence[g] * population;
        if (m.essential[g] > 0 && need > EPSILON) {
          deprivation += m.essential[g] * clamp(1 - w.gotHousehold[base + g] / need, 0, 1);
        }
      }
      deprivation /= m.essentialTotal;
    }
    zone.deprivation[z] += 0.3 * (deprivation - zone.deprivation[z]);
    zone.expectedIncome[z] += p.incomeSmoothing * (w.householdIncome[z] - zone.expectedIncome[z]);

    // Wages: tight labour markets and past inflation push them up.
    const wageChange = p.wageUnemploymentGain * (p.naturalUnemployment - zone.unemployment[z])
      + p.wageShortageGain * (1 - w.laborScale[z]) + p.wageInflationPass * zone.inflation[z];
    // The wage is the fixed yardstick while the builder searches for starting prices.
    if (!w.calibrating) zone.wage[z] *= 1 + clamp(wageChange, -p.wageMaxDown, p.wageMaxUp);
    const wage = zone.wage[z];
    const productivity = w.productivity[z];
    let capitalPrice = 0;
    for (let g = 0; g < G; g++) capitalPrice += m.investment[g] * zg.buyPrice[base + g];
    const hurdle = privateHurdle(s, c);
    const keep = 1 - s.country.taxCorporate[c];

    for (let g = 0; g < G; g++) {
      const index = base + g;
      let cost = m.labor[g] * wage / (productivity * zg.efficiency[index]);
      const inputs = m.inputGoods[g];
      const amounts = m.inputAmounts[g];
      for (let i = 0; i < inputs.length; i++) cost += amounts[i] * zg.buyPrice[base + inputs[i]];
      const capacity = w.effectiveCapacity[index];
      const stock = zg.stock[index];
      let price = zg.price[index];

      if (capacity > EPSILON || stock > EPSILON) {
        const orders = w.orders[index];
        zg.expectedDemand[index] += p.demandSmoothing * (orders - zg.expectedDemand[index]);
        const expected = zg.expectedDemand[index];
        const target = expected * (1 + m.cover[g]);
        // Made-to-order goods have no inventory; their price reads demand against capacity instead.
        const gap = m.madeToOrder[g] ? 0
          : target > EPSILON ? clamp((target - stock) / target, -1, 1) : (stock > EPSILON ? -1 : 0);
        const short = orders > EPSILON ? clamp(1 - w.sold[index] / orders, 0, 1) : 0;
        const wanted = m.madeToOrder[g] ? orders : w.want[index];
        const pressure = capacity > EPSILON ? clamp(wanted / capacity, 0, 1.5) : 0;
        zg.pressure[index] += p.profitSmoothing * (pressure - zg.pressure[index]);
        // While the builder searches for starting prices, only supply and demand move them.
        const normalPrice = cost + capitalCharge(m, g, capitalPrice, hurdle, keep);
        const costPull = w.calibrating ? 0 : clamp(normalPrice / price - 1, -1, 1);
        const change = p.priceInventoryGain * gap + p.priceShortageGain * short + p.priceCostGain * costPull
          + (capacity > EPSILON ? p.pricePressureGain * (pressure - m.normalUtilization[g]) : 0);
        price *= 1 + clamp(change, -p.priceMaxDown, p.priceMaxUp);
        const floor = cost * p.priceFloorCostRatio;
        const ceiling = zg.refPrice[index] * p.priceCapRefMultiple;
        if (price > ceiling) price = ceiling;
        if (price < floor && !w.calibrating) price = floor;
      } else {
        // Nothing is made here: the local price simply follows what buyers pay.
        price = zg.buyPrice[index];
        zg.expectedDemand[index] *= 1 - p.demandSmoothing;
        if (zg.expectedDemand[index] < DUST) zg.expectedDemand[index] = 0;
      }
      zg.price[index] = price;
      zg.refPrice[index] += (price - zg.refPrice[index]) / p.refPriceWeeks;
      zg.margin[index] += p.profitSmoothing * (clamp((price - cost) / price, -1, 1) - zg.margin[index]);

      // Construction advances one stage; finished plant joins capacity.
      const rate = m.buildRate[g];
      const done1 = zg.build1[index] * rate;
      const done2 = zg.build2[index] * rate;
      const done3 = zg.build3[index] * rate;
      zg.build1[index] -= done1;
      zg.build2[index] += done1 - done2;
      zg.build3[index] += done2 - done3;
      // Idle or loss-making plant is closed gradually, on top of normal wear.
      const idle = clamp(1 - zg.pressure[index] / p.scrapPressure, 0, 1);
      const losing = clamp(-zg.margin[index] * 4, 0, 1);
      const scrap = p.scrapRateMax * (idle > losing ? idle : losing);
      let installed = zg.capacity[index] * (1 - m.depreciationWeekly[g] - scrap) + done3;
      if (installed < DUST) installed = 0;
      zg.capacity[index] = installed;
      if (zg.build1[index] < DUST) zg.build1[index] = 0;
      if (zg.build2[index] < DUST) zg.build2[index] = 0;
      if (zg.build3[index] < DUST) zg.build3[index] = 0;

      // A resource ceiling that demand keeps pressing against slowly gives way (discovery, better extraction).
      if (zg.resourceCap[index] > 0 && m.resourceBased[g]) {
        const installedAll = zg.capacity[index] + zg.build1[index] + zg.build2[index] + zg.build3[index];
        if (installedAll >= 0.97 * zg.resourceCap[index]) {
          const urgency = clamp((zg.pressure[index] - m.normalUtilization[g]) / (1 - m.normalUtilization[g]), 0, 1);
          zg.resourceCap[index] *= 1 + p.resourceDiscoveryRate * urgency;
        }
      }

      // Temporary production shocks fade.
      if (zg.yieldRecovery[index] > 0) {
        zg.yieldFactor[index] += (1 - zg.yieldFactor[index]) * zg.yieldRecovery[index];
        if (zg.yieldFactor[index] > 0.9999 && zg.yieldFactor[index] < 1.0001) {
          zg.yieldFactor[index] = 1;
          zg.yieldRecovery[index] = 0;
        }
      }

      // Remove meaningless crumbs so values can never decay into denormal numbers.
      if (zg.stock[index] > 0 && zg.stock[index] < DUST) { w.ledgerDust[g] += zg.stock[index]; zg.stock[index] = 0; }
      if (zg.inputBuffer[index] > 0 && zg.inputBuffer[index] < DUST) { w.ledgerDust[g] += zg.inputBuffer[index]; zg.inputBuffer[index] = 0; }
      if (zg.shortage[index] < 1e-6) zg.shortage[index] = 0;
      if (zg.usage[index] < DUST) zg.usage[index] = 0;
    }
  }
}

/** Slow structural change: population, technology and infrastructure. */
export function develop(s: EconomyState, w: Workspace, m: Model): void {
  const p = s.config.params;
  const Z = s.zones.length;
  const G = m.goodCount;
  const zone = s.zone;
  let frontier = 0;
  for (let z = 0; z < Z; z++) if (zone.technology[z] > frontier) frontier = zone.technology[z];
  for (let z = 0; z < Z; z++) {
    const c = zone.owner[z];
    // Infrastructure drifts towards what public investment sustains.
    const norm = p.infraNormShare * s.country.realGdp[c];
    const sustained = norm > EPSILON ? clamp(w.infrastructureReal[c] / norm, 0, 3) : 1;
    zone.infrastructure[z] = clamp(zone.infrastructure[z] + p.infraAdjust * (sustained - zone.infrastructure[z]), 0.2, p.infraMax);
    // Technology: a slow world trend plus catch-up for zones behind the frontier.
    const lag = frontier > EPSILON ? Math.max(0, 1 - zone.technology[z] / frontier) : 0;
    // Exogenous progress fades smoothly (cubically) towards a ceiling, so technology can never grow without bound.
    const level = zone.technology[z] / p.techCeiling;
    const room = Math.max(0, 1 - level * level * level);
    const growth = (p.techGrowthBase + p.techCatchUp * lag + p.infraGrowthEffect * (zone.infrastructure[z] - 1)) * room / 52;
    const rate = Math.max(-0.001, growth);
    zone.technology[z] *= 1 + rate;
    // Better technology also gets more out of the same land and deposits, so
    // natural-resource ceilings rise with it instead of strangling growth.
    if (rate > 0) {
      for (let g = 0; g < G; g++) {
        if (m.resourceBased[g] && s.zoneGood.resourceCap[z * G + g] > 0) s.zoneGood.resourceCap[z * G + g] *= 1 + rate;
      }
    }
    // Population approaches its cap smoothly; it can neither explode nor be pushed past the cap by growth alone.
    const cap = zone.populationCap[z];
    const fill = cap > 0 ? Math.min(1, zone.population[z] / cap) : 1;
    zone.population[z] *= 1 + zone.populationGrowth[z] * (zone.populationGrowth[z] > 0 ? 1 - fill * fill * fill : 1) / 52;
    if (zone.mobilized[z] > zone.population[z] * p.laborParticipation * 0.9) {
      zone.mobilized[z] = zone.population[z] * p.laborParticipation * 0.9;
    }
  }
}
