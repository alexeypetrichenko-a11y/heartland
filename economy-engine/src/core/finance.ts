import type { EconomyEvent, EconomyState } from '../types.ts';
import type { Model, Workspace } from './model.ts';
import { clamp, EPSILON } from './model.ts';
import { bankLend, bankReceive, settleBanks } from './credit.ts';

/**
 * Public finances: budgets, borrowing, debt service, default and the world
 * monetary rule.
 *
 * Money is conserved. Governments borrow existing money from households (at
 * home and abroad) and the engine records who holds whose debt, so interest,
 * repayment and default losses reach exactly the right holders. When the bond
 * market cannot supply enough, a solvent state may borrow from its own central
 * bank, which is the only source of new money besides the bank's lending to
 * firms and exceptional creation by explicit command (see credit.ts).
 */

/** Public debt of country c: bonds held by households plus loans from its central bank. */
export function publicDebt(s: EconomyState, c: number): number {
  return s.country.debt[c] + s.country.cbStateLoans[c];
}

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
      // Reserves are judged against what buyers normally pay, freight and tariffs included,
      // so an importer is not mistaken for a country in permanent scarcity.
      w.countryRefPrice[c * G + g] += weight * s.zoneGood.refBuyPrice[index];
      w.countryShortage[c * G + g] += weight * s.zoneGood.shortage[index];
      w.countryUse[c * G + g] += s.zoneGood.usage[index];
    }
  }
}

