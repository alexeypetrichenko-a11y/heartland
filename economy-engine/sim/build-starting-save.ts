/**
 * Pre-built starting economy for the game's fictional scenario (handoff).
 *
 *   npm run starting-save          regenerate scenarios/fictional-week1.economy.json
 *   npm run starting-save -- --check   rebuild in memory and fail if the committed file differs
 *
 * The file is a normal session save (saveEconomySession) of week 1 with no player
 * country: the economy is built and calibrated from fictionalGameWorld() and the
 * fictional region profiles, and its first week is resolved by the autopilot for
 * every country. startEconomyFromSave(text, gameState) then attaches the player's
 * country; the result is identical to createEconomySession(gameState), a few
 * hundred times faster. The generation is deterministic: rebuilding gives the same
 * bytes, which --check (and tests/handoff.test.ts) verifies.
 *
 * Regenerate it after any change to the engine, its configuration, the fictional
 * scenario or its profiles, and commit it with that change.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STATE_VERSION } from '../src/index.ts';
import {
  createEconomySession, economyFingerprint, fictionalGameWorld, INTEGRATION_CONTRACT_VERSION, saveEconomySession, SESSION_VERSION,
} from '../src/integration/index.ts';

export const STARTING_SAVE_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'scenarios', 'fictional-week1.economy.json');

/** Build the starting save's text (deterministic). */
export function buildStartingSave(): string {
  return saveEconomySession(createEconomySession(fictionalGameWorld(null)));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const started = performance.now();
  const text = buildStartingSave();
  const seconds = ((performance.now() - started) / 1000).toFixed(2);
  const summary = JSON.parse(text) as { worldFingerprint: string; economy: { turn: number } };
  if (process.argv.includes('--check')) {
    const committed = readFileSync(STARTING_SAVE_PATH, 'utf8');
    if (committed !== text) {
      console.error(`Starting save is out of date: rebuild it with "npm run starting-save" (rebuilt ${text.length} bytes, committed ${committed.length}).`);
      process.exit(1);
    }
    console.log(`Starting save is up to date (${(text.length / 1024).toFixed(0)} KB, rebuilt in ${seconds} s).`);
  } else {
    writeFileSync(STARTING_SAVE_PATH, text);
    console.log(`Wrote ${STARTING_SAVE_PATH}`);
  }
  const fingerprint = economyFingerprint((await import('../src/integration/index.ts')).loadEconomySession(text));
  console.log(`  week ${summary.economy.turn}, session format v${SESSION_VERSION}, engine state v${STATE_VERSION}, contract ${INTEGRATION_CONTRACT_VERSION}`);
  console.log(`  world fingerprint ${summary.worldFingerprint}, economy fingerprint ${fingerprint}, ${text.length} bytes`);
}
