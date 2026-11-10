import { useState } from 'react';
import { DetailPanel } from './DetailPanel';
import { useMapNavigation } from './useMapNavigation';
import { MAX_ZOOM, MIN_ZOOM } from './mapViewport';
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
  alden: '#304B60',
  belora: '#466176',
  cyrin: '#24384C',
};

export function RegionMap({ state }: { state: GameState }) {
  const navigation = useMapNavigation();
  const [showDetails, setShowDetails] = useState(false);
  const [selectedId, setSelectedId] = useState<RegionId>(() => (state.regions.find(region => region.ownerId === state.playerCountryId) ?? state.regions[0]).id);
  const selected = state.regions.find(region => region.id === selectedId);
  const owner = state.countries.find(country => country.id === selected?.ownerId);

  return (
    <section className="region-map" aria-labelledby="map-title">
      <h2 id="map-title" className="sr-only">Fictional test map</h2>
      <p id="map-help" className="sr-only">Tap or click to select. Drag to pan. Pinch or use the mouse wheel to zoom. Keyboard: + and − to zoom, arrows to pan, 0 or Home to reset. Tab to a region, then Enter or Space to select. Fictional test world.</p>
      <div className="world-layout" hidden={showDetails}>
        <div className="map-wrap">
        <svg ref={navigation.svgRef} className={`map-svg${navigation.dragging ? ' is-dragging' : ''}`}
          viewBox={`0 0 ${navigation.size.width} ${navigation.size.height}`} tabIndex={0}
          role="group" aria-labelledby="map-title" aria-describedby="map-help" {...navigation.events}>
          <defs><pattern id="map-grid" width="60" height="48" patternUnits="userSpaceOnUse"><path d="M60 0H0V48" fill="none" stroke="#16222F" /></pattern></defs>
          {/* One camera over fixed world coordinates; future geographic overlays can share it. */}
          <g className="map-world" transform={navigation.transform}>
          <rect width="360" height="332" fill="url(#map-grid)" />
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
                onFocus={event => navigation.revealRegion(event.currentTarget)}
                onKeyDown={event => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setSelectedId(region.id);
                  }
                }}
              >
                <polygon points={shape.points} fill={region.id === selectedId ? '#C99A4A' : countryColors[country.id]} />
                <text x={shape.x} y={shape.y} aria-hidden="true">
                  {region.name.split(' ').map((word, index) => (
                    <tspan key={index} x={shape.x} dy={index === 0 ? 0 : 22}>{word}</tspan>
                  ))}
                </text>
              </g>
            );
          })}
          </g>
        </svg>
        <div className="map-controls" role="group" aria-label="Map view controls">
          <button type="button" aria-label="Zoom in" title="Zoom in (+)" disabled={navigation.view.zoom >= MAX_ZOOM} onClick={() => navigation.zoomBy(1.25)}>+</button>
          <button type="button" aria-label="Zoom out" title="Zoom out (−)" disabled={navigation.view.zoom <= MIN_ZOOM} onClick={() => navigation.zoomBy(1 / 1.25)}>−</button>
          <button type="button" aria-label="Reset map view" title="Reset map view (0 or Home)" onClick={navigation.reset}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 10a8 8 0 1 1 1 8M4 4v6h6" /></svg>
          </button>
          <output className="sr-only" aria-live="polite" aria-atomic="true">Map zoom {Math.round(navigation.view.zoom * 100)}%</output>
        </div>
        </div>
        <section id="region-details" className="region-sheet" aria-labelledby="region-details-title">
          <div className="region-summary" aria-live="polite" aria-atomic="true">
            <span className="eyebrow">Selected region</span>
            <h3 id="region-details-title">{selected?.name}</h3>
            <p>Controlled by {owner?.name}</p>
          </div>
          <ul className="map-legend" aria-label="Country colors">
            {state.countries.map(country => <li key={country.id}><span className="country-swatch" style={{ backgroundColor: countryColors[country.id] }} aria-hidden="true" />{country.name}</li>)}
          </ul>
          <button type="button" className="row region-more" onClick={() => setShowDetails(true)} aria-controls="region-more-details" aria-expanded={showDetails}>
            <span className="row-text"><b>Region details</b><span>Neighbors and map help</span></span><span className="chevron" aria-hidden="true">›</span>
          </button>
        </section>
      </div>
      <DetailPanel id="region-more-details" title="Region details" open={showDetails} onClose={() => setShowDetails(false)}>
        <dl className="data-list">
          <div><dt>Region</dt><dd>{selected?.name}</dd></div>
          <div><dt>Country</dt><dd>{owner?.name}</dd></div>
          <div><dt>Neighboring regions</dt><dd>{selected?.adjacentRegionIds.map(id => state.regions.find(region => region.id === id)!.name).join(', ')}</dd></div>
        </dl>
        <p>Tap or click a region to inspect it. Drag with one finger or the mouse to pan; pinch or use the mouse wheel to zoom. Use +, − and reset inside the map frame. Zoom ranges from 100% (fit the whole map) to 400%.</p>
        <p>Keyboard: focus the map or a region, use + or − to zoom, arrow keys to pan (Shift for larger steps), and 0 or Home to reset. Tab to a region, then Enter or Space to select. This is an illustrative fictional test map.</p>
      </DetailPanel>
    </section>
  );
}
