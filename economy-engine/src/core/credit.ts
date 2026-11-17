import type { EconomyEvent, EconomyState } from '../types.ts';
import type { Model, Workspace } from './model.ts';
import {
  AVERAGE_TIER, clamp, DUST, EPSILON, firmLoanRate, MIXED, OWNERSHIP_COUNT, OWNERSHIP_TYPES, PUBLIC, TIER_COUNT,
} from './model.ts';

/**
 * Central banks, firm credit, bankruptcy and performance-tier transitions
 * (Milestone 2: R07-R09, R31, R57, R58, R61).
 *
 * Accounting model. Every unit of money in circulation is a liability of
 * some national central bank ("money issued"). A central bank's assets are
 * its reserves (gold and foreign assets that do not circulate), its loans to
 * its own state and its loans to firms. Its capital (equity) is assets minus
 * money issued. Money changes ONLY through the bank:
 *
 *   - lending X:          loans +X, money issued +X (the borrower receives new money);
 *   - receiving interest: money issued -I (the money is withdrawn), capital +I;
 *   - receiving principal: loans -R, money issued -R;
 *   - paying its profit to the treasury: money issued +P, capital -P;
 *   - writing off a bad loan: loans -W, capital -W (no money moves);
 *   - exceptional creation on explicit command (R08): money issued +E, capital -E.
 *
 * Normal lending is limited (R61): total loans may not exceed capital divided
 * by the capital ratio. The state is served first (R07); firms share what is
 * left. There is no automatic money creation of any other kind.
 */

const O = OWNERSHIP_COUNT;
const T = TIER_COUNT;

/** Capital of central bank c: reserves + loans to the state + loans to firms - money issued. */
export function bankEquity(s: EconomyState, c: number, firmLoans: number): number {
  return s.country.cbReserves[c] + s.country.cbStateLoans[c] + firmLoans - s.country.cbIssued[c];
}

/** Largest total of loans bank c may hold with its present capital. */
export function lendingCapacity(s: EconomyState, c: number, firmLoans: number): number {
  return Math.max(0, bankEquity(s, c, firmLoans)) / s.config.params.cbCapitalRatio;
}

/** Sum of firm loans held by each central bank. */
export function firmLoansByBank(s: EconomyState, out: Float64Array): void {
  out.fill(0);
  const loan = s.firm.loan;
  const lender = s.firm.lender;
  for (let a = 0; a < loan.length; a++) if (loan[a] > 0) out[lender[a]] += loan[a];
}

/** Start of the week: how much each central bank may still lend. */
export function openBanks(s: EconomyState, w: Workspace): void {
  firmLoansByBank(s, w.cbFirmLoans);
  // Money held in each country (households, firms, treasury): what its bank's policy aims at.
  const perZone = s.firm.cash.length / s.zones.length;
  for (let z = 0; z < s.zones.length; z++) {
    const c = s.zone.owner[z];
    w.domesticMoney[c] += s.zone.householdMoney[z];
    for (let k = 0; k < perZone; k++) w.domesticMoney[c] += s.firm.cash[z * perZone + k];
  }
  for (let c = 0; c < s.countries.length; c++) w.domesticMoney[c] += s.country.treasury[c];
  for (let c = 0; c < s.countries.length; c++) {
    w.cbIssuedStart[c] = s.country.cbIssued[c];
    const loans = s.country.cbStateLoans[c] + w.cbFirmLoans[c];
    w.cbCapacityLeft[c] = Math.max(0, lendingCapacity(s, c, w.cbFirmLoans[c]) - loans);
    w.firmLoanRate[c] = firmLoanRate(s, c);
  }
}

/** Lend up to `amount` of new money from bank c; returns what was granted. Never beyond capacity. */
export function bankLend(s: EconomyState, w: Workspace, c: number, amount: number): number {
  const granted = Math.min(Math.max(0, amount), w.cbCapacityLeft[c]);
  if (!(granted > 0)) return 0;
  w.cbCapacityLeft[c] -= granted;
  s.country.cbIssued[c] += granted;
  return granted;
}

