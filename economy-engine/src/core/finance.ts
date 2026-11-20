import type { EconomyEvent, EconomyState } from '../types.ts';
import type { Model, Workspace } from './model.ts';
import { clamp, EPSILON } from './model.ts';

/**
 * Public finances: budgets, borrowing, debt service, default and the world
 * monetary rule.
 *
 * Money is conserved. Governments borrow existing money from households (at
 * home and abroad) and the engine records who holds whose debt, so interest,
 * repayment and default losses reach exactly the right holders. The only
 * source of new money is the rule-based world monetary authority.
 */

/** Pay `amount` from a treasury to the holders of that country's debt. */
function payHolders(s: EconomyState, w: Workspace, c: number, amount: number, isIncome: boolean): void {
  const C = s.countries.length;
  const Z = s.zones.length;
  const debt = s.country.debt[c];
  if (!(amount > 0) || !(debt > EPSILON)) return;
  let paid = 0;
  for (let z = 0; z < Z; z++) {
    const part = amount * (s.bonds[z * C + c] / debt);
    if (part > 0) {
      s.zone.householdMoney[z] += part;
      if (isIncome) w.householdIncome[z] += part;
      paid += part;
    }
  }
  s.country.treasury[c] -= paid;
}

/** Shrink or grow every holder's claim on country c by the same factor. */
function scaleDebt(s: EconomyState, c: number, factor: number): void {
  const C = s.countries.length;
  const Z = s.zones.length;
  let total = 0;
  for (let z = 0; z < Z; z++) {
    const value = s.bonds[z * C + c] * factor;
    s.bonds[z * C + c] = value;
    total += value;
  }
  // The debt is defined as the sum of the claims, so the two can never drift apart.
  s.country.debt[c] = total;
}

function repay(s: EconomyState, w: Workspace, c: number, wanted: number): number {
  const debt = s.country.debt[c];
  const amount = Math.min(wanted, s.country.treasury[c], debt);
  if (!(amount > 0)) return 0;
  payHolders(s, w, c, amount, false);
  scaleDebt(s, c, Math.max(0, (debt - amount) / debt));
  w.repaid[c] += amount;
  return amount;
}

/** Average what a country's buyers pay and use, for reserve decisions. */
function summariseCountries(s: EconomyState, w: Workspace, m: Model): void {
  const Z = s.zones.length;
  const G = m.goodCount;
  for (let z = 0; z < Z; z++) w.population[s.zone.owner[z]] += s.zone.population[z];
  for (let z = 0; z < Z; z++) {
    const c = s.zone.owner[z];
    const weight = w.population[c] > 0 ? s.zone.population[z] / w.population[c] : 0;
    for (let g = 0; g < G; g++) {
      const index = z * G + g;
      w.countryPrice[c * G + g] += weight * s.zoneGood.buyPrice[index];
      w.countryRefPrice[c * G + g] += weight * s.zoneGood.refPrice[index];
      w.countryShortage[c * G + g] += weight * s.zoneGood.shortage[index];
      w.countryUse[c * G + g] += s.zoneGood.usage[index];
    }
  }
}

/** Decide how much each government wants to add to or release from reserves. */
function planReserves(s: EconomyState, w: Workspace, m: Model): void {
  const p = s.config.params;
  const C = s.countries.length;
  const G = m.goodCount;
  for (let c = 0; c < C; c++) {
    for (let g = 0; g < G; g++) {
      const index = c * G + g;
      const reserves = s.countryGood.reserves[index];
      const targetWeeks = s.countryGood.reserveTargetWeeks[index];
      if (!(reserves > 0) && !(targetWeeks > 0)) continue;
      const use = w.countryUse[index];
      const target = targetWeeks * use;
      const mode = s.countryGood.reserveMode[index];
      const price = w.countryPrice[index];
      const reference = w.countryRefPrice[index];
      const shortage = w.countryShortage[index];
      let release = 0;
      let buy = 0;
      if (mode === 2) release = reserves * p.reserveReleaseShare;
      else if (mode === 3) buy = Math.min(Math.max(0, target - reserves) * p.reserveFillShare * 2, use * 0.5);
      else if (mode === 0) {
        const scarce = shortage > p.reserveReleaseShortage || price > reference * p.reserveReleasePriceRatio;
        if (scarce) release = reserves * p.reserveReleaseShare;
        else if (reserves < target && shortage < p.reserveReleaseShortage * 0.5 && price <= reference * p.reserveBuyPriceRatio) {
          buy = Math.min((target - reserves) * p.reserveFillShare, use * 0.25);
        }
      }
      w.releaseOffer[index] = release;
      w.reserveBuy[index] = buy;
    }
  }
}

