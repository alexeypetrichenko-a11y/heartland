/**
 * Worked example of the integration contract on the game's fictional scenario.
 *
 *   npm run example
 *
 * It plays the part of the game:
 *  - it launches a game with Alden as the player from the pre-built starting economy;
 *  - it shows the dashboard figures the UI would display;
 *  - it drafts the player's fiscal controls (three taxes, four spending shares);
 *  - it resolves weeks with the combined weekly turn: a stand-in for the game's own turn
 *    (no T06 any more) captures a region, which the economy treats as an occupation;
 *  - it shows the week's notices, then saves, restores and keeps going.
 *
 * It imports nothing from the game; `fictionalGameWorld()` is a copy of the fields of
 * `src/game/initialState.ts` the economy needs.
 */
import { readFileSync } from 'node:fs';
import type { CountryEconomyView, EconomySession } from '../src/integration/index.ts';
import {
  advanceWeekTogether, checkEconomyCommands, economyFingerprint, fictionalGameWorld, fiscalCommands, fiscalLimits, getCountryEconomy,
  getRegionEconomy, loadEconomySession, saveEconomySession, startEconomyFromSave, weeklyEconomyNotices,
} from '../src/integration/index.ts';

const pct = (x: number | null) => (x === null ? '—' : `${(x * 100).toFixed(1)}%`);
const num = (x: number) => x.toFixed(1);

function dashboard(view: CountryEconomyView): string {
  return `${view.name.padEnd(7)} GDP ${num(view.gdpReal).padStart(6)} (growth ${pct(view.gdpGrowth)})  inflation ${pct(view.inflation)}  unemployment ${pct(view.unemployment)}`
    + `  stability ${view.stability.toFixed(0)}  treasury ${num(view.treasury)}  debt ${pct(view.debtToGdp)} of GDP  balance ${num(view.budget.balance)}`;
}

function show(session: EconomySession, title: string): void {
  console.log(`\n== Week ${session.week}: ${title}`);
  for (const view of session.summary.countries) console.log('  ' + dashboard(view));
  for (const notice of weeklyEconomyNotices(session)) console.log(`  [${notice.severity}] ${notice.title}: ${notice.message}`);
}

// 1. The player launches a game: the economy starts from the pre-built week-1 save (no calibration).
const world = fictionalGameWorld('alden');
const started = performance.now();
let session = startEconomyFromSave(readFileSync(new URL('../scenarios/fictional-week1.economy.json', import.meta.url), 'utf8'), world);
console.log(`Economy started from the save in ${(performance.now() - started).toFixed(1)} ms.`);
show(session, 'start of the game');

// 2. The fiscal controls the UI shows: current values and the engine's limits.
const alden = getCountryEconomy(session, 'alden');
console.log('\nAlden fiscal policy:', JSON.stringify(alden.fiscal), 'limits:', JSON.stringify(fiscalLimits(session)));

// 3. The player drafts new values; the UI checks them while they are edited.
const draft = fiscalCommands('alden', { taxes: { income: 0.24, corporate: 0.2 }, spending: { infrastructure: 0.05 } });
console.log('Draft:', JSON.stringify(draft));
console.log('Check:', checkEconomyCommands(session, draft) ?? 'valid');
console.log('Check of an out-of-range rate:', checkEconomyCommands(session, fiscalCommands('alden', { taxes: { consumption: 0.9 } })));

// 4. A stand-in for the game's own weekly turn after the migration (diplomacy, AI, military; no T06).
interface Game { week: number; regions: { id: string; ownerId: string }[] }
let game: Game = { week: 1, regions: world.regions.map(region => ({ id: region.id, ownerId: region.ownerId })) };
const gameTurn = (captureAmber: boolean) => (g: Game): Game => ({
  week: g.week + 1,
  regions: g.regions.map(region => (captureAmber && region.id === 'amber-plain' ? { ...region, ownerId: 'alden' } : region)),
});

// 5. Twelve weeks, the draft taking effect in the first; then Alden captures Amber Plain.
for (let k = 0; k < 12; k++) ({ game, session } = advanceWeekTogether({ game, session, advanceGame: gameTurn(false), economyCommands: k === 0 ? draft : [] }));
show(session, 'after twelve weeks');
({ game, session } = advanceWeekTogether({ game, session, advanceGame: gameTurn(true) }));
const amber = getRegionEconomy(session, 'amber-plain');
show(session, 'the week of the capture');
console.log(`  Amber Plain: controlled by ${amber.controllerId}, legally ${amber.legalOwnerId} (${amber.occupationPolicy} occupation)`);

// 6. Save with the game, restore, and continue: the restored game is identical.
const save = saveEconomySession(session);
const restored = loadEconomySession(save);
console.log(`\nSaved ${(save.length / 1024).toFixed(0)} KB; fingerprint ${economyFingerprint(session)} = ${economyFingerprint(restored)}`);
for (let k = 0; k < 26; k++) ({ game, session } = advanceWeekTogether({ game, session: k === 0 ? restored : session, advanceGame: gameTurn(true) }));
show(session, 'half a year of occupation later');