/** Money paid to bank c (interest, principal or recoveries) is withdrawn from circulation. */
export function bankReceive(s: EconomyState, c: number, amount: number): void {
  if (amount > 0) s.country.cbIssued[c] -= amount;
}

/** Replacement value of the plant of every aggregate of zone z (credit collateral). */
export function capitalValues(s: EconomyState, w: Workspace, m: Model, z: number, capitalPrice: number): void {
  const G = m.goodCount;
  const S = m.sectorCount;
  const lines = s.firmLine.capacity;
  const first = z * S * O;
  for (let k = 0; k < S * O; k++) w.aggCapitalValue[first + k] = 0;
  for (let g = 0; g < G; g++) {
    const perUnit = m.capitalWeeks[g] * capitalPrice;
    const a = first + m.goodSector[g] * O;
    const base = (z * G + g) * O * T;
    for (let o = 0; o < O; o++) {
      let capacity = 0;
      for (let t = 0; t < T; t++) capacity += lines[base + o * T + t];
      w.aggCapitalValue[a + o] += capacity * perUnit;
    }
  }
}

/**
 * Borrow up to `amount` for aggregate a, within its credit limit (lower for
 * firms in poor health) and its bank's capacity. A firm keeps borrowing from the bank that already holds its loan.
 */
export function firmBorrow(s: EconomyState, w: Workspace, a: number, owner: number, amount: number): number {
  if (w.calibrating || !(amount > 0)) return 0;
  const p = s.config.params;
  const firm = s.firm;
  const lender = firm.loan[a] > 0 ? firm.lender[a] : owner;
  // Banks lend less to firms in poor financial health: a firm that keeps losing
  // money eventually finds no more credit (and may then fail, R31).
  const room = p.firmMaxLeverage * w.aggCapitalValue[a] * clamp(1 + 0.5 * firm.health[a], 0.5, 1) - firm.loan[a];
  const granted = bankLend(s, w, lender, Math.min(amount, room));
  if (!(granted > 0)) return 0;
  firm.lender[a] = lender;
  firm.loan[a] += granted;
  firm.cash[a] += granted;
  return granted;
}

/** Share of new investment a firm finances with a loan, given the price of credit. */
export function loanFinancedShare(s: EconomyState, c: number): number {
  const p = s.config.params;
  const neutral = p.baseRate + p.firmLoanSpread;
  const rate = firmLoanRate(s, c);
  return p.firmTargetLeverage * clamp(1 + p.firmLeverageRateSensitivity * (neutral - rate) / neutral, 0.25, 2.5);
}

/**
 * Weekly debt service of aggregate a: interest at the firm loan rate, and
 * repayment as fast as the plant that secures the loan wears out. Unpaid
 * interest is added to the debt (there is no automatic restructuring, R31).
 * Returns the part of the service that could not be paid.
 */
export function serviceFirmDebt(s: EconomyState, w: Workspace, a: number, depreciation: number): number {
  const firm = s.firm;
  const loan = firm.loan[a];
  if (!(loan > 0)) return 0;
  const lender = firm.lender[a];
  const interest = loan * w.firmLoanRate[lender] / 52;
  const principal = w.calibrating ? 0 : loan * depreciation;
  const cash = Math.max(0, firm.cash[a]);
  const interestPaid = Math.min(interest, cash);
  const principalPaid = Math.min(principal, cash - interestPaid);
  firm.cash[a] -= interestPaid + principalPaid;
  bankReceive(s, lender, interestPaid + principalPaid);
  w.cbInterestIncome[lender] += interestPaid;
  w.aggInterest[a] = interestPaid;
  firm.loan[a] = loan - principalPaid + (interest - interestPaid);
  const unpaid = interest - interestPaid + principal - principalPaid;
  return unpaid > 1e-12 * (interest + principal) ? unpaid : 0;
}

/**
 * End of the week: banks pay out their profit, set their policy rates and
 * report exceptional money creation.
 */
