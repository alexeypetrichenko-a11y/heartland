import { useEffect, useRef, useState } from 'react';
import { planRegionChunks, projectRegionChunk, usableRegions, type AtlasRegion } from '../geography/atlasRegions';
import { createGeographyLoader } from '../geography/loadGeography';
import type { CountryGeography } from '../geography/countrySelection';
import type { GeographicBounds, GeographicCountryId, GeographicPosition, GeographicRegion } from '../geography/types';

type RegionStatus = 'loading' | 'ready' | 'missing' | 'outside' | 'limited' | 'error';
type Snapshot = { countryId: GeographicCountryId; entries: AtlasRegion[]; status: RegionStatus };
type Cache = { countryId: GeographicCountryId; regions?: GeographicRegion[]; chunks: Map<string, AtlasRegion[]> };

export function useAtlasRegions(countryId: GeographicCountryId | null, geography: CountryGeography | undefined,
    bounds: GeographicBounds[], focus: GeographicPosition, revision: number) {
  const source = useRef<ReturnType<typeof createGeographyLoader> | null>(null);
  const cache = useRef<Cache | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);

  useEffect(() => {
    if (!countryId || !geography) {
      cache.current = null;
      setSnapshot(null);
      return;
    }
    const id = countryId;
    const regionIndex = geography.regionIndex;
    const controller = new AbortController();
    const signal = controller.signal;
    const loader = source.current ??= createGeographyLoader({ appBaseUrl: import.meta.env.BASE_URL });

    async function loadVisible() {
      const current: Cache = cache.current?.countryId === id ? cache.current : { countryId: id, chunks: new Map() };
      cache.current = current;
      try {
        if (!current.regions) {
          const index = await loader.loadRegionIndexAsset(id, regionIndex, signal);
          if (signal.aborted) return;
          current.regions = usableRegions(index);
        }
        if (!current.regions.length) {
          setSnapshot({ countryId: id, entries: [], status: 'missing' });
          return;
        }

        const plan = planRegionChunks(current.regions, bounds, focus);
        const keep = new Set(plan.assets.map(asset => asset.path));
        for (const key of current.chunks.keys()) if (!keep.has(key)) current.chunks.delete(key);
        const publish = (status: RegionStatus) => setSnapshot({ countryId: id, entries: [...current.chunks.values()].flat(), status });
        if (!plan.assets.length) {
          publish(plan.limited ? 'limited' : 'outside');
          return;
        }

        // Existing geometry remains available while each new chunk arrives.
        let failed = false;
        for (const asset of plan.assets) {
          if (current.chunks.has(asset.path)) continue;
          try {
            const collection = await loader.loadRegionChunk(id, asset, signal);
            if (signal.aborted) return;
            current.chunks.set(asset.path, projectRegionChunk(collection, current.regions, asset.path));
            publish('loading');
          } catch {
            if (signal.aborted) return;
            failed = true;
          }
        }
        publish(failed ? 'error' : plan.limited ? 'limited' : 'ready');
      } catch {
        if (!signal.aborted) setSnapshot({ countryId: id, entries: [], status: 'error' });
      }
    }

    // Continuous pan/zoom can cancel pending requests before starting new work.
    const timer = window.setTimeout(loadVisible, 180);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [countryId, geography, bounds, focus, revision]);

  return snapshot?.countryId === countryId ? snapshot : null;
}
