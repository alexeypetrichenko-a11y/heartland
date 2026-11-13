import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import type { CountryId, DiplomaticCommand, EconomicPolicy, GameState, MilitaryCommand, TurnCommand } from '../game/models';
import { ECONOMIC_POLICIES } from '../game/economy';
import { EconomyPanel } from './EconomyPanel';
import { DetailPanel } from './DetailPanel';
import { RegionMap } from './RegionMap';
import { MilitaryPanel } from './MilitaryPanel';
import { DiplomacyPanel } from './DiplomacyPanel';
import { AI_PRIORITIES } from '../game/ai';

const AtlasMap = lazy(() => import('./AtlasMap'));

type PrototypePageProps = {
  state: GameState;
  onSelectCountry: (id: CountryId) => void;
  onAdvanceTurn: (commands: readonly TurnCommand[]) => boolean;
  turnError: string | null;
  onBack: () => void;
};

const sections = [
  { id: 'world', label: 'World', icon: 'M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18Z M3 12h18 M12 3c3 3 3 15 0 18 M12 3c-3 3-3 15 0 18' },
  { id: 'politics', label: 'Politics', icon: 'M3 9l9-5 9 5 M5 10v8 M9.5 10v8 M14.5 10v8 M19 10v8 M3 20h18' },
  { id: 'economy', label: 'Economy', icon: 'M5 20V11 M12 20V5 M19 20v-7 M3 20h18' },
  { id: 'diplomacy', label: 'Diplomacy', icon: 'M9 7.5a4.5 4.5 0 1 0 0 9a4.5 4.5 0 0 0 0-9Z M15 7.5a4.5 4.5 0 1 0 0 9a4.5 4.5 0 0 0 0-9Z' },
  { id: 'military', label: 'Military', icon: 'M12 3l7 3v5c0 4.5-3 8-7 10c-4-2-7-5.5-7-10V6l7-3Z' },
] as const;
type Section = typeof sections[number]['id'];

