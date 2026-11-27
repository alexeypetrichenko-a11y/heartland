/**
 * MIL-00R-DESIGN cross-check against the MIL-00-ENGINE resolver (PR #41).
 *
 * This file needs the PR #41 source tree: it is not runnable on main, where `strategicLand.ts` does not
 * exist yet. In a checkout of PR #41 at e24a6136b (or later, if the resolver is unchanged):
 *
 *   node --experimental-strip-types docs/military/tools/mil00r_engine_check.ts [mil00r-results.json] [out.json]
 *
 * It uses the PR #41 resolver unchanged. A prototype recovery step below changes manpower between
 * settlements, standing in for the future MIL-00R settlement step. Given the Python results file
 * (python3 docs/military/tools/mil00r_calibrate.py --json FILE), it also checks that the Python mirror
 * matches the engine.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createInitialState } from '../../../src/game/initialState.ts';
import type { GameState } from '../../../src/game/models.ts';
import { selectCountry } from '../../../src/game/selectCountry.ts';
import { collectiveReasons, resolveStrategicLand, startStrategicLand, type CollectiveOrder } from '../../../src/game/strategicLand.ts';

const FULL = 25000;

function fixture(strength = FULL): GameState {
  const game = selectCountry(createInitialState(), 'alden');
  game.regions[1].adjacentRegionIds.push('amber-plain');
  game.regions[2].adjacentRegionIds.push('reed-coast');
  game.divisions = [
    { ...game.divisions[0], id: 'a0', regionId: 'alden-vale', manpower: FULL },
    { ...game.divisions[1], id: 'd0', manpower: FULL },
  ];
  const started = startStrategicLand(game);
  started.divisions = started.divisions.map(d => d.id === 'a0' ? { ...d, manpower: strength } : d);
  return started;
}

const attack = (game: GameState): CollectiveOrder =>
  ({ id: `a0@${game.week}`, divisionIds: ['a0'], countryId: 'alden', week: game.week, action: { kind: 'attack', targetRegionId: 'amber-plain' } });
const settle = (game: GameState, orders: CollectiveOrder[] = []): GameState =>
  ({ ...game, ...resolveStrategicLand(game, orders), week: game.week + 1 });
const engineAccepts = (game: GameState) => collectiveReasons(game, attack(game)).length === 0;
const unit = (game: GameState, id: string) => game.divisions.find(d => d.id === id)!;
const engaged = (game: GameState, id: string) => game.strategicLand!.fronts.some(f => f.sides.some(side => side.includes(id)));

/** One assault from a0 against d0; returns the game after the front closes and the weeks fought. */
function assault(start: GameState) {
  let game = settle(start, [attack(start)]);
  let weeks = 1;
  while (game.strategicLand!.fronts.length && weeks < 52) {
    game = settle(game);
    weeks++;
  }
  return { game, weeks, attackerLoss: unit(start, 'a0').manpower - unit(game, 'a0').manpower, captured: game.regions[2].ownerId === 'alden' };
}

// 1. No recovery: the repelled formation never regains offensive eligibility.
const first = assault(fixture());
let idle = first.game;
const stalled: Record<string, { manpower: number; engineAccepts: boolean; reason: string | null }> = {};
while (idle.week <= 156) {
  if ([52, 104, 156].includes(idle.week)) {
    const reasons = collectiveReasons(idle, attack(idle));
    stalled[`week${idle.week}`] = { manpower: unit(idle, 'a0').manpower, engineAccepts: !reasons.length, reason: reasons[0]?.reason ?? null };
  }
  idle = settle(idle);
}

// 2. Re-entry strength against a fresh defender, with the retained 25,000 baseline.
const reentry = [20001, 21250, 22500, 23750, 25000].map(strength => {
  const result = assault(fixture(strength));
  return { reentry: strength, weeks_fought: result.weeks, attacker_loss: result.attackerLoss, outcome: result.captured ? 'captured' : 'repelled' };
});

// 3. Prototype MIL-00R step (model B, proposal P0): 7,500 trained replacements in the depot, 2,500 a week per
//    division, from the settlement after the unit left combat; proposed offensive bar 90%.
let game = first.game;
const released = game.week - 1;
let depot = Math.floor(15 * FULL * 0.02);
const marks: Record<string, number> = {};
while (game.week <= 40) {
  if (!marks.ready80 && engineAccepts(game)) marks.ready80 = game.week;
  if (!marks.ready90 && engineAccepts(game) && unit(game, 'a0').manpower * 100 >= 90 * FULL) marks.ready90 = game.week;
  if (!marks.full && unit(game, 'a0').manpower >= FULL) marks.full = game.week;
  const week = game.week;
  game = settle(game);
  if (week > released && !engaged(game, 'a0')) {
    const a0 = unit(game, 'a0');
    const grant = Math.min(Math.floor(FULL * 0.1), FULL - a0.manpower, depot);
    depot -= grant;
    game = { ...game, divisions: game.divisions.map(d => d.id === 'a0' ? { ...d, manpower: d.manpower + grant } : d) };
  }
}

// 4. After the refit, a fresh defender and a full-strength attacker repeat the first assault exactly.
game = { ...game, divisions: game.divisions.map(d => d.id === 'd0' ? { ...d, manpower: FULL } : d) };
const second = assault(game);

const results = {
  engine: 'PR #41 strategic-land-v1 (resolver unchanged)',
  first: { weeks: first.weeks, attacker_remaining: unit(first.game, 'a0').manpower, captured: first.captured },
  stalled, reentry, recovery_B_P0: marks,
  second_assault_after_refit: { weeks: second.weeks, attacker_loss: second.attackerLoss, captured: second.captured },
};
console.log(JSON.stringify(results, null, 1));
if (process.argv[3]) writeFileSync(process.argv[3], JSON.stringify(results, null, 1) + '\n');

const check = (ok: boolean, what: string) => { if (!ok) throw new Error(`Cross-check failed: ${what}`); };
check(first.weeks === 7 && unit(first.game, 'a0').manpower === 19417, 'the 1 v 1 attacker is repelled in week 7 at 19,417');
check(Object.values(stalled).every(s => !s.engineAccepts && s.manpower === 19417), 'no recovery: no attack at weeks 52, 104, 156');
check(second.weeks === 7 && second.attackerLoss === 5583, 'a refitted division repeats the approved 1 v 1 result');
const pythonFile = process.argv[2];
if (pythonFile) {
  const python = JSON.parse(readFileSync(pythonFile, 'utf8'));
  for (const row of reentry) {
    const mirror = python.reentry.find((r: { reentry: number }) => r.reentry === row.reentry);
    check(mirror.weeks_fought === row.weeks_fought && mirror.attacker_loss === row.attacker_loss && mirror.outcome === row.outcome,
      `re-entry at ${row.reentry}`);
  }
  const b = python.repelled_formation.find((r: { model: string; policy: string }) => r.model === 'B' && r.policy === 'replace');
  check(b.ready_80 === marks.ready80 && b.ready_90 === marks.ready90 && b.full === marks.full, 'recovery weeks under model B');
  console.log('Python mirror matches the PR #41 resolver.');
}
console.log('Engine cross-check passed.');
