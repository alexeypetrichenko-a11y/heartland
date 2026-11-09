import { useEffect, useRef, useState } from 'react';
import { HomePage } from '../ui/HomePage';
import { PrototypePage } from '../ui/PrototypePage';
import { createInitialState } from '../game/initialState';
import { selectCountry } from '../game/selectCountry';
import { advanceTurn } from '../game/advanceTurn';
import type { TurnCommand } from '../game/models';

export function App() {
  const [view, setView] = useState<'home' | 'prototype'>('home');
  const [gameState, setGameState] = useState(createInitialState);
  const [turnError, setTurnError] = useState<string | null>(null);
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    mainRef.current?.focus();
  }, [view]);

  function handleAdvanceTurn(commands: readonly TurnCommand[]) {
    try {
      const nextState = advanceTurn(gameState, commands);
      setGameState(nextState);
      setTurnError(null);
      return true;
    } catch (error) {
      setTurnError(error instanceof Error ? error.message : 'Unable to advance this week.');
      return false;
    }
  }

  return (
    <main
      ref={mainRef}
      tabIndex={-1}
      aria-labelledby="view-title"
      className={view === 'home' ? 'home' : 'prototype'}
    >
      {view === 'home' ? (
        <HomePage onOpenPrototype={() => setView('prototype')} />
      ) : (
        <PrototypePage
          state={gameState}
          onSelectCountry={id => setGameState(state => selectCountry(state, id))}
          onAdvanceTurn={handleAdvanceTurn}
          turnError={turnError}
          onBack={() => setView('home')}
        />
      )}
    </main>
  );
}
