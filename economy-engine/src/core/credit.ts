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
 * left. Every loan answers a real need: a state's financing gap that the bond
 * market could not fill, a firm's investment, or a firm short of working
 * capital. The bank never buys bonds or lends merely to make money grow, and
 * there is no automatic money creation of any other kind (Milestone 3).
 */

const O = OWNERSHIP_COUNT;
const T = TIER_COUNT;

/** Book value of liquidated plant held for sale by bank c. */
export function heldAssets(s: EconomyState, c: number): number {
  const holder = s.zoneGood.idleHolder;
  const value = s.zoneGood.idleValue;
  let total = 0;
  for (let i = 0; i < holder.length; i++) if (holder[i] === c) total += value[i];
  return total;
}

/** Capital of central bank c: reserves + loans to the state + loans to firms + plant held for sale - money issued. */
export function bankEquity(s: EconomyState, c: number, firmLoans: number): number {
  return s.country.cbReserves[c] + s.country.cbStateLoans[c] + firmLoans + heldAssets(s, c) - s.country.cbIssued[c];
}

/**
 * Plant held by banks after liquidations ages like any plant (a loss for the bank) and is
 * sold, at its book price, to healthy private or mixed firms of its sector in the zone once
 * there is demand for the capacity. It joins the buyer's average tier.
 */
export function sellIdlePlant(s: EconomyState, w: Workspace, m: Model): void {
  if (w.calibrating) return;
  const p = s.config.params;
  const Z = s.zones.length;
  const G = m.goodCount;
  const S = m.sectorCount;
  const zg = s.zoneGood;
  const firm = s.firm;
  for (let z = 0; z < Z; z++) {
    for (let g = 0; g < G; g++) {
      const index = z * G + g;
      if (zg.idleHolder[index] === -1) continue;
      zg.idleCapacity[index] *= 1 - m.depreciationWeekly[g];
      zg.idleValue[index] *= 1 - m.depreciationWeekly[g];
      if (zg.idleCapacity[index] < DUST) { clearIdle(s, index); continue; }
      if (zg.pressure[index] < 0.9 * m.normalUtilization[g]) continue;
      const price = zg.idleValue[index] / zg.idleCapacity[index];
      let budget = 0;
      const offers = [0, 0, 0];
      for (let o = 0; o < O; o++) {
        if (o === PUBLIC) continue;
        const a = (z * S + m.goodSector[g]) * O + o;
        if (firm.health[a] < -0.5) continue;
        offers[o] = Math.max(0, firm.cash[a] - p.workingCapitalWeeks * firm.costs[a]) * 0.5;
        budget += offers[o];
      }
      if (!(budget > 0)) continue;
      const units = price > 0 ? Math.min(zg.idleCapacity[index], budget / price) : zg.idleCapacity[index];
      const paid = units * price;
      for (let o = 0; o < O; o++) {
        if (!(offers[o] > 0)) continue;
        const part = offers[o] / budget;
        const a = (z * S + m.goodSector[g]) * O + o;
        firm.cash[a] -= paid * part;
        s.firmLine.capacity[(index * O + o) * T + AVERAGE_TIER] += units * part;
      }
      bankReceive(s, zg.idleHolder[index], paid);
      zg.idleCapacity[index] -= units;
      zg.idleValue[index] = Math.max(0, zg.idleValue[index] - paid);
      if (zg.idleCapacity[index] < DUST) clearIdle(s, index);
    }
  }
}

