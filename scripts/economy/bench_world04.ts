// Browser entry point bundled for the local performance harness.
import * as api from '../../economy-engine/src/integration/index.ts';
import { advanceGameWeek } from '../../src/game/economyBridge.ts';
import { EUROPE_ID, EUROPE_VERSION, readEuropeScenario, startEuropeGame } from '../../src/game/europeScenario.ts';
import { emptyDrafts } from '../../src/game/playerDrafts.ts';
import { decodeGameSave, encodeGameSave, restoreGameSave } from '../../src/game/saveFormat.ts';

async function benchmark() {
  const start = performance.now();
  const europe = await readEuropeScenario({ api }, async name => {
    const response = await fetch(`review/${EUROPE_ID}/${EUROPE_VERSION}/${name}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Could not read ${name}.`);
    return new Uint8Array(await response.arrayBuffer());
  });
  const runtime = { api, europe };
  let session = startEuropeGame(runtime, 'fra');
  const startMs = performance.now() - start;

  const times: number[] = [];
  for (let step = 0; step < 156; step++) {
    const tick = performance.now();
    session = advanceGameWeek(runtime, session.game, session.economy, []);
    times.push(performance.now() - tick);
  }
  times.sort((a, b) => a - b);
  const checkpoint = performance.now();
  const encoded = await encodeGameSave(runtime, { ...session, drafts: emptyDrafts() });
  const decoded = await decodeGameSave(encoded, async () => europe);
  const restored = restoreGameSave(runtime, decoded);
  const saveRestoreMs = performance.now() - checkpoint;
  if (api.economyFingerprint(restored.economy.session) !== api.economyFingerprint(session.economy.session)
    || JSON.stringify(restored.game) !== JSON.stringify(session.game)) throw new Error('Round-trip mismatch.');
  const measurements = {
    startMs, saveRestoreMs,
    medianWeekMs: (times[77] + times[78]) / 2,
    p95WeekMs: times[Math.ceil(0.95 * times.length) - 1],
    slowestWeekMs: times.at(-1)!,
  };
  const limits = { startMs: 1000, saveRestoreMs: 1000, medianWeekMs: 250, p95WeekMs: 500, slowestWeekMs: 1000 };
  return { zones: europe.fixture.regions.length, turns: times.length, ...measurements, limits,
    passed: (Object.keys(limits) as (keyof typeof limits)[]).every(key => measurements[key] <= limits[key]) };
}

const button = document.querySelector('button')!;
const output = document.querySelector('pre')!;
button.onclick = async () => {
  button.disabled = true;
  output.textContent = 'Running…';
  await new Promise(resolve => setTimeout(resolve, 50));
  try {
    output.textContent = JSON.stringify(await benchmark(), null, 2);
    output.dataset.result = 'complete';
  } catch (error) {
    output.textContent = String(error);
    output.dataset.result = 'error';
  } finally {
    button.disabled = false;
  }
};
