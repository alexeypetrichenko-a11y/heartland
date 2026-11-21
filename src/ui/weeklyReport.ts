import type { EconomyNotice, EconomySnapshot } from '../game/economyBridge.ts';
import { visibleDiplomaticMessages } from '../game/diplomacy.ts';
import type { GameState, MilitaryResult, Region } from '../game/models.ts';
import { formatMoney, formatPercent, formatSignedMoney, headlineNotice, significantShortages, UNAVAILABLE, type DashboardRow } from './economyDashboard.ts';
import { SPENDING_LABELS, TAX_LABELS } from './fiscalDraft.ts';

type Tone = 'positive' | 'negative' | 'neutral';
type Unit = 'money' | 'balance' | 'rate' | 'stability';
type DisplayEvent = { title: string; message: string; severity?: EconomyNotice['severity']; region?: Pick<Region, 'id' | 'name'> };
export type ReportMetric = DashboardRow & { change?: { text: string; tone: Tone } };
type FiscalRate = { label: string; rate: number; before?: number };

const politics = new Set<EconomyNotice['event']['type']>(['regime-change', 'regime-survived', 'unrest-started', 'unrest-escalated', 'unrest-ended']);
const territory = new Set<EconomyNotice['event']['type']>(['zone-occupied', 'zone-liberated', 'zone-annexed', 'occupation-revolt', 'occupation-revolt-ended', 'sabotage']);
const unrest = ['Calm', 'Protests', 'Mass unrest', 'Regime collapse risk'];
const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

function metric(label: string, value: number | null | undefined, before: number | undefined, unit: Unit, rising: Tone = 'neutral'): ReportMetric {
  if (!isNumber(value)) return { label, value: UNAVAILABLE };
  const rendered = unit === 'rate' ? formatPercent(value) : unit === 'balance' ? formatSignedMoney(value) : formatMoney(value);
  const row: ReportMetric = { label, value: unit === 'stability' ? `${rendered} / 100` : rendered };
  if (!isNumber(before)) return row;
  const delta = (value - before) * (unit === 'rate' ? 100 : 1);
  if (!isNumber(delta)) return row;
  const amount = formatSignedMoney(delta);
  const suffix = unit === 'rate' ? ' pp' : unit === 'stability' ? ' pts' : '';
  const tone = amount === '0.0' || rising === 'neutral' ? 'neutral'
    : delta > 0 ? rising : rising === 'positive' ? 'negative' : 'positive';
  return { ...row, change: { text: delta === 0 ? 'No change' : `${amount === '0.0' ? '≈0.0' : amount}${suffix}`, tone } };
}

function rates<K extends string>(labels: Record<K, string>, current: Partial<Record<K, number>> | undefined,
  previous: Partial<Record<K, number>> | undefined): FiscalRate[] {
  return (Object.keys(labels) as K[]).flatMap(key => {
    const rate = current?.[key];
    if (!isNumber(rate)) return [];
    const before = previous?.[key];
    return [{ label: labels[key], rate, before: isNumber(before) ? before : undefined }];
  });
}

function describeDiplomacy(game: GameState, playerId: string, week: number): DisplayEvent[] {
  const country = (id: string) => game.countries.find(entry => entry.id === id)?.name ?? id;
  return visibleDiplomaticMessages(game, playerId).flatMap(message => {
    const sender = country(message.fromId);
    const recipient = country(message.toId);
    const delta = message.relationshipChange;
    const effect = delta === 0 ? 'Relationship unchanged.' : `Relationship ${delta > 0 ? '+' : ''}${delta} points.`;
    if (message.visibility === 'public' && message.week === week) {
      const title = message.stance === 'goodwill' ? `${sender} declared goodwill toward ${recipient}` : `${sender} condemned ${recipient}`;
      return [{ title, message: effect }];
    }
    if (message.visibility !== 'private') return [];
    if (message.resolvedWeek === week && message.status !== 'pending') {
      return [{ title: `${recipient} ${message.status} ${sender}’s cooperation offer`, message: effect }];
    }
    if (message.week !== week) return [];
    return [{ title: `${sender} sent ${recipient} a private cooperation offer`, message: 'Awaiting a reply.' }];
  });
}

function regionReference(game: GameState, id: string | null): DisplayEvent['region'] {
  const region = game.regions.find(entry => entry.id === id);
  return region && { id: region.id, name: region.name };
}

