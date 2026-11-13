import type { EconomyState } from '../types.ts';
import type { Model, Workspace } from './model.ts';
import { EPSILON } from './model.ts';
import { inputRatios } from './production.ts';
import type { RouteTable } from './routes.ts';

/**
 * Market clearing for one week.
 *
 * Every zone is a local market with its own producer price. Buyers in a zone
 * spread their orders over every producer they are allowed and able to reach.
 * A producer attracts orders in proportion to the stock it offers, falling
 * steeply as its delivered price (producer price + freight + tariff) rises
 * above the cheapest offer, with a preference for local and national
 * producers. Orders a supplier cannot fill are redirected to other suppliers
 * in further passes; what still cannot be filled is a shortage.
 *
 * Sanctions are enforced on the physical flow itself. Goods are bought
 * straight from the producer's own stock and are consumed, stored in
 * non-exportable buffers or reserves, or turned into a different good, so a
 * sanctioned good can never be re-exported through a third country.
 */

/** r^(2^doublings) for r in (0, 1], using multiplications only. */
function attract(ratio: number, doublings: number): number {
  let value = ratio;
  for (let i = 0; i < doublings; i++) value *= value;
  return value;
}

export function clearMarkets(s: EconomyState, w: Workspace, m: Model, routes: RouteTable, tradeDetail: boolean): void {
  const G = m.goodCount;
  const Z = s.zones.length;
  if (tradeDetail) w.tradeLog = [];
  // Goods that can be stored are sold from last week's stock.
  let madeToOrder = false;
  for (let g = 0; g < G; g++) {
    if (m.madeToOrder[g]) madeToOrder = true;
    else clearGood(s, w, m, routes, g);
  }
  if (!madeToOrder) return;
  // Goods that cannot be stored are produced as they are sold, up to what the
  // week's planned capacity and the inputs now on site allow.
  const ratio = w.goodScratchB;
  for (let z = 0; z < Z; z++) {
    inputRatios(s, w, m, z, w.goodScratchA, ratio);
    for (let g = 0; g < G; g++) {
      if (!m.madeToOrder[g]) continue;
      const inputs = m.inputGoods[g];
      let scale = 1;
      for (let i = 0; i < inputs.length; i++) if (ratio[inputs[i]] < scale) scale = ratio[inputs[i]];
      w.potential[z * G + g] = w.plan[z * G + g] * scale;
    }
  }
  for (let g = 0; g < G; g++) if (m.madeToOrder[g]) clearGood(s, w, m, routes, g);
}

