import { memo, useEffect, useMemo, useState } from 'react';
import { intersectsGeography, projectGeography, projectPolygonParts } from '../geography/atlas';
import { createGeographyLoader } from '../geography/loadGeography';
import type { GeographicBounds, GeographicCountryId, GeographicRegionId, GeographicPosition } from '../geography/types';
import type { EuropeScenario } from '../game/europeScenario';
import type { GameState } from '../game/models';
import type { PlayerDrafts } from '../game/playerDrafts';
import { militaryEvents, militarySelection } from '../game/strategicLand';
import { projectWorld, type WorldCamera } from '../geography/worldCamera';
import type { AtlasSize } from '../geography/atlas';

const bounds: GeographicBounds = [-13, 33, 47, 62];
const colors: Record<string, string> = {
  fra: '#577eb5', deu: '#84736c', gbr: '#996387', ita: '#427d68', pol: '#a76065', tur: '#a7824e',
};
type Part = ReturnType<typeof projectPolygonParts>[number];
export type ProvinceShape = { parts: Part[]; outline: string };

const point = (position: GeographicPosition) => {
  const { x, y } = projectGeography(position);
  return `${+x.toFixed(6)},${+y.toFixed(6)}`;
};

function addBoundary(edges: Map<string, string>, rings: GeographicPosition[][]) {
  for (const ring of rings) {
    let a = point(ring[0]);
    for (const position of ring.slice(1)) {
      const b = point(position);
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;
      // A shared Admin-1 edge is internal to this game province.
      if (!edges.delete(key)) edges.set(key, `M${a}L${b}`);
      a = b;
    }
  }
}

async function loadMap(scenario: EuropeScenario) {
  const geography = createGeographyLoader({ appBaseUrl: import.meta.env.BASE_URL });
  const provinces = Promise.all(scenario.countries.map(async country => {
    const id: GeographicCountryId = `ne:admin0:${country.iso3}`;
    const index = await geography.loadRegionIndex(id);
    if (!index) throw new Error(`No province geography for ${country.name}.`);
    const regions = scenario.provinces.filter(region => region.ownerId === country.id);
    const members = new Map(regions.flatMap(region => (region.naturalEarth.admin1 ?? []).map(member => [member, region.id] as const)));
    const assets = new Map(index.regions.filter(region => members.has(region.id) && region.geometryStatus === 'valid')
      .map(region => [region.geometry.path, region.geometry]));
    const shapes = new Map(regions.map(region => [region.id, { parts: [] as Part[], edges: new Map<string, string>() }]));
    for (const asset of assets.values()) {
      const chunk = await geography.loadRegionChunk(id, asset);
      for (const feature of chunk.features) {
        const province = members.get(feature.id as GeographicRegionId);
        if (!province) continue;
        const shape = shapes.get(province)!;
        const polygons = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
        projectPolygonParts(feature.geometry).forEach((part, index) => {
          if (!intersectsGeography(part.bbox, bounds)) return;
          shape.parts.push(part);
          addBoundary(shape.edges, polygons[index]);
        });
      }
    }
    for (const region of regions) {
      if (!shapes.get(region.id)?.parts.length) throw new Error(`No usable geography for ${region.name}.`);
    }
    return [...shapes].map(([id, { parts, edges }]): [string, ProvinceShape] => [id, { parts, outline: [...edges.values()].join('') }]);
  })).then(entries => new Map(entries.flat()));
  return { regions: await provinces };
}

let mapRequest: Promise<Awaited<ReturnType<typeof loadMap>>> | undefined;

export type Campaign = {
  scenario: EuropeScenario;
  state: GameState;
  drafts: PlayerDrafts;
  selectedUnits: readonly string[];
  toggleUnit: (id: string) => void;
  selectUnits: (ids: string[]) => void;
  locate: { id: string } | null;
  matchKey: number;
  fixtures: boolean;
  markerStress: boolean;
};

