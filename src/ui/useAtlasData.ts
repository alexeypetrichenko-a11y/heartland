import { useEffect, useMemo, useRef, useState } from 'react';
import { createAtlasData } from '../geography/atlasData';
import { atlasBounds, countryDetailPriority, countryInViewport, type AtlasCatalog, type AtlasShape, type AtlasSize, type AtlasView } from '../geography/atlas';
import type { CountryGeography } from '../geography/countrySelection';
import type { GeographicBounds, GeographicCountryId, OverviewScale } from '../geography/types';

export function useAtlasData(view: AtlasView, size: AtlasSize, active: boolean, revision: number,
  options: { bounds: GeographicBounds[]; overviewOnly: boolean; overviewScale: OverviewScale; detailEnabled?: boolean }, inspectCountry: boolean) {
  const source = useRef<ReturnType<typeof createAtlasData> | null>(null);
  source.current ??= createAtlasData(import.meta.env.BASE_URL);
  const [catalog, setCatalog] = useState<AtlasCatalog | null>(null);
  const [overview, setOverview] = useState<AtlasShape[]>([]);
  const [detail, setDetail] = useState<AtlasShape[]>([]);
  const retainedDetail = useRef(detail); retainedDetail.current = detail;
  const [error, setError] = useState('');
  const [resolution, setResolution] = useState('110m');
  const [loading, setLoading] = useState(false);
  const [countryGeography, setCountryGeography] = useState<Map<GeographicCountryId, CountryGeography>>();
  useEffect(() => {
    if (!active || !inspectCountry || countryGeography) return;
    const controller = new AbortController();
    source.current!.loadCountryGeography(controller.signal).then(facts => {
      if (!controller.signal.aborted) setCountryGeography(facts);
    }).catch(() => {
      // The panel has the name, ID and label coordinates from the atlas catalog.
    });
    return () => controller.abort();
  }, [active, countryGeography, inspectCountry, revision]);
  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    setLoading(true); setError('');
    Promise.all([source.current!.loadCatalog(controller.signal), source.current!.loadOverview('110m', controller.signal)])
      .then(([c, shapes]) => { if (!controller.signal.aborted) { setCatalog(c); setOverview(old => old.length ? old : shapes); } })
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
        const scale = options?.overviewScale ?? (view.zoom >= 2.5 ? '50m' : '110m');
        const shapes = await source.current!.loadOverview(scale, controller.signal);
        if (controller.signal.aborted) return;
        setOverview(shapes); setResolution(scale);
        if (options?.overviewOnly || options?.detailEnabled === false || view.zoom < 8) return;
        const bounds = options?.bounds ?? [atlasBounds(view, size)];
        const countries = catalog.countries.filter(c => bounds.some(b => countryInViewport(c, b)))
          .map(country => ({ country, priority: countryDetailPriority(country, [view.center.x - 180, 90 - view.center.y]) }))
          .sort((a, b) => a.priority[0] - b.priority[0] || a.priority[1] - b.priority[1] || a.country.id.localeCompare(b.country.id))
          .slice(0, 12).map(entry => entry.country);
        const next = new Map(retainedDetail.current.filter(s => countries.some(c => c.id === s.id)).map(s => [s.id, s]));
        let index = 0;
        // Two in-flight detail requests maximum, with cancellation on camera/tab changes.
        async function worker() {
          while (index < countries.length && !controller.signal.aborted) {
            const country = countries[index++];
            const result = await source.current!.loadDetail(country, controller.signal);
            if (controller.signal.aborted) return;
            next.set(result.id, result);
          }
        }
        const results = await Promise.allSettled([worker(), worker()]);
        if (!controller.signal.aborted) {
          const values = [...next.values()];
          setDetail(old => old.length === values.length && old.every((s, i) => s === values[i]) ? old : values); setResolution('10m detail');
          if (results.some(r => r.status === 'rejected')) setError('Some map detail is unavailable. Showing the available boundaries.');
        }
      } catch {
        if (!controller.signal.aborted) setError('Some map detail is unavailable. Showing the available boundaries.');
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }, 220);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [active, catalog, view, size, revision, options]);
  const shapes = useMemo(() => {
    const merged = new Map(overview.map(shape => [shape.id, shape]));
    for (const shape of detail) merged.set(shape.id, shape);
    return [...merged.values()];
  }, [overview, detail]);
  return { catalog, overview, shapes, error, loading, resolution, countryGeography };
}
