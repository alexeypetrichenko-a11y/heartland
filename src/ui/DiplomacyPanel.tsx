import { useState } from 'react';
import type { DiplomaticCommand, GameState } from '../game/models';
import { DIPLOMACY_PARAMETERS, visibleDiplomaticMessages } from '../game/diplomacy';

type Props = {
  state: GameState;
  pendingAction: DiplomaticCommand | null;
  onStageAction: (command: DiplomaticCommand | null) => void;
};

export function DiplomacyPanel({ state, pendingAction, onStageAction }: Props) {
  const [targetId, setTargetId] = useState('');
  const [action, setAction] = useState<'goodwill' | 'condemnation' | 'offer'>('goodwill');
  const countryId = state.playerCountryId!;
  const counterparts = state.countries.filter(country => country.id !== countryId);
  const target = counterparts.find(country => country.id === targetId);
  const visible = visibleDiplomaticMessages(state, countryId);
  const declarations = visible.filter(message => message.visibility === 'public');
  const offers = visible.filter(message => message.visibility === 'private');
  const recentResolved = offers.filter(offer => offer.status !== 'pending').slice(-12);
  const countryName = (id: string) => state.countries.find(country => country.id === id)?.name ?? id;
  const signed = (value: number) => `${value > 0 ? '+' : ''}${value}`;
  const actionLabel = (command: DiplomaticCommand) => command.type === 'respond-offer'
    ? `${command.response === 'accept' ? 'Accept' : 'Reject'} offer from ${countryName(offers.find(offer => offer.id === command.offerId)?.fromId ?? '')}`
    : `${command.type === 'declare' ? `Public ${command.stance}` : 'Private cooperation offer'} to ${countryName(command.targetId)}`;
  const duplicateOffer = offers.some(offer => offer.status === 'pending' && [offer.fromId, offer.toId].includes(targetId));

  return <section aria-labelledby="diplomacy-title">
    <h2 id="diplomacy-title" tabIndex={-1}>Diplomacy</h2>
    <p>Provisional relationships: {DIPLOMACY_PARAMETERS.minRelationship} (hostile) to +{DIPLOMACY_PARAMETERS.maxRelationship} (friendly); 0 is neutral. Scores are public and shared by each pair.</p>
    <ul aria-label="Bilateral relationships">{state.relations.map(relation => <li key={relation.countryIds.join(':')}>
      {relation.countryIds.map(countryName).join(' ↔ ')}: {signed(relation.value)}
    </li>)}</ul>
    <form onSubmit={event => {
      event.preventDefault();
      if (!target) return;
      onStageAction(action === 'offer' ? { type: 'offer-cooperation', countryId, targetId: target.id }
        : { type: 'declare', countryId, targetId: target.id, stance: action });
    }}>
      <label htmlFor="diplomatic-target">Diplomatic counterpart</label>
      <select id="diplomatic-target" value={target?.id ?? ''} required onChange={event => setTargetId(event.target.value)}>
        <option value="" disabled>Select another country</option>
        {counterparts.map(country => <option key={country.id} value={country.id}>{country.name}</option>)}
      </select>
      <label htmlFor="diplomatic-action">Diplomatic action</label>
      <select id="diplomatic-action" value={action} aria-describedby="diplomatic-help" onChange={event => {
        const value = event.target.value;
        if (value === 'goodwill' || value === 'condemnation' || value === 'offer') setAction(value);
      }}>
        <option value="goodwill">Public goodwill (+{DIPLOMACY_PARAMETERS.goodwill})</option>
        <option value="condemnation">Public condemnation ({DIPLOMACY_PARAMETERS.condemnation})</option>
        <option value="offer">Private cooperation offer</option>
      </select>
      <button type="submit" disabled={!target || (action === 'offer' && duplicateOffer)}>Stage diplomatic action</button>
      <p id="diplomatic-help">One diplomatic action per week, applied with Next week. Staging replaces your previous diplomatic draft. Declarations are public; offers and replies are visible only to the two countries. Acceptance changes the relationship by +{DIPLOMACY_PARAMETERS.acceptedOffer}; rejection by {DIPLOMACY_PARAMETERS.rejectedOffer}, limited by the score range. Offers create no treaty, payments or military obligations. Each AI country then makes one diplomatic decision.</p>
      {action === 'offer' && duplicateOffer && <p>An offer between these countries is already pending. Wait for a reply or respond below.</p>}
    </form>
    {pendingAction && <div role="status">
      <p>Staged diplomatic action: {actionLabel(pendingAction)}. Press Next week to apply.</p>
      <button type="button" onClick={() => onStageAction(null)}>Discard staged diplomatic action</button>
    </div>}
    <div aria-live="polite">
      <h3>Public declarations</h3>
      {declarations.length === 0 ? <p>No public declarations yet.</p> : <ul aria-label="Public declarations">{declarations.slice(-12).map(message => <li key={message.id}>
        Week {message.week}: {countryName(message.fromId)} → {countryName(message.toId)}: {message.stance}.
        {' '}Relationship change: {signed(message.relationshipChange)}. {message.reason}
      </li>)}</ul>}
      <h3>Your private bilateral offers</h3>
      <p>Only offers involving your country appear here. Pending offers remain until answered.</p>
      {offers.length === 0 ? <p>No private offers involving your country.</p> : <ul aria-label="Your private offers">{offers.filter(offer => offer.status === 'pending' || recentResolved.includes(offer)).map(offer => <li key={offer.id}>
        Week {offer.week}: {countryName(offer.fromId)} → {countryName(offer.toId)}: cooperation offer — {offer.status}.
        {' '}{offer.reason}
        {offer.status !== 'pending' && <> Resolved week {offer.resolvedWeek}. Relationship change: {signed(offer.relationshipChange)}. {offer.responseReason}</>}
        {offer.status === 'pending' && offer.toId === countryId && <>
          <button type="button" onClick={() => onStageAction({ type: 'respond-offer', countryId, offerId: offer.id, response: 'accept' })}>Accept offer from {countryName(offer.fromId)}</button>
          {' '}<button type="button" onClick={() => onStageAction({ type: 'respond-offer', countryId, offerId: offer.id, response: 'reject' })}>Reject offer from {countryName(offer.fromId)}</button>
        </>}
      </li>)}</ul>}
      {(declarations.length > 12 || offers.filter(offer => offer.status !== 'pending').length > 12) && <p>Showing the latest 12 declarations and latest 12 resolved offers, plus all pending offers.</p>}
    </div>
  </section>;
}
