/**
 * Worked example of the integration API on the game's fictional scenario (ECON-05).
 *
 *   npm run example
 *
 * It plays the part of the game: it launches a game with Alden as the player,
 * shows the dashboard figures the UI would display, submits economic decisions,
 * lets a military capture change a region's owner, saves and restores, and
 * keeps going. It imports nothing from the game; `fictionalGameWorld()` is a copy
 * of the fields of `src/game/initialState.ts` the economy needs.
 */
import type { CountryEconomyView, EconomySession } from '../src/integration/index.ts';
import {
  advanceEconomyWeek, checkEconomyCommands, createEconomySession, economyFingerprint, fictionalGameWorld, getCountryEconomy,
  getRegionEconomy, legacyEconomyView, loadEconomySession, saveEconomySession,
} from '../src/integration/index.ts';

const pct = (x: number | null) => (x === null ? '—' : `${(x * 100).toFixed(1)}%`);
const num = (x: number) => x.toFixed(1);

function dashboard(view: CountryEconomyView): string {
  return `${view.name.padEnd(7)} GDP ${num(view.gdpReal).padStart(6)} (growth ${pct(view.gdpGrowth)})  inflation ${pct(view.inflation)}  unemployment ${pct(view.unemployment)}`
    + `  stability ${view.stability.toFixed(0)}  treasury ${num(view.treasury)}  debt ${pct(view.debtToGdp)} of GDP  policy rate ${pct(view.centralBank.policyRate)}`;
}

function show(session: EconomySession, title: string): void {
  console.log(`\n== Week ${session.week}: ${title}`);
  for (const view of session.summary.countries) console.log('  ' + dashboard(view));
  for (const event of session.summary.events) if (!event.type.startsWith('unrest')) console.log(`  event: ${event.type} (${event.countryId})`);
}

// 1. The player launches a game: only now is an economy built.
const world = fictionalGameWorld('alden');
const started = performance.now();
let session = createEconomySession(world);
console.log(`Economy created in ${(performance.now() - started).toFixed(0)} ms for ${world.countries.length} countries and ${world.regions.length} regions.`);
show(session, 'start of the game');

// 2. What the current economy panel would show during the migration.
console.log('\nLegacy panel numbers for Alden:', legacyEconomyView(getCountryEconomy(session, 'alden')));

// 3. The player prepares decisions; the UI checks them before the week is resolved.
const decisions = [
  { type: 'set-tax' as const, countryId: 'alden', tax: 'income' as const, rate: 0.22 },
  { type: 'set-spending' as const, countryId: 'alden', category: 'infrastructure' as const, share: 0.05 },
];
console.log('\nCheck of the decisions:', checkEconomyCommands(session, decisions) ?? 'valid');
console.log('Check of an order for another country:', checkEconomyCommands(session, [{ type: 'set-tax', countryId: 'belora', tax: 'income', rate: 0.5 }]));

// 4. Twelve weeks: the decisions take effect in the first one.
for (let k = 0; k < 12; k++) session = advanceEconomyWeek(session, { playerCommands: k === 0 ? decisions : [] });
show(session, 'after twelve weeks');

// 5. The game's military turn: Alden captures Amber Plain. The economy is told the new owner.
const regions = world.regions.map(region => ({ id: region.id, ownerId: region.id === 'amber-plain' ? 'alden' : region.ownerId }));
session = advanceEconomyWeek(session, { regionControl: regions });
const amber = getRegionEconomy(session, 'amber-plain');
console.log(`\nAmber Plain: controlled by ${amber.controllerId}, legally ${amber.legalOwnerId}, occupied ${amber.occupied} (${amber.occupationPolicy}),`
  + ` agriculture output ${num(amber.sectors.find(sector => sector.sectorId === 'agriculture')!.output)}`);

// 6. Save with the game, restore, and continue: the restored game is identical.
const save = saveEconomySession(session);
const restored = loadEconomySession(save);
console.log(`\nSaved ${(save.length / 1024).toFixed(0)} KB; fingerprint ${economyFingerprint(session)} = ${economyFingerprint(restored)}`);
for (let k = 0; k < 26; k++) session = advanceEconomyWeek(session, { regionControl: regions });
show(session, 'half a year of occupation later');