export function settleBanks(s: EconomyState, w: Workspace, events: EconomyEvent[]): void {
  const p = s.config.params;
  const C = s.countries.length;
  const Z = s.zones.length;
  const country = s.country;
  firmLoansByBank(s, w.cbFirmLoans);
  for (let c = 0; c < C; c++) {
    // Profit: interest earned less loans written off. Losses are borne by capital.
    const profit = w.cbInterestIncome[c] - w.cbWriteOffs[c];
    if (profit > 0) {
      const payout = profit * p.cbProfitPayout;
      country.cbIssued[c] += payout;
      country.treasury[c] += payout;
      w.revenueCentralBank[c] += payout;
    }
    if (w.revenueMoneyCreation[c] > 0) {
      events.push({ type: 'money-created', turn: s.turn + 1, countryId: s.countries[c].id, amount: w.revenueMoneyCreation[c] });
    }
    country.cbExceptionalRecent[c] *= 1 - 1 / p.exceptionalMoneyMemoryWeeks;
    if (country.cbExceptionalRecent[c] < DUST) country.cbExceptionalRecent[c] = 0;
  }
  if (w.calibrating) return;
  openMarketOperations(s, w);
  // Automatic policy rate (R09): leans against inflation and unemployment, and
  // rises as lending capacity runs out so scarce credit is rationed by price.
  for (let c = 0; c < C; c++) {
    let inflation = 0, people = 0, idle = 0, supply = 0;
    for (let z = 0; z < Z; z++) {
      if (s.zone.owner[z] !== c) continue;
      inflation += s.zone.inflation[z] * s.zone.population[z];
      people += s.zone.population[z];
      idle += s.zone.unemployment[z] * w.laborSupply[z];
      supply += w.laborSupply[z];
    }
    const yearlyInflation = people > EPSILON ? 52 * inflation / people : 0;
    const unemployment = supply > EPSILON ? idle / supply : p.naturalUnemployment;
    const loans = country.cbStateLoans[c] + w.cbFirmLoans[c];
    const capacity = lendingCapacity(s, c, w.cbFirmLoans[c]);
    const used = capacity > 0 ? loans / capacity : (loans > 0 ? 1 : 0);
    const rule = p.baseRate + p.cbInflationGain * (yearlyInflation - p.inflationTarget)
      - p.cbUnemploymentGain * (unemployment - p.naturalUnemployment)
      + p.cbScarcityPremium * clamp((used - 0.85) / 0.15, 0, 1);
    country.cbRate[c] += p.cbRateSmoothing * (clamp(rule, p.cbRateFloor, p.cbRateCeiling) - country.cbRate[c]);
  }
}

/**
 * Normal monetary policy by open-market operations (R07, R09, R61). Each bank
 * aims to let the total money it has issued (after its lending, repayments and
 * profit transfers of the week) grow with real output at the inflation target, more when inflation is below target and less (or negative) when it
 * is above. It does so by buying its own state's bonds from the households
 * that hold them, pro rata, or selling them back. A purchase is a loan to the
 * state, so it needs lending capacity; a sale needs bonds in the bank's hands.
 * No one receives money for nothing.
 */
