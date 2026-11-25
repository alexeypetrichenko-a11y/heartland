import { useEffect, useState } from 'react';
import * as api from '../../economy-engine/src/integration/index.ts';
import { createSaveSlot, type SaveAvailability, type SaveStatus } from '../game/localSaveSlot';
import { eligibleMaritimeRoutes, regionalDivisions, type TransportOrder } from '../game/mobility/journeys';
import {
  advanceSyntheticMobility, encodeSyntheticMobility, restoreSyntheticMobility, startSyntheticMobility, syntheticRoutes, type SyntheticSession,
} from '../game/mobility/syntheticScenario';
import { WeeklyReportPanel } from './WeeklyReportPanel';
import { readWeeklyReport, type WeeklyReport } from './weeklyReport';
import './maritimeReview.css';

const runtime = { api };
const labels = {
  departed: 'Departed', arrived: 'Arrived', returned: 'Returned', returning: 'Returning',
  waiting: 'Waiting', refused: 'Transport refused',
};

function regionName(session: SyntheticSession, id: string) {
  return session.game.regions.find(region => region.id === id)?.name ?? id;
}

function maritimeReport(session: SyntheticSession): WeeklyReport | null {
  const report = readWeeklyReport(session.game, session.economy);
  if (!report) return null;
  const events = session.mobility.results.map(result => {
    const division = session.game.divisions.find(unit => unit.id === result.divisionId)!;
    const route = syntheticRoutes.find(entry => entry.id === result.routeId)!;
    const region = session.game.regions.find(entry => entry.id === result.regionId);
    const returning = result.kind === 'returning';
    const from = regionName(session, returning ? route.to : route.from);
    const to = regionName(session, returning ? route.from : route.to);
    const timing = result.dueWeek === undefined ? '' : ` · Expected Week ${result.dueWeek}`;
    return { title: `${labels[result.kind]} · ${division.name}`, message: result.reason ?? (region
      ? `Reached ${region.name}.` : `${from} → ${to}${timing}`), region };
  });
  return { ...report, militaryEvents: [...events, ...report.militaryEvents] };
}

