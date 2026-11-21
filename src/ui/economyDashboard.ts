import type { CountryEconomyView, EconomyNotice } from '../game/economyBridge.ts';

/**
 * Display model of the economy panel (INT-01). Every figure comes from the economic
 * engine's integration API; this file only formats them and computes nothing economic.
 * Money is in the engine's illustrative units.
 */
export type DashboardRow = { label: string; value: string; note?: string };

const money = new Intl.NumberFormat('en', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const percent = new Intl.NumberFormat('en', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 });
const whole = new Intl.NumberFormat('en', { maximumFractionDigits: 0 });

export const UNAVAILABLE = 'Unavailable';
/** One decimal; a value that rounds to zero is shown as 0.0, never -0.0. */
export const formatMoney = (value: number) => money.format(Math.abs(value) < 0.05 ? 0 : value);
export const formatSignedMoney = (value: number) => `${value >= 0.05 ? '+' : ''}${formatMoney(value)}`;
export const formatPercent = (value: number) => percent.format(value);

export function readEconomyDashboard(view: CountryEconomyView, previous: CountryEconomyView | null, week: number) {
  const budget: DashboardRow[] = [
    { label: 'Treasury', value: formatMoney(view.treasury) },
    { label: 'Weekly revenue', value: formatMoney(view.budget.revenue) },
    { label: 'Weekly expenditure', value: formatMoney(view.budget.expenditure) },
    { label: 'Weekly balance', value: formatSignedMoney(view.budget.balance) },
  ];
  const indicators: DashboardRow[] = [
    { label: 'GDP', value: formatMoney(view.gdpReal), note: 'per week, constant prices' },
    view.gdpGrowth === null
      ? { label: 'Economic growth', value: UNAVAILABLE, note: 'shown after 26 weeks of data' }
      : { label: 'Economic growth', value: formatPercent(view.gdpGrowth), note: 'annualised; includes occupied regions' },
    { label: 'Inflation', value: formatPercent(view.inflation), note: 'annualised' },
    { label: 'Unemployment', value: formatPercent(view.unemployment) },
    { label: 'Political stability', value: `${whole.format(view.stability)} / 100` },
    { label: 'Public debt', value: formatMoney(view.debt), note: `${formatPercent(view.debtToGdp)} of yearly GDP` },
    { label: 'Central-bank policy rate', value: formatPercent(view.centralBank.policyRate) },
  ];
  // The largest sectors by this week's output, and the goods in short supply (engine shortage index above 5%).
  const sectors = [...view.sectors].sort((a, b) => b.output - a.output).slice(0, 3)
    .map(sector => ({ label: sector.name, value: formatMoney(sector.output), note: `${formatPercent(sector.utilization)} of capacity` }));
  const shortages = view.sectors.filter(sector => sector.goodsShort.length > 0)
    .map(sector => ({ label: sector.name, value: sector.goodsShort.map(good => good.replace(/_/g, ' ')).join(', ') }));
  const latestWeek = previous && previous.countryId === view.countryId && week > 1
    ? { week: week - 1, openingTreasury: formatMoney(previous.treasury), closingTreasury: formatMoney(view.treasury) }
    : null;
  return { budget, indicators, sectors, shortages, latestWeek };
}

/** Notices of the latest week to show in the economy panel: everything about the player, and other countries' critical news. */
export function economyNews(notices: readonly EconomyNotice[]): EconomyNotice[] {
  return notices.filter(notice => notice.concernsPlayer || notice.severity === 'critical' || notice.severity === 'defeat');
}

/** The one alert the game header shows after a week: the player's defeat, or a critical event concerning the player. */
export function headlineNotice(notices: readonly EconomyNotice[]): EconomyNotice | null {
  return notices.find(notice => notice.severity === 'defeat')
    ?? notices.find(notice => notice.severity === 'critical' && notice.concernsPlayer) ?? null;
}
