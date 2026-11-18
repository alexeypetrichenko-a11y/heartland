import type { ReactNode } from 'react';
import type { AtlasCountry } from '../geography/atlas';
import { regionName } from '../geography/atlasRegions';
import { countryPlayability, type CountryGeography } from '../geography/countrySelection';
import type { GeographicRegion } from '../geography/types';

const playabilityLabels = {
  undecided: 'Playability undecided',
  playable: 'Playable',
  unavailable: 'Unavailable for play',
};

function AtlasInspectionPanel({ name, kind, onClear, children }: { name: string; kind: 'country' | 'region'; onClear: () => void; children: ReactNode }) {
  return <section className={`atlas-selection-panel atlas-${kind}-panel`} aria-labelledby="atlas-inspection-name">
    <div className="atlas-inspection-facts">
      <h3 id="atlas-inspection-name">{name}</h3>
      {children}
    </div>
    <button type="button" aria-label={`Clear ${kind} selection`} onClick={onClear}>×</button>
  </section>;
}

export function AtlasCountryPanel({ country, geography, onClear }: {
  country: AtlasCountry;
  geography?: CountryGeography;
  onClear: () => void;
}) {
  const [longitude, latitude] = country.label;
  const coordinates = `${Math.abs(latitude).toFixed(2)}° ${latitude < 0 ? 'S' : 'N'}, ${Math.abs(longitude).toFixed(2)}° ${longitude < 0 ? 'W' : 'E'}`;
  return <AtlasInspectionPanel kind="country" name={country.name} onClear={onClear}>
    <p>{geography?.subregion || geography?.continent || `Map point ${coordinates}`}</p>
    <p className="atlas-inspection-id"><span className="sr-only">Geographic ID </span><code>{country.id}</code></p>
    <p>{playabilityLabels[countryPlayability(country.id)]}</p>
  </AtlasInspectionPanel>;
}

export function AtlasRegionPanel({ region, country, onClear }: { region: GeographicRegion; country: AtlasCountry; onClear: () => void }) {
  const codes = [region.source.adm1_code, region.source.iso_3166_2].filter(code => typeof code === 'string' && code && code !== '-99');
  return <AtlasInspectionPanel kind="region" name={regionName(region)} onClear={onClear}>
    <p><span className="sr-only">Parent country </span>{country.name}</p>
    <p className="atlas-inspection-id"><span className="sr-only">Geographic ID </span><code>{region.id}</code></p>
    {codes.length > 0 && <p><span className="sr-only">Source codes </span><code>{codes.join(' · ')}</code></p>}
  </AtlasInspectionPanel>;
}
