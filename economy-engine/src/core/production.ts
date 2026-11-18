import type { EconomyState } from '../types.ts';
import type { Model, Workspace } from './model.ts';
import { bankReceive, creditAppetite, firmBorrow, serviceFirmDebt } from './credit.ts';
import {
  AVERAGE_TIER, capitalCharge, clamp, DUST, EPSILON, MIXED, OBJECTIVE_AFFORDABLE, OBJECTIVE_MAX_PRODUCTION, OBJECTIVE_PROFITABILITY,
  OBJECTIVE_STRATEGIC, OWNERSHIP_COUNT, PUBLIC, structuralHurdle, TIER_COUNT,
} from './model.ts';

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
    const need = w.inputNeed[base + g];
    available[g] = s.zoneGood.inputBuffer[base + g] + w.gotInput[base + g];
    ratio[g] = need > EPSILON ? Math.min(1, available[g] / need) : 1;
  }
}

/** Firms turn the inputs they obtained into output and pay their workers and owners. */
export function produce(s: EconomyState, w: Workspace, m: Model): void {
  const p = s.config.params;
  const Z = s.zones.length;
  const G = m.goodCount;
  const S = m.sectorCount;
  const O = OWNERSHIP_COUNT;
  const T = TIER_COUNT;
  const zg = s.zoneGood;
  const fg = s.firmGood;
  const firm = s.firm;
  const tierFactor = m.tierFactor;
  const available = w.goodScratchA;
  const ratio = w.goodScratchB;
  const used = w.goodScratchC;
  const ownerOutput = [0, 0, 0];

  for (let z = 0; z < Z; z++) {
    const c = s.zone.owner[z];
    const base = z * G;
    const aggregateBase = z * S * O;
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
      // Output is shared between production lines as planned; each line's staff is
      // employed (and paid) by its own aggregate. linePlan now holds line output.
      const done = output / plan;
      const lineBase = index * O * T;
      const a = aggregateBase + m.goodSector[sector] * O;
      for (let o = 0; o < O; o++) {
        let made = 0;
        for (let t = 0; t < T; t++) {
          const l = lineBase + o * T + t;
          const lineOutput = w.linePlan[l] * done;
          w.linePlan[l] = lineOutput;
          made += lineOutput;
          const staff = lineOutput * w.staffPerUnit[index] / tierFactor[t];
          w.aggEmployment[a + o] += staff;
          employment += staff;
        }
        ownerOutput[o] = made;
      }
      valueAdded += output * zg.price[index] - inputValue;
      valueAddedReal += output * m.basePrice[sector] - inputReal;
      if (m.madeToOrder[sector]) zg.stock[index] = 0;
      else {
        // Ownership of the stock: what was carried over keeps its owners, new output belongs to its makers.
        const carried = unsold - spoiled;
        const stock = carried + output;
        zg.stock[index] = stock;
        if (stock > EPSILON) {
          const shareBase = index * O;
          let total = 0;
          for (let o = 0; o < O; o++) {
            const share = (carried * fg.stockShare[shareBase + o] + ownerOutput[o]) / stock;
            fg.stockShare[shareBase + o] = share;
            total += share;
          }
          if (total > 0) for (let o = 0; o < O; o++) fg.stockShare[shareBase + o] /= total;
        }
      }
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
    for (let g = 0; g < G; g++) {
      w.useInvestment[g] += w.gotInvestment[base + g];
      w.ledgerUsed[g] += w.gotInvestment[base + g];
    }

    // Investment goods become capacity under construction, aggregate by aggregate.
    for (let sector = 0; sector < S; sector++) {
      for (let o = 0; o < O; o++) {
        const a = aggregateBase + sector * O + o;
        let fill = 1;
        let invested = false;
        for (let g = 0; g < G; g++) {
          const demand = w.aggDemandInvestment[a * G + g];
          if (demand > EPSILON) {
            invested = true;
            fill = Math.min(fill, w.aggGotInvestment[a * G + g] / demand);
          }
        }
        if (!invested || !(fill > 0)) continue;
        const goods = m.sectorGoods[sector];
        for (let i = 0; i < goods.length; i++) {
          const ownerIndex = (base + goods[i]) * O + o;
          fg.build1[ownerIndex] += w.ownerBuild[ownerIndex] * fill;
        }
      }
    }

    // Wages (income tax withheld), corporate tax, then owners take out spare
    // cash or put cash in when an aggregate runs dry.
    const incomeTax = s.country.taxIncome[c];
    const wage = s.zone.wage[z];
    let wageBill = 0;
    let privateNeed = 0;
    let publicNeed = 0;
    for (let k = 0; k < S * O; k++) {
      const a = aggregateBase + k;
      const o = k % O;
      // Wages come first; a firm short of cash borrows working capital to pay them.
      const owed = wage * w.aggEmployment[a];
      if (owed > firm.cash[a]) firmBorrow(s, w, a, c, owed - firm.cash[a]);
      const wages = Math.min(owed, Math.max(0, firm.cash[a]));
      firm.cash[a] -= wages;
      wageBill += wages;
      // Debt service: interest, and repayment as fast as the plant securing the loan wears out.
      const unpaidDebt = serviceFirmDebt(s, w, a, aggregateDepreciation(s, m, z, a));
      const surplus = w.aggRevenue[a] - w.aggPurchases[a] - wages - w.aggInterest[a];
      w.aggProfit[a] = surplus;
      const corporate = Math.min(Math.max(0, surplus) * s.country.taxCorporate[c], Math.max(0, firm.cash[a]));
      firm.cash[a] -= corporate;
      s.country.treasury[c] += corporate;
      w.revenueCorporateTax[c] += corporate;
      firm.costs[a] += p.costSmoothing * (wages + w.aggPurchases[a] - firm.costs[a]);
      firm.employment[a] = w.aggEmployment[a];
      firm.revenue[a] = w.aggRevenue[a];
      const target = p.workingCapitalWeeks * firm.costs[a];
      const floor = p.cashFloorWeeks * firm.costs[a];
      const publicPart = o === PUBLIC ? 1 : o === MIXED ? p.mixedPublicShare : 0;
      // The state supports its public and mixed firms only where it has chosen to (and pays for it).
      const stateWilling = s.countrySector.publicSupport[c * S + Math.floor(k / O)] === 1 ? 1 : 0;
      w.aggCall[a] = 0;
      w.aggDebtSupport[a] = 0;
      if (firm.cash[a] > target) {
        let excess = firm.cash[a] - target;
        // Debt above the normal leverage is paid down before owners are paid.
        const extraDebt = firm.loan[a] - 1.2 * p.firmTargetLeverage * w.aggCapitalValue[a];
        if (extraDebt > 0 && !w.calibrating) {
          const repay = Math.min(extraDebt, excess * p.firmExcessDebtRepay);
          firm.cash[a] -= repay;
          firm.loan[a] -= repay;
          bankReceive(s, firm.lender[a], repay);
          excess -= repay;
        }
        const dividend = excess * p.dividendSpeed;
        firm.cash[a] -= dividend;
        const toState = dividend * publicPart;
        const toPeople = dividend - toState;
        s.country.treasury[c] += toState + toPeople * incomeTax;
        w.revenueFirmDividends[c] += toState;
        w.revenueIncomeTax[c] += toPeople * incomeTax;
        s.zone.householdMoney[z] += toPeople * (1 - incomeTax);
        w.householdIncome[z] += toPeople * (1 - incomeTax);
      } else if (firm.cash[a] >= floor && health(firm, a) > -0.5) {
        // Short of working capital but not in trouble: borrow part of the gap (liquidity credit).
        firmBorrow(s, w, a, c, (target - firm.cash[a]) * p.firmLiquidityBorrow * creditAppetite(s, c));
      } else if (firm.cash[a] < floor) {
        // Below the cash floor: borrow back to a moderate working capital first,
        // then ask the owners for whatever is still missing to reach the floor.
        firmBorrow(s, w, a, c, 0.5 * (floor + target) - firm.cash[a]);
        const need = floor - firm.cash[a];
        // Private owners stop putting money into firms that keep losing it; the state
        // supports its share where it has chosen to.
        const privateWilling = firm.health[a] > -0.5 ? 1 : 0;
        if (need > 0 && (publicPart * stateWilling > 0 || privateWilling > 0)) {
          w.aggCall[a] = need;
          publicNeed += need * publicPart * stateWilling;
          privateNeed += need * (1 - publicPart) * privateWilling;
        }
      }
      // A supported public (or mixed) firm whose debt exceeds what its plant would fetch has
      // the excess paid down by the state, a real fiscal cost, instead of going insolvent.
      const excessDebt = firm.loan[a] - Math.max(0, firm.cash[a]) - p.liquidationValue * w.aggCapitalValue[a];
      if (firm.health[a] < -0.5 && excessDebt > 0 && publicPart * stateWilling > 0 && !w.calibrating) {
        w.aggDebtSupport[a] = excessDebt * publicPart;
        publicNeed += w.aggDebtSupport[a];
      }
      w.aggTrouble[a] = owed - wages > 1e-12 * owed || unpaidDebt > 0 ? 1 : 0;
    }
    s.zone.householdMoney[z] += wageBill * (1 - incomeTax);
    s.country.treasury[c] += wageBill * incomeTax;
    w.revenueIncomeTax[c] += wageBill * incomeTax;
    w.householdIncome[z] += wageBill * (1 - incomeTax);
    w.wageBill[z] = wageBill;
    const supply = w.laborSupply[z];
    s.zone.unemployment[z] = supply > EPSILON ? clamp(1 - employment / supply, 0, 1) : 0;

    // Rescues are limited to a small share of what the owners hold each week.
    if (privateNeed > 0 || publicNeed > 0) {
      const privateLimit = p.capitalCallShare * Math.max(0, s.zone.householdMoney[z]);
      const publicLimit = p.capitalCallShare * Math.max(0, s.country.treasury[c]);
      const privateFill = privateNeed > privateLimit ? privateLimit / privateNeed : 1;
      const publicFill = publicNeed > publicLimit ? publicLimit / publicNeed : 1;
      for (let k = 0; k < S * O; k++) {
        const a = aggregateBase + k;
        const need = w.aggCall[a];
        if (!(need > 0)) continue;
        const o = k % O;
        const publicPart = o === PUBLIC ? 1 : o === MIXED ? p.mixedPublicShare : 0;
        const privateWilling = firm.health[a] > -0.5 ? 1 : 0;
        const stateWilling = s.countrySector.publicSupport[c * S + Math.floor(k / O)] === 1 ? 1 : 0;
        const fromState = need * publicPart * stateWilling * publicFill;
        const fromPeople = need * (1 - publicPart) * privateWilling * privateFill;
        firm.cash[a] += fromState + fromPeople;
        s.country.treasury[c] -= fromState;
        w.spentFirmSupport[c] += fromState;
        s.zone.householdMoney[z] -= fromPeople;
      }
      for (let k = 0; k < S * O; k++) {
        const a = aggregateBase + k;
        const support = w.aggDebtSupport[a] * publicFill;
        if (!(support > 0)) continue;
        const paid = Math.min(support, firm.loan[a], Math.max(0, s.country.treasury[c]));
        s.country.treasury[c] -= paid;
        w.spentFirmSupport[c] += paid;
        firm.loan[a] -= paid;
        bankReceive(s, firm.lender[a], paid);
      }
    }

    // Distress, judged after any support: wages or debt service not met in full this week, or
    // the firm keeps losing money while its debt, net of cash, exceeds what its plant would fetch
    // in a liquidation (balance-sheet insolvency). A firm hit by a temporary shock at normal
    // leverage is therefore not liquidated. Chronic heavy losses also count, at 1/13 of a week
    // each (two years of them lead to liquidation), except for public firms the state supports,
    // whose losses may be the price of the objective it gave them (R03).
    for (let k = 0; k < S * O; k++) {
      const a = aggregateBase + k;
      if (w.calibrating) { firm.distress[a] = 0; continue; }
      const o = k % O;
      const supported = o === PUBLIC && s.countrySector.publicSupport[c * S + Math.floor(k / O)] === 1;
      const insolvent = firm.health[a] < -0.5 && firm.loan[a] - Math.max(0, firm.cash[a]) > p.liquidationValue * w.aggCapitalValue[a];
      const chronic = firm.health[a] < -0.8 && !supported;
      firm.distress[a] = w.aggTrouble[a] === 1 || insolvent ? firm.distress[a] + 1 : chronic ? firm.distress[a] + 1 / 13 : 0;
    }
  }
}

