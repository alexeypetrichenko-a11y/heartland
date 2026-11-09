/** Plain data only; IDs refer to entries in the corresponding GameState arrays. */
export type CountryId = string;
export type RegionId = string;

/** Illustrative test values, not approved economic units or balance rules. */
export interface Economy {
  treasury: number;
  weeklyIncome: number;
  weeklyExpenses: number;
}

export interface Country {
  id: CountryId;
  name: string;
  controller: 'player' | 'ai';
  economy: Economy;
}

export interface Region {
  id: RegionId;
  name: string;
  ownerId: CountryId;
  adjacentRegionIds: RegionId[];
}

/** One unordered country pair; neutral starts at 0. No diplomatic behavior yet. */
export interface Relation {
  countryIds: [CountryId, CountryId];
  value: number;
}

/** Location and headcount only; no orders, combat or supply rules yet. */
export interface Division {
  id: string;
  name: string;
  ownerId: CountryId;
  regionId: RegionId;
  manpower: number;
}

/** Temporary inert order for testing persistence; no gameplay effects. */
export interface StandingOrder {
  id: string;
  countryId: CountryId;
  kind: 'placeholder';
  label: string;
}

/** Commands change stored orders; they are not themselves persistent orders. */
export type TurnCommand =
  | { type: 'set-standing-order'; order: StandingOrder }
  | { type: 'cancel-standing-order'; countryId: CountryId; orderId: string };

export interface GameState {
  /** Week 1 is the initial week; no turns have been resolved. */
  week: number;
  /** Reserved for future deterministic simulation; not consumed in T02. */
  seed: number;
  /** Null before selection; all countries are then AI-owned placeholders. */
  playerCountryId: CountryId | null;
  countries: Country[];
  regions: Region[];
  relations: Relation[];
  divisions: Division[];
  standingOrders: StandingOrder[];
}
