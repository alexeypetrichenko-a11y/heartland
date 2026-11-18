import type { AtlasCountry } from '../geography/atlas';
import { countryPlayability, type CountryGeography } from '../geography/countrySelection';

const playabilityLabels = {
  undecided: 'Playability undecided',
  playable: 'Playable',
  unavailable: 'Unavailable for play',
};

export function AtlasCountryPanel({ country, geography, onClear }: {
  country: AtlasCountry;
  geography?: CountryGeography;
  onClear: () => void;
}) {
  const [longitude, latitude] = country.label;
  const coordinates = `${Math.abs(latitude).toFixed(2)}° ${latitude < 0 ? 'S' : 'N'}, ${Math.abs(longitude).toFixed(2)}° ${longitude < 0 ? 'W' : 'E'}`;
  return <section className="atlas-country-panel" aria-labelledby="atlas-country-name">
    <div className="atlas-country-facts">
      <h3 id="atlas-country-name">{country.name}</h3>
      <p>{geography?.subregion || geography?.continent || `Map point ${coordinates}`}</p>
      <p className="atlas-country-id"><span className="sr-only">Geographic ID </span><code>{country.id}</code></p>
      <p>{playabilityLabels[countryPlayability(country.id)]}</p>
    </div>
    <button type="button" aria-label="Clear country selection" onClick={onClear}>×</button>
  </section>;
}
