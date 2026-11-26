import { useState } from 'react';
import { DetailPanel } from './DetailPanel';
import { militaryBriefing } from './militaryBriefing';
import type { GameState, MilitaryCommand, MilitaryOrder } from '../game/models';

type MilitaryPanelProps = {
  state: GameState;
  forceNote?: string;
  pendingOrders: readonly MilitaryCommand[];
  onStageOrder: (command: MilitaryCommand) => void;
  onRemoveOrder: (id: string) => void;
  onDiscardOrders: () => void;
};

export function MilitaryPanel({ state, forceNote, pendingOrders, onStageOrder, onRemoveOrder, onDiscardOrders }: MilitaryPanelProps) {
  const [panel, setPanel] = useState<{ kind: 'orders' | 'results'; week: number } | null>(null);
  const detail = panel?.week === state.week ? panel.kind : null;
  function setDetail(kind: 'orders' | 'results' | null) {
    setPanel(kind ? { kind, week: state.week } : null);
  }
  const [divisionId, setDivisionId] = useState('');
  const [kind, setKind] = useState<MilitaryOrder['kind']>('defend');
  const [targetId, setTargetId] = useState('');
  const personnel = forceNote ? 'personnel equivalents' : 'personnel';
  const divisions = state.divisions.filter(division => division.ownerId === state.playerCountryId);
  const selected = divisions.find(division => division.id === divisionId && division.manpower > 0);
  const origin = state.regions.find(region => region.id === selected?.regionId);
  const targets = state.regions.filter(region => origin?.adjacentRegionIds.includes(region.id)
    && (kind === 'move' ? region.ownerId === selected?.ownerId : region.ownerId !== selected?.ownerId));
  const target = targets.find(region => region.id === targetId);
  const regionName = (id: string) => state.regions.find(region => region.id === id)?.name ?? id;
  const divisionName = (id: string) => state.divisions.find(division => division.id === id)?.name ?? id;
  const orderLabel = (order: MilitaryOrder) => order.kind === 'defend' ? 'Defend current region' : `${order.kind === 'move' ? 'Move to' : 'Attack'} ${regionName(order.targetRegionId)}`;
  const activeAttacks = divisions.flatMap(division => division.manpower > 0 && division.order.kind === 'attack'
    ? [{ division, targetId: division.order.targetRegionId }] : []);
  const briefing = kind === 'attack' && target ? militaryBriefing(state, target.id) : null;
  const persistence = kind === 'attack' ? 'Persistent · repeats each week until capture, destruction or replacement.'
    : kind === 'move' ? 'One-time · move during settlement, then defend at the destination.'
    : 'Persistent · hold the current region and stop any continuing attack when this order takes effect.';
  const latest = state.militaryResults[0];
  const resultSummary = !latest ? (state.week === 1 ? 'No weeks resolved yet' : 'No movement or combat')
    : latest.kind === 'moved' ? `Moved to ${regionName(latest.targetRegionId)}`
      : latest.kind === 'cancelled' ? 'Order cancelled'
        : `${latest.captured ? 'Captured' : 'Combat at'} ${regionName(latest.targetRegionId)}`;

  return (
    <section className="compact-section" aria-labelledby="military-title">
      <h2 id="military-title" className="sr-only">Military</h2>
      <div key={state.week} className="overview overview-grid military-overview" hidden={detail !== null}>
        <section className="military-active card" aria-label="Active attacks">
          <h3>Continuing attacks</h3>
          {activeAttacks.length === 0 ? <p>No attacks are currently active.</p> :
            <ul>{activeAttacks.map(({ division, targetId }) => {
              const replacement = pendingOrders.find(command => command.divisionId === division.id);
              return <li key={division.id}>
                <strong>{division.name}</strong>
                <dl className="military-attack-details">
                  <div><dt>Origin</dt><dd>{regionName(division.regionId)}</dd></div>
                  <div><dt>Destination</dt><dd>{regionName(targetId)}</dd></div>
                  <div><dt>Current strength</dt><dd>{division.manpower.toLocaleString()} {personnel}</dd></div>
                </dl>
                <p>{replacement ? `Pending replacement for Week ${state.week} · ${orderLabel(replacement.order)}`
                  : `Continues when Week ${state.week} settles.`}</p>
                <button type="button" disabled={replacement?.order.kind === 'defend'} onClick={() => {
                  onStageOrder({ type: 'set-military-order', divisionId: division.id, countryId: division.ownerId, order: { kind: 'defend' } });
                }}>Stage stop for {division.name}</button>
              </li>;
            })}</ul>}
        </section>
        <div className="group">
          <h3>Forces · {divisions.length} division{divisions.length === 1 ? '' : 's'}</h3>
          {forceNote && <p>{forceNote}</p>}
          <ul className="card card-list" aria-label="Your divisions">{divisions.map(division => (
            <li key={division.id} className="force-row">
              <b>{division.name}</b>
              <span>{division.manpower} {personnel} · {regionName(division.regionId)}</span>
              <span className="operation">{division.manpower > 0 ? `Active · ${orderLabel(division.order)}` : 'Unavailable (destroyed)'}</span>
            </li>
          ))}</ul>
        </div>
        <div className="group">
          <h3>Operations</h3>
          <div className="card">
            <button type="button" className="row" onClick={() => setDetail('orders')} aria-controls="orders-details" aria-expanded={detail === 'orders'}>
              <span className="row-text"><b>Military orders</b><span>{pendingOrders.length ? `${pendingOrders.length} pending for Week ${state.week}` : 'Move, defend or attack'}</span></span><span className="chevron" aria-hidden="true">›</span>
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
            {divisions.map(division => <option key={division.id} value={division.id} disabled={division.manpower === 0}>{division.name} ({division.manpower} {personnel})</option>)}
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
          {selected && <section className="military-preview" aria-label="Order preview">
            <h3>Before staging</h3>
            <dl className="data-list">
              <div><dt>Division and strength</dt><dd>{selected.name} · {selected.manpower.toLocaleString()} {personnel}</dd></div>
              <div><dt>Origin</dt><dd>{origin?.name}</dd></div>
              <div><dt>Destination</dt><dd>{kind === 'defend' ? origin?.name : target?.name ?? 'Select a target'}</dd></div>
              <div><dt>Execution</dt><dd>Week {state.week} · when you tap Next week</dd></div>
              <div><dt>Duration and effect</dt><dd>{persistence}</dd></div>
              {kind === 'attack' && <>
                <div><dt>Enemy information</dt><dd>{briefing?.enemy ?? 'Select a target to review available intelligence.'}</dd></div>
                <div><dt>Estimated force ratio</dt><dd>{briefing?.ratio ?? 'Select a target.'}</dd></div>
                <div><dt>Combat risk</dt><dd>{briefing?.risk ?? 'Select a target.'}</dd></div>
              </>}
            </dl>
            <p>Remove a pending order before advancing, or stage another order for this division to replace it. To stop an active attack, stage Defend and advance the week.</p>
          </section>}
          <div className="military-confirmation">
            <p id="military-execution"><strong>Executes in Week {state.week}</strong><br />When you tap Next week.</p>
            <button type="submit" aria-describedby="military-execution" disabled={!selected || (kind !== 'defend' && !target)}>Stage military order</button>
          </div>
          <details><summary>Order rules</summary><p id="military-help">Staged orders apply with Next week. Defend holds position and stops an attack. Moves finish in one week; attacks repeat weekly until capture, destruction or replacement. Enemy units defend in place without making decisions. Combat and headcounts are provisional; units at zero personnel are unavailable.</p></details>
        </form>
        {pendingOrders.length > 0 && <div role="status">
          <p>Pending military orders for Week {state.week}</p>
          <ul>{pendingOrders.map(command => <li key={command.divisionId}>{divisionName(command.divisionId)} · {orderLabel(command.order)}
            <button type="button" onClick={() => onRemoveOrder(command.divisionId)}>Remove pending order for {divisionName(command.divisionId)}</button>
          </li>)}</ul>
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
                    {activeAttacks.some(({ division }) => division.id === result.divisionId) && ' Attack remains active.'}
                  </>}
            </li>)}
          </ul>}
        </div>
      </DetailPanel>
    </section>
  );
}
