import { useEffect, useMemo, useRef, useState } from 'react';
import { atlasBounds, intersectsGeography, type AtlasSize, type AtlasView } from '../geography/atlas';
import { createTerrainData, projectHydrology, terrainImageRect, visibleTerrainTiles, type HydrologyFeature, type TerrainManifest, type TerrainTile } from '../geography/terrain';

type Props = { view: AtlasView; size: AtlasSize; enabled: boolean; active: boolean; revision: number; onStatus: (status: string) => void };
export function AtlasTerrain({ view, size, enabled, active, revision, onStatus }: Props) {
  const source = useRef<ReturnType<typeof createTerrainData> | null>(null);
  source.current ??= createTerrainData(import.meta.env.BASE_URL);
  const [manifest, setManifest] = useState<TerrainManifest | null>(null);
  const [world, setWorld] = useState('');
  const [tiles, setTiles] = useState<{ tile: TerrainTile; url: string }[]>([]);
  const [features, setFeatures] = useState<HydrologyFeature[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!enabled || !active) return;
    const controller = new AbortController();
    setError('');
    (async () => {
      try {
        const m = await source.current!.loadManifest(controller.signal);
        if (controller.signal.aborted) return;
        setManifest(m);
        const image = await source.current!.loadRaster(m.raster.overview, controller.signal);
        if (!controller.signal.aborted) setWorld(image);
      } catch { if (!controller.signal.aborted) setError('Physical overview unavailable.'); }
    })();
    return () => controller.abort();
  }, [enabled, active, revision]);
  useEffect(() => {
    if (!manifest || !enabled || !active) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const bounds = atlasBounds(view, size);
      const selected = visibleTerrainTiles(manifest, view, size, window.devicePixelRatio);
      setTiles([]); setError('');
      async function raster() {
        let index = 0;
        const next: { tile: TerrainTile; url: string }[] = [];
        async function worker() {
          while (index < selected.length && !controller.signal.aborted) {
            const tile = selected[index++];
            const url = await source.current!.loadRaster(tile, controller.signal);
            if (controller.signal.aborted) return;
            next.push({ tile, url }); setTiles([...next]);
          }
        }
        await Promise.all([worker(), worker()]);
      }
      async function hydrology() {
        const overview = await source.current!.loadHydrology(manifest!.hydrology[view.zoom >= 3 ? '50m' : '110m'], controller.signal);
        if (controller.signal.aborted) return;
        setFeatures(overview.features);
        if (view.zoom < 10) return;
        const chunks = manifest!.hydrology['10m'].filter(c => intersectsGeography(c.bounds, bounds));
        const records = new Map<string, HydrologyFeature>();
        // Full source features may occur in adjacent chunks; de-duplicate by source ID.
        for (const chunk of chunks) {
          const value = await source.current!.loadHydrology(chunk, controller.signal);
          if (controller.signal.aborted) return;
          for (const feature of value.features) records.set(feature.id, feature);
        }
        if (!controller.signal.aborted) setFeatures([...records.values()]);
      }
      // Hydrology and imagery have independent error handling; neither hides political data.
      raster().catch(() => { if (!controller.signal.aborted) setError('Some relief detail unavailable.'); });
      hydrology().catch(() => { if (!controller.signal.aborted) setError('Some river/lake detail unavailable.'); });
    }, 240);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [manifest, view, size, enabled, active, revision]);
  useEffect(() => { onStatus(enabled ? error : ''); }, [error, enabled, onStatus]);
  useEffect(() => () => source.current?.dispose(), []);
  const paths = useMemo(() => features.map(feature => ({ ...feature, path: projectHydrology(feature) })), [features]);
  if (!enabled || !active) return null;
  const bounds = atlasBounds(view, size);
  const visible = paths.filter(f => intersectsGeography(f.bbox, bounds) && f.rank <= (view.zoom < 3 ? 3 : view.zoom < 6 ? 5 : 12));
  return <g className="atlas-physical" aria-hidden="true" pointerEvents="none">
    <g className="atlas-relief" opacity=".8" style={{ mixBlendMode: 'multiply' }}>
      {world && manifest && <image className="atlas-terrain-overview" href={world} {...terrainImageRect(manifest.raster.overview.bounds)} preserveAspectRatio="none" />}
      {tiles.map(({ tile, url }) => <image key={tile.path} className="atlas-terrain-tile" data-level={tile.level} data-tile={tile.path} href={url}
        {...terrainImageRect(tile.imageBounds)} preserveAspectRatio="none" />)}
    </g>
    <g className="atlas-hydrology" fillRule="evenodd" strokeLinecap="round" strokeLinejoin="round">
      {visible.map(feature => <path key={feature.id} data-hydrology={feature.id} data-kind={feature.kind} d={feature.path}
        fill={feature.kind === 'lake' ? '#518597' : 'none'} stroke={feature.kind === 'lake' ? '#6997a5' : '#72a5b6'}
        strokeWidth={feature.kind === 'lake' ? .45 : .65} vectorEffect="non-scaling-stroke" />)}
    </g>
  </g>;
}