/** Decide how much each government wants to add to or release from reserves. */
function planReserves(s: EconomyState, w: Workspace, m: Model): void {
  const p = s.config.params;
  const C = s.countries.length;
  const Z = s.zones.length;
  const G = m.goodCount;
  // Stored reserves age (more slowly than producers' stock) and storage costs
  // real money, paid to the warehouse workers of the country (R13).
  for (let c = 0; c < C; c++) {
    let value = 0;
    for (let g = 0; g < G; g++) {
      const index = c * G + g;
      const held = s.countryGood.reserves[index];
      if (!(held > 0)) continue;
      const lost = held * m.spoilage[g] * p.reserveSpoilageShare;
      s.countryGood.reserves[index] = held - lost;
      w.ledgerSpoiled[g] += lost;
      value += (held - lost) * w.countryRefPrice[index];
    }
    const cost = Math.min(value * p.reserveStorageCost, Math.max(0, s.country.treasury[c]));
    if (!(cost > 0) || !(w.population[c] > 0)) continue;
    s.country.treasury[c] -= cost;
    w.spentReserveStorage[c] += cost;
    let paid = 0;
    let last = -1;
    for (let z = 0; z < Z; z++) {
      if (s.zone.owner[z] !== c) continue;
      const part = cost * s.zone.population[z] / w.population[c];
      s.zone.householdMoney[z] += part;
      w.householdIncome[z] += part;
      paid += part;
      last = z;
    }
    // Rounding remainder goes to the last zone so no money is lost.
    if (last >= 0) { s.zone.householdMoney[last] += cost - paid; w.householdIncome[last] += cost - paid; }
  }
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
    // ECON-07 (A): the shares apply to the budget base, which follows a falling GDP only slowly.
    const base = country.spendingBase[c];
    const military = country.spendMilitary[c] * base;
    w.planAdministration[c] = country.spendAdministration[c] * base;
    w.planSocial[c] = country.spendSocial[c] * base;
    w.planMilitaryPay[c] = military * p.militaryPayShare;
    w.planMilitaryGoods[c] = military - w.planMilitaryPay[c];
    w.planInfrastructure[c] = country.spendInfrastructure[c] * base;
    let extras = 0;
    let reserves = 0;
    for (let g = 0; g < G; g++) {
      extras += w.procurement[c * G + g] * w.countryPrice[c * G + g];
      reserves += w.reserveBuy[c * G + g] * w.countryPrice[c * G + g];
    }
    w.planExtras[c] = reserves;
    // Core spending: the four budgets and military procurement. Reserve purchases are paid
    // only from what is left, so filling stores can never starve schools and hospitals.
    const planned = w.planAdministration[c] + w.planSocial[c] + military + w.planInfrastructure[c] + extras;
    w.planTotal[c] = planned;
    const excluded = country.exclusionWeeks[c] > 0;
    w.interestDue[c] = country.debt[c] * country.averageRate[c] / 52 + country.cbStateLoans[c] * country.cbRate[c] / 52;
    w.principalDue[c] = country.marketAccess[c] === 1 || excluded ? 0 : country.debt[c] / p.debtMaturityWeeks;
    // Cash wanted at the start of a week: this week's bills plus a buffer.
    w.cashTarget[c] = (planned + reserves) * (1 + p.treasuryBufferWeeks);
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
  // What the bond market could not supply, a solvent state may borrow from its
  // own central bank, which serves the state before firms (R07) but only within
  // its lending capacity (R61).
  for (let c = 0; c < C; c++) {
    const shortfall = w.creditRequest[c] - w.borrowed[c];
    if (!(shortfall > 1e-12 * w.creditRequest[c]) || w.calibrating) continue;
    const room = p.cbStateLimit * 52 * country.gdp[c] - country.cbStateLoans[c];
    const granted = bankLend(s, w, c, Math.min(shortfall, room));
    if (!(granted > 0)) continue;
    country.cbStateLoans[c] += granted;
    country.treasury[c] += granted;
    w.borrowed[c] += granted;
    w.cbLentState[c] += granted;
  }

  // 3. Debt service, then spending with whatever cash is left.
  for (let c = 0; c < C; c++) {
    let missed = false;
    const interestDue = w.interestDue[c];
    if (interestDue > 0) {
      // Bondholders and the central bank are paid in the same proportion.
      const paid = Math.min(interestDue, Math.max(0, country.treasury[c]));
      const bankDue = country.cbStateLoans[c] * country.cbRate[c] / 52;
      const bankPaid = interestDue > 0 ? paid * bankDue / interestDue : 0;
      payHolders(s, w, c, paid - bankPaid, true);
      country.treasury[c] -= bankPaid;
      bankReceive(s, c, bankPaid);
      w.cbInterestIncome[c] += bankPaid;
      w.spentInterest[c] += paid;
      const unpaid = interestDue - paid;
      if (unpaid > interestDue * 1e-9) {
        missed = true;
        w.interestUnpaid[c] += unpaid;
        // Unpaid interest is added to what the country owes.
        const unpaidBank = bankDue - bankPaid;
        if (country.debt[c] > EPSILON) scaleDebt(s, c, (country.debt[c] + unpaid - unpaidBank) / country.debt[c]);
        country.cbStateLoans[c] += unpaidBank;
      }
    }
    if (w.principalDue[c] > 0) {
      const paid = repay(s, w, c, w.principalDue[c]);
      if (paid < w.principalDue[c] * (1 - 1e-9)) missed = true;
    }
    // Central-bank loans to the state are always repaid in instalments: they cannot be rolled
    // over for ever. A state that still needs the money must borrow again, from the bond
    // market first and from its bank only within its ordinary lending capacity.
    const instalment = w.calibrating ? 0 : country.cbStateLoans[c] / p.cbStateLoanWeeks;
    if (instalment > 0) {
      const paid = Math.min(instalment, Math.max(0, country.treasury[c]));
      country.treasury[c] -= paid;
      country.cbStateLoans[c] -= paid;
      bankReceive(s, c, paid);
      w.repaid[c] += paid;
      if (paid < instalment * (1 - 1e-9)) missed = true;
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
    // Reserves are bought only with cash beyond this week's core spending.
    const spare = country.treasury[c] - planned * funded;
    w.reserveFunded[c] = w.planExtras[c] > 0 ? clamp(spare / w.planExtras[c], 0, 1) : 0;
    // ECON-07 (A): with no debt left to repay, cash beyond this week's bills and a strategic reserve goes
    // back to households a little each week (as a cash transfer) instead of piling up idle in the treasury.
    if (p.surplusReturnShare > 0 && !w.calibrating && country.debt[c] <= EPSILON && country.cbStateLoans[c] <= EPSILON) {
      const excess = spare - w.planExtras[c] - planned * p.treasuryReserveWeeks;
      if (excess > EPSILON) w.planReturn[c] = excess * p.surplusReturnShare;
    }
  }

  // 4. Cash transfers to households and orders for goods, zone by zone.
  for (let z = 0; z < Z; z++) {
    const c = s.zone.owner[z];
    // An occupier extends its spending to the zones it occupies only as far as its policy says (Milestone 4).
    const share = w.spendPopulation[c] > 0 ? s.zone.population[z] * w.spendWeight[z] / w.spendPopulation[c] : 0;
    if (!(share > 0)) continue;
    const funded = w.fundedShare[c];
    const cash = Math.min((w.planSocial[c] + w.planMilitaryPay[c]) * share, country.treasury[c]);
    const returned = Math.min(w.planReturn[c] * share, Math.max(0, country.treasury[c] - cash));
    if (returned > 0) {
      country.treasury[c] -= returned;
      s.zone.householdMoney[z] += returned;
      w.householdIncome[z] += returned;
      w.spentSurplusReturn[c] += returned;
    }
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
      const reserve = w.reserveBuy[c * G + g] * w.reserveFunded[c] * share;
      if (reserve > 0) w.demandReserve[z * G + g] = reserve;
    }
  }
}