export function PrototypePage({ state, onSelectCountry, onAdvanceTurn, turnError, onBack }: PrototypePageProps) {
  const [choice, setChoice] = useState('');
  const [showScenario, setShowScenario] = useState(false);
  const [activeSection, setActiveSection] = useState<Section>('world');
  const [showAtlas, setShowAtlas] = useState(false);
  const [atlasVisited, setAtlasVisited] = useState(false);
  const [policyChoice, setPolicyChoice] = useState<EconomicPolicy | null>(null);
  const [pendingMilitaryOrders, setPendingMilitaryOrders] = useState<MilitaryCommand[]>([]);
  const [pendingDiplomacy, setPendingDiplomacy] = useState<DiplomaticCommand | null>(null);
  const dashboardRef = useRef<HTMLHeadingElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const country = state.countries.find(country => country.id === state.playerCountryId);
  const regions = state.regions.filter(region => region.ownerId === country?.id);
  const nextPolicy = policyChoice ?? country?.economicPolicy ?? 'standard';
  const policyPending = country && nextPolicy !== country.economicPolicy;
  const hasDrafts = policyPending || pendingMilitaryOrders.length > 0 || pendingDiplomacy;

  function advanceWeek() {
    if (!country) return;
    const commands: TurnCommand[] = [...pendingMilitaryOrders];
    if (pendingDiplomacy) commands.push(pendingDiplomacy);
    if (nextPolicy !== country.economicPolicy) commands.push({ type: 'set-economic-policy', countryId: country.id, policy: nextPolicy });
    if (onAdvanceTurn(commands)) {
      setPendingMilitaryOrders([]);
      setPendingDiplomacy(null);
    } else {
      // Bring the shared error into view even when the current section is scrolled.
      requestAnimationFrame(() => errorRef.current?.focus());
    }
  }

  useEffect(() => {
    dashboardRef.current?.focus({ preventScroll: true });
  }, [state.playerCountryId, activeSection]);

  if (!country) return (
    <div className="prototype-content country-setup">
      <h1 id="view-title">Local prototype</h1>
      <p>Explore a small illustrative, fictional test world in a local single-player scenario.</p>
      <section className="hud" aria-labelledby="country-choice-title">
        <h2 id="country-choice-title">Choose your country</h2>
        <p>Choose one country to control. The other two make one autonomous diplomatic decision each week.</p>
        <form onSubmit={event => {
          event.preventDefault();
          if (choice) onSelectCountry(choice);
        }}>
          <label htmlFor="player-country">Player country</label>
          <select id="player-country" value={choice} onChange={event => setChoice(event.target.value)} required>
            <option value="" disabled>Select a country</option>
            {state.countries.map(country => <option key={country.id} value={country.id}>{country.name}</option>)}
          </select>
          <button type="submit" disabled={!choice}>Start local scenario</button>
        </form>
      </section>
      <RegionMap state={state} />
      <button type="button" onClick={onBack}>Back to title screen</button>
    </div>
  );

  return (
    <div className="game-shell">
      <header className="game-topbar">
        <div className="game-title">
          <p className="brand"><span className="brand-name">Heartland · </span>{country.name}</p>
          <h1 id="view-title" ref={dashboardRef} tabIndex={-1}>{sections.find(section => section.id === activeSection)!.label}</h1>
        </div>
        <dl className="game-meta" aria-label={`${country.name} status`}>
          <div><dt className="sr-only">Week</dt><dd aria-live="polite" aria-atomic="true">Week {state.week}</dd></div>
          <div><dt className="sr-only">Treasury</dt><dd><span aria-hidden="true">¤ </span>{country.economy.treasury}</dd></div>
        </dl>
        <button className="next-week" type="button" onClick={advanceWeek}>Next week</button>
        <button className="icon-button" type="button" onClick={() => setShowScenario(value => !value)} aria-label="Scenario menu" aria-controls="scenario-details" aria-expanded={showScenario}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
        </button>
      </header>

      <div className="game-main">
        {hasDrafts && <p className="turn-status" role="status">
          Drafts: {pendingMilitaryOrders.length} military · {pendingDiplomacy ? 1 : 0} diplomacy{policyPending && ` · ${ECONOMIC_POLICIES[nextPolicy].label}`}
        </p>}
        {turnError && <p className="turn-error" ref={errorRef} tabIndex={-1} role="alert">
          {turnError} Week not advanced. Your drafts are retained; review orders and tax policy, then try again.
        </p>}

        {/* Mounted, hidden views retain map selection, unfinished forms and staged commands. */}
        <div className="game-workspace" hidden={showScenario}>
          <div id="section-world" className="section-view" hidden={activeSection !== 'world'}>
            <div className="section-view" hidden={showAtlas}><RegionMap state={state} /></div>
            {atlasVisited && <div className="section-view" hidden={!showAtlas}><Suspense fallback={<p className="atlas-caption" role="status">Opening world atlas…</p>}>
              <AtlasMap active={showAtlas && activeSection === 'world' && !showScenario} onBack={() => setShowAtlas(false)} />
            </Suspense></div>}
          </div>
          <div id="section-politics" className="section-view" hidden={activeSection !== 'politics'}>
            <section className="overview" aria-labelledby="politics-title">
              <h2 id="politics-title" className="sr-only">Politics</h2>
              <div className="group"><h3>Domestic affairs</h3><div className="card placeholder">
                <b>Domestic stability and regime management</b><p>Planned for a future update. Political mechanics are not implemented yet.</p>
              </div></div>
            </section>
          </div>
          <div id="section-economy" className="section-view" hidden={activeSection !== 'economy'}>
            <EconomyPanel country={country} nextPolicy={nextPolicy} onChangePolicy={setPolicyChoice} />
          </div>
          <div id="section-diplomacy" className="section-view" hidden={activeSection !== 'diplomacy'}>
            <DiplomacyPanel state={state} pendingAction={pendingDiplomacy} onStageAction={setPendingDiplomacy} />
          </div>
          <div id="section-military" className="section-view" hidden={activeSection !== 'military'}>
            <MilitaryPanel state={state} pendingOrders={pendingMilitaryOrders}
              onStageOrder={command => setPendingMilitaryOrders(orders => [...orders.filter(order => order.divisionId !== command.divisionId), command])}
              onDiscardOrders={() => setPendingMilitaryOrders([])} />
          </div>
        </div>
        <DetailPanel id="scenario-details" title="Scenario information" open={showScenario} onClose={() => setShowScenario(false)}>
          <p>Local single-player prototype · Fictional test world. Temporary statistics and provisional rules, not balanced game values.</p>
          <p>Next week applies all staged diplomacy, runs AI diplomatic decisions, settles budgets and resolves military orders. Invalid orders or insufficient funds reject the whole week without changes.</p>
          <p>Active state stays in memory through title navigation. Reloading resets it; leaving the prototype discards unapplied drafts. Placeholder standing orders: {state.standingOrders.length}.</p>
          <h3>Country control</h3>
          <ul>{state.countries.map(country => <li key={country.id}>{country.name}: {country.controller === 'player' ? 'Player-controlled (you)' : `AI-controlled — ${AI_PRIORITIES[country.id].label}`}</li>)}</ul>
          <h3>Your regions</h3><ul>{regions.map(region => <li key={region.id}>{region.name}</li>)}</ul>
          <button type="button" onClick={() => { setAtlasVisited(true); setShowAtlas(true); setActiveSection('world'); setShowScenario(false); }}>Open world atlas</button>
          <button type="button" onClick={onBack}>Back to title screen</button>
        </DetailPanel>
      </div>

      <nav className="game-nav" aria-label="Game sections">
        {sections.map(section => <button key={section.id} type="button" aria-current={activeSection === section.id ? 'page' : undefined}
          aria-controls={`section-${section.id}`} onClick={() => { setActiveSection(section.id); setShowScenario(false); }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={section.icon} /></svg>
          <span className="nav-label">{section.label}</span>
        </button>)}
      </nav>
    </div>
  );
}