function openMarketOperations(s: EconomyState, w: Workspace): void {
  const p = s.config.params;
  const C = s.countries.length;
  const Z = s.zones.length;
  const country = s.country;
  const target = p.inflationTarget / 52;
  for (let c = 0; c < C; c++) {
    let inflation = 0, people = 0;
    for (let z = 0; z < Z; z++) {
      if (s.zone.owner[z] !== c) continue;
      inflation += s.zone.inflation[z] * s.zone.population[z];
      people += s.zone.population[z];
    }
    const weekly = people > EPSILON ? inflation / people : 0;
    const growth = clamp(target + s.world.realGrowth + p.cbMoneyGain * (target - weekly), -p.cbMoneyMaxWeekly, p.cbMoneyMaxWeekly);
    const bonds = country.debt[c];
    // The bank's operations of the week, together, should add money at this pace relative to
    // the money held in its country: the purchase makes up for what its lending, repayments
    // and profit transfers did. (Money earned abroad or spent abroad is not offset.)
    const base = Math.max(0, w.domesticMoney[c]);
    const limit = p.cbMoneyMaxWeekly * 2 * base;
    let amount = clamp(growth * base - (country.cbIssued[c] - w.cbIssuedStart[c]), -limit, limit);
    if (amount > 0) amount = Math.min(amount, w.cbCapacityLeft[c]);
    else amount = -Math.min(-amount, country.cbStateLoans[c]);
    if (amount === 0) continue;
    // Purchases are limited to the bonds households actually hold (at most half of them in a week).
    if (amount > 0) amount = Math.min(amount, 0.5 * bonds);
    if (!(amount > 0) && !(amount < 0)) continue;
    if (amount > 0) {
      // Buy bonds from every holder in proportion to what they hold.
      const keep = Math.max(0, 1 - amount / bonds);
      let paid = 0;
      for (let z = 0; z < Z; z++) {
        const held = s.bonds[z * C + c];
        if (!(held > 0)) continue;
        const left = held * keep;
        s.bonds[z * C + c] = left;
        s.zone.householdMoney[z] += held - left;
        paid += held - left;
      }
      amount = paid;
      w.cbCapacityLeft[c] = Math.max(0, w.cbCapacityLeft[c] - amount);
    } else {
      // Sell bonds back to households in proportion to their cash.
      let cash = 0;
      for (let z = 0; z < Z; z++) cash += Math.max(0, s.zone.householdMoney[z]);
      const sale = Math.min(-amount, 0.5 * cash);
      if (!(sale > 0)) continue;
      let received = 0;
      for (let z = 0; z < Z; z++) {
        const part = Math.min(Math.max(0, s.zone.householdMoney[z]), sale * Math.max(0, s.zone.householdMoney[z]) / cash);
        s.zone.householdMoney[z] -= part;
        s.bonds[z * C + c] += part;
        received += part;
      }
      amount = -received;
    }
    let held = 0;
    for (let z = 0; z < Z; z++) held += s.bonds[z * C + c];
    // Market debt is by definition the sum of the households' claims.
    country.debt[c] = held;
    country.cbStateLoans[c] = Math.max(0, country.cbStateLoans[c] + amount);
    country.cbIssued[c] += amount;
  }
}

/**
 * Re-measure starting firm debt and central-bank capital at the prices the
 * world builder settled on, so the first week starts at normal leverage.
 */
export function resetStartingCredit(s: EconomyState, m: Model): void {
  const p = s.config.params;
  const Z = s.zones.length;
  const G = m.goodCount;
  const S = m.sectorCount;
  const w = { aggCapitalValue: new Float64Array(Z * S * O) } as unknown as Workspace;
  for (let z = 0; z < Z; z++) {
    let capitalPrice = 0;
    for (let g = 0; g < G; g++) capitalPrice += m.investment[g] * s.zoneGood.buyPrice[z * G + g];
    capitalValues(s, w, m, z, capitalPrice);
    for (let k = 0; k < S * O; k++) {
      const a = z * S * O + k;
      s.firm.loan[a] = p.firmTargetLeverage * w.aggCapitalValue[a];
      s.firm.lender[a] = s.zone.owner[z];
    }
  }
  const loans = new Float64Array(s.countries.length);
  firmLoansByBank(s, loans);
  for (let c = 0; c < s.countries.length; c++) {
    const capital = p.cbCapitalRatio * (loans[c] + s.country.cbStateLoans[c] + p.cbStartingHeadroom * 52 * s.country.gdp[c]);
    s.country.cbReserves[c] = Math.max(0, s.country.cbIssued[c] - loans[c] - s.country.cbStateLoans[c] + capital);
  }
}

/**
 * Liquidation of insolvent firms (R31). When an aggregate has been unable to
 * pay its wages or its debt service for `bankruptcyWeeks` weeks in a row, its
 * weakest firms fail: at least `bankruptcyMinShare` of its plant, the fragile
 * tier first. Their plant is sold at a liquidation price to healthy firms of
 * the same sector and zone (it joins their average tier) or scrapped if nobody
 * can pay; their cash and the sale proceeds repay the bank as far as they go,
 * and the rest of their debt is written off. Jobs disappear with the plant.
 * Public firms are not liquidated: their owner, the state, supports them.
 */