/**
 * Start of the week: plan spending, borrow, service debt, pay cash transfers
 * and turn the remaining budgets into orders for goods.
 */
export function planBudgets(s: EconomyState, w: Workspace, m: Model, events: EconomyEvent[]): void {
  const p = s.config.params;
  const C = s.countries.length;
  const Z = s.zones.length;
  const G = m.goodCount;
  const country = s.country;
  summariseCountries(s, w, m);
  planReserves(s, w, m);

  // 1. Spending plans and borrowing requests.
  for (let c = 0; c < C; c++) {
    const base = country.gdp[c];
    const military = country.spendMilitary[c] * base;
    w.planAdministration[c] = country.spendAdministration[c] * base;
    w.planSocial[c] = country.spendSocial[c] * base;
    w.planMilitaryPay[c] = military * p.militaryPayShare;
    w.planMilitaryGoods[c] = military - w.planMilitaryPay[c];
    w.planInfrastructure[c] = country.spendInfrastructure[c] * base;
    let extras = 0;
    for (let g = 0; g < G; g++) {
      extras += (w.procurement[c * G + g] + w.reserveBuy[c * G + g]) * w.countryPrice[c * G + g];
    }
    w.planExtras[c] = extras;
    const planned = w.planAdministration[c] + w.planSocial[c] + military + w.planInfrastructure[c] + extras;
    w.planTotal[c] = planned;
    const excluded = country.exclusionWeeks[c] > 0;
    w.interestDue[c] = country.debt[c] * country.averageRate[c] / 52;
    w.principalDue[c] = country.marketAccess[c] === 1 || excluded ? 0 : country.debt[c] / p.debtMaturityWeeks;
    // Cash wanted at the start of a week: this week's bills plus a buffer.
    w.cashTarget[c] = planned * (1 + p.treasuryBufferWeeks);
    const need = w.interestDue[c] + w.principalDue[c] + w.cashTarget[c] - country.treasury[c];
    w.creditRequest[c] = country.marketAccess[c] === 1 && country.autoBorrow[c] === 1 && need > 0 ? need : 0;
    w.creditRequested += w.creditRequest[c];
  }

  // 2. Credit market: households lend part of their cash, with a home bias.
  for (let z = 0; z < Z; z++) {
    w.lendable[z] = p.lendableShare * s.zone.householdMoney[z];
    w.creditAvailable += w.lendable[z];
  }
  if (w.creditRequested > 0) {
    for (let pass = 0; pass < 2; pass++) {
      for (let c = 0; c < C; c++) {
        const request = w.creditRequest[c];
        if (!(request > 0)) continue;
        let weightTotal = 0;
        for (let z = 0; z < Z; z++) {
          weightTotal += s.zone.householdMoney[z] * (s.zone.owner[z] === c ? p.lenderHomeBias : 1);
        }
        if (!(weightTotal > 0)) continue;
        let received = 0;
        for (let z = 0; z < Z; z++) {
          const ask = request * s.zone.householdMoney[z] * (s.zone.owner[z] === c ? p.lenderHomeBias : 1) / weightTotal;
          if (pass === 0) { w.lendAsked[z] += ask; continue; }
          // Second pass: every lender scales all requests by the same factor.
          const lent = ask * w.lendScale[z];
          if (lent > 0) { s.bonds[z * C + c] += lent; w.lendGiven[z] += lent; received += lent; }
        }
        if (pass === 1 && received > 0) {
          const before = country.debt[c];
          country.averageRate[c] = (country.averageRate[c] * before + country.marketRate[c] * received) / (before + received);
          country.debt[c] = before + received;
          country.treasury[c] += received;
          w.borrowed[c] = received;
        }
      }
      if (pass === 0) {
        for (let z = 0; z < Z; z++) {
          w.lendScale[z] = w.lendAsked[z] > w.lendable[z] ? w.lendable[z] / w.lendAsked[z] : 1;
        }
      }
    }
    // Lenders hand over the cash only after all requests were computed from the same balances.
    for (let z = 0; z < Z; z++) s.zone.householdMoney[z] = Math.max(0, s.zone.householdMoney[z] - w.lendGiven[z]);
  }

  // 3. Debt service, then spending with whatever cash is left.
  for (let c = 0; c < C; c++) {
    let missed = false;
    const interestDue = w.interestDue[c];
    if (interestDue > 0) {
      const paid = Math.min(interestDue, country.treasury[c]);
      payHolders(s, w, c, paid, true);
      w.spentInterest[c] += paid;
      const unpaid = interestDue - paid;
      if (unpaid > interestDue * 1e-9) {
        missed = true;
        // Unpaid interest is added to what the country owes.
        scaleDebt(s, c, (country.debt[c] + unpaid) / country.debt[c]);
      }
    }
    if (w.principalDue[c] > 0) {
      const paid = repay(s, w, c, w.principalDue[c]);
      if (paid < w.principalDue[c] * (1 - 1e-9)) missed = true;
    }
    if (w.extraRepayment[c] > 0) repay(s, w, c, w.extraRepayment[c]);
    if (missed) {
      country.missedPayments[c] += 1;
      w.missedPayment[c] = 1;
      events.push({ type: 'missed-payment', turn: s.turn + 1, countryId: s.countries[c].id, consecutive: country.missedPayments[c] });
    } else country.missedPayments[c] = 0;

    const planned = w.planTotal[c];
    const funded = planned > EPSILON ? clamp(country.treasury[c] / planned, 0, 1) : 1;
    w.fundedShare[c] = funded;
    country.arrears[c] += 0.2 * ((1 - funded) - country.arrears[c]);
    w.planAdministration[c] *= funded;
    w.planSocial[c] *= funded;
    w.planMilitaryPay[c] *= funded;
    w.planMilitaryGoods[c] *= funded;
    w.planInfrastructure[c] *= funded;
  }

  // 4. Cash transfers to households and orders for goods, zone by zone.
  for (let z = 0; z < Z; z++) {
    const c = s.zone.owner[z];
    const share = w.population[c] > 0 ? s.zone.population[z] / w.population[c] : 0;
    if (!(share > 0)) continue;
    const funded = w.fundedShare[c];
    const cash = Math.min((w.planSocial[c] + w.planMilitaryPay[c]) * share, country.treasury[c]);
    if (cash > 0) {
      const social = w.planSocial[c] + w.planMilitaryPay[c] > 0 ? cash * w.planSocial[c] / (w.planSocial[c] + w.planMilitaryPay[c]) : 0;
      country.treasury[c] -= cash;
      s.zone.householdMoney[z] += cash;
      w.householdIncome[z] += cash;
      w.spentSocial[c] += social;
      w.spentMilitary[c] += cash - social;
    }
    for (let g = 0; g < G; g++) {
      const price = s.zoneGood.buyPrice[z * G + g];
      const administration = w.planAdministration[c] * m.administration[g] * share;
      const military = w.planMilitaryGoods[c] * m.military[g] * share + w.procurement[c * G + g] * funded * share * price;
      const infrastructure = w.planInfrastructure[c] * m.infrastructure[g] * share;
      const value = administration + military + infrastructure;
      if (value > 0) {
        w.demandGovernment[z * G + g] = value / price;
        w.governmentOrdered[c * G + g] += value / price;
        const base = (c * G + g) * 3;
        w.governmentCategoryShare[base] += administration;
        w.governmentCategoryShare[base + 1] += military;
        w.governmentCategoryShare[base + 2] += infrastructure;
      }
      const reserve = w.reserveBuy[c * G + g] * funded * share;
      if (reserve > 0) w.demandReserve[z * G + g] = reserve;
    }
  }
}

