import type { GameState } from '../game/models';
import { RegionMap } from './RegionMap';

type PrototypePageProps = {
  state: GameState;
  onBack: () => void;
};

export function PrototypePage({ state, onBack }: PrototypePageProps) {
  return (
    <div className="prototype-content">
      <h1 id="view-title">Local prototype</h1>
      <p>Explore a small illustrative, fictional test world. Gameplay is not implemented.</p>
      <section aria-labelledby="hud-title" className="hud">
        <h2 id="hud-title">Game overview</h2>
        <dl>
          <div><dt>Country</dt><dd>Not selected — placeholder only</dd></div>
          <div><dt>Week</dt><dd>Not started — no turns available</dd></div>
          <div><dt>Orders</dt><dd>Unavailable — no game logic yet</dd></div>
          <div><dt>Status</dt><dd>UI prototype only</dd></div>
        </dl>
      </section>
      <RegionMap state={state} />
      <button type="button" onClick={onBack}>Back to title screen</button>
    </div>
  );
}