/** Prices, wages, expectations, living standards and capacity react to the week. */
export function adjust(s: EconomyState, w: Workspace, m: Model): void {
  const p = s.config.params;
  const Z = s.zones.length;
  const G = m.goodCount;
  const O = OWNERSHIP_COUNT;
  const T = TIER_COUNT;
  const zg = s.zoneGood;
  const zone = s.zone;
  const fg = s.firmGood;
  const lineCapacity = s.firmLine.capacity;
  const tierFactor = m.tierFactor;

  let frontier = 0;
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
    if (z === 0) { frontier = 0; for (let k = 0; k < Z; k++) if (zone.technology[k] > frontier) frontier = zone.technology[k]; }
    const wageChange = p.wageUnemploymentGain * (p.naturalUnemployment - zone.unemployment[z])
      + p.wageShortageGain * (1 - w.laborScale[z]) + p.wageInflationPass * zone.inflation[z]
      // Pay settlements also track the zone's productivity growth, so unit costs (and prices)
      // do not drift down as technology improves. This anchors the price level now that money
      // is created only against real credit needs (Milestone 3).
      + p.wageProductivityPass * technologyGrowth(s, z, frontier);
    // The wage is the fixed yardstick while the builder searches for starting prices.
    if (!w.calibrating) zone.wage[z] *= 1 + clamp(wageChange, -p.wageMaxDown, p.wageMaxUp);
    const wage = zone.wage[z];
    const productivity = w.productivity[z];
    let capitalPrice = 0;
    for (let g = 0; g < G; g++) capitalPrice += m.investment[g] * zg.buyPrice[base + g];
    // Normal prices carry the long-run return on capital, not this week's policy rate.
    const hurdle = structuralHurdle(s, c);
    const keep = 1 - s.country.taxCorporate[c];

    for (let g = 0; g < G; g++) {
      const index = base + g;
      // Reference unit cost is the average tier's: new plant joins that tier, so it
      // sets the long-run price and the return on expansion. Strong firms earn more.
      const laborCost = m.labor[g] * wage / (productivity * zg.efficiency[index]);
      const averageLabor = laborCost / tierFactor[AVERAGE_TIER];
      let cost = averageLabor;
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
        // Public firms told to keep prices affordable give up their return on capital,
        // pulling the zone's normal price down in proportion to their share of capacity (R03).
        const normalPrice = cost + capitalCharge(m, g, capitalPrice, hurdle, keep) * (1 - affordableShare(s, m, z, g));
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
      zg.refBuyPrice[index] += (zg.buyPrice[index] - zg.refBuyPrice[index]) / p.refPriceWeeks;
      zg.margin[index] += p.profitSmoothing * (clamp((price - cost) / price, -1, 1) - zg.margin[index]);

      // Construction advances one stage. Finished plant first renews worn-out plant
      // of the same owner in its own tier (maintenance keeps a firm's standing);
      // anything beyond that is expansion and joins the average tier.
      const rate = m.buildRate[g];
      const ownerBase = index * O;
      const lineBase = ownerBase * T;
      let installedAll = 0;
      for (let o = 0; o < O; o++) {
        const done1 = fg.build1[ownerBase + o] * rate;
        const done2 = fg.build2[ownerBase + o] * rate;
        const done3 = fg.build3[ownerBase + o] * rate;
        fg.build1[ownerBase + o] -= done1;
        fg.build2[ownerBase + o] += done1 - done2;
        fg.build3[ownerBase + o] += done2 - done3;
        if (fg.build1[ownerBase + o] < DUST) fg.build1[ownerBase + o] = 0;
        if (fg.build2[ownerBase + o] < DUST) fg.build2[ownerBase + o] = 0;
        if (fg.build3[ownerBase + o] < DUST) fg.build3[ownerBase + o] = 0;
        installedAll += fg.build1[ownerBase + o] + fg.build2[ownerBase + o] + fg.build3[ownerBase + o];
        let ownerCapacity = 0;
        for (let t = 0; t < T; t++) ownerCapacity += lineCapacity[lineBase + o * T + t];
        const renewal = Math.min(done3, ownerCapacity * m.depreciationWeekly[g]);
        const renewalRate = ownerCapacity > EPSILON ? renewal / ownerCapacity : 0;
        const expansion = done3 - (ownerCapacity > EPSILON ? renewal : 0);
        for (let t = 0; t < T; t++) {
          const l = lineBase + o * T + t;
          // Idle or loss-making plant is closed gradually, on top of normal wear;
          // each tier's losses are judged at its own costs, so fragile plant goes first.
          const idle = clamp(1 - zg.pressure[index] / p.scrapPressure, 0, 1);
          const tierMargin = zg.margin[index] - (laborCost / tierFactor[t] - averageLabor) / price;
          const losing = clamp(-tierMargin * 4, 0, 1);
          // Public firms with a production or supply objective keep their plant; those keeping
          // prices affordable accept losses without closing plant for them (R03).
          const objective = o === PUBLIC ? s.countrySector.publicObjective[c * m.sectorCount + m.goodSector[g]] : OBJECTIVE_PROFITABILITY;
          const keepsPlant = objective === OBJECTIVE_MAX_PRODUCTION || objective === OBJECTIVE_STRATEGIC;
          const scrap = keepsPlant ? 0 : p.scrapRateMax * (objective === OBJECTIVE_AFFORDABLE ? idle : (idle > losing ? idle : losing));
          let next = lineCapacity[l] * (1 - m.depreciationWeekly[g] - scrap + renewalRate) + (t === AVERAGE_TIER ? expansion : 0);
          if (next < DUST) next = 0;
          lineCapacity[l] = next;
          installedAll += next;
        }
      }

      // A resource ceiling that demand keeps pressing against slowly gives way (discovery, better extraction).
      if (zg.resourceCap[index] > 0 && m.resourceBased[g]) {
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
    const rate = technologyGrowth(s, z, frontier);
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

/** Capital-weighted weekly depreciation of an aggregate's plant: the pace at which its loan is repaid. */
function aggregateDepreciation(s: EconomyState, m: Model, z: number, a: number): number {
  const G = m.goodCount;
  const S = m.sectorCount;
  const sector = Math.floor(a / OWNERSHIP_COUNT) % S;
  const o = a % OWNERSHIP_COUNT;
  const goods = m.sectorGoods[sector];
  let value = 0;
  let worn = 0;
  for (let i = 0; i < goods.length; i++) {
    const g = goods[i];
    const base = ((z * G + g) * OWNERSHIP_COUNT + o) * TIER_COUNT;
    let capacity = 0;
    for (let t = 0; t < TIER_COUNT; t++) capacity += s.firmLine.capacity[base + t];
    value += capacity * m.capitalWeeks[g];
    worn += capacity * m.capitalWeeks[g] * m.depreciationWeekly[g];
  }
  return value > EPSILON ? worn / value : 0;
}

function health(firm: EconomyState['firm'], a: number): number {
  return firm.health[a];
}

/** Share of a zone's capacity of good g held by public firms told to keep prices affordable. */
function affordableShare(s: EconomyState, m: Model, z: number, g: number): number {
  const c = s.zone.owner[z];
  if (s.countrySector.publicObjective[c * m.sectorCount + m.goodSector[g]] !== OBJECTIVE_AFFORDABLE) return 0;
  const base = (z * m.goodCount + g) * OWNERSHIP_COUNT * TIER_COUNT;
  let total = 0;
  let public_ = 0;
  for (let k = 0; k < OWNERSHIP_COUNT * TIER_COUNT; k++) {
    const capacity = s.firmLine.capacity[base + k];
    total += capacity;
    if (Math.floor(k / TIER_COUNT) === PUBLIC) public_ += capacity;
  }
  return total > 0 ? public_ / total : 0;
}

/**
 * Weekly technology growth of zone z: a slow world trend, catch-up for zones behind
 * the frontier and an infrastructure effect, fading smoothly (cubically) towards a
 * ceiling so technology can never grow without bound.
 */
function technologyGrowth(s: EconomyState, z: number, frontier: number): number {
  const p = s.config.params;
  const technology = s.zone.technology[z];
  const lag = frontier > EPSILON ? Math.max(0, 1 - technology / frontier) : 0;
  const level = technology / p.techCeiling;
  const room = Math.max(0, 1 - level * level * level);
  const growth = (p.techGrowthBase + p.techCatchUp * lag + p.infraGrowthEffect * (s.zone.infrastructure[z] - 1)) * room / 52;
  return Math.max(-0.001, growth);
}
