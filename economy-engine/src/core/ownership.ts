import type { EconomyState } from '../types.ts';
import type { Model, Workspace } from './model.ts';
import { AVERAGE_TIER, MIXED, OWNERSHIP_COUNT, PUBLIC, TIER_COUNT } from './model.ts';
import { bankReceive, clearIdle } from './credit.ts';

/**
 * State and ownership operations (Milestone 3: R02, R03, R32, central-bank
 * recapitalisation). Every operation moves existing money between existing
 * holders and existing assets between owners: none creates money or plant.
 */

const O = OWNERSHIP_COUNT;
const T = TIER_COUNT;

/** Capital-goods price index of a zone (what plant costs there to build). */
function capitalPrice(s: EconomyState, m: Model, z: number): number {
  let price = 0;
  for (let g = 0; g < m.goodCount; g++) price += m.investment[g] * s.zoneGood.buyPrice[z * m.goodCount + g];
  return price;
}

/** Replacement value of an aggregate's plant. */
export function plantValue(s: EconomyState, m: Model, z: number, sector: number, o: number): number {
  const G = m.goodCount;
  const price = capitalPrice(s, m, z);
  let value = 0;
  for (const g of m.sectorGoods[sector]) {
    const base = ((z * G + g) * O + o) * T;
    for (let t = 0; t < T; t++) value += s.firmLine.capacity[base + t] * m.capitalWeeks[g] * price;
  }
  return value;
}

/** Fair price of a whole aggregate: its plant (at the transfer valuation), plus its cash, less its debt; never below zero. */
export function fairValue(s: EconomyState, m: Model, z: number, sector: number, o: number): number {
  const a = (z * m.sectorCount + sector) * O + o;
  return Math.max(0, plantValue(s, m, z, sector, o) * s.config.params.ownershipTransferValue + Math.max(0, s.firm.cash[a]) - s.firm.loan[a]);
}

/**
 * Move a share of one aggregate (plant in every tier, construction, unsold stock,
 * cash, debt, running costs and workforce) to another owner in the same zone and
 * sector. Totals are conserved exactly; only the owner changes. The debt keeps
 * its lender.
 */
export function transferAggregate(s: EconomyState, m: Model, z: number, sector: number, from: number, to: number, share: number): void {
  if (!(share > 0) || from === to) return;
  const G = m.goodCount;
  const firm = s.firm;
  const fg = s.firmGood;
  const lines = s.firmLine.capacity;
  const a = (z * m.sectorCount + sector) * O + from;
  const b = (z * m.sectorCount + sector) * O + to;
  let movedCapacity = 0;
  let destinationCapacity = 0;
  for (const g of m.sectorGoods[sector]) {
    const ownerA = (z * G + g) * O + from;
    const ownerB = (z * G + g) * O + to;
    for (let t = 0; t < T; t++) {
      const moved = lines[ownerA * T + t] * share;
      destinationCapacity += lines[ownerB * T + t];
      lines[ownerA * T + t] -= moved;
      lines[ownerB * T + t] += moved;
      movedCapacity += moved;
    }
    for (const field of [fg.build1, fg.build2, fg.build3]) {
      const moved = field[ownerA] * share;
      field[ownerA] -= moved;
      field[ownerB] += moved;
    }
    const stockShare = fg.stockShare[ownerA] * share;
    fg.stockShare[ownerA] -= stockShare;
    fg.stockShare[ownerB] += stockShare;
  }
  // Financial health of the combined aggregate: capacity-weighted.
  const weight = movedCapacity + destinationCapacity;
  if (weight > 0) firm.health[b] = (firm.health[b] * destinationCapacity + firm.health[a] * movedCapacity) / weight;
  firm.distress[b] = Math.max(firm.distress[b], firm.distress[a]);
  for (const field of [firm.cash, firm.costs, firm.employment, firm.revenue]) {
    const moved = field[a] * share;
    field[a] -= moved;
    field[b] += moved;
  }
  const debt = firm.loan[a] * share;
  if (debt > 0) {
    if (!(firm.loan[b] > 0)) firm.lender[b] = firm.lender[a];
    firm.loan[a] -= debt;
    firm.loan[b] += debt;
  }
}

/** True when moving debt from aggregate `from` to `to` would mix two banks' claims. */
export function lendersConflict(s: EconomyState, m: Model, z: number, sector: number, from: number, to: number): boolean {
  const a = (z * m.sectorCount + sector) * O + from;
  const b = (z * m.sectorCount + sector) * O + to;
  return s.firm.loan[a] > 0 && s.firm.loan[b] > 0 && s.firm.lender[a] !== s.firm.lender[b];
}

/** Pay `amount` to the households of zone z (as income) and record it. */
function payHouseholds(s: EconomyState, w: Workspace, z: number, amount: number): void {
  s.zone.householdMoney[z] += amount;
  w.householdIncome[z] += amount;
}

