import { useState } from 'react';
import { DetailPanel } from './DetailPanel';
import type { GameState, MilitaryCommand, MilitaryOrder } from '../game/models';

type MilitaryPanelProps = {
  state: GameState;
  pendingOrders: readonly MilitaryCommand[];
  onStageOrder: (command: MilitaryCommand) => void;
  onDiscardOrders: () => void;
};

export function MilitaryPanel({ state, pendingOrders, onStageOrder, onDiscardOrders }: MilitaryPanelProps) {
  const [detail, setDetail] = useState<'orders' | 'results' | null>(null);
  const [divisionId, setDivisionId] = useState('');
  const [kind, setKind] = useState<MilitaryOrder['kind']>('defend');
  const [targetId, setTargetId] = useState('');
  const divisions = state.divisions.filter(division => division.ownerId === state.playerCountryId);
  const selected = divisions.find(division => division.id === divisionId && division.manpower > 0);
  const origin = state.regions.find(region => region.id === selected?.regionId);
  const targets = state.regions.filter(region => origin?.adjacentRegionIds.includes(region.id)
    && (kind === 'move' ? region.ownerId === selected?.ownerId : region.ownerId !== selected?.ownerId));
  const target = targets.find(region => region.id === targetId);
  const regionName = (id: string) => state.regions.find(region => region.id === id)?.name ?? id;
  const divisionName = (id: string) => state.divisions.find(division => division.id === id)?.name ?? id;
  const orderLabel = (order: MilitaryOrder) => order.kind === 'defend' ? 'Defend current region' : `${order.kind === 'move' ? 'Move to' : 'Attack'} ${regionName(order.targetRegionId)}`;
  const latest = state.militaryResults[0];
  const resultSummary = !latest ? (state.week === 1 ? 'No weeks resolved yet' : 'No movement or combat')
    : latest.kind === 'moved' ? `Moved to ${regionName(latest.targetRegionId)}`
      : latest.kind === 'cancelled' ? 'Order cancelled'
        : `${latest.captured ? 'Captured' : 'Combat at'} ${regionName(latest.targetRegionId)}`;

  return (
    <section className="compact-section" aria-labelledby="military-title">
      <h2 id="military-title" className="sr-only">Military</h2>
      <div className="overview overview-grid" hidden={detail !== null}>
        <div className="group">
          <h3>Forces · {divisions.length} division{divisions.length === 1 ? '' : 's'}</h3>
          <ul className="card card-list" aria-label="Your divisions">{divisions.map(division => (
            <li key={division.id} className="force-row">
              <b>{division.name}</b>
              <span>{division.manpower} personnel · {regionName(division.regionId)}</span>
              <span className="operation">{division.manpower > 0 ? orderLabel(division.order) : 'Unavailable (destroyed)'}</span>
            </li>
          ))}</ul>
        </div>
        <div className="group">
          <h3>Operations</h3>
          <div className="card">
            <button type="button" className="row" onClick={() => setDetail('orders')} aria-controls="orders-details" aria-expanded={detail === 'orders'}>
              <span className="row-text"><b>Military orders</b><span>{pendingOrders.length ? `${pendingOrders.length} staged for next week` : 'Move, defend or attack'}</span></span><span className="chevron" aria-hidden="true">›</span>
            </button>
            <button type="button" className="row" onClick={() => setDetail('results')} aria-controls="combat-details" aria-expanded={detail === 'results'}>
              <span className="row-text"><b>Latest military results</b><span>{state.week > 1 && `Week ${state.week - 1} · `}{resultSummary}</span></span><span className="chevron" aria-hidden="true">›</span>
            </button>
          </div>
        </div>
      </div>
      <DetailPanel id="orders-details" title="Military orders" open={detail === 'orders'} onClose={() => setDetail(null)}>
        <form onSubmit={event => {
          event.preventDefault();
          if (!selected || !state.playerCountryId || (kind !== 'defend' && !target)) return;
          const order: MilitaryOrder = kind === 'defend' ? { kind } : { kind, targetRegionId: target!.id };
          onStageOrder({ type: 'set-military-order', countryId: state.playerCountryId, divisionId: selected.id, order });
        }}>
          <label htmlFor="military-division">Division</label>
          <select id="military-division" value={selected?.id ?? ''} required onChange={event => {
            setDivisionId(event.target.value);
            setKind('defend');
            setTargetId('');
          }}>
            <option value="" disabled>Select your division</option>
            {divisions.map(division => <option key={division.id} value={division.id} disabled={division.manpower === 0}>{division.name} ({division.manpower} personnel)</option>)}
          </select>
          <label htmlFor="military-order">Military order</label>
          <select id="military-order" value={kind} disabled={!selected} aria-describedby="military-help" onChange={event => {
            const value = event.target.value;
            if (value === 'move' || value === 'defend' || value === 'attack') setKind(value);
            setTargetId('');
          }}>
            <option value="defend">Defend current region</option>
            <option value="move">Move to friendly region</option>
            <option value="attack">Attack enemy region</option>
          </select>
          {kind !== 'defend' && <>
            <label htmlFor="military-target">Target region</label>
            <select id="military-target" value={target?.id ?? ''} required disabled={!selected} onChange={event => setTargetId(event.target.value)}>
              <option value="" disabled>Select an adjacent {kind === 'move' ? 'friendly' : 'enemy'} region</option>
              {targets.map(region => <option key={region.id} value={region.id}>{region.name}</option>)}
            </select>
            {selected && targets.length === 0 && <p>No adjacent {kind === 'move' ? 'friendly' : 'enemy'} regions are available.</p>}
          </>}
          <button type="submit" disabled={!selected || (kind !== 'defend' && !target)}>Stage military order</button>
          <details><summary>Order rules</summary><p id="military-help">Staged orders apply with Next week. Defend holds position and stops an attack. Moves finish in one week; attacks repeat weekly until capture, destruction or replacement. Enemy units defend in place without making decisions. Combat and headcounts are provisional; units at zero personnel are unavailable.</p></details>
        </form>
        {pendingOrders.length > 0 && <div role="status">
          <p>Staged military orders for next week:</p>
          <ul>{pendingOrders.map(command => <li key={command.divisionId}>{divisionName(command.divisionId)}: {orderLabel(command.order)}</li>)}</ul>
          <button type="button" onClick={onDiscardOrders}>Discard staged military orders</button>
        </div>}
      </DetailPanel>
      <DetailPanel id="combat-details" title="Combat and movement" open={detail === 'results'} onClose={() => setDetail(null)}>
        <div aria-live="polite" aria-atomic="true" id="military-results">
          <h3>Latest military results{state.week > 1 ? ` (week ${state.week - 1})` : ''}</h3>
          {state.militaryResults.length === 0 ? <p>{state.week === 1 ? 'No weeks resolved yet.' : 'No movement or combat this week.'}</p> : <ul>
            {state.militaryResults.map(result => <li key={result.divisionId}>
              {result.kind === 'moved' ? `${divisionName(result.divisionId)} moved from ${regionName(result.fromRegionId)} to ${regionName(result.targetRegionId)}.`
                : result.kind === 'cancelled' ? `${divisionName(result.divisionId)}: order cancelled. ${result.reason}`
                  : <>
                    {divisionName(result.divisionId)} attacked {regionName(result.targetRegionId)}. Attacker casualties: {result.attackerCasualties}.
                    {' '}Defender casualties: {result.defenderCasualties.length ? result.defenderCasualties.map(loss => `${divisionName(loss.divisionId)}: ${loss.losses}`).join('; ') : '0 (undefended)'}.
                    {' '}{result.captured ? `Captured ${regionName(result.targetRegionId)}.` : 'Territory not captured.'}
                    {state.divisions.find(division => division.id === result.divisionId)?.manpower === 0 && ' Attacking division destroyed.'}
                  </>}
            </li>)}
          </ul>}
        </div>
      </DetailPanel>
    </section>
  );
}
