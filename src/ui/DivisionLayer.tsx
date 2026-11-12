import { useRef, type PointerEvent } from 'react';
import type { MapDivision } from './mapDivisions';

type MarkerProps = { division: MapDivision; scale: number; selected: boolean; onSelect: () => void; onFocus: (element: SVGGElement) => void };

function DivisionMarker({ division, scale, selected, onSelect, onFocus }: MarkerProps) {
  const pointer = useRef<{ id: number; x: number; y: number; cancelled: boolean } | null>(null);
  const suppressClick = useRef(false);
  function moved(event: PointerEvent<SVGGElement>) {
    const start = pointer.current;
    if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) >= 6) start.cancelled = true;
  }
  const own = division.visibility === 'own';
  const label = `${division.name}, ${division.countryName}, ${division.regionName}, ${own ? 'your division' : 'identified in latest combat report'}. Illustrative region marker.`;
  return <g className="division-marker" data-map-interactive="true" data-division-id={division.id} data-visibility={division.visibility}
    role="button" tabIndex={0} aria-pressed={selected} aria-controls="region-details"
    aria-label={label}
    onFocus={event => onFocus(event.currentTarget)}
    onPointerDown={event => {
      event.stopPropagation();
      if (event.button !== 0) return;
      if (pointer.current) {
        pointer.current.cancelled = true;
        suppressClick.current = true;
      } else {
        pointer.current = { id: event.pointerId, x: event.clientX, y: event.clientY, cancelled: false };
        suppressClick.current = false;
      }
      event.currentTarget.setPointerCapture(event.pointerId);
    }}
    onPointerMove={event => { event.stopPropagation(); moved(event); }}
    onPointerUp={event => {
      event.stopPropagation();
      moved(event);
      if (pointer.current?.id === event.pointerId) {
        suppressClick.current = pointer.current.cancelled;
        pointer.current = null;
      }
    }}
    onPointerCancel={() => { pointer.current = null; suppressClick.current = true; }}
    onLostPointerCapture={() => {
      if (pointer.current) { pointer.current = null; suppressClick.current = true; }
    }}
    onClick={event => {
      event.stopPropagation();
      if (event.detail === 0 || !suppressClick.current) onSelect();
    }}
    onKeyDown={event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        event.stopPropagation();
        onSelect();
      }
    }}>
    <title>{label}</title>
    {/* The anchor shares the geographic camera; only the symbol/target keeps a 44px screen size. */}
    <g transform={`translate(${division.position.x} ${division.position.y}) scale(${1 / scale})`}>
      <rect className="division-hit-area" x="-22" y="-22" width="44" height="44" rx="8" fill="transparent" />
      <rect className="division-focus" x="-20" y="-20" width="40" height="40" rx="8" />
      <rect className="division-symbol" x="-12" y="-9" width="24" height="18" rx="3" />
      <path className="division-cross" d="M-9-6L9 6M9-6L-9 6" />
    </g>
  </g>;
}

type Props = { enabled: boolean; divisions: MapDivision[]; scale: number; selectedId: string | null; onSelect: (division: MapDivision) => void; onFocus: (element: SVGGElement) => void };

// A camera child, independent of visibility decisions and simulation commands.
export function DivisionLayer({ enabled, divisions, scale, selectedId, onSelect, onFocus }: Props) {
  return <g id="map-divisions-overlay" role="group" aria-label="Division region markers" display={enabled ? undefined : 'none'}>
    {enabled && divisions.map(division => <DivisionMarker key={division.id} division={division} scale={scale}
      selected={division.id === selectedId} onSelect={() => onSelect(division)} onFocus={onFocus} />)}
  </g>;
}
