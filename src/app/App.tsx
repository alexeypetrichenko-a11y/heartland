import { useEffect, useRef, useState } from 'react';
import { HomePage } from '../ui/HomePage';
import { PrototypePage } from '../ui/PrototypePage';

export function App() {
  const [view, setView] = useState<'home' | 'prototype'>('home');
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
        <PrototypePage onBack={() => setView('home')} />
      )}
    </main>
  );
}
