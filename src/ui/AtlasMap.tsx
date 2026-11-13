import { useMemo, useRef, useState } from 'react';
import { ATLAS_MAX_ZOOM, atlasBounds, intersectsGeography, projectGeography, type AtlasCatalog, type AtlasSize, type AtlasView } from '../geography/atlas';
import { useAtlasCamera } from './useAtlasCamera';
import { useAtlasData } from './useAtlasData';
import { DetailPanel } from './DetailPanel';

function labels(catalog: AtlasCatalog | null, view: AtlasView, size: AtlasSize, scale: number) {
  if (!catalog || view.zoom < 2.5) return [];
  const placed: { x: number; y: number; width: number }[] = [];
  return [...catalog.countries].sort((a, b) => b.area - a.area).filter(country => {
    if (country.area * scale * scale < 1400) return false;
    const p = projectGeography(country.label);
    const x = (p.x - view.center.x) * scale + size.width / 2;
    const y = (p.y - view.center.y) * scale + size.height / 2;
    const width = country.name.length * 6.2 + 12;
    if (x - width / 2 < 8 || x + width / 2 > size.width - 8 || y < 18 || y > size.height - 18) return false;
    if (x + width / 2 > size.width - 64 && y < 160) return false;
    if (placed.some(p => Math.abs(p.x - x) < (p.width + width) / 2 && Math.abs(p.y - y) < 23)) return false;
    placed.push({ x, y, width });
    return placed.length <= 35;
  }).slice(0, 35).map(country => {
    const p = projectGeography(country.label);
    return { ...country, x: (p.x - view.center.x) * scale + size.width / 2, y: (p.y - view.center.y) * scale + size.height / 2 };
  });
}

export default function AtlasMap({ active, onBack }: { active: boolean; onBack: () => void }) {
  const navigation = useAtlasCamera();
  const [revision, setRevision] = useState(0);
  const [showHelp, setShowHelp] = useState(false);
  const helpButton = useRef<HTMLButtonElement>(null);
  const data = useAtlasData(navigation.view, navigation.size, active && !showHelp, revision);
  const countries = useMemo(() => new Map(data.catalog?.countries.map(c => [c.id, c]) ?? []), [data.catalog]);
  const bounds = atlasBounds(navigation.view, navigation.size);
  const countryLabels = labels(data.catalog, navigation.view, navigation.size, navigation.scale);
  return <section className="atlas-view" aria-label="World atlas">
    <div className="atlas-heading" hidden={showHelp}>
      <button type="button" onClick={onBack}>‹ Scenario</button>
      <div><h2>World atlas</h2><p>Geographic reference</p></div>
      <button type="button" ref={helpButton} onClick={() => setShowHelp(true)} aria-label="About the world atlas">ⓘ</button>
    </div>
    <div className="atlas-frame" hidden={showHelp}>
      <svg className="atlas-svg" ref={navigation.ref} tabIndex={0} role="group" aria-label="World geographic map"
        aria-describedby="atlas-help atlas-status" viewBox={`0 0 ${navigation.size.width} ${navigation.size.height}`} {...navigation.events}>
        <defs><pattern id="atlas-graticule" width="30" height="30" patternUnits="userSpaceOnUse">
          <path d="M30 0H0V30" fill="none" stroke="#80a5bd" strokeWidth=".16" opacity=".16" />
        </pattern></defs>
        <g className="atlas-camera" transform={navigation.transform} data-zoom={navigation.view.zoom}>
          <rect width="360" height="180" fill="#182d3d" />
          <rect width="360" height="180" fill="url(#atlas-graticule)" />
          {/* Political color and all future physical/point overlays share this geographic camera. */}
          <g className="atlas-political" fillRule="evenodd" stroke="#293b45" strokeWidth=".85" strokeLinejoin="round">
            {data.shapes.map(shape => {
              const country = countries.get(shape.id);
              if (!country || !intersectsGeography(country.bbox, bounds)) return null;
              const path = shape.parts.filter(p => intersectsGeography(p.bbox, bounds)).map(p => p.path).join('');
              return path && <path key={shape.id} data-country={shape.id} d={path} fill={country.color} vectorEffect="non-scaling-stroke" />;
            })}
          </g>
        </g>
        <g className="atlas-labels" aria-hidden="true" pointerEvents="none">
          {countryLabels.map(c => <text key={c.id} x={c.x} y={c.y} textAnchor="middle">{c.name}</text>)}
          {navigation.view.zoom < 2.5 && <text x="14" y={navigation.size.height - 16}>ALL CONTINENTS · WGS84</text>}
        </g>
      </svg>
      <div className="map-controls atlas-controls" role="group" aria-label="Atlas view controls">
        <button type="button" aria-label="Zoom in atlas" onClick={() => navigation.zoomBy(1.5)} disabled={navigation.view.zoom >= ATLAS_MAX_ZOOM}>+</button>
        <button type="button" aria-label="Zoom out atlas" onClick={() => navigation.zoomBy(1 / 1.5)} disabled={navigation.view.zoom <= 1}>−</button>
        <button type="button" aria-label="Reset atlas view" onClick={navigation.reset}>↺</button>
      </div>
      <output className="atlas-zoom" aria-live="polite" aria-atomic="true">{navigation.view.zoom.toFixed(1)}×</output>
    </div>
    <div className="atlas-caption" hidden={showHelp}>
      <p id="atlas-status" role="status">{data.error || (data.loading ? 'Loading map detail…' : `Natural Earth · ${data.resolution} · Colors identify geography`)}</p>
      {data.error && <button type="button" onClick={() => setRevision(n => n + 1)}>Retry map data</button>}
      <p id="atlas-help" className="sr-only">Drag to pan, pinch or use the wheel to zoom. Keyboard: plus and minus to zoom, arrows to pan, 0 or Home for the whole world. This reference map has no selection or gameplay effects.</p>
    </div>
    <DetailPanel id="atlas-information" title="About the world atlas" open={showHelp} onClose={() => {
      setShowHelp(false); requestAnimationFrame(() => helpButton.current?.focus());
    }}>
      <p>This is a geographic reference alongside the fictional scenario. Country colors identify Natural Earth geographic entities, not military ownership or alliances. These entities are not automatically playable sovereign countries.</p>
      <p>Drag to pan; pinch or use the wheel to zoom. + and − zoom, arrows pan (Shift for larger steps), and 0 or Home fits the whole world. Zoom ranges from 1× to 128×. Borders become more detailed as you zoom; small islands may be absent at overview scales.</p>
      <p>Made with Natural Earth, public-domain cartographic data. The source uses its documented de facto boundary treatment, including disputed and dependent territories; this does not settle future game ownership. Boundaries are a generalized source snapshot, not a current legal or ground-precision map.</p>
      <p>The equirectangular view includes Antarctica and both poles. Shapes are increasingly stretched near the poles. The map stops at the date line; it does not wrap. Country and region selection, physical terrain and geographical military positions are separate phases.</p>
    </DetailPanel>
  </section>;
}