export function useEuropeMap(scenario?: EuropeScenario) {
  const [map, setMap] = useState<Awaited<ReturnType<typeof loadMap>>>();
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!scenario) return;
    let active = true;
    mapRequest ??= loadMap(scenario).catch(error => { mapRequest = undefined; throw error; });
    void mapRequest.then(value => { if (active) setMap(value); }).catch(reason => {
      if (active) setError(reason instanceof Error ? reason.message : 'Europe’s map could not load.');
    });
    return () => { active = false; };
  }, [scenario, attempt]);
  return { map, error, retry: () => { setError(''); setAttempt(value => value + 1); } };
}

export function provinceAnchor(shape: ProvinceShape): GeographicPosition {
  // Use the largest part and choose a point inside it. This denotes a
  // province's presence, with no claim that a formation is stationed here.
  const area = ([w, s, e, n]: Part['bbox']) => (e - w) * (n - s);
  const part = shape.parts.reduce((main, entry) => area(entry.bbox) > area(main.bbox) ? entry : main);
  const [w, s, e, n] = part.bbox;
  const center: GeographicPosition = [(w + e) / 2, (s + n) / 2];
  const context = document.createElement('canvas').getContext('2d');
  if (!context) return center;
  const path = new Path2D(part.path);
  for (const radius of [0, .12, .25, .4]) for (let step = 0; step < 16; step++) {
    const angle = step / 16 * Math.PI * 2;
    const candidate: GeographicPosition = [center[0] + Math.cos(angle) * radius * (e - w), center[1] + Math.sin(angle) * radius * (n - s)];
    const point = projectGeography(candidate);
    if (context.isPointInPath(path, point.x, point.y, 'evenodd')) return candidate;
  }
  return center;
}

export const ProvincePaths = memo(function ProvincePaths({ shapes, state, selected }: {
  shapes: Map<string, ProvinceShape>; state: GameState; selected: string;
}) {
  return <>
    {state.regions.filter(region => shapes.has(region.id)).map(region => <path key={region.id}
      data-province={region.id} d={shapes.get(region.id)!.parts.map(part => part.path).join('')}
      fill={selected === region.id ? '#e4b15e' : colors[region.ownerId] ?? '#435868'} fillRule="evenodd">
      <title>{region.name}</title>
    </path>)}
    <g aria-hidden="true" fill="none" stroke="#192c3b" strokeWidth=".85">
      {[...shapes].map(([id, shape]) => <path key={id} d={shape.outline} vectorEffect="non-scaling-stroke" />)}
    </g>
  </>;
});

type Unit = ReturnType<typeof militarySelection>[number];

export function campaignUnits(state: GameState) {
  const viewer = state.playerCountryId;
  if (!viewer) return [];
  const ids = state.divisions.filter(unit => unit.ownerId === viewer && unit.manpower > 0).map(unit => unit.id);
  return militarySelection(state, viewer, ids);
}

export function ProvinceDetails({ campaign, selected, onProvince, onCountry }: {
  campaign: Campaign; selected: string; onProvince: (id: string) => void; onCountry: (id: string) => void;
}) {
  const { scenario, state } = campaign;
  const province = scenario.provinces.find(region => region.id === selected);
  const region = state.regions.find(region => region.id === selected);
  const eligible = useMemo(() => campaignUnits(state).filter(unit => unit.regionId === selected && unit.status === 'available').map(unit => unit.id), [state, selected]);
  const owner = state.countries.find(country => country.id === region?.ownerId);
  const names = (ids: string[]) => ids.map(id => state.regions.find(region => region.id === id)?.name ?? id).join(', ') || 'None';
  return <section className="europe-map" aria-label="Europe 2023 provinces">
    <div className="europe-map-controls">
      <div><label htmlFor="europe-map-view">Map view</label><select id="europe-map-view" value="" onChange={event => onCountry(event.target.value)}>
        <option value="" disabled>Center on country</option>
        {scenario.countries.map(country => <option key={country.id} value={country.id}>{country.name}</option>)}
      </select></div>
      <div><label htmlFor="europe-province">Province</label><select id="europe-province" value={selected} onChange={event => onProvince(event.target.value)}>
        <option value="" disabled>Select a province</option>
        {scenario.countries.map(country => <optgroup key={country.id} label={country.name}>
          {scenario.provinces.filter(region => region.ownerId === country.id).map(region => <option key={region.id} value={region.id}>{region.name}</option>)}
        </optgroup>)}
      </select></div>
    </div>
    {province && <div className="region-summary" aria-live="polite">
      <h3>{province.name}</h3><p>Controlled by {owner?.name}</p>
      {eligible.length > 0 && <button type="button" onClick={() => campaign.selectUnits(eligible)}>Select available divisions ({eligible.length})</button>}
      <details key={province.id}><summary>Province connections</summary>
        <dl className="data-list">
          <div><dt>Land borders</dt><dd>{names(province.landAdjacentRegionIds)}</dd></div>
          <div><dt>Maritime trade</dt><dd>{names(province.maritimeLinkedRegionIds)}</dd></div>
          <div><dt>Military movement links</dt><dd>{names(province.movementAdjacentRegionIds)}</dd></div>
        </dl>
      </details>
    </div>}
  </section>;
}

