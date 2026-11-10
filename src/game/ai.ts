import type { CountryId, DiplomaticCommand, GameState } from './models.ts';
import { applyDiplomaticCommand, relationshipValue, visibleDiplomaticMessages } from './diplomacy.ts';

/** Provisional national priorities/thresholds; no economic or military AI in T08. */
export const AI_PRIORITIES: Record<string, { label: string; preferStrongest: boolean; acceptanceThreshold: number }> = {
  alden: { label: 'Build close partnerships', preferStrongest: true, acceptanceThreshold: -10 },
  belora: { label: 'Repair weak relationships', preferStrongest: false, acceptanceThreshold: -30 },
  cyrin: { label: 'Cooperate cautiously', preferStrongest: false, acceptanceThreshold: 0 },
};

export interface AIDecision { command: DiplomaticCommand; reason: string }

/** Choose exactly one local action from visible diplomacy. No hidden bilateral reads. */
export function decideDiplomacy(state: GameState, countryId: CountryId): AIDecision {
  const country = state.countries.find(country => country.id === countryId);
  const priority = AI_PRIORITIES[countryId];
  if (!country || country.controller !== 'ai' || !priority) throw new Error('AI decision requires a fictional AI country.');
  const visible = visibleDiplomaticMessages(state, countryId);
  const incoming = visible.filter(message => message.visibility === 'private' && message.toId === countryId && message.status === 'pending')
    .sort((a, b) => a.week - b.week || compareId(a.id, b.id))[0];
  if (incoming) {
    const accept = relationshipValue(state, countryId, incoming.fromId) >= priority.acceptanceThreshold;
    return {
      command: { type: 'respond-offer', countryId, offerId: incoming.id, response: accept ? 'accept' : 'reject' },
      reason: `${priority.label}: ${accept ? 'accepted' : 'rejected'} at relationship ${relationshipValue(state, countryId, incoming.fromId)} (minimum ${priority.acceptanceThreshold}).`,
    };
  }
  // React only to this week's player declaration, so old statements do not trigger endless replies.
  const statement = visible.find(message => message.visibility === 'public' && message.week === state.week
    && message.fromId === state.playerCountryId && message.toId === countryId);
  if (statement?.visibility === 'public') {
    return { command: { type: 'declare', countryId, targetId: statement.fromId, stance: statement.stance },
      reason: `Responding to ${statement.stance === 'goodwill' ? 'public goodwill' : 'public condemnation'} from ${statement.fromId}.` };
  }
  const targets = state.countries.filter(other => other.id !== countryId).sort((a, b) => {
    const difference = relationshipValue(state, countryId, a.id) - relationshipValue(state, countryId, b.id);
    return (priority.preferStrongest ? -difference : difference) || compareId(a.id, b.id);
  });
  const targetId = targets[0].id;
  const pending = visible.some(message => message.visibility === 'private' && message.status === 'pending'
    && [message.fromId, message.toId].includes(countryId) && [message.fromId, message.toId].includes(targetId));
  const canOffer = relationshipValue(state, countryId, targetId) >= priority.acceptanceThreshold && !pending;
  return { command: canOffer ? { type: 'offer-cooperation', countryId, targetId }
    : { type: 'declare', countryId, targetId, stance: 'goodwill' }, reason: `${priority.label}.` };
}

const compareId = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;

/** Stable sequential decisions avoid conflicting bilateral offers in this local prototype. */
export function resolveAIDiplomacy(state: GameState): GameState {
  let next = state;
  for (const country of state.countries.filter(country => country.controller === 'ai').sort((a, b) => compareId(a.id, b.id))) {
    const decision = decideDiplomacy(next, country.id);
    next = applyDiplomaticCommand(next, decision.command, decision.reason);
  }
  return next;
}
