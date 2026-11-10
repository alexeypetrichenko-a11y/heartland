import { useState } from 'react';
import type { GameState, RegionId } from '../game/models';

// Presentation only: shared edges follow the T02 fixture's adjacency.
// These shapes are illustrative, not real geography or simulation data.
const regionShapes: Record<RegionId, { points: string; x: number; y: number }> = {
  'alden-vale': { points: '30,16 176,16 186,65 176,116 90,126 16,116', x: 100, y: 65 },
  'reed-coast': { points: '176,16 328,24 344,116 260,106 176,116 186,65', x: 260, y: 65 },
  'amber-plain': { points: '16,116 90,126 176,116 166,168 176,216 98,206 24,216', x: 96, y: 165 },
  'silver-hills': { points: '176,116 260,106 344,116 334,216 258,226 176,216 166,168', x: 260, y: 165 },
  'cedar-basin': { points: '24,216 98,206 176,216 186,270 176,316 42,306', x: 102, y: 265 },
  'dawn-ridge': { points: '176,216 258,226 334,216 320,306 176,316 186,270', x: 256, y: 265 },
};

const countryColors: Record<string, string> = {
  alden: '#8fc8a3',
  belora: '#e7bd76',
  cyrin: '#a5b9e5',
};

export function RegionMap({ state }: { state: GameState }) {
  const [selectedId, setSelectedId] = useState<RegionId | null>(null);
  const selected = state.regions.find(region => region.id === selectedId);
  const owner = state.countries.find(country => country.id === selected?.ownerId);

  return (
    <section className="region-map" aria-labelledby="map-title">
      <h2 id="map-title" tabIndex={-1}>Fictional test map</h2>
      <p id="map-help">Tap or click a region to inspect it. Keyboard: Tab to a region, then Enter or Space to select.</p>
      <ul className="map-legend" aria-label="Country colors">
        {state.countries.map(country => (
          <li key={country.id}>
            <span className="country-swatch" style={{ backgroundColor: countryColors[country.id] }} aria-hidden="true" />
            {country.name}
          </li>
        ))}
      </ul>
      <div className="map-layout">
        <svg className="map-svg" viewBox="0 0 360 332" role="group" aria-labelledby="map-title" aria-describedby="map-help">
          {state.regions.map(region => {
            const shape = regionShapes[region.id];
            const country = state.countries.find(candidate => candidate.id === region.ownerId)!;
            return (
              <g
                key={region.id}
                className="map-region"
                role="button"
                tabIndex={0}
                aria-label={`${region.name}, ${country.name}`}
                aria-pressed={region.id === selectedId}
                aria-controls="region-details"
                onClick={() => setSelectedId(region.id)}
                onKeyDown={event => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setSelectedId(region.id);
                  }
                }}
              >
                <polygon points={shape.points} fill={countryColors[country.id]} />
                <text x={shape.x} y={shape.y} aria-hidden="true">
                  {region.name.split(' ').map((word, index) => (
                    <tspan key={index} x={shape.x} dy={index === 0 ? 0 : 22}>{word}</tspan>
                  ))}
                </text>
              </g>
            );
          })}
        </svg>
        <section id="region-details" className="region-details" aria-labelledby="region-details-title" aria-live="polite" aria-atomic="true">
          <h3 id="region-details-title">Region details</h3>
          {selected ? (
            <dl>
              <div><dt>Region</dt><dd>{selected.name}</dd></div>
              <div><dt>Country</dt><dd>{owner?.name}</dd></div>
              <div>
                <dt>Neighboring regions</dt>
                <dd>{selected.adjacentRegionIds.map(id => state.regions.find(region => region.id === id)!.name).join(', ')}</dd>
              </div>
            </dl>
          ) : <p>Select a region to see its details.</p>}
        </section>
      </div>
    </section>
  );
}
