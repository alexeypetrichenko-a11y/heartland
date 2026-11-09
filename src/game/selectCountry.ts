import type { CountryId, GameState } from './models.ts';

/** Assign one local player; AI controllers are labels only, with no behavior. */
export function selectCountry(state: GameState, countryId: CountryId): GameState {
  if (!state.countries.some(country => country.id === countryId)) {
    throw new Error('Select an available country.');
  }
  return {
    ...state,
    playerCountryId: countryId,
    countries: state.countries.map(country => ({
      ...country,
      controller: country.id === countryId ? 'player' : 'ai',
    })),
  };
}
