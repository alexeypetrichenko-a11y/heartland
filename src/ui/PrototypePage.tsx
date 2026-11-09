import { useEffect, useRef, useState } from 'react';
import type { CountryId, EconomicPolicy, GameState, MilitaryCommand, TurnCommand } from '../game/models';
import { calculateWeeklyBudget, ECONOMIC_POLICIES, isEconomicPolicy } from '../game/economy';
import { RegionMap } from './RegionMap';
import { MilitaryPanel } from './MilitaryPanel';

type PrototypePageProps = {
  state: GameState;
  onSelectCountry: (id: CountryId) => void;
  onAdvanceTurn: (commands: readonly TurnCommand[]) => boolean;
  turnError: string | null;
  onBack: () => void;
};

export function PrototypePage({ state, onSelectCountry, onAdvanceTurn, turnError, onBack }: PrototypePageProps) {
  const [choice, setChoice] = useState('');
  const [policyChoice, setPolicyChoice] = useState<EconomicPolicy | null>(null);
  const [pendingMilitaryOrders, setPendingMilitaryOrders] = useState<MilitaryCommand[]>([]);
  const dashboardRef = useRef<HTMLHeadingElement>(null);
  const country = state.countries.find(country => country.id === state.playerCountryId);
  const regions = state.regions.filter(region => region.ownerId === country?.id);
  const budget = country ? calculateWeeklyBudget(country.economy, country.economicPolicy) : null;
  const nextPolicy = policyChoice ?? country?.economicPolicy ?? 'standard';

  function advanceWeek() {
    if (!country) return;
    const commands: TurnCommand[] = [...pendingMilitaryOrders];
    if (nextPolicy !== country.economicPolicy) commands.push({ type: 'set-economic-policy', countryId: country.id, policy: nextPolicy });
    if (onAdvanceTurn(commands)) setPendingMilitaryOrders([]);
  }

  useEffect(() => {
    if (state.playerCountryId) dashboardRef.current?.focus();
  }, [state.playerCountryId]);

  return (
    <div className="prototype-content">
      <h1 id="view-title">Local prototype</h1>
      <p>Explore a small illustrative, fictional test world in a local single-player scenario. Advance one week at a time with a provisional economy and land combat. AI decisions are not implemented.</p>
      {!country && (
        <section className="hud" aria-labelledby="country-choice-title">
          <h2 id="country-choice-title">Choose your country</h2>
          <p>Choose one country to control. The other two will be marked AI-controlled; AI behavior is not implemented.</p>
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
      )}
      <section aria-labelledby="hud-title" className="hud">
        <h2 id="hud-title">Game overview</h2>
        <dl>
          <div><dt>Country</dt><dd>{country?.name ?? 'Not selected'}</dd></div>
          <div><dt>Week</dt><dd aria-live="polite" aria-atomic="true">{country ? `Week ${state.week}` : 'Not started — choose a country'}</dd></div>
          <div><dt>Orders</dt><dd>{pendingMilitaryOrders.length} staged military orders; {state.standingOrders.length} placeholder standing orders. Active military orders appear below.</dd></div>
          <div><dt>Status</dt><dd>{country ? 'Local scenario — provisional economy and land combat' : 'Choose a country to start'}</dd></div>
        </dl>
        {country && (
          <>
            <button type="button" onClick={advanceWeek}>Next week</button>
            <p>Each successful press settles budgets, resolves military orders and advances one week. Invalid orders or insufficient funds reject the whole week without changes.</p>
            {turnError && <p role="alert">{turnError} Week not advanced. Review your staged orders and tax policy below, then try again.</p>}
          </>
        )}
      </section>
      {country && budget && (
        <section className="hud" aria-labelledby="dashboard-title">
          <h2 id="dashboard-title" ref={dashboardRef} tabIndex={-1}>{country.name} national dashboard</h2>
          <p>Temporary fictional statistics and rules, not balanced game values. This local scenario lasts until the page is reloaded.</p>
          <h3>Country control</h3>
          <ul>
            {state.countries.map(country => (
              <li key={country.id}>{country.name}: {country.controller === 'player' ? 'Player-controlled (you)' : 'AI-controlled (no behavior yet)'}</li>
            ))}
          </ul>
          <h3>Economy</h3>
          <p>Provisional whole illustrative units. Income and expenses below reflect the active policy each week.</p>
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
            {nextPolicy !== country.economicPolicy && <p role="status">Pending policy: {ECONOMIC_POLICIES[nextPolicy].label}. Press Next week to apply.</p>}
          </form>
          <h3>Your regions</h3>
          <ul>{regions.map(region => <li key={region.id}>{region.name}</li>)}</ul>
          <MilitaryPanel state={state} pendingOrders={pendingMilitaryOrders}
            onStageOrder={command => setPendingMilitaryOrders(orders => [...orders.filter(order => order.divisionId !== command.divisionId), command])}
            onDiscardOrders={() => setPendingMilitaryOrders([])} />
        </section>
      )}
      <RegionMap state={state} />
      <button type="button" onClick={onBack}>Back to title screen</button>
    </div>
  );
}
