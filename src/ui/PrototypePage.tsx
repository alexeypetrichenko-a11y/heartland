import { useEffect, useRef, useState } from 'react';
import type { CountryId, GameState } from '../game/models';
import { RegionMap } from './RegionMap';

type PrototypePageProps = {
  state: GameState;
  onSelectCountry: (id: CountryId) => void;
  onAdvanceTurn: () => void;
  onBack: () => void;
};

export function PrototypePage({ state, onSelectCountry, onAdvanceTurn, onBack }: PrototypePageProps) {
  const [choice, setChoice] = useState('');
  const dashboardRef = useRef<HTMLHeadingElement>(null);
  const country = state.countries.find(country => country.id === state.playerCountryId);
  const regions = state.regions.filter(region => region.ownerId === country?.id);
  const divisions = state.divisions.filter(division => division.ownerId === country?.id);

  useEffect(() => {
    if (state.playerCountryId) dashboardRef.current?.focus();
  }, [state.playerCountryId]);

  return (
    <div className="prototype-content">
      <h1 id="view-title">Local prototype</h1>
      <p>Explore a small illustrative, fictional test world in a local single-player scenario. Advance one week at a time; economic, military and AI simulation are not implemented.</p>
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
          <div><dt>Orders</dt><dd>{state.standingOrders.length} standing orders — placeholder support only; no gameplay effects or order controls yet</dd></div>
          <div><dt>Status</dt><dd>{country ? 'Local scenario — time progression only' : 'Choose a country to start'}</dd></div>
        </dl>
        {country && (
          <>
            <button type="button" onClick={onAdvanceTurn}>Next week</button>
            <p>Each press advances exactly one week. Economic and military statistics stay unchanged. No timer or multiplayer.</p>
          </>
        )}
      </section>
      {country && (
        <section className="hud" aria-labelledby="dashboard-title">
          <h2 id="dashboard-title" ref={dashboardRef} tabIndex={-1}>{country.name} national dashboard</h2>
          <p>Temporary fictional statistics, not balanced game values. Economy and military data do not advance. Selection lasts until the page is reloaded.</p>
          <h3>Country control</h3>
          <ul>
            {state.countries.map(country => (
              <li key={country.id}>{country.name}: {country.controller === 'player' ? 'Player-controlled (you)' : 'AI-controlled (no behavior yet)'}</li>
            ))}
          </ul>
          <h3>Economy</h3>
          <p>Illustrative units; income and expenses are weekly fixture values only.</p>
          <dl>
            <div><dt>Treasury</dt><dd>{country.economy.treasury}</dd></div>
            <div><dt>Weekly income</dt><dd>{country.economy.weeklyIncome}</dd></div>
            <div><dt>Weekly expenses</dt><dd>{country.economy.weeklyExpenses}</dd></div>
          </dl>
          <h3>Your regions</h3>
          <ul>{regions.map(region => <li key={region.id}>{region.name}</li>)}</ul>
          <h3>Military</h3>
          <p>Divisions: {divisions.length}. Headcounts are temporary fixture values.</p>
          <ul>{divisions.map(division => (
            <li key={division.id}>
              {division.name} — {division.manpower} personnel; located in {state.regions.find(region => region.id === division.regionId)?.name}.
            </li>
          ))}</ul>
        </section>
      )}
      <RegionMap state={state} />
      <button type="button" onClick={onBack}>Back to title screen</button>
    </div>
  );
}