function describeMilitary(game: GameState, result: MilitaryResult): DisplayEvent {
  const attacker = game.divisions.find(entry => entry.id === result.divisionId);
  const division = attacker?.name ?? result.divisionId;
  if (result.kind === 'cancelled') return { title: `${division}’s order was cancelled`, message: result.reason };
  const region = regionReference(game, result.targetRegionId);
  const target = region?.name ?? result.targetRegionId;
  if (result.kind === 'moved') return {
    title: `${division} moved to ${target}`, region, message: `Moved from ${regionReference(game, result.fromRegionId)?.name ?? result.fromRegionId}.`,
  };
  const losses = result.defenderCasualties.reduce((total, loss) => total + loss.losses, 0);
  const followUp = attacker?.manpower === 0 ? ' The attacking division was destroyed.'
    : attacker?.order.kind === 'attack' && attacker.order.targetRegionId === result.targetRegionId ? ' The attack order remains active.' : '';
  return {
    title: result.captured ? `${target} captured` : `Battle at ${target}`, region,
    message: `${division} attacked. ${result.captured ? 'Control changed hands.' : 'Control held.'} Attacker losses ${result.attackerCasualties}. Defender losses ${losses}.${followUp}`,
  };
}

/** Presentation data for one settled week, with comparisons only where both observations exist. */
export function readWeeklyReport(game: GameState, economy: EconomySnapshot) {
  const { player, session } = economy;
  if (game.week <= 1 || game.week !== session.week || game.playerCountryId !== player.countryId) return null;
  // Game orders resolve for the week being left; the engine snapshot has the new week number.
  const week = game.week - 1;
  const prior = economy.previous?.countryId === player.countryId ? economy.previous : null;
  const notices = economy.notices.filter(notice => notice.week === session.week);
  const displayNotice = ({ title, message, severity, regionId }: EconomyNotice): DisplayEvent =>
    ({ title, message, severity, region: regionReference(game, regionId) });
  const territoryChanged = prior?.regionIds && player.regionIds
    ? prior.regionIds.length !== player.regionIds.length || prior.regionIds.some(id => !player.regionIds.includes(id))
    : notices.some(notice => notice.concernsPlayer && ['zone-occupied', 'zone-liberated', 'zone-annexed'].includes(notice.event.type));
  const overview = [
    metric('Real GDP', player.gdpReal, prior?.gdpReal, 'money', territoryChanged ? 'neutral' : 'positive'),
    metric('Treasury', player.treasury, prior?.treasury, 'money', 'positive'),
    metric('Weekly balance', player.budget?.balance, prior?.budget?.balance, 'balance', 'positive'),
  ];
  const stability = metric('Political stability', player.stability, prior?.stability, 'stability', 'positive');
  stability.note = unrest[player.unrestTier];
  const indicators: ReportMetric[] = [
    metric('Government revenue', player.budget?.revenue, prior?.budget?.revenue, 'money'),
    metric('Government expenditure', player.budget?.expenditure, prior?.budget?.expenditure, 'money'),
    metric('Public debt', player.debt, prior?.debt, 'money'),
    metric('Debt / annual GDP', player.debtToGdp, prior?.debtToGdp, 'rate'),
    metric('Annualised inflation', player.inflation, prior?.inflation, 'rate'),
    metric('Unemployment', player.unemployment, prior?.unemployment, 'rate', 'negative'),
    stability,
    metric('Annualised GDP growth', player.gdpGrowth, undefined, 'rate'),
  ].filter(row => row.value !== UNAVAILABLE);
  if (typeof player.marketAccess === 'boolean') {
    indicators.push({ label: 'Credit market access', value: player.marketAccess ? 'Open' : 'Closed' });
  }

  const fiscal = {
    taxes: rates(TAX_LABELS, player.fiscal?.taxes, prior?.fiscal?.taxes),
    spending: rates(SPENDING_LABELS, player.fiscal?.spending, prior?.fiscal?.spending),
  };
  const applied = [...fiscal.taxes, ...fiscal.spending].filter(rate => rate.before !== undefined && rate.before !== rate.rate);
  const attention = notices.filter(notice => notice.severity === 'defeat' || notice.severity === 'critical'
    || (notice.severity === 'warning' && notice.concernsPlayer));
  const lead = headlineNotice(attention);
  return {
    week,
    overview,
    indicators,
    territoryChanged,
    fiscal,
    applied,
    shortages: significantShortages(player.sectors),
    defeated: economy.defeated,
    alerts: (lead ? [lead, ...attention.filter(notice => notice !== lead)] : attention).slice(0, 2).map(displayNotice),
    economyEvents: notices.filter(notice => !politics.has(notice.event.type) && !territory.has(notice.event.type)).map(displayNotice),
    politicalEvents: [
      ...notices.filter(notice => politics.has(notice.event.type)).map(displayNotice),
      ...describeDiplomacy(game, player.countryId, week),
    ],
    militaryEvents: [
      ...notices.filter(notice => territory.has(notice.event.type)).map(displayNotice),
      ...game.militaryResults.map(result => describeMilitary(game, result)),
    ],
  };
}

export type WeeklyReport = NonNullable<ReturnType<typeof readWeeklyReport>>;
