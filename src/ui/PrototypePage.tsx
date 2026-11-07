type PrototypePageProps = {
  onBack: () => void;
};

export function PrototypePage({ onBack }: PrototypePageProps) {
  return (
    <div className="prototype-content">
      <h1 id="view-title">Local prototype</h1>
      <p>This is a game-view placeholder, not a working game. Gameplay is not implemented.</p>
      <section aria-labelledby="hud-title" className="hud">
        <h2 id="hud-title">Game overview</h2>
        <dl>
          <div><dt>Country</dt><dd>Not selected — placeholder only</dd></div>
          <div><dt>Week</dt><dd>Not started — no turns available</dd></div>
          <div><dt>Orders</dt><dd>Unavailable — no game logic yet</dd></div>
          <div><dt>Status</dt><dd>UI prototype only</dd></div>
        </dl>
      </section>
      <button type="button" onClick={onBack}>Back to title screen</button>
    </div>
  );
}
