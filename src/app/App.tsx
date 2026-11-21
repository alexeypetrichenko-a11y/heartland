import { Component, lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { createInitialState } from '../game/initialState';
import { selectCountry } from '../game/selectCountry';
import { advanceGameWeek, startEconomy, type EconomyCommand, type EconomyRuntime, type EconomySnapshot } from '../game/economyBridge';
import type { CountryId, GameState, TurnCommand } from '../game/models';

const AtlasMap = lazy(() => import('../ui/AtlasMap'));
const PrototypePage = lazy(() => import('../ui/PrototypePage').then(module => ({ default: module.PrototypePage })));

class ScreenBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <div className="atlas-startup" role="alert"><p>This screen could not load. Check your connection and reload the app.</p></div> : this.props.children;
  }
}

export function App() {
  const [view, setView] = useState<'atlas' | 'prototype'>('atlas');
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [turnError, setTurnError] = useState<string | null>(null);
  // The economic engine's session is the only economy (INT-01). It is created when a fictional game
  // starts (country chosen), never for the globe; the engine and the week-1 save are loaded then.
  const [economy, setEconomy] = useState<EconomySnapshot | null>(null);
  const [economyStatus, setEconomyStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [economyError, setEconomyError] = useState<string | null>(null);
  const runtimeRef = useRef<EconomyRuntime | null>(null);
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    mainRef.current?.focus({ preventScroll: true });
  }, [view]);

  useEffect(() => {
    // A restored document opens on exploration without discarding its game.
    const restored = (event: PageTransitionEvent) => { if (event.persisted) setView('atlas'); };
    const resumed = () => {
      const standalone = (navigator as Navigator & { standalone?: boolean }).standalone === true || window.matchMedia('(display-mode: standalone)').matches;
      if (document.visibilityState === 'visible' && standalone) setView('atlas');
    };
    window.addEventListener('pageshow', restored);
    document.addEventListener('visibilitychange', resumed);
    return () => { window.removeEventListener('pageshow', restored); document.removeEventListener('visibilitychange', resumed); };
  }, []);

  async function startGameEconomy(game: GameState) {
    setEconomy(null);
    setEconomyStatus('loading');
    setEconomyError(null);
    try {
      if (!runtimeRef.current) {
        const { loadEconomyRuntime } = await import('../game/economyRuntime');
        runtimeRef.current = await loadEconomyRuntime();
      }
      setEconomy(startEconomy(runtimeRef.current, game));
      setEconomyStatus('ready');
    } catch (error) {
      setEconomyStatus('failed');
      setEconomyError(error instanceof Error ? error.message : null);
    }
  }

  function handleSelectCountry(countryId: CountryId) {
    if (!gameState) return;
    const game = selectCountry(gameState, countryId);
    setGameState(game);
    void startGameEconomy(game);
  }

  function handleAdvanceTurn(commands: readonly TurnCommand[], economyCommands: readonly EconomyCommand[]) {
    const runtime = runtimeRef.current;
    if (!gameState?.playerCountryId || !runtime || !economy) return false;
    try {
      // One atomic week: game (diplomacy, AI, military) then economy; both are committed only if both succeed.
      const next = advanceGameWeek(runtime, gameState, economy, commands, economyCommands);
      setGameState(next.game);
      setEconomy(next.economy);
      setTurnError(null);
      return true;
    } catch (error) {
      setTurnError(error instanceof Error ? error.message : 'Unable to advance this week.');
      return false;
    }
  }

  function openPrototype() {
    setGameState(state => state ?? createInitialState());
    setView('prototype');
  }

  return (
    <main
      ref={mainRef}
      tabIndex={-1}
      aria-labelledby={view === 'atlas' ? 'atlas-home-title' : 'view-title'}
      className="prototype"
    >
      {/* One atlas stays mounted across game navigation, retaining its camera. */}
      <div className="game-shell atlas-home" hidden={view !== 'atlas'}>
        <header className="game-topbar">
          <div className="game-title"><p className="brand">Heartland</p><h1 id="atlas-home-title">World</h1></div>
          <button type="button" onClick={openPrototype}>{gameState?.playerCountryId ? 'Resume game' : 'Fictional game'}</button>
        </header>
        <div className="game-main">
          <ScreenBoundary><Suspense fallback={<div className="atlas-startup" role="status">Loading Earth…</div>}>
            <AtlasMap active={view === 'atlas'} />
          </Suspense></ScreenBoundary>
        </div>
      </div>
      {/* Mount gameplay only on request, then retain all state and drafts. */}
      {gameState && <div hidden={view !== 'prototype'}>
        <ScreenBoundary><Suspense fallback={<div className="atlas-startup" role="status">Opening fictional game…</div>}><PrototypePage
          active={view === 'prototype'}
          state={gameState}
          onSelectCountry={handleSelectCountry}
          onAdvanceTurn={handleAdvanceTurn}
          turnError={turnError}
          economy={economy}
          fiscalApi={runtimeRef.current?.api}
          economyStatus={economyStatus}
          economyError={economyError}
          onRetryEconomy={() => { if (gameState?.playerCountryId) void startGameEconomy(gameState); }}
          onBack={() => setView('atlas')}
        /></Suspense></ScreenBoundary>
      </div>}
    </main>
  );
}