function clearGood(s: EconomyState, w: Workspace, m: Model, routes: RouteTable, g: number): void {
  const p = s.config.params;
  const Z = s.zones.length;
  const C = s.countries.length;
  const G = m.goodCount;
  const zg = s.zoneGood;
  const owner = s.zone.owner;
  const tradable = m.tradable[g];
  const madeToOrder = m.madeToOrder[g];
  const doublings = p.tradeElasticityDoublings;
  const freightRate = m.freight[g] * p.freightPerDistance;
  const remaining = w.remainingDemand;
  const stockLeft = w.remainingStock;

  // --- 1. Demand and supply of every zone -----------------------------------
  let anyDemand = false;
  for (let z = 0; z < Z; z++) {
    const index = z * G + g;
    const demand = w.demandHousehold[index] + w.demandInput[index] + w.demandInvestment[index]
      + w.demandGovernment[index] + w.demandReserve[index];
    w.zoneDemand[z] = demand;
    remaining[z] = demand;
    stockLeft[z] = madeToOrder ? w.potential[index] : zg.stock[index];
    w.paid[z] = 0;
    w.received[z] = 0;
    w.releaseShipped[z] = 0;
    w.idealPrice[z] = 0;
    w.hasSupplier[z] = 0;
    if (demand > EPSILON) anyDemand = true;
  }
  w.shipped.fill(0);

  // --- 2. Delivered-cost factor and blockade limit for every pair -----------
  if (tradable) {
    for (let z = 0; z < Z; z++) {
      const buyer = owner[z];
      const row = z * Z;
      let bestThroughput = 0;
      for (let j = 0; j < Z; j++) {
        if (j === z) { w.costFactor[row + j] = 1; w.pairLimit[row + j] = Infinity; continue; }
        const seller = owner[j];
        const distance = routes.distance[row + j];
        let factor = 0;
        if (distance !== Infinity && w.blocked[(buyer * C + seller) * G + g] === 0) {
          const extra = freightRate * distance + (buyer === seller ? 0 : w.tariff[(buyer * C + seller) * G + g]);
          if (extra <= p.maxTradeCost) factor = 1 + extra;
        }
        w.costFactor[row + j] = factor;
        const throughput = routes.throughput[row + j];
        w.pairLimit[row + j] = throughput < 1 ? throughput * w.zoneDemand[z] : Infinity;
        if (factor > 0 && throughput > bestThroughput) bestThroughput = throughput;
      }
      // Restricted routes also cap everything the zone can bring in from abroad.
      w.foreignLeft[z] = bestThroughput < 1 ? bestThroughput * w.zoneDemand[z] : Infinity;
    }
  } else for (let z = 0; z < Z; z++) w.foreignLeft[z] = 0;

  // --- 3. Strategic reserves released to domestic buyers only ---------------
  for (let c = 0; c < C; c++) w.countryScratch[c] = 0;
  for (let z = 0; z < Z; z++) w.countryScratch[owner[z]] += w.zoneDemand[z];
  for (let z = 0; z < Z; z++) {
    const c = owner[z];
    const offer = w.releaseOffer[c * G + g];
    if (!(offer > 0) || !(w.countryScratch[c] > EPSILON)) continue;
    const quantity = Math.min(w.zoneDemand[z], offer * w.zoneDemand[z] / w.countryScratch[c]);
    if (!(quantity > 0)) continue;
    w.releaseShipped[z] = quantity;
    remaining[z] -= quantity;
    w.received[z] += quantity;
    w.paid[z] += quantity * zg.buyPrice[z * G + g];
  }

  // --- 4. Allocation passes ---------------------------------------------------
  const passes = anyDemand ? p.allocationPasses : 1;
  for (let pass = 0; pass < passes; pass++) {
    w.supplierOrders.fill(0);
    let ordered = false;
    for (let z = 0; z < Z; z++) {
      const need = remaining[z];
      const buying = need > EPSILON;
      // The first pass also prices the good for zones that buy nothing this week.
      if (!buying && pass > 0) continue;
      const row = z * Z;
      const first = tradable ? 0 : z;
      const last = tradable ? Z : z + 1;
      let cheapest = Infinity;
      for (let j = first; j < last; j++) {
        if (!(stockLeft[j] > EPSILON)) continue;
        if (j !== z && (w.costFactor[row + j] === 0 || !(w.pairLimit[row + j] > EPSILON) || !(w.foreignLeft[z] > EPSILON))) continue;
        const delivered = zg.price[j * G + g] * (j === z ? 1 : w.costFactor[row + j]);
        if (delivered < cheapest) cheapest = delivered;
      }
      if (cheapest === Infinity) continue;
      let weightTotal = 0;
      let valueTotal = 0;
      const buyerCountry = owner[z];
      for (let j = first; j < last; j++) {
        if (!(stockLeft[j] > EPSILON) || (j !== z && (w.costFactor[row + j] === 0 || !(w.pairLimit[row + j] > EPSILON) || !(w.foreignLeft[z] > EPSILON)))) {
          w.attraction[row + j] = 0;
          continue;
        }
        const delivered = zg.price[j * G + g] * (j === z ? 1 : w.costFactor[row + j]);
        const preference = j === z ? p.homePreference : owner[j] === buyerCountry ? p.nationalPreference : 1;
        // Bigger stocks draw proportionally more orders; dearer offers far fewer.
        const weight = stockLeft[j] * preference * attract(cheapest / delivered, doublings);
        w.attraction[row + j] = weight;
        weightTotal += weight;
        valueTotal += weight * delivered;
      }
      if (!(weightTotal > 0)) continue;
      if (pass === 0) {
        w.idealPrice[z] = valueTotal / weightTotal;
        w.hasSupplier[z] = 1;
      }
      if (!buying) continue;
      let foreignOrdered = 0;
      for (let j = first; j < last; j++) {
        const weight = w.attraction[row + j];
        if (!(weight > 0)) continue;
        let quantity = need * weight / weightTotal;
        if (j !== z && quantity > w.pairLimit[row + j]) quantity = w.pairLimit[row + j];
        w.order[row + j] = quantity;
        if (j !== z) foreignOrdered += quantity;
      }
      const foreignScale = foreignOrdered > 0 && foreignOrdered > w.foreignLeft[z] ? Math.max(0, w.foreignLeft[z]) / foreignOrdered : 1;
      for (let j = first; j < last; j++) {
        if (j !== z) w.order[row + j] *= foreignScale;
        w.supplierOrders[j] += w.order[row + j];
      }
      ordered = true;
    }
    if (!ordered) break;
    // Orders received are the demand signal producers react to. A supplier that
    // sold out is skipped in later passes, so no order is counted twice.
    for (let j = 0; j < Z; j++) {
      w.orders[j * G + g] += w.supplierOrders[j];
      w.supplierFill[j] = w.supplierOrders[j] > stockLeft[j] ? stockLeft[j] / w.supplierOrders[j] : 1;
      w.supplierOrders[j] = 0;
    }
    for (let z = 0; z < Z; z++) {
      if (!(remaining[z] > EPSILON)) continue;
      const row = z * Z;
      const first = tradable ? 0 : z;
      const last = tradable ? Z : z + 1;
      for (let j = first; j < last; j++) {
        const quantity = w.order[row + j];
        if (!(quantity > 0)) continue;
        w.order[row + j] = 0;
        const sent = quantity * w.supplierFill[j];
        w.shipped[row + j] += sent;
        w.supplierOrders[j] += sent;
        remaining[z] -= sent;
        w.received[z] += sent;
        w.paid[z] += sent * zg.price[j * G + g] * (j === z ? 1 : w.costFactor[row + j]);
        if (j !== z) {
          if (w.pairLimit[row + j] !== Infinity) w.pairLimit[row + j] = Math.max(0, w.pairLimit[row + j] - sent);
          if (w.foreignLeft[z] !== Infinity) w.foreignLeft[z] = Math.max(0, w.foreignLeft[z] - sent);
        }
      }
    }
    for (let j = 0; j < Z; j++) stockLeft[j] = Math.max(0, stockLeft[j] - w.supplierOrders[j]);
  }

  // --- 5. Split deliveries between buyers, check they can pay, settle --------
  for (let z = 0; z < Z; z++) {
    const index = z * G + g;
    const c = owner[z];
    const demand = w.zoneDemand[z];
    const got = w.received[z];
    const previousPrice = zg.buyPrice[index];
    if (!(got > EPSILON)) {
      w.unmet[g] += demand;
      if (demand > EPSILON) zg.shortage[index] += 0.3 * (1 - zg.shortage[index]);
      else zg.shortage[index] *= 0.7;
      zg.usage[index] *= 0.9;
      if (w.hasSupplier[z] === 1) zg.buyPrice[index] = w.idealPrice[z];
      continue;
    }
    const price = w.paid[z] / got;
    const dHousehold = w.demandHousehold[index];
    const dInput = w.demandInput[index];
    const dInvestment = w.demandInvestment[index];
    const dGovernment = w.demandGovernment[index];
    const dReserve = w.demandReserve[index];
    let qGovernment: number;
    let fill: number;
    if (s.country.governmentPriority[c] === 1) {
      // War-economy rationing: state orders are served before everyone else.
      qGovernment = Math.min(dGovernment, got);
      const others = demand - dGovernment;
      fill = others > EPSILON ? Math.min(1, (got - qGovernment) / others) : 0;
    } else {
      fill = Math.min(1, got / demand);
      qGovernment = dGovernment * fill;
    }
    let qHousehold = dHousehold * fill;
    let qInput = dInput * fill;
    let qInvestment = dInvestment * fill;
    let qReserve = dReserve * fill;

    // Nobody may spend money they do not have; undeliverable goods go back.
    const taxed = 1 + s.country.taxConsumption[c];
    const householdCost = qHousehold * price * taxed;
    if (householdCost > s.zone.householdMoney[z]) {
      qHousehold *= householdCost > EPSILON ? Math.max(0, s.zone.householdMoney[z]) / householdCost : 0;
    }
    const firmCost = (qInput + qInvestment) * price;
    const firmCash = Math.max(0, s.zone.firmMoney[z] - w.wageReserve[z]);
    if (firmCost > firmCash) {
      const ratio = firmCost > EPSILON ? firmCash / firmCost : 0;
      qInput *= ratio; qInvestment *= ratio;
    }
    const stateCost = (qGovernment + qReserve) * price;
    if (stateCost > s.country.treasury[c]) {
      const ratio = stateCost > EPSILON ? Math.max(0, s.country.treasury[c]) / stateCost : 0;
      qGovernment *= ratio; qReserve *= ratio;
    }
    const kept = qHousehold + qInput + qInvestment + qGovernment + qReserve;
    const keep = kept < got ? kept / got : 1;

    // Buyers pay.
    const householdPaid = qHousehold * price;
    s.zone.householdMoney[z] -= householdPaid * taxed;
    s.country.treasury[c] += householdPaid * (taxed - 1);
    w.revenueConsumptionTax[c] += householdPaid * (taxed - 1);
    w.householdSpending[z] += householdPaid * taxed;
    w.householdReal[z] += qHousehold * m.basePrice[g];
    const firmPaid = (qInput + qInvestment) * price;
    s.zone.firmMoney[z] -= firmPaid;
    w.firmPurchases[z] += qInput * price;
    s.country.treasury[c] -= (qGovernment + qReserve) * price;

    // Sellers, carriers and customs are paid.
    const first = tradable ? 0 : z;
    const last = tradable ? Z : z + 1;
    const row = z * Z;
    for (let j = first; j < last; j++) {
      const quantity = w.shipped[row + j] * keep;
      if (!(quantity > 0)) continue;
      const value = quantity * zg.price[j * G + g];
      s.zone.firmMoney[j] += value;
      w.firmRevenue[j] += value;
      w.sold[j * G + g] += quantity;
      if (j === z) continue;
      const seller = owner[j];
      const freight = value * freightRate * routes.distance[row + j];
      // Tariffs apply only when a national border is crossed.
      const duty = c !== seller ? value * w.tariff[(c * C + seller) * G + g] : 0;
      // Freight is earned by transport workers at both ends of the route.
      s.zone.householdMoney[z] += freight * 0.5;
      s.zone.householdMoney[j] += freight * 0.5;
      w.householdIncome[z] += freight * 0.5;
      w.householdIncome[j] += freight * 0.5;
      s.country.treasury[c] += duty;
      w.revenueTariffs[c] += duty;
      if (c !== seller) {
        w.countryExports[seller] += value;
        w.countryImports[c] += value + freight;
      }
      w.traded[g] += quantity;
      if (w.tradeLog) w.tradeLog.push(j, z, g, quantity, value);
    }
    const released = w.releaseShipped[z] * keep;
    if (released > 0) {
      const value = released * previousPrice;
      s.country.treasury[c] += value;
      w.revenueReserveSales[c] += value;
      w.releaseSold[c * G + g] += released;
    }

    // Deliveries are recorded per buyer class.
    w.gotHousehold[index] = qHousehold;
    w.gotInput[index] = qInput;
    w.gotInvestment[index] = qInvestment;
    w.gotGovernment[index] = qGovernment;
    w.gotReserve[index] = qReserve;
    w.useHousehold[g] += qHousehold;
    w.useGovernment[g] += qGovernment;
    w.ledgerUsed[g] += qHousehold + qGovernment;
    w.unmet[g] += demand - kept;
    if (qReserve > 0) {
      s.countryGood.reserves[c * G + g] += qReserve;
      w.spentReserves[c] += qReserve * price;
    }
    if (qGovernment > 0) {
      w.governmentBought[c * G + g] += qGovernment;
      const shares = (c * G + g) * 3;
      const total = w.governmentCategoryShare[shares] + w.governmentCategoryShare[shares + 1] + w.governmentCategoryShare[shares + 2];
      if (total > 0) {
        const value = qGovernment * price;
        w.spentAdministration[c] += value * w.governmentCategoryShare[shares] / total;
        w.spentMilitary[c] += value * w.governmentCategoryShare[shares + 1] / total;
        w.spentInfrastructure[c] += value * w.governmentCategoryShare[shares + 2] / total;
        w.infrastructureReal[c] += qGovernment * m.basePrice[g] * w.governmentCategoryShare[shares + 2] / total;
      }
    }
    zg.shortage[index] += 0.3 * ((demand > EPSILON ? 1 - Math.min(1, kept / demand) : 0) - zg.shortage[index]);
    zg.usage[index] += 0.1 * (kept - zg.usage[index]);
    zg.buyPrice[index] = kept > EPSILON ? price : (w.hasSupplier[z] === 1 ? w.idealPrice[z] : previousPrice);
  }

  // --- 6. Goods leave the producers' and the governments' stores ------------
  if (!madeToOrder) {
    for (let j = 0; j < Z; j++) {
      const index = j * G + g;
      zg.stock[index] = Math.max(0, zg.stock[index] - w.sold[index]);
    }
  }
  for (let c = 0; c < C; c++) {
    const sold = w.releaseSold[c * G + g];
    if (sold > 0) s.countryGood.reserves[c * G + g] = Math.max(0, s.countryGood.reserves[c * G + g] - sold);
  }
}