/** Write off part of a country's debt and apply the consequences. */
function applyDefault(s: EconomyState, w: Workspace, m: Model, c: number, forced: boolean, events: EconomyEvent[]): void {
  const p = s.config.params;
  const country = s.country;
  const Z = s.zones.length;
  const G = m.goodCount;
  const before = country.debt[c];
  if (!(before + country.cbStateLoans[c] > EPSILON)) return;
  // Repeat defaulters (C3): every consequence is heavier, creditors concede much less each
  // time, and they concede nothing at all while the previous restructuring is still under way
  // (the country is still shut out of credit markets), so serial defaults cannot erase debt.
  // ECON-07 (B): a default the state chose while it could still borrow and pay is judged more harshly than
  // one forced on it (or declared once lenders had already shut it out).
  const voluntary = !forced && country.marketAccess[c] === 1 && country.missedPayments[c] === 0;
  const record = 1 + country.defaultMemory[c];
  // The write-off depends only on the country's record of defaults (the approved provisional 55% for a first one);
  // every other consequence is heavier for a voluntary default.
  const repeat = record + (voluntary ? p.voluntaryDefaultWeight : 0);
  const haircut = country.exclusionWeeks[c] > 0 ? 0 : p.defaultHaircut / (record * record);
  scaleDebt(s, c, 1 - haircut);
  // The central bank's loans to the defaulting state lose the same share: a loss of its capital.
  const bankLoss = country.cbStateLoans[c] * haircut;
  country.cbStateLoans[c] -= bankLoss;
  w.cbWriteOffs[c] += bankLoss;
  const writtenOff = before - country.debt[c] + bankLoss;
  country.averageRate[c] = Math.min(country.averageRate[c], p.restructuredRate);
  // Repeat offenders stay locked out of credit markets for longer.
  // A voluntary default counts as part of an extra previous default here too.
  country.exclusionWeeks[c] = Math.round(p.defaultExclusionWeeks * (1 + 0.5 * (country.defaults[c] + (voluntary ? p.voluntaryDefaultWeight : 0))));
  country.marketAccess[c] = 0;
  country.reputationSpread[c] += p.defaultReputationSpread * repeat;
  country.stability[c] = Math.max(0, country.stability[c] - p.defaultStabilityShock * repeat);
  country.missedPayments[c] = 0;
  country.defaults[c] += 1;
  country.defaultMemory[c] += 1;
  const outputShock = Math.min(0.25, p.defaultOutputShock * repeat);
  // Financial disruption: a temporary loss of output in every sector.
  if (outputShock > 0 && p.defaultShockRecoveryWeeks > 0) {
    const recovery = Math.min(1, 1 / p.defaultShockRecoveryWeeks);
    for (let z = 0; z < Z; z++) {
      if (s.zone.owner[z] !== c) continue;
      for (let g = 0; g < G; g++) {
        const index = z * G + g;
        const active = s.zoneGood.yieldFactor[index] < 0.999 && s.zoneGood.yieldRecovery[index] > 0;
        s.zoneGood.yieldRecovery[index] = active ? Math.min(s.zoneGood.yieldRecovery[index], recovery) : recovery;
        // Disruptions do not compound: output is held at most (1 - shock) of normal.
        s.zoneGood.yieldFactor[index] = Math.min(s.zoneGood.yieldFactor[index], 1 - outputShock);
      }
    }
  }
  events.push({
    type: 'sovereign-default', turn: s.turn + 1, countryId: s.countries[c].id, forced, voluntary,
    haircut, debtWrittenOff: writtenOff,
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

  // No automatic money creation (R08): central banks only lend within their
  // capacity, collect interest and pay their profit to the treasury.
  settleBanks(s, w, events);

  for (let c = 0; c < C; c++) {
    // Cash clearly above the target pays down debt.
    if (country.debt[c] > EPSILON && country.treasury[c] > w.cashTarget[c] * 1.1 && !w.calibrating) {
      repay(s, w, c, (country.treasury[c] - w.cashTarget[c]) * p.surplusRepayShare);
    }
    // Cash still well above the target repays the central bank, so money cannot pile up idle in a treasury.
    if (country.cbStateLoans[c] > 0 && country.treasury[c] > w.cashTarget[c] * 1.1 && !w.calibrating) {
      const paid = Math.min(country.cbStateLoans[c], (country.treasury[c] - w.cashTarget[c]) * p.surplusRepayShare);
      country.treasury[c] -= paid;
      country.cbStateLoans[c] -= paid;
      bankReceive(s, c, paid);
      w.repaid[c] += paid;
    }
    country.gdp[c] += p.gdpSmoothing * (w.countryNominal[c] - country.gdp[c]);
    const gap = w.countryNominal[c] - country.spendingBase[c];
    country.spendingBase[c] += (gap < 0 ? p.spendingBaseFall : p.gdpSmoothing) * gap;
    country.realGdp[c] = w.countryReal[c];
    const revenue = w.revenueIncomeTax[c] + w.revenueConsumptionTax[c] + w.revenueCorporateTax[c] + w.revenueTariffs[c]
      + w.revenueCentralBank[c] + w.revenueMoneyCreation[c] + w.revenueReserveSales[c] + w.revenueFunds[c] + w.revenueFirmDividends[c]
      + w.revenueOwnership[c] + w.revenueOccupation[c];
    const spending = w.spentAdministration[c] + w.spentSocial[c] + w.spentMilitary[c] + w.spentInfrastructure[c]
      + w.spentReserves[c] + w.spentReserveStorage[c] + w.spentInterest[c] + w.spentFunds[c] + w.spentFirmSupport[c]
      + w.spentOwnership[c] + w.spentCentralBankCapital[c] + w.spentOccupationSecurity[c] + w.spentTransport[c] + w.spentSurplusReturn[c];
    const deficit = country.gdp[c] > EPSILON ? (spending - revenue) / country.gdp[c] : 0;
    country.deficit[c] += 0.1 * (clamp(deficit, -1, 1) - country.deficit[c]);

    if (w.defaultRequested[c] === 1) applyDefault(s, w, m, c, false, events);
    else if (country.missedPayments[c] >= p.missedPaymentsToDefault) applyDefault(s, w, m, c, true, events);

    // Sovereign risk premium.
    const yearly = 52 * country.gdp[c];
    const debt = publicDebt(s, c);
    const ratio = yearly > EPSILON ? debt / yearly : (debt > EPSILON ? 10 : 0);
    const over = Math.max(0, ratio - p.spreadQuadThreshold);
    const spread = p.spreadLinear * Math.max(0, ratio - p.spreadDebtThreshold) + p.spreadQuad * over * over
      + p.spreadDeficit * Math.max(0, country.deficit[c] - 0.03) + country.reputationSpread[c]
      + p.spreadInstability * Math.max(0, (50 - country.stability[c]) / 50)
      // Lenders fear repayment in money printed for the purpose (R43).
      + (yearly > EPSILON ? p.exceptionalMoneySpread * country.cbExceptionalRecent[c] / yearly : 0);
    const rate = Math.min(p.maxRate, s.world.interestRate + spread);
    country.marketRate[c] += 0.25 * (rate - country.marketRate[c]);
    country.reputationSpread[c] *= 1 - 1 / p.reputationDecayWeeks;
    country.defaultMemory[c] *= 1 - 1 / p.defaultMemoryWeeks;
    if (country.defaultMemory[c] < 1e-6) country.defaultMemory[c] = 0;
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
