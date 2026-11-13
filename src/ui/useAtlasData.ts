import { useEffect, useRef, useState } from 'react';
import { createAtlasData } from '../geography/atlasData';
import { atlasBounds, countryInViewport, type AtlasCatalog, type AtlasShape, type AtlasSize, type AtlasView } from '../geography/atlas';

export function useAtlasData(view: AtlasView, size: AtlasSize, active: boolean, revision: number) {
  const source = useRef<ReturnType<typeof createAtlasData> | null>(null);
  source.current ??= createAtlasData(import.meta.env.BASE_URL);
  const [catalog, setCatalog] = useState<AtlasCatalog | null>(null);
  const [overview, setOverview] = useState<AtlasShape[]>([]);
  const [detail, setDetail] = useState<AtlasShape[]>([]);
  const [error, setError] = useState('');
  const [resolution, setResolution] = useState('110m');
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    setLoading(true); setError('');
    Promise.all([source.current!.loadCatalog(controller.signal), source.current!.loadOverview('110m', controller.signal)])
      .then(([c, shapes]) => { if (!controller.signal.aborted) { setCatalog(c); setOverview(shapes); } })
      .catch(() => { if (!controller.signal.aborted) setError('The world map could not load. The scenario remains available.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [active, revision]);

  useEffect(() => {
    if (!active || !catalog) return;
    const controller = new AbortController();
    // Settle the gesture before requesting more detail; never fetch a high-resolution world.
    const timer = window.setTimeout(async () => {
      setLoading(true); setError('');
      try {
        const scale = view.zoom >= 2.5 ? '50m' : '110m';
        const shapes = await source.current!.loadOverview(scale, controller.signal);
        if (controller.signal.aborted) return;
        setOverview(shapes); setResolution(scale);
        if (view.zoom < 8) { setDetail([]); return; }
        const bounds = atlasBounds(view, size);
        const countries = catalog.countries.filter(c => countryInViewport(c, bounds)).sort((a, b) => a.area - b.area).slice(0, 12);
        const next: AtlasShape[] = [];
        let index = 0;
        // Two in-flight detail requests maximum, with cancellation on camera/tab changes.
        async function worker() {
          while (index < countries.length && !controller.signal.aborted) {
            const country = countries[index++];
            const result = await source.current!.loadDetail(country, controller.signal);
            if (controller.signal.aborted) return;
            next.push(result); setDetail([...next]);
          }
        }
        setDetail([]);
        await Promise.all([worker(), worker()]);
        if (!controller.signal.aborted) setResolution('10m detail');
      } catch {
        if (!controller.signal.aborted) setError('Some map detail is unavailable. Showing the available boundaries.');
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }, 220);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [active, catalog, view, size, revision]);
  const merged = new Map(overview.map(shape => [shape.id, shape]));
  if (view.zoom >= 8) for (const shape of detail) merged.set(shape.id, shape);
  return { catalog, shapes: [...merged.values()], error, loading, resolution };
}
