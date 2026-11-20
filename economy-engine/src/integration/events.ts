import type { CountryId, EconomyEvent } from '../types.ts';
import type { EconomySession } from './session.ts';

/**
 * How the game should present the economy's weekly events (handoff). Every engine
 * event maps to one notice with a fixed severity, so the UI does not have to
 * interpret economic rules:
 *
 * - `defeat`: the player's regime was overthrown (GAME_DESIGN.md section 6): end the game;
 * - `critical`: a major crisis that needs the player's attention now;
 * - `warning`: a problem worth showing in the weekly log and as a badge;
 * - `info`: background news for the weekly log.
 *
 * Texts are plain English for the log; the game may rephrase them, but not change
 * the severity or what triggers it.
 */
export type EconomyNoticeSeverity = 'defeat' | 'critical' | 'warning' | 'info';

export interface EconomyNotice {
  severity: EconomyNoticeSeverity;
  title: string;
  message: string;
  /** Country the event is about. */
  countryId: CountryId;
  /** Region the event is about, when there is one. */
  regionId: string | null;
  /** True when the event is about the player's country (or a region it legally owns or controls). */
  concernsPlayer: boolean;
  /** The game week the event happened in. */
  week: number;
  /** The engine's original event, for details. */
  event: EconomyEvent;
}

const pct = (value: number) => `${Math.round(value * 100)}%`;
const UNREST = ['', 'protests', 'mass unrest', 'regime collapse risk'];

/** One notice for one economy event (see the severity rules above). */
export function describeEconomyEvent(session: EconomySession, event: EconomyEvent): EconomyNotice {
  const state = session.state;
  const country = (id: string) => state.countries.find(entry => entry.id === id)?.name ?? id;
  const region = (id: string) => state.zones.find(entry => entry.id === id)?.name ?? id;
  const player = session.playerCountryId;
  let severity: EconomyNoticeSeverity = 'info';
  let title: string;
  let message: string;
  let regionId: string | null = null;
  let involved: string[] = [event.countryId];
  const name = country(event.countryId);
  switch (event.type) {
    case 'regime-change':
      severity = event.countryId === player ? 'defeat' : 'critical';
      title = `Regime overthrown in ${name}`;
      message = event.countryId === player
        ? `Unrest has brought down the government of ${name}. This is a defeat.`
        : `Unrest has brought down the government of ${name}; a new regime takes over.`;
      break;
    case 'regime-survived':
      severity = 'warning';
      title = `${name}'s government survives a crisis`;
      message = `The regime of ${name} withstood a wave of ${UNREST[event.tier]}; the crisis is not over.`;
      break;
    case 'unrest-started':
      severity = 'warning';
      title = `Unrest in ${name}`;
      message = `${name} faces ${UNREST[event.tier]}. Output suffers from strikes.`;
      break;
    case 'unrest-escalated':
      severity = event.tier >= 3 ? 'critical' : 'warning';
      title = `Unrest escalates in ${name}`;
      message = `Unrest in ${name} has grown into ${UNREST[event.tier]}.`;
      break;
    case 'unrest-ended':
      title = `Calm returns to ${name}`;
      message = `The unrest in ${name} is over.`;
      break;
    case 'sovereign-default':
      severity = 'critical';
      title = `${name} defaults on its debt`;
      message = `${name} ${event.forced ? 'could no longer pay and' : ''} defaulted: ${pct(event.haircut)} of its debt was written off. Credit markets are closed to it for a time. A default is not a defeat.`.replace('  ', ' ');
      break;
    case 'market-access-lost':
      severity = 'critical';
      title = `${name} loses access to credit markets`;
      message = `Lenders demand ${pct(event.rate)} from ${name}: it can no longer borrow on the market.`;
      break;
    case 'market-access-restored':
      title = `${name} can borrow again`;
      message = `${name} has regained access to credit markets at ${pct(event.rate)}.`;
      break;
    case 'missed-payment':
      severity = 'warning';
      title = `${name} misses a debt payment`;
      message = `${name} could not pay all its debt service this week (${event.consecutive} week${event.consecutive === 1 ? '' : 's'} in a row). Unpaid interest is added to the debt.`;
      break;
    case 'money-created':
      severity = 'warning';
      title = `${name} creates money`;
      message = `The central bank of ${name} created money for the treasury, on the government's explicit order. Expect inflation and a higher risk premium.`;
      break;
    case 'firm-bankruptcy':
      severity = 'warning';
      regionId = event.zoneId;
      title = `Bankruptcy in ${region(event.zoneId)}`;
      message = `${event.ownership[0].toUpperCase()}${event.ownership.slice(1)} firms of the ${event.sectorId.replace(/_/g, ' ')} sector in ${region(event.zoneId)} went bankrupt (${pct(event.capacityShare)} of the sector's plant there).`;
      break;
    case 'zone-occupied':
      severity = 'critical';
      regionId = event.zoneId;
      involved = [event.occupierId, event.sovereignId];
      title = `${region(event.zoneId)} occupied`;
      message = `${country(event.occupierId)} now controls the economy of ${region(event.zoneId)}, which legally remains part of ${country(event.sovereignId)} (${event.policy} occupation).`;
      break;
    case 'zone-liberated':
      severity = 'info';
      regionId = event.zoneId;
      involved = [event.sovereignId, event.formerOccupierId];
      title = `${region(event.zoneId)} liberated`;
      message = `${region(event.zoneId)} is again controlled by ${country(event.sovereignId)}.`;
      break;
    case 'zone-annexed':
      severity = 'critical';
      regionId = event.zoneId;
      involved = [event.ownerId, event.formerOwnerId];
      title = `${region(event.zoneId)} annexed`;
      message = `${region(event.zoneId)} now legally belongs to ${country(event.ownerId)} (formerly ${country(event.formerOwnerId)}).`;
      break;
    case 'sabotage':
      severity = 'warning';
      regionId = event.zoneId;
      title = `Sabotage in ${region(event.zoneId)}`;
      message = `Resistance fighters destroyed ${pct(event.share)} of the ${event.goodId.replace(/_/g, ' ')} plant in occupied ${region(event.zoneId)}.`;
      break;
    case 'occupation-revolt':
      severity = 'critical';
      regionId = event.zoneId;
      title = `Revolt in ${region(event.zoneId)}`;
      message = `The population of occupied ${region(event.zoneId)} is in open revolt against ${country(event.occupierId)}.`;
      break;
    case 'occupation-revolt-ended':
      regionId = event.zoneId;
      title = `Revolt subsides in ${region(event.zoneId)}`;
      message = `Open revolt in ${region(event.zoneId)} has died down.`;
      break;
    default: {
      // Every engine event is handled above; a new event type must be added here.
      const unknown: never = event;
      throw new Error(`Unhandled economy event ${(unknown as { type: string }).type}.`);
    }
  }
  return {
    severity, title, message, countryId: event.countryId, regionId, concernsPlayer: player !== null && involved.includes(player),
    week: event.turn, event,
  };
}

/** Notices for the last resolved week, most severe first (stable within a severity). */
export function weeklyEconomyNotices(session: EconomySession): EconomyNotice[] {
  const rank: Record<EconomyNoticeSeverity, number> = { defeat: 0, critical: 1, warning: 2, info: 3 };
  return session.summary.events.map(event => describeEconomyEvent(session, event))
    .map((notice, index) => ({ notice, index }))
    .sort((a, b) => rank[a.notice.severity] - rank[b.notice.severity] || a.index - b.index)
    .map(entry => entry.notice);
}