/** Remove what is left of a holding of idle plant (its remaining book value is a loss for the bank). */
export function clearIdle(s: EconomyState, index: number): void {
  s.zoneGood.idleCapacity[index] = 0;
  s.zoneGood.idleValue[index] = 0;
  s.zoneGood.idleHolder[index] = -1;
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
  for (let c = 0; c < s.countries.length; c++) {
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
  // A bank does not lend across a front line: firms of an occupied zone that owe money to
  // their legal owner's bank get no new credit until liberation (Milestone 4).
  if (lender !== owner) {
    const z = Math.floor(a / (w.sectorCount * OWNERSHIP_COUNT));
    if (s.zone.sovereign[z] !== s.zone.owner[z]) return 0;
  }
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

/** How much more (or less) firms borrow than at the neutral rate, given the price of credit. */
export function creditAppetite(s: EconomyState, c: number): number {
  const p = s.config.params;
  const neutral = p.baseRate + p.firmLoanSpread;
  return clamp(1 + p.firmLeverageRateSensitivity * (neutral - firmLoanRate(s, c)) / neutral, 0.25, 2.5);
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
    // The bank keeps the capital its loans require plus room to lend a further share of
    // yearly GDP (so credit does not run short at the first upturn), and pays only the rest
    // of the week's profit to the treasury, never its capital.
    const profit = w.cbInterestIncome[c] - w.cbWriteOffs[c];
    const loans = country.cbStateLoans[c] + w.cbFirmLoans[c];
    const wanted = p.cbCapitalRatio * (loans + p.cbStartingHeadroom * 52 * country.gdp[c]);
    const spareCapital = bankEquity(s, c, w.cbFirmLoans[c]) - wanted;
    if (profit > 0 && spareCapital > 0) {
      const payout = Math.min(profit * p.cbProfitPayout, spareCapital);
      country.cbIssued[c] += payout;
      // WORLD-03-FINAL (opt-in): part of the payout goes to the owners of commercial banks (the country's households),
      // taxed like dividends; the money paid out is the same, only its recipient changes.
      const share = s.countries[c].bankProfitToHouseholds ?? 0;
      let held = 0;
      if (share > 0) for (let z = 0; z < Z; z++) if (s.zone.owner[z] === c) held += s.zone.householdMoney[z];
      const toPeople = share > 0 && held > 0 ? payout * share : 0;
      const tax = toPeople * country.taxIncome[c];
      if (toPeople > 0) {
        for (let z = 0; z < Z; z++) {
          if (s.zone.owner[z] !== c) continue;
          const part = (toPeople - tax) * s.zone.householdMoney[z] / held;
          s.zone.householdMoney[z] += part;
          w.householdIncome[z] += part;
        }
        w.revenueIncomeTax[c] += tax;
      }
      country.treasury[c] += payout - toPeople + tax;
      w.revenueCentralBank[c] += payout - toPeople;
    }
    if (w.revenueMoneyCreation[c] > 0) {
      events.push({ type: 'money-created', turn: s.turn + 1, countryId: s.countries[c].id, amount: w.revenueMoneyCreation[c] });
    }
    country.cbExceptionalRecent[c] *= 1 - 1 / p.exceptionalMoneyMemoryWeeks;
    if (country.cbExceptionalRecent[c] < DUST) country.cbExceptionalRecent[c] = 0;
  }
  if (w.calibrating) return;
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
 * Starting credit: all money in circulation starts as credit money. Each
 * country's money is matched by loans of its central bank to the firms of
 * that country, shared in proportion to the value of their plant (never above
 * the credit limit; any remainder is backed by reserves). Each bank then holds
 * exactly the capital its loans require plus room to lend a further share of
 * yearly GDP. Without this, money backed only by reserves could never grow
 * with the economy, and prices would drift down for ever.
 */
export function assignStartingCredit(p: EconomyState['config']['params'], zoneOwner: readonly number[], perZone: number,
  capitalValue: ArrayLike<number>, loan: number[], lender: number[], issued: readonly number[], stateLoans: readonly number[],
  yearlyGdp: readonly number[], reserves: number[]): void {
  const C = issued.length;
  const value = new Float64Array(C);
  for (let z = 0; z < zoneOwner.length; z++) for (let k = 0; k < perZone; k++) value[zoneOwner[z]] += capitalValue[z * perZone + k];
  const loans = new Float64Array(C);
  for (let z = 0; z < zoneOwner.length; z++) {
    const c = zoneOwner[z];
    const ratio = value[c] > 0 ? Math.max(0, issued[c] - stateLoans[c]) / value[c] : 0;
    for (let k = 0; k < perZone; k++) {
      const a = z * perZone + k;
      loan[a] = Math.min(p.firmMaxLeverage, ratio) * capitalValue[a];
      lender[a] = c;
      loans[c] += loan[a];
    }
  }
  for (let c = 0; c < C; c++) {
    const capital = p.cbCapitalRatio * (loans[c] + stateLoans[c] + p.cbStartingHeadroom * yearlyGdp[c]);
    reserves[c] = Math.max(0, issued[c] - loans[c] - stateLoans[c] + capital);
  }
}

/** Re-measure starting credit at the prices the world builder settled on. */
export function resetStartingCredit(s: EconomyState, m: Model): void {
  const Z = s.zones.length;
  const G = m.goodCount;
  const S = m.sectorCount;
  const w = { aggCapitalValue: new Float64Array(Z * S * O) } as unknown as Workspace;
  for (let z = 0; z < Z; z++) {
    let capitalPrice = 0;
    for (let g = 0; g < G; g++) capitalPrice += m.investment[g] * s.zoneGood.buyPrice[z * G + g];
    capitalValues(s, w, m, z, capitalPrice);
  }
  assignStartingCredit(s.config.params, s.zone.owner, S * O, w.aggCapitalValue, s.firm.loan, s.firm.lender,
    s.country.cbIssued, s.country.cbStateLoans, s.country.gdp.map(g => 52 * g), s.country.cbReserves);
}

/**
 * Liquidation of insolvent firms (R31). When an aggregate has been unable to
 * pay its wages or its debt service for `bankruptcyWeeks` weeks in a row, its
 * weakest firms fail: at least `bankruptcyMinShare` of its plant, the fragile
 * tier first. Their plant is sold at a liquidation price to healthy firms of
 * the same sector and zone (it joins their average tier) or scrapped if nobody
 * can pay; their cash and the sale proceeds repay the bank as far as they go,
 * and the rest of their debt is written off. Jobs disappear with the plant.
 * Public firms are liquidated too when the state's support is not enough
 * (Milestone 3); plant that cannot be sold at once is held by the creditor bank.
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
        if (firm.distress[a] < p.bankruptcyWeeks) continue;
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
        // Buyers: other private and mixed firms of the same sector in the zone, with cash above working capital.
        let budget = 0;
        const offers = [0, 0, 0];
        for (let b = 0; b < O; b++) {
          if (b === o || b === PUBLIC) continue;
          const buyer = (z * S + sector) * O + b;
          if (firm.health[buyer] < -0.5) continue;
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
        // Plant nobody could buy is not destroyed: the creditor bank takes it over and holds it
        // for sale, booked at no more than what it is still owed (R31, R32). Without a creditor
        // (no debt) it is scrapped.
        const claim = debt - recovered;
        let booked = 0;
        if (claim > 0 && sold < 1) {
          const unsoldValue = value * (1 - sold);
          const bookValue = Math.min(unsoldValue, claim);
          let placed = 0;
          for (let i = 0; i < goods.length; i++) {
            const index = z * G + goods[i];
            const units = removed[i] * (1 - sold);
            if (!(units > 0)) continue;
            const holder = s.zoneGood.idleHolder[index];
            if (holder !== -1 && holder !== lender) continue; // another bank already holds plant here: scrapped
            const part = unsoldValue > 0 ? bookValue * units * m.capitalWeeks[goods[i]] * capitalPrice * p.liquidationValue / unsoldValue : 0;
            s.zoneGood.idleCapacity[index] += units;
            s.zoneGood.idleValue[index] += part;
            s.zoneGood.idleHolder[index] = lender;
            placed += part;
          }
          booked = placed;
        }
        if (debt > 0) {
          bankReceive(s, lender, recovered);
          w.cbWriteOffs[lender] += debt - recovered - booked;
          firm.loan[a] -= debt;
          if (firm.loan[a] < DUST) firm.loan[a] = 0;
        }
        // Anything left belongs to the owners.
        const surplus = available - recovered;
        if (surplus > 0) {
          // The state's part belongs to the legal owner (Milestone 4: also under occupation).
          const toState = o === PUBLIC ? surplus : o === MIXED ? surplus * p.mixedPublicShare : 0;
          const legal = s.zone.sovereign[z];
          s.country.treasury[legal] += toState;
          w.revenueFirmDividends[legal] += toState;
          s.zone.householdMoney[z] += surplus - toState;
          w.householdIncome[z] += surplus - toState;
        }
        firm.health[a] = Math.min(firm.health[a], -0.5);
        w.bankruptcies[c] += 1;
        events.push({
          type: 'firm-bankruptcy', turn: s.turn + 1, countryId: s.countries[c].id, zoneId: s.zones[z].id, sectorId: s.config.sectors[sector].id,
          ownership: OWNERSHIP_TYPES[o], capacityShare: share, debt, recovered, writtenOff: Math.max(0, debt - recovered - booked), assetsSold: sold,
          assetsHeld: booked,
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
