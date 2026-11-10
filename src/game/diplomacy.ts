import type { CountryId, DiplomaticCommand, GameState } from './models.ts';

/** Reversible T08 demo parameters, not approved balance or a treaty system. */
export const DIPLOMACY_PARAMETERS = {
  minRelationship: -100, maxRelationship: 100,
  goodwill: 5, condemnation: -10, acceptedOffer: 10, rejectedOffer: -5,
  playerActionsPerWeek: 1,
} as const;

export function parseDiplomaticCommand(value: unknown): DiplomaticCommand {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const command = value as Record<string, unknown>;
    const text = (input: unknown): input is string => typeof input === 'string' && input.trim().length > 0;
    if (text(command.countryId)) {
      if (command.type === 'declare' && text(command.targetId) && (command.stance === 'goodwill' || command.stance === 'condemnation')) {
        return { type: command.type, countryId: command.countryId, targetId: command.targetId, stance: command.stance };
      }
      if (command.type === 'offer-cooperation' && text(command.targetId)) {
        return { type: command.type, countryId: command.countryId, targetId: command.targetId };
      }
      if (command.type === 'respond-offer' && text(command.offerId) && (command.response === 'accept' || command.response === 'reject')) {
        return { type: command.type, countryId: command.countryId, offerId: command.offerId, response: command.response };
      }
    }
  }
  throw new Error('Invalid diplomatic command.');
}

/** Both the UI and each AI use this selector, including for resolved offers. */
export function visibleDiplomaticMessages(state: GameState, viewerId: CountryId) {
  if (!state.countries.some(country => country.id === viewerId)) return [];
  return state.diplomaticMessages.filter(message => message.visibility === 'public'
    || message.fromId === viewerId || message.toId === viewerId);
}

export function relationshipValue(state: GameState, first: CountryId, second: CountryId): number {
  const relation = state.relations.find(relation => relation.countryIds.includes(first) && relation.countryIds.includes(second));
  if (first === second || !relation || !Number.isInteger(relation.value)
    || relation.value < DIPLOMACY_PARAMETERS.minRelationship || relation.value > DIPLOMACY_PARAMETERS.maxRelationship) {
    throw new Error('Invalid bilateral relationship.');
  }
  return relation.value;
}

/** Internal rules shared by human and AI actors; advanceTurn authorizes external commands. */
export function applyDiplomaticCommand(state: GameState, input: DiplomaticCommand, reason = 'Player decision.'): GameState {
  const command = parseDiplomaticCommand(input);
  if (!state.countries.some(country => country.id === command.countryId)) throw new Error('Unknown diplomatic sender.');
  const offer = command.type === 'respond-offer'
    ? visibleDiplomaticMessages(state, command.countryId).find(message => message.id === command.offerId) : undefined;
  if (command.type === 'respond-offer' && (!offer || offer.visibility !== 'private'
    || offer.toId !== command.countryId || offer.status !== 'pending')) {
    throw new Error('Only the recipient can respond to a pending private offer.');
  }
  const targetId = command.type === 'respond-offer' ? offer!.fromId : command.targetId;
  if (targetId === command.countryId || !state.countries.some(country => country.id === targetId)) {
    throw new Error('Diplomacy requires another existing country.');
  }
  const before = relationshipValue(state, command.countryId, targetId);
  if (command.type === 'offer-cooperation' && state.diplomaticMessages.some(message => message.visibility === 'private'
    && message.status === 'pending' && [message.fromId, message.toId].includes(command.countryId)
    && [message.fromId, message.toId].includes(targetId))) {
    throw new Error('A private offer between these countries is already pending.');
  }
  const delta = command.type === 'declare' ? DIPLOMACY_PARAMETERS[command.stance]
    : command.type === 'respond-offer' ? (command.response === 'accept' ? DIPLOMACY_PARAMETERS.acceptedOffer : DIPLOMACY_PARAMETERS.rejectedOffer) : 0;
  const after = Math.max(DIPLOMACY_PARAMETERS.minRelationship, Math.min(DIPLOMACY_PARAMETERS.maxRelationship, before + delta));
  const relationshipChange = after - before;
  const relations = state.relations.map(relation => relation.countryIds.includes(command.countryId) && relation.countryIds.includes(targetId)
    ? { ...relation, value: after } : relation);
  // IDs derive from serializable state alone, without a clock or random source.
  const id = `diplomacy-${state.week}-${state.diplomaticMessages.length + 1}`;
  const diplomaticMessages = command.type === 'respond-offer'
    ? state.diplomaticMessages.map(message => message.id === command.offerId && message.visibility === 'private'
      ? { ...message, status: command.response === 'accept' ? 'accepted' as const : 'rejected' as const,
        resolvedWeek: state.week, relationshipChange, responseReason: reason } : message)
    : [...state.diplomaticMessages, command.type === 'declare'
      ? { id, week: state.week, visibility: 'public' as const, fromId: command.countryId, toId: targetId, stance: command.stance, relationshipChange, reason }
      : { id, week: state.week, visibility: 'private' as const, fromId: command.countryId, toId: targetId, status: 'pending' as const, relationshipChange, reason }];
  return { ...state, relations, diplomaticMessages };
}
