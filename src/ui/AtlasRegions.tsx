import { useMemo } from 'react';
import { intersectsGeography, type AtlasShape } from '../geography/atlas';
import type { AtlasRegion } from '../geography/atlasRegions';
import { COUNTRY_HIGHLIGHT, COUNTRY_HIGHLIGHT_OPACITY } from '../geography/countrySelection';
import type { GeographicBounds, GeographicRegionId } from '../geography/types';

export function AtlasRegions({ entries, parent, bounds, offsets, selectedId }: {
  entries: AtlasRegion[];
  parent: AtlasShape;
  bounds: GeographicBounds[];
  offsets: number[];
  selectedId: GeographicRegionId | undefined;
}) {
  const mask = useMemo(() => parent.parts.map(part => part.path).join(''), [parent]);
  const visible = useMemo(() => entries.flatMap(entry => {
    const parts = entry.parts.filter(part => bounds.some(box => intersectsGeography(part.bbox, box)));
    if (!parts.length) return [];
    return [{ id: entry.id, path: parts.map(part => part.path).join(''), outline: parts.map(part => part.outline).join('') }];
  }), [entries, bounds]);
  const selected = visible.find(entry => entry.id === selectedId);

  return <g className="atlas-regions" data-region-country={parent.id}>
    <defs><clipPath id="atlas-region-parent"><path d={mask} clipRule="evenodd" /></clipPath></defs>
    {offsets.map(offset => <g key={offset} transform={`translate(${offset} 0)`} data-region-offset={offset}>
      <g clipPath="url(#atlas-region-parent)">
        {visible.map(entry => <path key={entry.id} d={entry.outline} data-region-id={entry.id}
          fill="none" stroke="#132539" strokeOpacity={.65} strokeWidth={.75} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />)}
        {selected && <g data-selected-region={selected.id}>
          <path d={selected.path} fillRule="evenodd" fill={COUNTRY_HIGHLIGHT} fillOpacity={COUNTRY_HIGHLIGHT_OPACITY} />
          <path d={selected.outline} fill="none" stroke={COUNTRY_HIGHLIGHT} strokeWidth={1.6} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        </g>}
      </g>
    </g>)}
  </g>;
}
