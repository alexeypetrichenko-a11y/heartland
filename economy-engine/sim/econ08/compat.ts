/**
 * ECON-08 save compatibility: play existing saves and the fictional world for a number of weeks and print the
 * state hashes, so the same script can be run against the engine before and after ECON-08 and compared.
 *
 *   node --experimental-strip-types <engine>/sim/econ08/compat.ts <engine-root> <repo-root>
 *
 * Cases: (1) the WORLD-03 package's week-1 session (built before ECON-08), 26 weeks with France as player;
 * (2) the engine's v5 fixture session save (tests/fixtures/fictional-week1.v5.economy.json), migrated on load and
 * played 26 weeks with Alden as player; (3) the fictional world built from scratch and played 26 weeks. Prints one hash per case.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const [engineRoot, repoRoot] = process.argv.slice(2).map(p => resolve(p));
const core = await import(resolve(engineRoot, 'src/index.ts'));
const api = await import(resolve(engineRoot, 'src/integration/index.ts'));
const out: Record<string, string> = {};
let session = api.withPlayerCountry(api.loadEconomySession(readFileSync(resolve(repoRoot, 'scenarios/europe-2023/1.0.0-draft.1/week1.session.json'), 'utf8')), 'fra');
for (let w = 0; w < 26; w++) session = api.advanceEconomyWeek(session, {});
out['world03-package-save, 26 weeks'] = api.economyFingerprint(session);
// The fixture is a session save holding a v5 economy (migrated on load).
let v5 = api.withPlayerCountry(api.loadEconomySession(readFileSync(resolve(engineRoot, 'tests/fixtures/fictional-week1.v5.economy.json'), 'utf8')), 'alden');
for (let w = 0; w < 26; w++) v5 = api.advanceEconomyWeek(v5, {});
out['v5 fixture save, 26 weeks'] = api.economyFingerprint(v5);
void core;
let f = api.createEconomySession(api.fictionalGameWorld());
for (let w = 0; w < 26; w++) f = api.advanceEconomyWeek(f, {});
out['fictional world built and played 26 weeks'] = api.economyFingerprint(f);
console.log(JSON.stringify(out));