const orderStyle = {
  move: { symbol: '→', label: 'Pending move', dash: '7 4' },
  attack: { symbol: '×', label: 'Pending attack', dash: '2 4' },
  active: { symbol: '!', label: 'Active engagement', dash: '' },
  reinforce: { symbol: '+', label: 'Reinforcement', dash: '10 4 2 4' },
  retreat: { symbol: '↶', label: 'Retreat', dash: '4 5' },
};
type Route = { kind: keyof typeof orderStyle; origin?: string | null; destination: string; fixture?: boolean };

function campaignRoutes(campaign: Campaign, units: Unit[]): Route[] {
  const { state, drafts } = campaign;
  const viewer = state.playerCountryId;
  if (!viewer) return [];
  const roster = new Map(units.map(unit => [unit.id, unit]));
  const routes: Route[] = [];
  for (const { divisionId, countryId, order } of drafts.military) {
    if (countryId === viewer && roster.has(divisionId) && order.kind !== 'defend') {
      routes.push({ kind: order.kind, origin: roster.get(divisionId)?.regionId, destination: order.targetRegionId });
    }
  }
  for (const unit of units) {
    const order = state.divisions.find(division => division.id === unit.id)?.order;
    const destination = unit.destination ?? (order?.kind === 'attack' ? order.targetRegionId : undefined);
    if (destination && unit.regionId) routes.push({ kind: 'active', origin: unit.regionId, destination });
  }
  for (const order of drafts.collective ?? []) {
    if (order.countryId !== viewer) continue;
    for (const id of order.divisionIds) {
      const unit = roster.get(id);
      if (!unit?.regionId) continue;
      const action = order.action;
      if (action.kind === 'move' || action.kind === 'attack') routes.push({ kind: action.kind, origin: unit.regionId, destination: action.targetRegionId });
      if (action.kind === 'reinforce') {
        const front = state.strategicLand?.fronts.find(front => front.id === action.engagementId && front.countries.includes(viewer));
        if (front) routes.push({ kind: 'reinforce', origin: unit.regionId, destination: front.target });
      }
      if (action.kind === 'disengage' && action.fallbackRegionId) routes.push({ kind: 'retreat', origin: unit.regionId, destination: action.fallbackRegionId });
    }
  }
  for (const event of militaryEvents(state, viewer)) {
    if (event.kind === 'retreat' && event.regionId) routes.push({ kind: 'retreat', destination: event.regionId });
  }
  if (campaign.fixtures) {
    const origin = units.find(unit => unit.regionId && state.regions.find(region => region.id === unit.regionId)?.adjacentRegionIds.length)?.regionId;
    const destination = state.regions.find(region => region.id === origin)?.adjacentRegionIds[0];
    if (origin && destination) routes.push({ kind: 'reinforce', origin, destination, fixture: true },
      { kind: 'retreat', origin: destination, destination: origin, fixture: true });
  }
  return [...new Map(routes.map(route => [JSON.stringify(route), route])).values()];
}

