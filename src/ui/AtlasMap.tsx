import { useMemo, useRef, useState } from 'react';
import { ATLAS_MAX_ZOOM, intersectsGeography, type AtlasCatalog, type AtlasSize, type AtlasView } from '../geography/atlas';
import { projectWorld, type WorldCamera } from '../geography/worldCamera';
import type { GeographicBounds } from '../geography/types';
import { useAtlasCamera } from './useAtlasCamera';
import { useAtlasData } from './useAtlasData';
import { useProjectionTransition } from './useProjectionTransition';
import { DetailPanel } from './DetailPanel';
import { AtlasTerrain } from './AtlasTerrain';
import { AtlasGlobe } from './AtlasGlobe';

const WORLD_SIZE: AtlasSize = { width: 360, height: 180 };
const WORLD_VIEW: AtlasView = { zoom: 1, center: { x: 180, y: 90 } };
const WORLD_BOUNDS: GeographicBounds[] = [[-180, -90, 180, 90]];

function labels(catalog: AtlasCatalog | null, camera: WorldCamera, size: AtlasSize, areaScale: number) {
  if (!catalog) return [];
  const placed: { x: number; y: number; width: number }[] = [];
  return [...catalog.countries].sort((a, b) => b.area - a.area).flatMap(country => {
    if (country.area * areaScale < 1400 || placed.length >= 35) return [];
    const { x, y } = projectWorld(camera, size, country.label, 'flat')!;
    const width = country.name.length * 6.2 + 12;
    if (x - width / 2 < 8 || x + width / 2 > size.width - 8 || y < 18 || y > size.height - 60) return [];
    if (x + width / 2 > size.width - 64 && y < 160) return [];
    if (placed.some(p => Math.abs(p.x - x) < (p.width + width) / 2 && Math.abs(p.y - y) < 23)) return [];
    placed.push({ x, y, width });
    return [{ ...country, x, y }];
  });
}

