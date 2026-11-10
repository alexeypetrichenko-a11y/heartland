/** Plain data only; IDs refer to entries in the corresponding GameState arrays. */
export type CountryId = string;
export type RegionId = string;
export type EconomicPolicy = 'standard' | 'tax-relief';

/** Illustrative test values, not approved economic units or balance rules. */
export interface Economy {
  treasury: number;
  /** Base income before the provisional policy adjustment. */
  weeklyIncome: number;
  weeklyExpenses: number;
}

export interface Country {
  id: CountryId;
  name: string;
  controller: 'player' | 'ai';
  economy: Economy;
  economicPolicy: EconomicPolicy;
}

export interface Region {
  id: RegionId;
  name: string;
  ownerId: CountryId;
  adjacentRegionIds: RegionId[];
}

/** One shared, unordered bilateral score; provisional range -100 to +100. */
export interface Relation {
  countryIds: [CountryId, CountryId];
  value: number;
}

export type DiplomaticCommand =
  | { type: 'declare'; countryId: CountryId; targetId: CountryId; stance: 'goodwill' | 'condemnation' }
  | { type: 'offer-cooperation'; countryId: CountryId; targetId: CountryId }
  | { type: 'respond-offer'; countryId: CountryId; offerId: string; response: 'accept' | 'reject' };

/** The complete local state retains private records; consumers must use the visibility selector. */
export type DiplomaticMessage =
  | {
    id: string; week: number; visibility: 'public'; fromId: CountryId; toId: CountryId;
    stance: 'goodwill' | 'condemnation'; relationshipChange: number; reason: string;
  }
  | {
    id: string; week: number; visibility: 'private'; fromId: CountryId; toId: CountryId;
    status: 'pending' | 'accepted' | 'rejected'; relationshipChange: number; reason: string;
    resolvedWeek?: number; responseReason?: string;
  };

export type MilitaryOrder =
  | { kind: 'defend' }
  | { kind: 'move' | 'attack'; targetRegionId: RegionId };

/** T07 prototype headcounts/orders; no equipment, morale or supply simulation. */
export interface Division {
  id: string;
  name: string;
  ownerId: CountryId;
  regionId: RegionId;
  manpower: number;
  order: MilitaryOrder;
}

export type MilitaryCommand = {
  type: 'set-military-order';
  countryId: CountryId;
  divisionId: string;
  order: MilitaryOrder;
};

/** Outcomes from the most recently resolved week, not an accumulating history. */
export type MilitaryResult =
  | { kind: 'moved'; divisionId: string; fromRegionId: RegionId; targetRegionId: RegionId }
  | { kind: 'cancelled'; divisionId: string; reason: string }
  | {
    kind: 'combat'; divisionId: string; targetRegionId: RegionId;
    attackerCasualties: number;
    defenderCasualties: { divisionId: string; losses: number }[];
    captured: boolean;
  };

/** Temporary inert order for testing persistence; no gameplay effects. */
export interface StandingOrder {
  id: string;
  countryId: CountryId;
  kind: 'placeholder';
  label: string;
}

/** Commands change persistent orders/policy; commands themselves are not stored. */
export type TurnCommand =
  | { type: 'set-standing-order'; order: StandingOrder }
  | { type: 'cancel-standing-order'; countryId: CountryId; orderId: string }
  | { type: 'set-economic-policy'; countryId: CountryId; policy: EconomicPolicy }
  | MilitaryCommand
  | DiplomaticCommand;

export interface GameState {
  /** Week 1 is the initial week; no turns have been resolved. */
  week: number;
  /** Preserved; the current deterministic rules need no random draws. */
  seed: number;
  /** Null before selection; all countries are then AI-owned placeholders. */
  playerCountryId: CountryId | null;
  countries: Country[];
  regions: Region[];
  relations: Relation[];
  divisions: Division[];
  standingOrders: StandingOrder[];
  militaryResults: MilitaryResult[];
  diplomaticMessages: DiplomaticMessage[];
}