export function CampaignMarkers({ campaign, view, size, anchors, orders, onInspect, onOpen }: {
  campaign: Campaign; view: WorldCamera; size: AtlasSize; anchors: Map<string, GeographicPosition>;
  orders: boolean; onInspect: (id: string) => void; onOpen: (ids: string[]) => void;
}) {
  const units = useMemo(() => campaignUnits(campaign.state), [campaign.state]);
  const displayUnits = useMemo(() => campaign.markerStress && units.length
    ? Array.from({ length: 90 }, (_, index) => ({ ...units[index % units.length], id: `synthetic-${index}` }))
    : units, [campaign.markerStress, units]);
  const routes = useMemo(() => orders ? campaignRoutes(campaign, units) : [], [campaign, orders, units]);
  const at = (id?: string | null) => {
    const coordinate = id ? anchors.get(id) : undefined;
    return coordinate ? projectWorld(view, size, coordinate, 'flat') : null;
  };
  const groups: { x: number; y: number; ids: string[]; provinces: string[] }[] = [];
  for (const unit of displayUnits) {
    if (!unit.regionId) continue;
    const point = at(unit.regionId);
    if (!point || point.x < 18 || point.y < 20 || point.x > size.width - 18 || point.y > size.height - 20) continue;
    const near = groups.find(group => Math.hypot(group.x - point.x, group.y - point.y) < 45);
    if (near) {
      near.ids.push(unit.id);
      if (!near.provinces.includes(unit.regionId)) near.provinces.push(unit.regionId);
    } else groups.push({ ...point, ids: [unit.id], provinces: [unit.regionId] });
  }
  return <>
    {orders && <svg className="geo-orders" viewBox={`0 0 ${size.width} ${size.height}`} aria-hidden="true">
      {routes.map((route, i) => {
        const start = at(route.origin), end = at(route.destination);
        if (!end) return null;
        const style = orderStyle[route.kind];
        return <g key={i} data-geo-order={route.kind}><title>{style.label}{route.fixture ? ' (fixture)' : ''}</title>
          {start && <path d={`M${start.x} ${start.y}L${end.x} ${end.y}`} strokeDasharray={style.dash} />}
          <text x={start ? (start.x + end.x) / 2 : end.x} y={start ? (start.y + end.y) / 2 : end.y} textAnchor="middle">{style.symbol}</text>
        </g>;
      })}
    </svg>}
    <div className="geo-counters" data-marker-roster={displayUnits.length} data-marker-visible={groups.reduce((total, group) => total + group.ids.length, 0)}>
      {groups.map(group => <button type="button" key={group.ids[0]} style={{ left: group.x, top: group.y }}
        aria-pressed={group.ids.every(id => campaign.selectedUnits.includes(id))}
        aria-label={`${group.ids.length} ${group.ids.length === 1 ? 'division' : 'divisions'} near ${campaign.state.regions.find(region => region.id === group.provinces[0])?.name}`}
        data-geo-counter="" disabled={campaign.markerStress} onPointerDown={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}
        onClick={() => { onInspect(group.provinces[0]); onOpen(group.ids); if (group.ids.length === 1) campaign.toggleUnit(group.ids[0]); }}>
        ◈ {group.ids.length}</button>)}
    </div>
  </>;
}

export function CampaignUnitList({ campaign, open, onClose }: { campaign: Campaign; open: string[]; onClose: () => void }) {
  const units = useMemo(() => campaignUnits(campaign.state), [campaign.state]);
  if (!open.length) return null;
  return <div className="geo-counter-detail" aria-label="Formations in counter">
    <button type="button" onClick={onClose}>Close formations</button>
    <ul>{units.filter(unit => open.includes(unit.id)).map(unit => <li key={unit.id}>
      <button type="button" aria-pressed={campaign.selectedUnits.includes(unit.id)} onClick={() => campaign.toggleUnit(unit.id)}>
        {campaign.state.divisions.find(division => division.id === unit.id)?.name} · {unit.strength.toLocaleString()}
      </button>
    </li>)}</ul>
  </div>;
}

export function OrdersKey({ fixtures }: { fixtures: boolean }) {
  return <p className="geo-orders-key">{Object.values(orderStyle).map(style => `${style.symbol} ${style.label}`).join(' · ')}
    {fixtures && ' · Reinforcement and retreat examples are review fixtures.'}</p>;
}