export function resolveBankruptcies(s: EconomyState, w: Workspace, m: Model, events: EconomyEvent[]): void {
  if (w.calibrating) return;
  const p = s.config.params;
  const Z = s.zones.length;
  const G = m.goodCount;
  const S = m.sectorCount;
  const firm = s.firm;
  const fg = s.firmGood;
  const lines = s.firmLine.capacity;
  for (let z = 0; z < Z; z++) {
    const c = s.zone.owner[z];
    let capitalPrice = 0;
    for (let g = 0; g < G; g++) capitalPrice += m.investment[g] * s.zoneGood.buyPrice[z * G + g];
    for (let sector = 0; sector < S; sector++) {
      for (let o = 0; o < O; o++) {
        const a = (z * S + sector) * O + o;
        if (o === PUBLIC || firm.distress[a] < p.bankruptcyWeeks) continue;
        const goods = m.sectorGoods[sector];
        let total = 0;
        const byTier = [0, 0, 0];
        for (let i = 0; i < goods.length; i++) {
          const base = ((z * G + goods[i]) * O + o) * T;
          for (let t = 0; t < T; t++) { byTier[t] += lines[base + t]; total += lines[base + t]; }
        }
        firm.distress[a] = 0;
        if (!(total > EPSILON)) continue;
        // A very small aggregate (under 0.1% of the zone's workforce) is wound up in one go.
        const tiny = firm.employment[a] < 0.001 * w.laborSupply[z];
        const share = tiny ? 1 : clamp(Math.max(byTier[2] / total, p.bankruptcyMinShare), 0, 1);
        // Remove plant: fragile tier first, then average, then strong.
        let left = share * total;
        const removedTier = [0, 0, 0];
        for (const t of [2, 1, 0]) {
          const take = Math.min(left, byTier[t]);
          removedTier[t] = take;
          left -= take;
        }
        const removed = new Float64Array(goods.length);
        let value = 0;
        for (let i = 0; i < goods.length; i++) {
          const base = ((z * G + goods[i]) * O + o) * T;
          for (let t = 0; t < T; t++) {
            if (!(byTier[t] > 0) || !(removedTier[t] > 0)) continue;
            const cut = lines[base + t] * removedTier[t] / byTier[t];
            lines[base + t] -= cut;
            if (lines[base + t] < DUST) lines[base + t] = 0;
            removed[i] += cut;
          }
          value += removed[i] * m.capitalWeeks[goods[i]] * capitalPrice * p.liquidationValue;
          // Unfinished construction of the failed firms is abandoned.
          const ownerIndex = (z * G + goods[i]) * O + o;
          fg.build1[ownerIndex] *= 1 - share;
          fg.build2[ownerIndex] *= 1 - share;
          fg.build3[ownerIndex] *= 1 - share;
        }
        // Buyers: other non-public firms of the same sector in the zone, with cash above working capital.
        let budget = 0;
        const offers = [0, 0, 0];
        for (let b = 0; b < O; b++) {
          if (b === o || b === PUBLIC) continue;
          const buyer = (z * S + sector) * O + b;
          offers[b] = Math.max(0, firm.cash[buyer] - p.workingCapitalWeeks * firm.costs[buyer]) * 0.5;
          budget += offers[b];
        }
        const sold = value > 0 ? Math.min(1, budget / value) : 0;
        const proceeds = value * sold;
        if (proceeds > 0) {
          for (let b = 0; b < O; b++) {
            if (!(offers[b] > 0)) continue;
            const part = offers[b] / budget;
            const buyer = (z * S + sector) * O + b;
            firm.cash[buyer] -= proceeds * part;
            for (let i = 0; i < goods.length; i++) {
              lines[((z * G + goods[i]) * O + b) * T + AVERAGE_TIER] += removed[i] * sold * part;
            }
          }
        }
        // The failed firms' cash and the proceeds go to the bank first.
        const cash = Math.max(0, firm.cash[a]) * share;
        firm.cash[a] -= cash;
        const debt = firm.loan[a] * share;
        const available = cash + proceeds;
        const recovered = Math.min(debt, available);
        const lender = firm.lender[a];
        if (debt > 0) {
          bankReceive(s, lender, recovered);
          w.cbWriteOffs[lender] += debt - recovered;
          firm.loan[a] -= debt;
          if (firm.loan[a] < DUST) firm.loan[a] = 0;
        }
        // Anything left belongs to the owners.
        const surplus = available - recovered;
        if (surplus > 0) {
          const toState = o === MIXED ? surplus * p.mixedPublicShare : 0;
          s.country.treasury[c] += toState;
          w.revenueFirmDividends[c] += toState;
          s.zone.householdMoney[z] += surplus - toState;
          w.householdIncome[z] += surplus - toState;
        }
        firm.health[a] = Math.min(firm.health[a], -0.5);
        w.bankruptcies[c] += 1;
        events.push({
          type: 'firm-bankruptcy', turn: s.turn + 1, countryId: s.countries[c].id, zoneId: s.zones[z].id, sectorId: s.config.sectors[sector].id,
          ownership: OWNERSHIP_TYPES[o], capacityShare: share, debt, recovered, writtenOff: debt - recovered, assetsSold: sold,
        });
      }
    }
  }
}