/** Write off part of a country's debt and apply the consequences. */
function applyDefault(s: EconomyState, m: Model, c: number, forced: boolean, events: EconomyEvent[]): void {
  const p = s.config.params;
  const country = s.country;
  const Z = s.zones.length;
  const G = m.goodCount;
  const before = country.debt[c];
  if (!(before > EPSILON)) return;
  scaleDebt(s, c, 1 - p.defaultHaircut);
  const writtenOff = before - country.debt[c];
  country.averageRate[c] = Math.min(country.averageRate[c], p.restructuredRate);
  // Repeat offenders stay locked out of credit markets for longer.
  country.exclusionWeeks[c] = Math.round(p.defaultExclusionWeeks * (1 + 0.5 * country.defaults[c]));
  country.marketAccess[c] = 0;
  country.reputationSpread[c] += p.defaultReputationSpread;
  country.stability[c] = Math.max(0, country.stability[c] - p.defaultStabilityShock);
  country.missedPayments[c] = 0;
  country.defaults[c] += 1;
  // Financial disruption: a temporary loss of output in every sector.
  if (p.defaultOutputShock > 0 && p.defaultShockRecoveryWeeks > 0) {
    const recovery = Math.min(1, 1 / p.defaultShockRecoveryWeeks);
    for (let z = 0; z < Z; z++) {
      if (s.zone.owner[z] !== c) continue;
      for (let g = 0; g < G; g++) {
        const index = z * G + g;
        const active = s.zoneGood.yieldFactor[index] < 0.999 && s.zoneGood.yieldRecovery[index] > 0;
        s.zoneGood.yieldRecovery[index] = active ? Math.min(s.zoneGood.yieldRecovery[index], recovery) : recovery;
        s.zoneGood.yieldFactor[index] *= 1 - p.defaultOutputShock;
      }
    }
  }
  events.push({
    type: 'sovereign-default', turn: s.turn + 1, countryId: s.countries[c].id, forced,
    haircut: p.defaultHaircut, debtWrittenOff: writtenOff,
  });
}

