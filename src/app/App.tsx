import { Component, lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createInitialState } from '../game/initialState';
import { selectCountry } from '../game/selectCountry';
import { advanceGameWeek, startEconomy, type EconomyCommand, type LoadedEconomy } from '../game/economyBridge';
import type { createLocalSaves, SaveAvailability, SaveStatus } from '../game/localSaves';
import type { CountryId, TurnCommand } from '../game/models';
import { emptyDrafts, type PlayerDrafts } from '../game/playerDrafts';
import type { EuropeScenario } from '../game/europeScenario';
import type { PlayableSession } from '../game/saveFormat';

const AtlasMap = lazy(() => import('../ui/AtlasMap'));
const PrototypePage = lazy(() => import('../ui/PrototypePage').then(module => ({ default: module.PrototypePage })));
const CountrySetup = lazy(() => import('../ui/PrototypePage').then(module => ({ default: module.CountrySetup })));
const europeEnabled = import.meta.env.PROD && import.meta.env.MODE === 'world04-local';
const storageUnavailable = { kind: 'unavailable', message: 'Local storage is unavailable.' } as const;

class ScreenBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <div className="atlas-startup" role="alert"><p>This screen could not load. Check your connection and reload the app.</p></div> : this.props.children;
  }
}

export function App() {
  const [view, setView] = useState<'atlas' | 'setup' | 'game'>('atlas');
  const [setupEurope, setSetupEurope] = useState<EuropeScenario | null>(null);
  const [scenarioChoice, setScenarioChoice] = useState<'fictional' | 'europe-2023'>('fictional');
  const [playing, setPlaying] = useState<PlayableSession | null>(null);
  const [gameKey, setGameKey] = useState(0);
  const [turnError, setTurnError] = useState<string | null>(null);
  const [availability, setAvailability] = useState<SaveAvailability | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [openingError, setOpeningError] = useState<string | null>(null);
  const sessionRef = useRef<PlayableSession | null>(null);
  const runtimeRef = useRef<LoadedEconomy | null>(null);
  const managerRef = useRef<ReturnType<typeof createLocalSaves> | null>(null);
  const probeRef = useRef<Promise<SaveAvailability> | null>(null);
  const opening = useRef(0);
  const mainRef = useRef<HTMLElement>(null);

  const inspectSave = useCallback(() => {
    probeRef.current ??= import('../game/localSaves').then(async ({ createLocalSaves }) => {
      managerRef.current = createLocalSaves(setSaveStatus, europeEnabled ? async () => {
        const { loadEuropeRuntime } = await import('../game/economyRuntime');
        return (await loadEuropeRuntime()).europe;
      } : undefined);
      const result = await managerRef.current.lookup();
      return result.kind === 'found' ? { kind: 'found' as const } : result;
    }).catch(() => storageUnavailable).then(result => {
      setAvailability(result);
      return result;
    });
    return probeRef.current;
  }, []);
  const atlasSettled = useCallback(() => { void inspectSave(); }, [inspectSave]);

  useEffect(() => {
    mainRef.current?.focus({ preventScroll: true });
  }, [view]);

  useEffect(() => {
    // A restored document opens on exploration without discarding its game.
    const restored = (event: PageTransitionEvent) => { if (event.persisted) setView('atlas'); };
    const flush = () => managerRef.current?.flush();
    const resumed = () => {
      if (document.visibilityState === 'hidden') flush();
      const standalone = (navigator as Navigator & { standalone?: boolean }).standalone === true || window.matchMedia('(display-mode: standalone)').matches;
      if (document.visibilityState === 'visible' && standalone) setView('atlas');
    };
    window.addEventListener('pageshow', restored);
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', resumed);
    return () => {
      window.removeEventListener('pageshow', restored);
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', resumed);
    };
  }, []);

  function commit(session: PlayableSession) {
    sessionRef.current = session;
    setPlaying(session);
  }

  function save(session: PlayableSession, delay = 0) {
    if (managerRef.current && runtimeRef.current) managerRef.current.schedule(runtimeRef.current, session, delay);
    else setSaveStatus({ kind: 'failed', message: storageUnavailable.message });
  }

  function openGame(runtime: LoadedEconomy, session: PlayableSession) {
    runtimeRef.current = runtime;
    commit(session);
    setGameKey(key => key + 1);
    setTurnError(null);
    setView('game');
  }

  async function openSetup() {
    const known = availability ?? await inspectSave();
    if (!availability && known.kind === 'found') return;
    if ((sessionRef.current || known.kind === 'found' || known.kind === 'unreadable')
      && !window.confirm('Start a new game and replace the local save when the game starts?')) return;
    setOpeningError(null);
    setScenarioChoice('fictional');
    setView('setup');
  }

  async function chooseScenario(choice: 'fictional' | 'europe-2023') {
    setScenarioChoice(choice);
    setOpeningError(null);
    if (choice === 'fictional' || setupEurope) return;
    const token = ++opening.current;
    setBusy(true);
    try {
      const { loadEuropeRuntime } = await import('../game/economyRuntime');
      const runtime = await loadEuropeRuntime();
      if (token === opening.current) setSetupEurope(runtime.europe);
    } catch (error) {
      if (token === opening.current) setOpeningError(error instanceof Error ? error.message : 'Europe 2023 could not load.');
    } finally {
      if (token === opening.current) setBusy(false);
    }
  }

  async function beginNewGame(countryId: CountryId) {
    const token = ++opening.current;
    setBusy(true);
    setOpeningError(null);
    try {
      const { loadEconomyRuntime, loadEuropeRuntime } = await import('../game/economyRuntime');
      const start = async () => {
        if (scenarioChoice === 'europe-2023') {
          const [runtime, { startEuropeGame }] = await Promise.all([loadEuropeRuntime(), import('../game/europeScenario')]);
          return { runtime, ...startEuropeGame(runtime, countryId) };
        }
        const runtime = await loadEconomyRuntime();
        const game = selectCountry(createInitialState(), countryId);
        return { runtime, game, economy: startEconomy(runtime, game) };
      };
      const { runtime, game, economy } = await start();
      if (token !== opening.current) return;
      const session = { game, economy, drafts: emptyDrafts() };
      openGame(runtime, session);
      save(session);
    } catch (error) {
      if (token === opening.current) setOpeningError(scenarioChoice === 'europe-2023' && error instanceof Error ? error.message
        : 'The local game could not start. Check your connection and try again.');
    } finally {
      if (token === opening.current) setBusy(false);
    }
  }

  async function resumeGame() {
    if (sessionRef.current) {
      setView('game');
      return;
    }
    setBusy(true);
    setOpeningError(null);
    try {
      const found = await managerRef.current?.lookup();
      if (found?.kind !== 'found') {
        setAvailability(found ?? storageUnavailable);
        if (found?.kind === 'empty') setOpeningError('The local save is no longer available.');
        return;
      }
      const [{ loadEconomyApi, loadEuropeRuntime }, { restoreGameSave }] = await Promise.all([
        import('../game/economyRuntime'),
        import('../game/saveFormat'),
      ]);
      const runtime = found.save.scenario ? await loadEuropeRuntime() : { api: await loadEconomyApi() };
      try {
        openGame(runtime, restoreGameSave(runtime, found.save));
        setSaveStatus({ kind: 'saved', week: found.save.game.week });
      } catch (error) {
        setAvailability({ kind: 'unreadable', message: error instanceof Error ? error.message : 'The local save could not be restored.' });
      }
    } catch {
      setOpeningError('The economy could not load. Check your connection and try Resume game again.');
    } finally {
      setBusy(false);
    }
  }

  function changeDrafts(drafts: PlayerDrafts) {
    const current = sessionRef.current;
    if (!current) return;
    const next = { ...current, drafts };
    commit(next);
    save(next, 180);
  }

  function handleAdvanceTurn(commands: readonly TurnCommand[], economyCommands: readonly EconomyCommand[]) {
    const runtime = runtimeRef.current;
    const current = sessionRef.current;
    if (!current || !runtime) return false;
    try {
      const next = { ...advanceGameWeek(runtime, current.game, current.economy, commands, economyCommands), drafts: emptyDrafts() };
      commit(next);
      save(next);
      setTurnError(null);
      return true;
    } catch (error) {
      setTurnError(error instanceof Error ? error.message : 'Unable to advance this week.');
      return false;
    }
  }

  function returnToGlobe() {
    ++opening.current;
    setBusy(false);
    setOpeningError(null);
    if (view === 'game' && sessionRef.current) save(sessionRef.current);
    setView('atlas');
  }

  const canResume = playing !== null || availability?.kind === 'found';
  const saveProblem = availability?.kind === 'unreadable' || availability?.kind === 'unavailable';
  const atlasError = openingError ?? (playing && saveStatus?.kind === 'failed' ? saveStatus.message
    : !playing && saveProblem ? availability.message : null);
  const runtime = runtimeRef.current;

  return (
    <main
      ref={mainRef}
      tabIndex={-1}
      aria-labelledby={view === 'atlas' ? 'atlas-home-title' : view === 'setup' ? 'country-setup-title' : 'view-title'}
      className="prototype"
    >
      {/* One atlas stays mounted across game navigation, retaining its camera. */}
      <div className="game-shell atlas-home" hidden={view !== 'atlas'}>
        <header className="game-topbar">
          <div className="game-title"><p className="brand">Heartland</p><h1 id="atlas-home-title">World</h1></div>
          {canResume && <button type="button" disabled={busy} onClick={() => void resumeGame()}>{busy ? 'Resuming…' : 'Resume game'}</button>}
          <button type="button" disabled={busy} onClick={() => void openSetup()}>
            {europeEnabled || canResume || availability?.kind === 'unreadable' ? 'New game' : 'Fictional game'}
          </button>
        </header>
        <div className="game-main">
          {atlasError && <p className="turn-error" role="alert">{atlasError}</p>}
          <ScreenBoundary><Suspense fallback={<div className="atlas-startup" role="status">Loading Earth…</div>}>
            <AtlasMap active={view === 'atlas'} onSettled={atlasSettled} />
          </Suspense></ScreenBoundary>
        </div>
      </div>
      {view === 'setup' && <ScreenBoundary><Suspense fallback={<div className="atlas-startup" role="status">Opening local game…</div>}>
        <CountrySetup busy={busy} error={openingError} onSelectCountry={id => void beginNewGame(id)} onBack={returnToGlobe}
          europeEnabled={europeEnabled} scenarioChoice={scenarioChoice} europe={setupEurope} onScenarioChoice={choice => void chooseScenario(choice)} />
      </Suspense></ScreenBoundary>}
      {/* Mount gameplay only on request, then retain all state and drafts. */}
      {playing && runtime && <div key={gameKey} hidden={view !== 'game'}>
        <ScreenBoundary><Suspense fallback={<div className="atlas-startup" role="status">Opening local game…</div>}><PrototypePage
          europe={runtime.europe}
          active={view === 'game'}
          state={playing.game}
          drafts={playing.drafts}
          onChangeDrafts={changeDrafts}
          onAdvanceTurn={handleAdvanceTurn}
          turnError={turnError}
          economy={playing.economy}
          fiscalApi={runtime.api}
          saveStatus={saveStatus}
          onSave={() => { if (sessionRef.current) save(sessionRef.current); }}
          onBack={returnToGlobe}
        /></Suspense></ScreenBoundary>
      </div>}
    </main>
  );
}
