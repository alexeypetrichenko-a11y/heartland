import { useEffect, useRef, useState } from 'react';
import type { CountryId, DiplomaticCommand, EconomicPolicy, GameState, MilitaryCommand, TurnCommand } from '../game/models';
import { calculateWeeklyBudget, ECONOMIC_POLICIES, isEconomicPolicy } from '../game/economy';
import { RegionMap } from './RegionMap';
import { MilitaryPanel } from './MilitaryPanel';
import { DiplomacyPanel } from './DiplomacyPanel';
import { AI_PRIORITIES } from '../game/ai';

type PrototypePageProps = {
  state: GameState;
  onSelectCountry: (id: CountryId) => void;
  onAdvanceTurn: (commands: readonly TurnCommand[]) => boolean;
  turnError: string | null;
  onBack: () => void;
};

const sections = [
  { id: 'world', label: 'World' },
  { id: 'politics', label: 'Politics' },
  { id: 'economy', label: 'Economy' },
  { id: 'diplomacy', label: 'Diplomacy' },
  { id: 'military', label: 'Military' },
] as const;
type Section = typeof sections[number]['id'];

export function PrototypePage({ state, onSelectCountry, onAdvanceTurn, turnError, onBack }: PrototypePageProps) {
  const [choice, setChoice] = useState('');
  const [activeSection, setActiveSection] = useState<Section>('world');
  const [policyChoice, setPolicyChoice] = useState<EconomicPolicy | null>(null);
  const [pendingMilitaryOrders, setPendingMilitaryOrders] = useState<MilitaryCommand[]>([]);
  const [pendingDiplomacy, setPendingDiplomacy] = useState<DiplomaticCommand | null>(null);
  const dashboardRef = useRef<HTMLHeadingElement>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const country = state.countries.find(country => country.id === state.playerCountryId);
  const regions = state.regions.filter(region => region.ownerId === country?.id);
  const budget = country ? calculateWeeklyBudget(country.economy, country.economicPolicy) : null;
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
    if (state.playerCountryId) dashboardRef.current?.focus();
  }, [state.playerCountryId]);

  useEffect(() => {
    workspaceRef.current?.querySelector<HTMLElement>(`#section-${activeSection} h2`)?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }, [activeSection]);

  if (!country || !budget) return (
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
          <p>Heartland · Local prototype</p>
          <h1 id="view-title" ref={dashboardRef} tabIndex={-1}>{country.name}</h1>
        </div>
        <button className="title-button" type="button" onClick={onBack} aria-label="Back to title screen">Title</button>
        <dl className="game-meta">
          <div><dt>Week</dt><dd aria-live="polite" aria-atomic="true">Week {state.week}</dd></div>
          <div><dt>Treasury</dt><dd>{country.economy.treasury}</dd></div>
        </dl>
        <button className="next-week" type="button" onClick={advanceWeek}>Next week</button>
      </header>

      <nav className="game-nav" aria-label="Game sections">
        {sections.map(section => (
          <button key={section.id} type="button" aria-current={activeSection === section.id ? 'page' : undefined}
            aria-controls={`section-${section.id}`} onClick={() => setActiveSection(section.id)}>
            {section.label}
          </button>
        ))}
      </nav>

      <div className="game-main">
        <p className="turn-status" role="status">
          {hasDrafts ? <>Next week applies all drafts: {pendingMilitaryOrders.length} military orders · {pendingDiplomacy ? 1 : 0} diplomatic actions{policyPending && ` · ${ECONOMIC_POLICIES[nextPolicy].label}`}.</>
            : 'No staged changes. Active policies and orders continue next week.'}
        </p>
        {turnError && <p className="turn-error" ref={errorRef} tabIndex={-1} role="alert">
          {turnError} Week not advanced. Review your military orders, diplomacy and economy, then try again. Your drafts are retained.
        </p>}

        {/* Keep views mounted so navigation preserves map selection and unfinished forms. */}
        <div className="game-workspace" ref={workspaceRef}>
          <div id="section-world" className="section-view" hidden={activeSection !== 'world'}>
            <RegionMap state={state} />
            <details className="scenario-info">
              <summary>Scenario information</summary>
              <p>Temporary fictional statistics and rules, not balanced game values. Advance one week at a time with a provisional economy, land combat and diplomacy. AI countries make simple local diplomatic decisions.</p>
              <p>Each successful Next week applies diplomacy, runs AI diplomatic decisions, settles budgets and resolves military orders. Invalid orders or insufficient funds reject the whole week without changes.</p>
              <p>This local scenario stays in memory through title navigation. Reloading resets it; leaving the prototype discards unapplied drafts. Placeholder standing orders: {state.standingOrders.length}.</p>
              <h3>Country control</h3>
              <ul>{state.countries.map(country => (
                <li key={country.id}>{country.name}: {country.controller === 'player' ? 'Player-controlled (you)' : `AI-controlled — ${AI_PRIORITIES[country.id].label}`}</li>
              ))}</ul>
              <h3>Your regions</h3>
              <ul>{regions.map(region => <li key={region.id}>{region.name}</li>)}</ul>
            </details>
          </div>

          <div id="section-politics" className="section-view hud" hidden={activeSection !== 'politics'}>
            <section aria-labelledby="politics-title">
              <h2 id="politics-title" tabIndex={-1}>Politics</h2>
              <p>Domestic stability and regime management are planned for a future update. Political mechanics are not implemented yet.</p>
            </section>
          </div>

          <div id="section-economy" className="section-view hud" hidden={activeSection !== 'economy'}>
            <section aria-labelledby="economy-title">
              <h2 id="economy-title" tabIndex={-1}>Economy</h2>
              <p>Provisional whole illustrative units. Income and expenses reflect the active policy each week.</p>
              <div className="economy-layout">
                <dl>
                  <div><dt>Treasury</dt><dd>{country.economy.treasury}</dd></div>
                  <div><dt>Weekly income</dt><dd>{budget.income}</dd></div>
                  <div><dt>Weekly expenses</dt><dd>{budget.expenses}</dd></div>
                  <div><dt>Weekly balance</dt><dd>{budget.balance > 0 ? '+' : ''}{budget.balance}</dd></div>
                  <div><dt>Active policy</dt><dd>{ECONOMIC_POLICIES[country.economicPolicy].label}</dd></div>
                  <div><dt>Weekly policy effect on income</dt><dd>{budget.income - country.economy.weeklyIncome}</dd></div>
                </dl>
                <form onSubmit={event => event.preventDefault()}>
                  <label htmlFor="economic-policy">Tax policy for next week</label>
                  <select id="economic-policy" value={nextPolicy} aria-describedby="policy-help" onChange={event => {
                    if (isEconomicPolicy(event.target.value)) setPolicyChoice(event.target.value);
                  }}>
                    <option value="standard">Standard taxation</option>
                    <option value="tax-relief">Tax relief</option>
                  </select>
                  <p id="policy-help">Standard taxation uses base income ({country.economy.weeklyIncome}). Tax relief reduces income by up to {ECONOMIC_POLICIES['tax-relief'].incomeReduction} each week, with a floor of zero. Expenses stay fixed. Your choice takes effect with Next week and stays active until changed.</p>
                  {policyPending && <p role="status">Pending policy: {ECONOMIC_POLICIES[nextPolicy].label}. Press Next week to apply.</p>}
                </form>
              </div>
            </section>
          </div>

          <div id="section-diplomacy" className="section-view hud" hidden={activeSection !== 'diplomacy'}>
            <DiplomacyPanel state={state} pendingAction={pendingDiplomacy} onStageAction={setPendingDiplomacy} />
          </div>

          <div id="section-military" className="section-view hud" hidden={activeSection !== 'military'}>
            <MilitaryPanel state={state} pendingOrders={pendingMilitaryOrders}
              onStageOrder={command => setPendingMilitaryOrders(orders => [...orders.filter(order => order.divisionId !== command.divisionId), command])}
              onDiscardOrders={() => setPendingMilitaryOrders([])} />
          </div>
        </div>
      </div>
    </div>
  );
}
