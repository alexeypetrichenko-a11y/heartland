import { useEffect, useRef, useState } from 'react';
import type { CountryId, GameState, TurnCommand } from '../game/models';
import type { EconomyCommand, EconomySnapshot } from '../game/economyBridge';
import { createInitialState } from '../game/initialState';
import type { SaveStatus } from '../game/localSaves';
import type { PlayerDrafts } from '../game/playerDrafts';
import { EconomyPanel } from './EconomyPanel';
import { formatMoney, headlineNotice } from './economyDashboard';
import { reviewFiscalDraft, type FiscalApi } from './fiscalDraft';
import { DetailPanel } from './DetailPanel';
import { RegionMap } from './RegionMap';
import { MilitaryPanel } from './MilitaryPanel';
import { DiplomacyPanel } from './DiplomacyPanel';
import { AI_PRIORITIES } from '../game/ai';

type PrototypePageProps = {
  active: boolean;
  state: GameState;
  drafts: PlayerDrafts;
  onChangeDrafts: (drafts: PlayerDrafts) => void;
  onAdvanceTurn: (commands: readonly TurnCommand[], economyCommands: readonly EconomyCommand[]) => boolean;
  turnError: string | null;
  onBack: () => void;
  economy: EconomySnapshot;
  fiscalApi: FiscalApi;
  saveStatus: SaveStatus | null;
  onSave: () => void;
};

export function CountrySetup({ busy, error, onSelectCountry, onBack }: {
  busy: boolean; error: string | null; onSelectCountry: (id: CountryId) => void; onBack: () => void;
}) {
  const [state] = useState(createInitialState);
  const [choice, setChoice] = useState('');
  return (
    <div className="prototype-content country-setup">
      <h1 id="country-setup-title">Local prototype</h1>
      <p>Explore a small illustrative, fictional test world in a local single-player scenario.</p>
      <section className="hud" aria-labelledby="country-choice-title">
        <h2 id="country-choice-title">Choose your country</h2>
        <p>Choose one country to control. The other two make one autonomous diplomatic decision each week.</p>
        <form onSubmit={event => {
          event.preventDefault();
          if (choice && !busy) onSelectCountry(choice);
        }}>
          <label htmlFor="player-country">Player country</label>
          <select id="player-country" value={choice} onChange={event => setChoice(event.target.value)} disabled={busy} required>
            <option value="" disabled>Select a country</option>
            {state.countries.map(country => <option key={country.id} value={country.id}>{country.name}</option>)}
          </select>
          <button type="submit" disabled={!choice || busy}>Start local scenario</button>
        </form>
        {busy && <p role="status">Preparing the economy…</p>}
        {error && <p className="turn-error" role="alert">{error}</p>}
      </section>
      <RegionMap state={state} />
      <button type="button" onClick={onBack}>Back to globe</button>
    </div>
  );
}

const sections = [
  { id: 'world', label: 'World', icon: 'M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18Z M3 12h18 M12 3c3 3 3 15 0 18 M12 3c-3 3-3 15 0 18' },
  { id: 'politics', label: 'Politics', icon: 'M3 9l9-5 9 5 M5 10v8 M9.5 10v8 M14.5 10v8 M19 10v8 M3 20h18' },
  { id: 'economy', label: 'Economy', icon: 'M5 20V11 M12 20V5 M19 20v-7 M3 20h18' },
  { id: 'diplomacy', label: 'Diplomacy', icon: 'M9 7.5a4.5 4.5 0 1 0 0 9a4.5 4.5 0 0 0 0-9Z M15 7.5a4.5 4.5 0 1 0 0 9a4.5 4.5 0 0 0 0-9Z' },
  { id: 'military', label: 'Military', icon: 'M12 3l7 3v5c0 4.5-3 8-7 10c-4-2-7-5.5-7-10V6l7-3Z' },
] as const;
type Section = typeof sections[number]['id'];

