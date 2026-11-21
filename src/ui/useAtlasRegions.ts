import { useEffect, useRef, useState } from 'react';
import { intersectsGeography } from '../geography/atlas';
import { planRegionChunks, projectRegionChunk, usableRegions, type AtlasRegion } from '../geography/atlasRegions';
import { createGeographyLoader } from '../geography/loadGeography';
import type { CountryGeography } from '../geography/countrySelection';
import type { GeographicBounds, GeographicCountryId, GeographicPosition, GeographicRegion } from '../geography/types';

type RegionStatus = 'loading' | 'ready' | 'missing' | 'unavailable' | 'incomplete' | 'outside' | 'limited' | 'error';
type Snapshot = { countryId: GeographicCountryId; entries: AtlasRegion[]; status: RegionStatus };
type Cache = { countryId: GeographicCountryId; regions?: GeographicRegion[]; unavailable?: GeographicRegion[]; chunks: Map<string, AtlasRegion[]> };

export function useAtlasRegions(countryId: GeographicCountryId | null, geography: CountryGeography | undefined,
    bounds: GeographicBounds[], focus: GeographicPosition, revision: number, prefetch: boolean) {
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
          current.unavailable = index?.regions.filter(region => region.geometryStatus !== 'valid');
        }
        if (!current.regions.length) {
          setSnapshot({ countryId: id, entries: [], status: regionIndex ? 'unavailable' : 'missing' });
          return;
        }

        const plan = planRegionChunks(current.regions, bounds, focus);
        const keep = new Set(plan.assets.map(asset => asset.path));
        for (const key of current.chunks.keys()) if (!keep.has(key)) current.chunks.delete(key);
        const publish = (status: RegionStatus) => {
          const entries = [...current.chunks.values()].flat();
          setSnapshot(previous => {
            if (previous?.countryId === id && previous.entries.length === entries.length &&
              previous.entries.every((entry, i) => entry === entries[i])) {
              return previous.status === status ? previous : { ...previous, status };
            }
            return { countryId: id, entries, status };
          });
        };
        const incomplete = current.unavailable?.some(region => bounds.some(box => intersectsGeography(region.bbox, box)));
        if (!plan.assets.length) {
          publish(plan.limited ? 'limited' : incomplete ? 'unavailable' : 'outside');
          return;
        }

        // Existing geometry remains available while each new chunk arrives.
        let failed = false;
        if (plan.assets.some(asset => !current.chunks.has(asset.path))) publish('loading');
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
        publish(failed ? 'error' : plan.limited ? 'limited' : incomplete ? 'incomplete' : 'ready');
      } catch {
        if (!signal.aborted) setSnapshot({ countryId: id, entries: [], status: 'error' });
      }
    }

    // Continuous pan/zoom can cancel pending requests before starting new work.
    const timer = window.setTimeout(loadVisible, prefetch ? 0 : 180);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [countryId, geography, bounds, focus, revision, prefetch]);

  return snapshot?.countryId === countryId ? snapshot : null;
}
