import { useEffect, useState } from 'react';
import { intersectsGeography, projectGeography, projectPolygonParts } from '../geography/atlas';
import { createGeographyLoader } from '../geography/loadGeography';
import type { GeographicBounds, GeographicCountryId, GeographicRegionId, GeographicPosition } from '../geography/types';
import type { EuropeScenario } from '../game/europeScenario';
import type { GameState } from '../game/models';

const bounds: GeographicBounds = [-13, 33, 47, 62];
const colors: Record<string, string> = {
  fra: '#577eb5', deu: '#84736c', gbr: '#996387', ita: '#427d68', pol: '#a76065', tur: '#a7824e',
};
type Part = ReturnType<typeof projectPolygonParts>[number];
type ProvinceShape = { parts: Part[]; outline: string };

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
  const background = geography.loadOverview().then(collection => collection.features.flatMap(feature => projectPolygonParts(feature.geometry))
    .filter(part => intersectsGeography(part.bbox, bounds)).map(part => part.path).join(''));
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
  const [outlines, regions] = await Promise.all([background, provinces]);
  return { outlines, regions };
}

let mapRequest: Promise<Awaited<ReturnType<typeof loadMap>>> | undefined;

export function EuropeMap({ scenario, state, inspect }: { scenario: EuropeScenario; state: GameState; inspect?: { id: string } | null }) {
  const [selected, setSelected] = useState(() => scenario.provinces.find(region => region.ownerId === state.playerCountryId)?.id ?? scenario.provinces[0].id);
  const [focus, setFocus] = useState('');
  const [map, setMap] = useState<Awaited<ReturnType<typeof loadMap>>>();
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    mapRequest ??= loadMap(scenario).catch(error => { mapRequest = undefined; throw error; });
    void mapRequest.then(value => { if (active) setMap(value); }).catch(reason => {
      if (active) setError(reason instanceof Error ? reason.message : 'Europe’s map could not load.');
    });
    return () => { active = false; };
  }, [scenario, attempt]);
  useEffect(() => {
    const province = scenario.provinces.find(region => region.id === inspect?.id);
    if (!province) return;
    setSelected(province.id);
    setFocus(current => current ? province.ownerId : current);
  }, [inspect, scenario]);

  function selectProvince(id: string, ownerId: string) {
    setSelected(id);
    if (focus) setFocus(ownerId);
  }

  const province = scenario.provinces.find(region => region.id === selected)!;
  const region = state.regions.find(region => region.id === selected)!;
  const owner = state.countries.find(country => country.id === region.ownerId)!;
  const names = (ids: string[]) => ids.map(id => state.regions.find(region => region.id === id)?.name ?? id).join(', ') || 'None';
  let frame = bounds;
  if (focus && map) {
    const parts = scenario.provinces.filter(region => region.ownerId === focus).flatMap(region => map.regions.get(region.id)!.parts);
    frame = [Math.min(...parts.map(part => part.bbox[0])) - 1, Math.min(...parts.map(part => part.bbox[1])) - 1,
      Math.max(...parts.map(part => part.bbox[2])) + 1, Math.max(...parts.map(part => part.bbox[3])) + 1];
  }
  const [west, south, east, north] = frame;

  return <section className="europe-map" aria-label="Europe 2023 provinces">
    <div className="europe-map-controls">
      <div><label htmlFor="europe-map-view">Map view</label><select id="europe-map-view" value={focus} onChange={event => setFocus(event.target.value)}>
        <option value="">All six countries</option>
        {scenario.countries.map(country => <option key={country.id} value={country.id}>{country.name}</option>)}
      </select></div>
      <div><label htmlFor="europe-province">Province</label><select id="europe-province" value={selected} onChange={event => {
        const region = scenario.provinces.find(region => region.id === event.target.value)!;
        selectProvince(region.id, region.ownerId);
      }}>
        {scenario.countries.map(country => <optgroup key={country.id} label={country.name}>
          {scenario.provinces.filter(region => region.ownerId === country.id).map(region => <option key={region.id} value={region.id}>{region.name}</option>)}
        </optgroup>)}
      </select></div>
    </div>
    {map ? <svg className="europe-provinces" viewBox={`${west + 180} ${90 - north} ${east - west} ${north - south}`} aria-label="Map of the 46 playable provinces" role="group">
      <path d={map.outlines} fill="#293b49" aria-hidden="true" />
      {scenario.provinces.map(region => <path key={region.id} data-province={region.id}
        d={map.regions.get(region.id)!.parts.map(part => part.path).join('')} fill={selected === region.id ? '#e4b15e' : colors[state.regions.find(current => current.id === region.id)!.ownerId]}
        fillRule="evenodd" onClick={() => selectProvince(region.id, region.ownerId)}>
        <title>{region.name}</title>
      </path>)}
      <g aria-hidden="true" pointerEvents="none" fill="none" stroke="#13212c" strokeWidth="0.85" strokeLinecap="round">
        {scenario.provinces.map(region => <path key={region.id} d={map.regions.get(region.id)!.outline} vectorEffect="non-scaling-stroke" />)}
      </g>
    </svg> : error ? <p role="alert">{error} <button onClick={() => { setError(''); setAttempt(value => value + 1); }}>Retry map</button></p>
      : <p role="status">Loading province boundaries…</p>}
    <div className="region-summary" aria-live="polite">
      <h3>{province.name}</h3><p>Controlled by {owner.name}</p>
      <details><summary>Province connections</summary>
        <dl className="data-list">
          <div><dt>Land borders</dt><dd>{names(province.landAdjacentRegionIds)}</dd></div>
          <div><dt>Maritime trade</dt><dd>{names(province.maritimeLinkedRegionIds)}</dd></div>
          <div><dt>Military movement links</dt><dd>{names(province.movementAdjacentRegionIds)}</dd></div>
        </dl>
      </details>
    </div>
    <p>Boundaries from Natural Earth 5.1.1.</p>
  </section>;
}