export function PrototypePage({ active, state, drafts, onChangeDrafts, onAdvanceTurn, turnError, onBack, economy, fiscalApi, saveStatus, onSave }: PrototypePageProps) {
  const [showScenario, setShowScenario] = useState(false);
  const [activeSection, setActiveSection] = useState<Section>('world');
  const { military, diplomacy, fiscal: proposedFiscal } = drafts;
  const dashboardRef = useRef<HTMLHeadingElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const country = state.countries.find(country => country.id === state.playerCountryId);
  const regions = state.regions.filter(region => region.ownerId === country?.id);
  const fiscal = reviewFiscalDraft(fiscalApi, economy, proposedFiscal);
  const fiscalCount = fiscal?.commands.length ?? 0;
  const draftSummary = [
    military.length > 0 ? `${military.length} military` : '',
    diplomacy ? '1 diplomacy' : '',
    fiscalCount ? `${fiscalCount} fiscal` : '',
  ].filter(Boolean).join(' · ');
  const defeated = economy.defeated;
  const headline = headlineNotice(economy.notices);

  function advanceWeek() {
    if (defeated || !fiscal) return;
    const commands: TurnCommand[] = [...military];
    if (diplomacy) commands.push(diplomacy);
    if (!onAdvanceTurn(commands, fiscal.commands)) {
      // Bring the shared error into view even when the current section is scrolled.
      requestAnimationFrame(() => errorRef.current?.focus());
    }
  }

  useEffect(() => {
    if (active) dashboardRef.current?.focus({ preventScroll: true });
  }, [state.playerCountryId, activeSection, active]);

  if (!country || !fiscal) throw new Error('The game has no matching player economy.');

  return (
    <div className="game-shell">
      <header className="game-topbar">
        <div className="game-title">
          <p className="brand"><span className="brand-name">Heartland · </span>{country.name}</p>
          <h1 id="view-title" ref={dashboardRef} tabIndex={-1}>{sections.find(section => section.id === activeSection)!.label}</h1>
        </div>
        <dl className="game-meta" aria-label={`${country.name} status`}>
          <div><dt className="sr-only">Week</dt><dd aria-live="polite" aria-atomic="true">Week {state.week}</dd></div>
          <div><dt className="sr-only">Treasury</dt><dd><span aria-hidden="true">¤ </span>{formatMoney(economy.player.treasury)}</dd></div>
        </dl>
        <button className="next-week" type="button" onClick={advanceWeek} disabled={defeated}
          title={defeated ? 'The game is over' : undefined}>Next week</button>
        <button className="icon-button" type="button" onClick={() => setShowScenario(value => !value)} aria-label="Scenario menu" aria-controls="scenario-details" aria-expanded={showScenario}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
        </button>
      </header>

      <div className="game-main">
        {defeated && <p className="turn-error" role="alert">
          <b>Your regime has been overthrown. The game is over.</b> {headline?.severity === 'defeat' ? headline.message : ''} You can still review the final state.
        </p>}
        {!defeated && headline && <p className="turn-status" role="status"><b>{headline.title}.</b> {headline.message}</p>}
        {saveStatus?.kind === 'failed' && <p className="turn-error" role="alert">{saveStatus.message}</p>}
        {draftSummary && <p className="turn-status" role="status">Drafts · {draftSummary}</p>}
        {turnError && <p className="turn-error" ref={errorRef} tabIndex={-1} role="alert">
          {turnError} Week not advanced. Your drafts are retained; review your orders, then try again.
        </p>}

        {/* Mounted, hidden views retain map selection, unfinished forms and staged commands. */}
        <div className="game-workspace" hidden={showScenario}>
          <div id="section-world" className="section-view" hidden={activeSection !== 'world'}>
            <RegionMap state={state} />
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
            <EconomyPanel week={state.week} economy={economy}
              fiscal={fiscal} onFiscalChange={(field, value) => onChangeDrafts({ ...drafts, fiscal: { ...proposedFiscal, [field]: value } })} />
          </div>
          <div id="section-diplomacy" className="section-view" hidden={activeSection !== 'diplomacy'}>
            <DiplomacyPanel state={state} pendingAction={diplomacy} onStageAction={action => onChangeDrafts({ ...drafts, diplomacy: action })} />
          </div>
          <div id="section-military" className="section-view" hidden={activeSection !== 'military'}>
            <MilitaryPanel state={state} pendingOrders={military}
              onStageOrder={command => onChangeDrafts({ ...drafts, military: [...military.filter(order => order.divisionId !== command.divisionId), command] })}
              onDiscardOrders={() => onChangeDrafts({ ...drafts, military: [] })} />
          </div>
        </div>
        <DetailPanel id="scenario-details" title="Scenario information" open={showScenario} onClose={() => setShowScenario(false)}>
          <p>Local single-player prototype · Fictional test world. Temporary statistics and provisional rules, not balanced game values.</p>
          <p>Next week resolves diplomacy and military orders, then applies fiscal drafts and advances the economy for the same week. Captured regions enter economic occupation and retain their legal owner. An invalid order rejects the entire week and retains every draft.</p>
          <p>Heartland saves this game and its drafts in this browser. Clearing website data or Safari removing stored data can erase the save.</p>
          {saveStatus && saveStatus.kind !== 'failed' && <p role="status">
            {saveStatus.kind === 'saving' ? 'Saving locally…' : `Saved locally · Week ${saveStatus.week}`}
          </p>}
          <h3>Country control</h3>
          <ul>{state.countries.map(country => <li key={country.id}>{country.name}: {country.controller === 'player' ? 'Player-controlled (you)' : `AI-controlled — ${AI_PRIORITIES[country.id].label}`}</li>)}</ul>
          <h3>Your regions</h3><ul>{regions.map(region => <li key={region.id}>{region.name}</li>)}</ul>
          <div className="scenario-save-actions">
            <button type="button" onClick={onSave}>Save now</button>
            <button type="button" onClick={() => { setShowScenario(false); onBack(); }}>Return to globe</button>
          </div>
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
