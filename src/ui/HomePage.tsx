type HomePageProps = {
  onOpenPrototype: () => void;
};

export function HomePage({ onOpenPrototype }: HomePageProps) {
  return (
    <div>
      <h1 id="view-title">Heartland</h1>
      <p>Geopolitical Strategy Game</p>
      <button type="button" onClick={onOpenPrototype}>
        Open local prototype
      </button>
    </div>
  );
}