/**
 * Provisional tier transitions (R58). Each aggregate's financial health
 * (profitability against the sector norm, debt pressure, distress) moves its
 * target tier mix: healthy firms modernise towards the strong tier, stricken
 * ones slide towards the fragile tier. Capacity drifts a small share of the
 * way towards that target each week; total capacity never changes here. At a
 * resting point (normal margins, no distress) the target is the sector's
 * normal mix, so tiers stay stable.
 */
export function updateTiers(s: EconomyState, w: Workspace, m: Model): void {
  if (w.calibrating) return;
  const p = s.config.params;
  const Z = s.zones.length;
  const G = m.goodCount;
  const S = m.sectorCount;
  const firm = s.firm;
  const lines = s.firmLine.capacity;
  for (let z = 0; z < Z; z++) {
    for (let sector = 0; sector < S; sector++) {
      const goods = m.sectorGoods[sector];
      const normal = s.config.sectors[sector].tierShares;
      for (let o = 0; o < O; o++) {
        const a = (z * S + sector) * O + o;
        // Normal margin of the aggregate's goods, weighted by its capacity.
        let weight = 0;
        let normalMargin = 0;
        for (let i = 0; i < goods.length; i++) {
          const g = goods[i];
          const base = ((z * G + g) * O + o) * T;
          const capacity = lines[base] + lines[base + 1] + lines[base + 2];
          if (!(capacity > 0)) continue;
          weight += capacity;
          normalMargin += capacity * m.targetMargin[g];
        }
        if (!(weight > EPSILON) || !(w.aggRevenue[a] > 0)) continue;
        normalMargin = Math.max(0.05, normalMargin / weight);
        // Realised profit margin this week (after wages, inputs and interest) against the normal one.
        const realised = w.aggProfit[a] / w.aggRevenue[a];
        const gap = clamp((realised - normalMargin) / normalMargin, -1, 1);
        const limit = p.firmMaxLeverage * w.aggCapitalValue[a];
        const pressure = limit > 0 ? clamp((firm.loan[a] / limit - 0.8) / 0.2, 0, 1) : 0;
        const signal = clamp(gap - 0.5 * pressure - (firm.distress[a] > 0 ? 0.5 : 0), -1, 1);
        firm.health[a] += p.healthSmoothing * (signal - firm.health[a]);
        const h = firm.health[a];
        const strong = normal[0] * (1 + p.tierHealthShift * h);
        const fragile = normal[2] * (1 - p.tierHealthShift * h);
        const target = [strong, 1 - strong - fragile, fragile];
        for (let i = 0; i < goods.length; i++) {
          const base = ((z * G + goods[i]) * O + o) * T;
          const capacity = lines[base] + lines[base + 1] + lines[base + 2];
          if (!(capacity > EPSILON)) continue;
          let moved = 0;
          for (let t = 0; t < T; t++) {
            const next = lines[base + t] + p.tierTransitionRate * (target[t] * capacity - lines[base + t]);
            lines[base + t] = next > 0 ? next : 0;
            moved += lines[base + t];
          }
          // Keep total capacity exact despite rounding.
          if (moved > 0) for (let t = 0; t < T; t++) lines[base + t] *= capacity / moved;
        }
      }
    }
  }
}