/**
 * Nationalisation (R02): the state buys `share` of a private or mixed aggregate
 * at its fair price, paid from the treasury to the zone's households (the private
 * owners; for a mixed firm only their part is paid). If the treasury cannot pay
 * the whole price, a correspondingly smaller share changes hands.
 */
export function nationalize(s: EconomyState, w: Workspace, m: Model, c: number, z: number, sector: number, share: number, from: number): number {
  const privatePart = from === MIXED ? 1 - s.config.params.mixedPublicShare : 1;
  const price = fairValue(s, m, z, sector, from) * share * privatePart;
  const affordable = price > 0 ? Math.min(1, Math.max(0, s.country.treasury[c]) / price) : 1;
  const taken = share * affordable;
  const paid = price * affordable;
  s.country.treasury[c] -= paid;
  w.spentOwnership[c] += paid;
  payHouseholds(s, w, z, paid);
  transferAggregate(s, m, z, sector, from, PUBLIC, taken);
  return taken;
}

/**
 * Privatisation (R02): the zone's households buy `share` of a public aggregate at
 * its fair price (spending at most half their cash); the treasury receives it.
 * Into a mixed firm, only the private part is sold.
 */
export function privatize(s: EconomyState, w: Workspace, m: Model, c: number, z: number, sector: number, share: number, to: number): number {
  const privatePart = to === MIXED ? 1 - s.config.params.mixedPublicShare : 1;
  const price = fairValue(s, m, z, sector, PUBLIC) * share * privatePart;
  const budget = 0.5 * Math.max(0, s.zone.householdMoney[z]);
  const affordable = price > 0 ? Math.min(1, budget / price) : 1;
  const sold = share * affordable;
  const paid = price * affordable;
  s.zone.householdMoney[z] -= paid;
  s.country.treasury[c] += paid;
  w.revenueOwnership[c] += paid;
  transferAggregate(s, m, z, sector, PUBLIC, to, sold);
  return sold;
}

/**
 * The state buys liquidated plant held for sale by a bank in one of its zones
 * (R32), at its book price, as far as the treasury allows. The plant joins the
 * public firms' average tier; no debt of the failed firms is taken over.
 */
export function acquireAssets(s: EconomyState, w: Workspace, m: Model, c: number, z: number, goods: readonly number[]): void {
  const G = m.goodCount;
  const zg = s.zoneGood;
  for (const g of goods) {
    const index = z * G + g;
    if (zg.idleHolder[index] === -1 || !(zg.idleCapacity[index] > 0)) continue;
    const price = zg.idleValue[index];
    const affordable = price > 0 ? Math.min(1, Math.max(0, s.country.treasury[c]) / price) : 1;
    if (!(affordable > 0)) continue;
    const units = zg.idleCapacity[index] * affordable;
    const paid = price * affordable;
    s.country.treasury[c] -= paid;
    w.spentOwnership[c] += paid;
    bankReceive(s, zg.idleHolder[index], paid);
    s.firmLine.capacity[(index * O + PUBLIC) * T + AVERAGE_TIER] += units;
    zg.idleCapacity[index] -= units;
    zg.idleValue[index] = Math.max(0, zg.idleValue[index] - paid);
    if (affordable >= 1 || zg.idleCapacity[index] <= 0) clearIdle(s, index);
  }
}

/** Treasury money paid into a public or mixed aggregate, as cash or to repay its bank debt. */
export function recapitalizeFirm(s: EconomyState, w: Workspace, c: number, a: number, amount: number, debt: boolean): void {
  let paid = Math.min(amount, Math.max(0, s.country.treasury[c]));
  if (debt) paid = Math.min(paid, s.firm.loan[a]);
  if (!(paid > 0)) return;
  s.country.treasury[c] -= paid;
  w.spentFirmSupport[c] += paid;
  if (debt) {
    s.firm.loan[a] -= paid;
    bankReceive(s, s.firm.lender[a], paid);
  } else s.firm.cash[a] += paid;
}

/**
 * Central-bank recapitalisation from the treasury. The money first repays what
 * the state owes the bank (so a state can never borrow from its bank to raise the
 * bank's own capital); only the rest becomes capital. Either way the money is
 * withdrawn from circulation: this has a real fiscal cost and creates nothing.
 */
export function recapitalizeBank(s: EconomyState, w: Workspace, c: number, amount: number): void {
  const paid = Math.min(amount, Math.max(0, s.country.treasury[c]));
  if (!(paid > 0)) return;
  const repaid = Math.min(paid, s.country.cbStateLoans[c]);
  s.country.treasury[c] -= paid;
  s.country.cbStateLoans[c] -= repaid;
  bankReceive(s, c, paid);
  w.repaid[c] += repaid;
  w.spentCentralBankCapital[c] += paid - repaid;
}