export function MaritimeReview() {
  const [session, setSession] = useState<SyntheticSession>();
  const [stored, setStored] = useState<SyntheticSession>();
  const [availability, setAvailability] = useState<SaveAvailability>();
  const [saveStatus, setSaveStatus] = useState<SaveStatus>();
  const [error, setError] = useState('');
  const [reportOpen, setReportOpen] = useState(false);
  const [divisionId, setDivisionId] = useState('');
  const [routeId, setRouteId] = useState('');
  const [regionId, setRegionId] = useState('alden-vale');
  const [slot] = useState(() => createSaveSlot<SyntheticSession, SyntheticSession>('heartland-mil01a', setSaveStatus, {
    encode: value => encodeSyntheticMobility(runtime, value),
    decode: record => restoreSyntheticMobility(runtime, record),
    week: value => value.game.week,
  }));

  useEffect(() => {
    let active = true;
    void slot.lookup().then(result => {
      if (!active) return;
      if (result.kind === 'found') {
        setStored(result.save);
        setAvailability({ kind: 'found' });
      } else setAvailability(result);
    });
    const flush = () => slot.flush();
    const onVisibility = () => { if (document.visibilityState === 'hidden') flush(); };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      active = false;
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [slot]);

  function commit(next: SyntheticSession) {
    setSession(next);
    slot.schedule(next);
  }

  function start() {
    if ((stored || session || availability?.kind === 'unreadable')
      && !window.confirm('Replace the local maritime review save?')) return;
    try {
      setError('');
      setReportOpen(false);
      setDivisionId('');
      setRouteId('');
      setRegionId('alden-vale');
      commit(startSyntheticMobility(runtime));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The maritime scenario could not start.');
    }
  }

  function nextWeek() {
    if (!session) return;
    try {
      const next = advanceSyntheticMobility(runtime, session);
      commit(next);
      setError('');
      setReportOpen(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The week could not advance.');
    }
  }

  if (!session) return <main className="maritime-review maritime-setup">
    <h1>Maritime transport</h1>
    <p>Play as Alden in a synthetic scenario. Move divisions between the mainland and Reed Island.</p>
    <div className="maritime-actions">
      <button type="button" disabled={!availability} onClick={start}>Start maritime scenario</button>
      {stored && <button type="button" onClick={() => { setSession(stored); setSaveStatus({ kind: 'saved', week: stored.game.week }); }}>Resume maritime game</button>}
    </div>
    {!availability && <p role="status">Checking local save…</p>}
    {availability && 'message' in availability && <p role="alert">{availability.message}</p>}
    {error && <p role="alert">{error}</p>}
  </main>;

  const report = maritimeReport(session);
  const living = session.game.divisions.filter(division => division.ownerId === session.game.playerCountryId && division.manpower > 0);
  const selected = living.find(division => division.id === divisionId);
  const available = selected ? eligibleMaritimeRoutes(session.game, session.mobility, syntheticRoutes, selected.id) : [];
  const route = available.find(entry => entry.id === routeId);
  const underway = (id: string) => session.mobility.journeys.find(journey => journey.divisionId === id);
  const staged = (id: string) => session.transportDrafts.find(order => order.divisionId === id);
  const destination = (id: string) => {
    const journey = underway(id);
    if (!journey) return null;
    const sailing = syntheticRoutes.find(entry => entry.id === journey.routeId)!;
    return regionName(session, journey.leg === 'outbound' ? sailing.to : sailing.from);
  };
  const present = regionalDivisions(session.game, session.mobility, regionId)
    .filter(division => division.ownerId === session.game.playerCountryId);
  const capacityGroup = syntheticRoutes[0].capacityGroup;
  const stagedCount = session.transportDrafts.filter(order => order.kind === 'transport'
    && syntheticRoutes.some(entry => entry.id === order.routeId && entry.capacityGroup === capacityGroup
      && !session.mobility.closedRouteIds.includes(entry.id))).length;
  const slots = syntheticRoutes[0].slots;
  const canSail = syntheticRoutes.some(entry => !session.mobility.closedRouteIds.includes(entry.id));
  const remaining = canSail ? Math.max(0, slots - stagedCount) : 0;
  const closed = session.mobility.closedRouteIds.length === syntheticRoutes.length;

  function stage(order: TransportOrder) {
    if (session) commit({ ...session, transportDrafts: [...session.transportDrafts.filter(entry => entry.divisionId !== order.divisionId), order] });
  }

  return <main className="maritime-review maritime-shell">
    <header className="maritime-header">
      <div><h1>Maritime transport</h1><p>Alden · Week {session.game.week}</p></div>
      <button type="button" disabled={session.economy.defeated || reportOpen} onClick={nextWeek}>Next week</button>
    </header>
    {reportOpen && report ? <WeeklyReportPanel active report={report} availableWeeks={[report.week]} onSelectWeek={() => {}}
      onOpenRegion={id => { setRegionId(id); setReportOpen(false); }} onClose={() => setReportOpen(false)} /> :
      <div className="maritime-scroll">
        <div className="maritime-actions">
          <button type="button" onClick={() => { slot.schedule(session); slot.flush(); }}>Save now</button>
          {report && <button type="button" onClick={() => setReportOpen(true)}>Latest weekly report</button>}
          <button type="button" onClick={start}>New maritime game</button>
        </div>
        <p role="status">{saveStatus?.kind === 'saved' ? `Saved locally · Week ${saveStatus.week}`
          : saveStatus?.kind === 'saving' ? 'Saving locally…' : ''}</p>
        {saveStatus?.kind === 'failed' && <p role="alert">{saveStatus.message}</p>}
        {error && <p role="alert">{error}</p>}
        {session.economy.defeated && <p role="alert">Alden’s regime has been overthrown.</p>}
        <div className="maritime-grid">
          <section className="maritime-card" aria-labelledby="maritime-orders">
            <h2 id="maritime-orders">Transport orders</h2>
            <p>Shared capacity · {remaining} of {slots} slots unclaimed by staged orders</p>
            <p>Orders compete for slots when the week settles.</p>
            <label htmlFor="maritime-division">Division</label>
            <select id="maritime-division" value={selected?.id ?? ''} onChange={event => {
              setDivisionId(event.target.value);
              setRouteId('');
            }}>
              <option value="">Choose a division</option>
              {living.map(division => <option key={division.id} value={division.id}>{division.name}</option>)}
            </select>
            {selected && available.length > 0 && <>
              <label htmlFor="maritime-destination">Maritime destination</label>
              <select id="maritime-destination" value={route?.id ?? ''} onChange={event => setRouteId(event.target.value)}>
                <option value="">Choose a destination</option>
                {available.map(entry => <option key={entry.id} value={entry.id}>
                  {regionName(session, entry.to)} · {entry.weeks} {entry.weeks === 1 ? 'week' : 'weeks'}
                </option>)}
              </select>
              {route && <p>Expected arrival · Week {session.game.week + route.weeks}</p>}
              <button type="button" disabled={!route || session.economy.defeated} onClick={() => {
                if (route) stage({ kind: 'transport', divisionId: selected.id, routeId: route.id });
              }}>Stage transport</button>
            </>}
            {selected && !available.length && !underway(selected.id) && <p>No open route from this division’s location.</p>}
            {selected && underway(selected.id)?.leg === 'outbound' && <button type="button" disabled={session.economy.defeated}
              onClick={() => stage({ kind: 'return', divisionId: selected.id })}>Request return</button>}
            {selected && staged(selected.id) && <button type="button" onClick={() => {
              commit({ ...session, transportDrafts: session.transportDrafts.filter(order => order.divisionId !== selected.id) });
            }}>Cancel staged order</button>}
          </section>

          <section className="maritime-card" aria-labelledby="maritime-roster">
            <h2 id="maritime-roster">Divisions</h2>
            <ul className="maritime-list" aria-label="Division status">
              {living.map(division => {
                const journey = underway(division.id);
                const order = staged(division.id);
                const result = session.mobility.results.find(entry => entry.divisionId === division.id);
                const lastArrival = result?.kind === 'arrived' || result?.kind === 'returned';
                const status = journey ? journey.status === 'waiting' ? 'Waiting' : journey.leg === 'return' ? 'Returning' : 'Traveling'
                  : lastArrival ? 'Arrived' : 'In region';
                return <li key={division.id}>
                  <strong>{division.name}</strong>
                  <p>{status} · {journey ? destination(division.id) : regionName(session, division.regionId)}</p>
                  {journey && <p>{journey.status === 'waiting' && journey.dueWeek <= session.game.week
                    ? 'Arrival pending until access is restored.' : `Expected arrival · Week ${journey.dueWeek}`}</p>}
                  {order && <p>{order.kind === 'return' ? 'Return staged' : `Transport staged · ${regionName(session, syntheticRoutes.find(entry => entry.id === order.routeId)!.to)}`}</p>}
                </li>;
              })}
            </ul>
          </section>
          <section className="maritime-card" aria-labelledby="maritime-presence">
            <h2 id="maritime-presence">Regional presence</h2>
            <label htmlFor="maritime-region">Region</label>
            <select id="maritime-region" value={regionId} onChange={event => setRegionId(event.target.value)}>
              {session.game.regions.map(region => <option key={region.id} value={region.id}>{region.name}</option>)}
            </select>
            {present.length ? <ul className="maritime-list" aria-label="Divisions present">
              {present.map(division => <li key={division.id}>{division.name}</li>)}
            </ul> : <p>No Alden divisions present.</p>}
          </section>
          <details className="maritime-card">
            <summary>Route availability</summary>
            <p>Change the synthetic crossing’s availability to test interruptions.</p>
            <button type="button" onClick={() => commit({ ...session, mobility: { ...session.mobility,
              closedRouteIds: closed ? [] : syntheticRoutes.map(entry => entry.id) } })}>{closed ? 'Reopen crossing' : 'Close crossing'}</button>
          </details>
        </div>
      </div>}
  </main>;
}
