import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { ATLAS_MAX_ZOOM, type AtlasCatalog, type AtlasPoint, type AtlasShape, type AtlasSize, type AtlasView } from '../geography/atlas';
import { borderStyle, countryDetailAmount } from '../geography/borderRendering';
import { pickAtlasCountry } from '../geography/countrySelection';
import { projectWorld, type WorldCamera } from '../geography/worldCamera';
import type { GeographicBounds, GeographicCountryId } from '../geography/types';
import { useAtlasCamera } from './useAtlasCamera';
import { useAtlasData } from './useAtlasData';
import { useProjectionTransition } from './useProjectionTransition';
import { DetailPanel } from './DetailPanel';
import { AtlasTerrain } from './AtlasTerrain';
import { AtlasGlobe } from './AtlasGlobe';
import { useGeographicFade } from './useGeographicFade';
import { AtlasPolitical, politicalLayers } from './AtlasPolitical';
import { readTerrainPreference, writeTerrainPreference } from './atlasPreferences';
import { AtlasCountryPanel } from './AtlasCountryPanel';

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

export default function AtlasMap({ active }: { active: boolean }) {
  const navigation = useAtlasCamera();
  const { view, size, layout } = navigation;
  const [revision, setRevision] = useState(0);
  const [showHelp, setShowHelp] = useState(false);
  const [selectedId, setSelectedId] = useState<GeographicCountryId | null>(null);
  const [terrainVisible, setTerrainVisible] = useState(readTerrainPreference);
  useEffect(() => { writeTerrainPreference(terrainVisible); }, [terrainVisible]);
  const [flatTerrainStatus, setFlatTerrainStatus] = useState('');
  const [globeTerrainStatus, setGlobeTerrainStatus] = useState('');
  const [globeReady, setGlobeReady] = useState(false);
  const visible = active && !showHelp;
  const flatBlend = useProjectionTransition(view.projection === 'flat', visible, globeReady || view.flatOnly, view.flatOnly);
  const needsFlat = view.projection === 'flat' || flatBlend > 0;
  const globeVisible = !view.flatOnly && (view.projection === 'globe' || flatBlend < 1);
  const loadBounds = needsFlat ? layout.bounds : WORLD_BOUNDS;
  const mediumOverview = needsFlat ? layout.view.zoom >= 2.5 : view.zoom >= 2.5;
  const detailAmount = countryDetailAmount(view, size);
  const detailEnabled = view.projection === 'flat' && flatBlend === 1 && detailAmount > 0;
  const options = useMemo(() => ({ bounds: loadBounds, overviewOnly: !needsFlat, overviewScale: mediumOverview ? '50m' as const : '110m' as const, detailEnabled }), [loadBounds, needsFlat, mediumOverview, detailEnabled]);
  const data = useAtlasData(needsFlat ? layout.view : WORLD_VIEW, needsFlat ? layout.loadSize : WORLD_SIZE, visible, revision, options, selectedId !== null);
  const helpButton = useRef<HTMLButtonElement>(null);
  const pickContext = useRef<CanvasRenderingContext2D | null>(null);
  const pickPaths = useRef<WeakMap<AtlasShape['parts'][number], Path2D> | null>(null);
  const overviewFade = useGeographicFade(data.overview, visible && needsFlat);
  const detailFade = useGeographicFade(data.shapes, visible && needsFlat);
  const layers = useMemo(() => needsFlat ? politicalLayers(overviewFade, detailFade, data.catalog, layout.bounds) : [], [needsFlat, overviewFade, detailFade, data.catalog, layout.bounds]);
  const borders = borderStyle(view, size, window.devicePixelRatio);
  const countryLabels = needsFlat ? labels(data.catalog, view, size, layout.scale ** 2 * layout.longitudeScale) : [];
  const terrainStatus = needsFlat ? flatTerrainStatus : globeTerrainStatus;
  const projectionLabel = view.flatOnly ? 'Flat atlas · Globe unavailable' : view.projection === 'globe' ? 'Globe' : 'Map';
  const initialLoading = !data.error && (!data.catalog || !data.overview.length || (!view.flatOnly && !globeReady));
  const selectedCountry = data.catalog?.countries.find(country => country.id === selectedId);
  const globeSelection = selectedId ? data.overview.find(shape => shape.id === selectedId) : undefined;

  function inspect(point: AtlasPoint, touch: boolean) {
    if (!visible || initialLoading || !data.catalog) return;
    const usingFlat = flatBlend >= .5;
    const fade = detailAmount >= .5 ? detailFade : overviewFade;
    const flatShapes = fade.previous && fade.mix < .5 ? fade.previous : fade.current;
    const shapes = usingFlat ? flatShapes : data.overview;
    if (!pickContext.current) {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 1;
      pickContext.current = canvas.getContext('2d');
    }
    const context = pickContext.current;
    if (!context) return;
    const paths = pickPaths.current ??= new WeakMap();
    const id = pickAtlasCountry({ ...view, projection: usingFlat ? 'flat' : 'globe' }, size, point, shapes, (part, p) => {
      let path = paths.get(part);
      if (!path) {
        path = new Path2D(part.path);
        paths.set(part, path);
      }
      return context.isPointInPath(path, p.x, p.y, 'evenodd');
    }, touch);
    if (id) setSelectedId(id);
  }

  function pointerUp(event: PointerEvent<HTMLDivElement>) {
    const tap = navigation.events.onPointerUp(event);
    if (tap) inspect(tap, event.pointerType === 'touch');
  }

  function keyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!event.altKey && !event.ctrlKey && !event.metaKey) {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        if (!event.repeat) inspect({ x: size.width / 2, y: size.height / 2 }, false);
        return;
      }
      if (event.key === 'Escape' && selectedId) {
        event.preventDefault();
        setSelectedId(null);
        return;
      }
    }
    navigation.events.onKeyDown(event);
  }

  return <section className="atlas-view" aria-label="World atlas">
    <div className="atlas-heading" hidden={showHelp}>
      <div><h2>World atlas</h2><p>Geographic reference</p></div>
      <button type="button" ref={helpButton} onClick={() => setShowHelp(true)} aria-label="About the world atlas">ⓘ</button>
    </div>
    <div className="atlas-frame" hidden={showHelp} aria-busy={initialLoading}>
      {(initialLoading || !data.overview.length) && <div className="atlas-loading" role="status">{data.error ? 'Earth data unavailable' : 'Loading Earth…'}</div>}
      <div className="atlas-viewport" ref={navigation.ref} tabIndex={0} role="group" aria-label="World geographic map" aria-describedby="atlas-help atlas-status"
        data-projection={view.flatOnly ? 'flat-fallback' : view.projection} data-zoom={view.zoom} data-longitude={layout.focus[0]} data-latitude={layout.focus[1]} data-bearing={layout.bearing}
        data-flat-blend={flatBlend} data-border-width={borders.width} data-border-opacity={borders.opacity} data-detail-blend={detailAmount}
        {...navigation.events} onPointerUp={pointerUp} onKeyDown={keyDown}>
        {!view.flatOnly && <div className="atlas-globe-layer" style={{ opacity: 1 - flatBlend, visibility: globeVisible ? 'visible' : 'hidden' }}>
          <AtlasGlobe camera={view} size={size} catalog={data.catalog} shapes={data.overview} selected={globeSelection} terrain={terrainVisible} active={visible && globeVisible}
            revision={revision} onUnavailable={navigation.fallbackToFlat} onReady={setGlobeReady} onStatus={setGlobeTerrainStatus} />
        </div>}
        <svg className="atlas-svg" aria-hidden="true" viewBox={`0 0 ${size.width} ${size.height}`} style={{ opacity: flatBlend, visibility: needsFlat ? 'visible' : 'hidden' }}>
          <defs><pattern id="atlas-graticule" width="30" height="30" patternUnits="userSpaceOnUse">
            <path d="M30 0H0V30" fill="none" stroke="#80a5bd" strokeWidth=".16" opacity=".16" />
          </pattern></defs>
          <rect width={size.width} height={size.height} fill="#182d3d" />
          <g className="atlas-camera" transform={layout.transform} data-zoom={view.zoom}>
            {needsFlat && <AtlasPolitical phase="fills" layers={layers} offsets={layout.offsets} detail={detailAmount} {...borders} />}
            <AtlasTerrain view={layout.view} size={layout.loadSize} bounds={layout.bounds} offsets={layout.offsets} enabled={terrainVisible} active={visible && needsFlat}
              revision={revision} onStatus={setFlatTerrainStatus} />
            {needsFlat && <AtlasPolitical phase="borders" layers={layers} offsets={layout.offsets} detail={detailAmount} selectedId={selectedId} {...borders} />}
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
      {selectedCountry && <AtlasCountryPanel country={selectedCountry} geography={data.countryGeography?.get(selectedCountry.id)} onClear={() => {
        setSelectedId(null);
        navigation.ref.current?.focus({ preventScroll: true });
      }} />}
      <p className="sr-only" role="status">{selectedCountry ? `${selectedCountry.name} selected` : ''}</p>
    </div>
    <div className="atlas-caption" hidden={showHelp}>
      <p id="atlas-status" role="status">{data.error || terrainStatus || (data.loading ? 'Loading map detail…' : `${projectionLabel} · Natural Earth · ${terrainVisible ? 'Physical reference' : 'Country colors'}`)}</p>
      {(data.error || terrainStatus) && <button type="button" onClick={() => setRevision(n => n + 1)}>Retry map data</button>}
      <p id="atlas-help" className="sr-only">Tap or click a country to inspect it. Drag to move the map, or pinch or use the wheel to zoom. Keyboard arrows navigate, Enter or Space inspects the center, Escape clears selection, plus and minus zoom, and 0 or Home resets the view.</p>
    </div>
    <DetailPanel id="atlas-information" title="About the world atlas" open={showHelp} onClose={() => {
      setShowHelp(false); requestAnimationFrame(() => helpButton.current?.focus());
    }}>
      <p>This is a geographic reference alongside the fictional scenario. Country colors identify Natural Earth geographic entities, not military ownership or alliances. These entities are not automatically playable sovereign countries.</p>
      <p>Tap or click a country to inspect its name, Natural Earth ID and geography. Use the panel's close button or Escape to clear it. With keyboard focus on the map, Enter or Space inspects the center. Zoom in to see smaller countries and islands. The playable roster will be chosen later.</p>
      <p>Drag east/west along parallels or north/south along meridians. Both views stay north-up. Latitude stops just short of each pole to prevent inversion; longitude wraps freely. Pinch or use the wheel to zoom. + and − zoom, arrows navigate (Shift for larger steps), and 0 or Home resets. Terrain preference is preserved between views.</p>
      <p>A brief fade connects the globe to the detailed map, keeping the same geographic focus, local scale and orientation. It is not a fully animated projection morph; features near the edges can change shape. The handoff adapts to screen shape and latitude. Near the poles, the globe remains active to avoid gaps in a flat polar cap.</p>
      <p>Borders use the same fine vector stroke on the globe and flat map. More source detail fades in as it loads; country-detail geometry appears after the projection handoff. The flat view uses local east/west scale correction and date-line wrapping. Zoom ranges from 1× to 128×; finite source detail cannot provide ground precision. Devices without usable 3D rendering fall back to the flat atlas.</p>
      <p>Made with Natural Earth, public-domain cartographic data. The source uses its documented de facto boundary treatment, including disputed and dependent territories; this does not settle future game ownership. Boundaries are a generalized source snapshot, not a current legal survey.</p>
      <p>Terrain blends real Natural Earth I land-cover coloring and shaded relief with the political colors, plus major source rivers and lakes. The globe uses overview terrain; more detail loads in the flat map. Terrain has no gameplay effects.</p>
      <p>The terrain raster is the publisher’s older quick-start snapshot (TIFF dated 2009, repository snapshot 2012), not current forest cover, a classified biome map or precise elevation. Plains and grasslands cannot be reliably distinguished as separate classes here. River/lake data use Natural Earth 5.0.0, with documented alignment gaps and seasonal omissions.</p>
    </DetailPanel>
  </section>;
}
