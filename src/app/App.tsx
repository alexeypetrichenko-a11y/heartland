import { useEffect, useRef, useState } from 'react';
import { HomePage } from '../ui/HomePage';
import { PrototypePage } from '../ui/PrototypePage';
import { createInitialState } from '../game/initialState';
import { selectCountry } from '../game/selectCountry';

export function App() {
  const [view, setView] = useState<'home' | 'prototype'>('home');
  const [gameState, setGameState] = useState(createInitialState);
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    mainRef.current?.focus();
  }, [view]);

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
          onBack={() => setView('home')}
        />
      )}
    </main>
  );
}