/**
 * End of the week: repay from surpluses, detect defaults, reprice sovereign
 * risk and let the monetary authority adjust the money supply.
 */
export function settleFinances(s: EconomyState, w: Workspace, m: Model, events: EconomyEvent[]): void {
  const p = s.config.params;
  const C = s.countries.length;
  const Z = s.zones.length;
  const country = s.country;

  // World aggregates measured this week.
  let worldReal = 0;
  for (let z = 0; z < Z; z++) {
    w.countryNominal[s.zone.owner[z]] += w.valueAdded[z];
    w.countryReal[s.zone.owner[z]] += w.valueAddedReal[z];
    worldReal += w.valueAddedReal[z];
  }
  let inflation = 0;
  let weight = 0;
  for (let z = 0; z < Z; z++) {
    inflation += s.zone.inflation[z] * s.zone.population[z];
    weight += s.zone.population[z];
  }
  s.world.inflation = weight > 0 ? inflation / weight : 0;
  const growth = s.world.realGdp > EPSILON ? clamp(worldReal / s.world.realGdp - 1, -0.05, 0.05) : 0;
  s.world.realGrowth += p.growthSmoothing * (growth - s.world.realGrowth);
  s.world.realGdp = worldReal;
  const utilisation = w.creditAvailable > EPSILON ? w.creditRequested / w.creditAvailable : 0;
  s.world.creditUtilization += 0.1 * (Math.min(2, utilisation) - s.world.creditUtilization);
  const tightness = Math.min(0.95, s.world.creditUtilization);
  s.world.interestRate = p.baseRate + p.worldRateSlope * tightness / (1 - tightness);

  // Monetary authority: money grows with real output, leaning against
  // inflation and against world-wide unemployment.
  let idle = 0;
  let workforce = 0;
  for (let z = 0; z < Z; z++) {
    idle += s.zone.unemployment[z] * w.laborSupply[z];
    workforce += w.laborSupply[z];
  }
  const slack = workforce > EPSILON ? idle / workforce - p.naturalUnemployment : 0;
  // Fighting unemployment with new money stops once inflation is at twice its target.
  const target = p.inflationTarget / 52;
  const room = target > EPSILON ? clamp((2 * target - s.world.inflation) / target, 0, 1) : (s.world.inflation <= 0 ? 1 : 0);
  // Trend: enough new money for real growth at the target inflation rate.
  const moneyGrowth = clamp(
    target + s.world.realGrowth + p.moneyRuleGain * (target - s.world.inflation) + p.moneyRuleSlackGain * slack * room,
    0, p.moneyGrowthMaxWeekly);
  const created = moneyGrowth * s.world.baseMoney;
  let gdpTotal = 0;
  for (let c = 0; c < C; c++) gdpTotal += country.gdp[c];
  if (created > 0 && gdpTotal > EPSILON && !w.calibrating) {
    for (let c = 0; c < C; c++) {
      const part = created * country.gdp[c] / gdpTotal;
      country.treasury[c] += part;
      w.revenueSeigniorage[c] += part;
    }
    s.world.baseMoney += created;
    w.moneyCreated += created;
  }

  for (let c = 0; c < C; c++) {
    // Cash clearly above the target pays down debt.
    if (country.debt[c] > EPSILON && country.treasury[c] > w.cashTarget[c] * 1.1) {
      repay(s, w, c, (country.treasury[c] - w.cashTarget[c]) * p.surplusRepayShare);
    }
    country.gdp[c] += p.gdpSmoothing * (w.countryNominal[c] - country.gdp[c]);
    country.realGdp[c] = w.countryReal[c];
    const revenue = w.revenueIncomeTax[c] + w.revenueConsumptionTax[c] + w.revenueCorporateTax[c] + w.revenueTariffs[c]
      + w.revenueSeigniorage[c] + w.revenueReserveSales[c] + w.revenueFunds[c];
    const spending = w.spentAdministration[c] + w.spentSocial[c] + w.spentMilitary[c] + w.spentInfrastructure[c]
      + w.spentReserves[c] + w.spentInterest[c] + w.spentFunds[c];
    const deficit = country.gdp[c] > EPSILON ? (spending - revenue) / country.gdp[c] : 0;
    country.deficit[c] += 0.1 * (clamp(deficit, -1, 1) - country.deficit[c]);

    if (w.defaultRequested[c] === 1) applyDefault(s, m, c, false, events);
    else if (country.missedPayments[c] >= p.missedPaymentsToDefault) applyDefault(s, m, c, true, events);

    // Sovereign risk premium.
    const yearly = 52 * country.gdp[c];
    const ratio = yearly > EPSILON ? country.debt[c] / yearly : (country.debt[c] > EPSILON ? 10 : 0);
    const over = Math.max(0, ratio - p.spreadQuadThreshold);
    const spread = p.spreadLinear * Math.max(0, ratio - p.spreadDebtThreshold) + p.spreadQuad * over * over
      + p.spreadDeficit * Math.max(0, country.deficit[c] - 0.03) + country.reputationSpread[c]
      + p.spreadInstability * Math.max(0, (50 - country.stability[c]) / 50);
    const rate = Math.min(p.maxRate, s.world.interestRate + spread);
    country.marketRate[c] += 0.25 * (rate - country.marketRate[c]);
    country.reputationSpread[c] *= 1 - 1 / p.reputationDecayWeeks;
    if (country.reputationSpread[c] < 1e-6) country.reputationSpread[c] = 0;

    if (country.exclusionWeeks[c] > 0) {
      country.exclusionWeeks[c] -= 1;
    } else if (country.marketAccess[c] === 1) {
      if (country.marketRate[c] > p.marketAccessRate) {
        country.marketAccess[c] = 0;
        events.push({ type: 'market-access-lost', turn: s.turn + 1, countryId: s.countries[c].id, rate: country.marketRate[c] });
      } else {
        // Maturing debt is refinanced at today's rate.
        country.averageRate[c] += (country.marketRate[c] - country.averageRate[c]) / p.debtMaturityWeeks;
      }
    } else if (country.marketRate[c] < p.accessRestoreRate) {
      country.marketAccess[c] = 1;
      events.push({ type: 'market-access-restored', turn: s.turn + 1, countryId: s.countries[c].id, rate: country.marketRate[c] });
    }
  }
}
