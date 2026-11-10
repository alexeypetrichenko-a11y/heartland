import { useState } from 'react';
import { DetailPanel } from './DetailPanel';
import type { DiplomaticCommand, GameState } from '../game/models';
import { DIPLOMACY_PARAMETERS, visibleDiplomaticMessages } from '../game/diplomacy';

type Props = {
  state: GameState;
  pendingAction: DiplomaticCommand | null;
  onStageAction: (command: DiplomaticCommand | null) => void;
};

export function DiplomacyPanel({ state, pendingAction, onStageAction }: Props) {
  const [detail, setDetail] = useState<'compose' | 'offers' | 'history' | null>(null);
  const [targetId, setTargetId] = useState('');
  const [action, setAction] = useState<'goodwill' | 'condemnation' | 'offer'>('goodwill');
  const countryId = state.playerCountryId!;
  const counterparts = state.countries.filter(country => country.id !== countryId);
  const target = counterparts.find(country => country.id === targetId);
  const visible = visibleDiplomaticMessages(state, countryId);
  const declarations = visible.filter(message => message.visibility === 'public');
  const offers = visible.filter(message => message.visibility === 'private');
  const incoming = offers.filter(offer => offer.status === 'pending' && offer.toId === countryId);
  const recentResolved = offers.filter(offer => offer.status !== 'pending').slice(-12);
  const countryName = (id: string) => state.countries.find(country => country.id === id)?.name ?? id;
  const signed = (value: number) => `${value > 0 ? '+' : ''}${value}`;
  const actionLabel = (command: DiplomaticCommand) => command.type === 'respond-offer'
    ? `${command.response === 'accept' ? 'Accept' : 'Reject'} offer from ${countryName(offers.find(offer => offer.id === command.offerId)?.fromId ?? '')}`
    : `${command.type === 'declare' ? `Public ${command.stance}` : 'Private cooperation offer'} to ${countryName(command.targetId)}`;
  const duplicateOffer = offers.some(offer => offer.status === 'pending' && [offer.fromId, offer.toId].includes(targetId));

  const draft = pendingAction && <div className="draft-notice" role="status">
    <p>Staged diplomatic action: {actionLabel(pendingAction)}. Press Next week to apply.</p>
    <button type="button" onClick={() => onStageAction(null)}>Discard staged diplomatic action</button>
  </div>;

  return <section className="compact-section" aria-labelledby="diplomacy-title">
    <h2 id="diplomacy-title" className="sr-only">Diplomacy</h2>
    <div className="overview overview-grid" hidden={detail !== null}>
      <div className="group">
        <h3>Relations</h3>
        <ul className="card card-list" aria-label="Bilateral relationships">{state.relations.map(relation => <li className="row" key={relation.countryIds.join(':')}>
          <span className="row-text"><b>{relation.countryIds.map(countryName).join(' ↔ ')}</b><span>Shared relationship</span></span><span className="value">{signed(relation.value)}</span>
        </li>)}</ul>
      </div>
      <div className="group">
        <h3>Incoming</h3>
        <div className="card">
          <button type="button" className="row" onClick={() => setDetail('offers')} aria-controls="offer-details" aria-expanded={detail === 'offers'}>
            <span className="row-text"><b>Proposals and replies</b><span>{incoming.length ? `${incoming.length} awaiting reply · ${incoming.map(offer => countryName(offer.fromId)).join(', ')}` : 'No incoming proposals'}</span></span><span className="chevron" aria-hidden="true">›</span>
          </button>
        </div>
        <div className="action-pair">
          <button type="button" onClick={() => setDetail('compose')} aria-controls="diplomatic-compose" aria-expanded={detail === 'compose'}>Compose diplomacy</button>
          <button type="button" onClick={() => setDetail('history')} aria-controls="declaration-details" aria-expanded={detail === 'history'}>Public declarations</button>
        </div>
      </div>
    </div>
    <DetailPanel id="diplomatic-compose" title="Diplomatic action" open={detail === 'compose'} onClose={() => setDetail(null)}>
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
        <details><summary>Diplomacy rules</summary><p id="diplomatic-help">One diplomatic action per week, applied with Next week. Staging replaces your previous diplomatic draft. Declarations are public; offers and replies are visible only to the two countries. Acceptance changes the relationship by +{DIPLOMACY_PARAMETERS.acceptedOffer}; rejection by {DIPLOMACY_PARAMETERS.rejectedOffer}, limited by the score range. Offers create no treaty, payments or military obligations. Each AI country then makes one diplomatic decision.</p><p>Provisional relationship range: {DIPLOMACY_PARAMETERS.minRelationship} to +{DIPLOMACY_PARAMETERS.maxRelationship}; 0 is neutral.</p></details>
        {action === 'offer' && duplicateOffer && <p>An offer between these countries is already pending. Wait for a reply or respond below.</p>}
      </form>
      {draft}
    </DetailPanel>
    <DetailPanel id="declaration-details" title="Public declarations" open={detail === 'history'} onClose={() => setDetail(null)}>
      <div aria-live="polite">
      <h3>Public declarations</h3>
      {declarations.length === 0 ? <p>No public declarations yet.</p> : <ul aria-label="Public declarations">{declarations.slice(-12).map(message => <li key={message.id}>
        Week {message.week}: {countryName(message.fromId)} → {countryName(message.toId)}: {message.stance}.
        {' '}Relationship change: {signed(message.relationshipChange)}. {message.reason}
      </li>)}</ul>}
      </div>
    </DetailPanel>
    <DetailPanel id="offer-details" title="Private proposals and replies" open={detail === 'offers'} onClose={() => setDetail(null)}>
      {draft}
      <div aria-live="polite">
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
    </DetailPanel>
  </section>;
}