export default function AtlasMap({ active, onBack }: { active: boolean; onBack: () => void }) {
  const navigation = useAtlasCamera();
  const { view, size, layout } = navigation;
  const [revision, setRevision] = useState(0);
  const [showHelp, setShowHelp] = useState(false);
  const [terrainVisible, setTerrainVisible] = useState(true);
  const [flatTerrainStatus, setFlatTerrainStatus] = useState('');
  const [globeTerrainStatus, setGlobeTerrainStatus] = useState('');
  const [globeReady, setGlobeReady] = useState(false);
  const visible = active && !showHelp;
  const flatBlend = useProjectionTransition(view.projection === 'flat', visible, globeReady || view.flatOnly, view.flatOnly);
  const needsFlat = view.projection === 'flat' || flatBlend > 0;
  const globeVisible = !view.flatOnly && (view.projection === 'globe' || flatBlend < 1);
  const loadBounds = needsFlat ? layout.bounds : WORLD_BOUNDS;
  const mediumOverview = needsFlat ? layout.view.zoom >= 2.5 : view.zoom >= 2.5;
  const options = useMemo(() => ({ bounds: loadBounds, overviewOnly: !needsFlat, overviewScale: mediumOverview ? '50m' as const : '110m' as const }), [loadBounds, needsFlat, mediumOverview]);
  const data = useAtlasData(needsFlat ? layout.view : WORLD_VIEW, needsFlat ? layout.loadSize : WORLD_SIZE, visible, revision, options);
  const helpButton = useRef<HTMLButtonElement>(null);
  const countries = useMemo(() => new Map(data.catalog?.countries.map(c => [c.id, c]) ?? []), [data.catalog]);
  const countryLabels = needsFlat ? labels(data.catalog, view, size, layout.scale ** 2 * layout.longitudeScale) : [];
  const visibleShapes = needsFlat ? data.shapes.flatMap(shape => {
    const country = countries.get(shape.id);
    if (!country || !layout.bounds.some(b => intersectsGeography(country.bbox, b))) return [];
    const parts = shape.parts.filter(p => layout.bounds.some(b => intersectsGeography(p.bbox, b)));
    const path = parts.map(p => p.path).join('');
    return path ? [{ id: shape.id, code: shape.id.split(':').at(-1), color: country.color, path, outline: parts.map(p => p.outline).join('') }] : [];
  }) : [];
  const terrainStatus = needsFlat ? flatTerrainStatus : globeTerrainStatus;
  const projectionLabel = view.flatOnly ? 'Flat atlas · Globe unavailable' : view.projection === 'globe' ? 'Globe' : 'Map';
  return <section className="atlas-view" aria-label="World atlas">
    <div className="atlas-heading" hidden={showHelp}>
      <button type="button" onClick={onBack}>‹ Scenario</button>
      <div><h2>World atlas</h2><p>Geographic reference</p></div>
      <button type="button" ref={helpButton} onClick={() => setShowHelp(true)} aria-label="About the world atlas">ⓘ</button>
    </div>
    <div className="atlas-frame" hidden={showHelp}>
      <div className="atlas-viewport" ref={navigation.ref} tabIndex={0} role="group" aria-label="World geographic map" aria-describedby="atlas-help atlas-status"
        data-projection={view.flatOnly ? 'flat-fallback' : view.projection} data-zoom={view.zoom} data-longitude={layout.focus[0]} data-latitude={layout.focus[1]} data-bearing={layout.bearing}
        data-flat-blend={flatBlend} {...navigation.events}>
        {!view.flatOnly && <div className="atlas-globe-layer" style={{ opacity: 1 - flatBlend, visibility: globeVisible ? 'visible' : 'hidden' }}>
          <AtlasGlobe camera={view} size={size} catalog={data.catalog} shapes={data.overview} terrain={terrainVisible} active={visible && globeVisible}
            revision={revision} onUnavailable={navigation.fallbackToFlat} onReady={setGlobeReady} onStatus={setGlobeTerrainStatus} />
        </div>}
        <svg className="atlas-svg" aria-hidden="true" viewBox={`0 0 ${size.width} ${size.height}`} style={{ opacity: flatBlend, visibility: needsFlat ? 'visible' : 'hidden' }}>
          <defs><pattern id="atlas-graticule" width="30" height="30" patternUnits="userSpaceOnUse">
            <path d="M30 0H0V30" fill="none" stroke="#80a5bd" strokeWidth=".16" opacity=".16" />
          </pattern>
            {visibleShapes.map(shape => <g key={shape.id}>
              <path id={`atlas-${shape.code}`} d={shape.path} />
              <path id={`atlas-outline-${shape.code}`} d={shape.outline} vectorEffect="non-scaling-stroke" />
            </g>)}
          </defs>
          <rect width={size.width} height={size.height} fill="#182d3d" />
          <g className="atlas-camera" transform={layout.transform} data-zoom={view.zoom}>
            {layout.offsets.map(offset => <g key={offset} transform={`translate(${offset} 0)`}>
              <rect width="360" height="180" fill="#182d3d" />
              <rect width="360" height="180" fill="url(#atlas-graticule)" />
              <g className="atlas-political" fillRule="evenodd" data-world-offset={offset}>
                {visibleShapes.map(shape => <use key={shape.id} href={`#atlas-${shape.code}`} data-country={shape.id} fill={shape.color} />)}
              </g>
            </g>)}
            <AtlasTerrain view={layout.view} size={layout.loadSize} bounds={layout.bounds} offsets={layout.offsets} enabled={terrainVisible} active={visible && needsFlat}
              revision={revision} onStatus={setFlatTerrainStatus} />
            {layout.offsets.map(offset => <g key={offset} transform={`translate(${offset} 0)`} className="atlas-country-borders" fill="none" stroke="#243b42" strokeWidth=".85" strokeLinejoin="round">
              {visibleShapes.map(shape => <use key={shape.id} href={`#atlas-outline-${shape.code}`} vectorEffect="non-scaling-stroke" />)}
            </g>)}
          </g>
          <g className="atlas-labels" pointerEvents="none">
            {countryLabels.map(c => <text key={c.id} x={c.x} y={c.y} textAnchor="middle">{c.name}</text>)}
          </g>
        </svg>
      </div>
      <div className="map-controls atlas-controls" role="group" aria-label="Atlas view controls">
        <button type="button" aria-label="Zoom in atlas" onClick={() => navigation.zoomBy(1.5)} disabled={view.zoom >= ATLAS_MAX_ZOOM}>+</button>
        <button type="button" aria-label="Zoom out atlas" onClick={() => navigation.zoomBy(1 / 1.5)} disabled={view.zoom <= 1}>−</button>
        <button type="button" aria-label="Reset atlas view" onClick={navigation.reset}>↺</button>
      </div>
      <output className="atlas-zoom" aria-live="polite" aria-atomic="true">{view.zoom.toFixed(1)}×</output>
      <button type="button" className="atlas-terrain-control" aria-label="Physical terrain" aria-pressed={terrainVisible} onClick={() => setTerrainVisible(value => !value)}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m2 20 8-15 5 9 3-6 4 12ZM7 11l3 3 3-3" /></svg>Terrain
      </button>
    </div>
    <div className="atlas-caption" hidden={showHelp}>
      <p id="atlas-status" role="status">{data.error || terrainStatus || (data.loading ? 'Loading map detail…' : `${projectionLabel} · Natural Earth · ${terrainVisible ? 'Physical reference' : 'Country colors'}`)}</p>
      {(data.error || terrainStatus) && <button type="button" onClick={() => setRevision(n => n + 1)}>Retry map data</button>}
      <p id="atlas-help" className="sr-only">Drag to rotate the globe or pan the flat map. Pinch or use the wheel to zoom between views. Keyboard: plus and minus zoom, arrows navigate, 0 or Home resets. This reference map has no selection or gameplay effects.</p>
    </div>
    <DetailPanel id="atlas-information" title="About the world atlas" open={showHelp} onClose={() => {
      setShowHelp(false); requestAnimationFrame(() => helpButton.current?.focus());
    }}>
      <p>This is a geographic reference alongside the fictional scenario. Country colors identify Natural Earth geographic entities, not military ownership or alliances. These entities are not automatically playable sovereign countries.</p>
      <p>Drag to rotate Earth at global zoom or pan the closer map. Pinch or use the wheel to zoom. + and − zoom, arrows navigate (Shift for larger steps), and 0 or Home resets. Terrain preference is preserved between views.</p>
      <p>A brief fade connects the globe to the detailed map, keeping the same geographic focus, local scale and orientation. It is not a fully animated projection morph; features near the edges can change shape. The handoff adapts to screen shape and latitude. Near the poles, the globe remains active to avoid gaps in a flat polar cap.</p>
      <p>The flat view uses the existing geographic geometry with local east/west scale correction and date-line wrapping. It retains the globe's orientation. Zoom ranges from 1× to 128×; finite source detail cannot provide ground precision. Devices without usable 3D rendering fall back to the flat atlas.</p>
      <p>Made with Natural Earth, public-domain cartographic data. The source uses its documented de facto boundary treatment, including disputed and dependent territories; this does not settle future game ownership. Boundaries are a generalized source snapshot, not a current legal survey.</p>
      <p>Terrain blends real Natural Earth I land-cover coloring and shaded relief with the political colors, plus major source rivers and lakes. The globe uses overview terrain; more detail loads in the flat map. Terrain has no gameplay effects.</p>
      <p>The terrain raster is the publisher’s older quick-start snapshot (TIFF dated 2009, repository snapshot 2012), not current forest cover, a classified biome map or precise elevation. Plains and grasslands cannot be reliably distinguished as separate classes here. River/lake data use Natural Earth 5.0.0, with documented alignment gaps and seasonal omissions.</p>
    </DetailPanel>
  </section>;
}
