import * as api from '../../economy-engine/src/integration/index.ts';
import { advanceGameWeek } from '../../src/game/economyBridge.ts';
import { EUROPE_ID, EUROPE_VERSION, readEuropeScenario, startEuropeGame } from '../../src/game/europeScenario.ts';
import { emptyDrafts } from '../../src/game/playerDrafts.ts';
import { decodeGameSave, encodeGameSave, restoreGameSave } from '../../src/game/saveFormat.ts';
import { collectiveReasons, militarySelection, startStrategicLand, type CollectiveOrder } from '../../src/game/strategicLand.ts';

export async function benchmarkStrategicLand(read: (name: string) => Promise<Uint8Array>, heavy: boolean) {
  const started = performance.now();
  const europe = await readEuropeScenario({ api }, read);
  const runtime = { api, europe };
  const initial = startEuropeGame(runtime, 'fra');
  let session = { ...initial, game: startStrategicLand(initial.game) };
  const startMs = performance.now() - started;
  const times: number[] = [];
  let engagementWeeks = 0;
  let maxFronts = 0;
  const exhaustion: Record<number, { depleted: number; surrendered: number }> = {};
  for (let step = 1; step <= 156; step++) {
    const tick = performance.now();
    const { game } = session;
    const orders: CollectiveOrder[] = [];
    if (heavy) {
      const owner = new Map(game.regions.map(r => [r.id, r]));
      for (const division of game.divisions) {
        if (division.ownerId !== 'fra') continue;
        const target = owner.get(division.regionId)?.adjacentRegionIds.find(id => owner.get(id)?.ownerId !== 'fra');
        if (!target) continue;
        const draft: CollectiveOrder = { id: division.id, countryId: 'fra', week: game.week,
          divisionIds: [division.id], action: { kind: 'attack', targetRegionId: target } };
        if (!collectiveReasons(game, draft).length) orders.push(draft);
      }
    }
    session = advanceGameWeek(runtime, game, session.economy, [], [], orders);
    const fronts = session.game.strategicLand!.fronts.length;
    if (fronts) engagementWeeks++;
    maxFronts = Math.max(maxFronts, fronts);
    if ([52, 104, 156].includes(step)) {
      const ids = session.game.divisions.map(d => d.id);
      const formations = session.game.countries.flatMap(country => militarySelection(session.game, country.id, ids));
      exhaustion[step] = {
        depleted: formations.filter(d => d.status === 'depleted').length,
        surrendered: formations.filter(d => d.status === 'surrendered').length,
      };
    }
    times.push(performance.now() - tick);
  }
  times.sort((a, b) => a - b);
  const checkpoint = performance.now();
  const encoded = await encodeGameSave(runtime, { ...session, drafts: emptyDrafts() });
  const restored = restoreGameSave(runtime, await decodeGameSave(encoded, async () => europe));
  const saveRestoreMs = performance.now() - checkpoint;
  if (JSON.stringify(restored.game) !== JSON.stringify(session.game)
    || api.economyFingerprint(restored.economy.session) !== api.economyFingerprint(session.economy.session)
    || session.game.divisions.length !== 90 || session.economy.session.state.zones.length !== 61) throw new Error('Benchmark verification failed.');
  const milliseconds = { startMs, medianWeekMs: (times[77] + times[78]) / 2, p95WeekMs: times[148],
    slowestWeekMs: times[155], saveRestoreMs };
  const limits = { startMs: 1000, medianWeekMs: 250, p95WeekMs: 500, slowestWeekMs: 1000, saveRestoreMs: 1000 };
  return { mode: heavy ? 'heavy orders' : 'calm', zones: 61, divisions: 90, weeks: times.length,
    engagementWeeks, maxFronts, exhaustion, milliseconds, bytes: new TextEncoder().encode(encoded).length,
    passed: (Object.keys(limits) as (keyof typeof limits)[]).every(key => milliseconds[key] <= limits[key]) };
}

export async function browserBenchmarkStrategicLand(heavy?: boolean) {
  const read = async (name: string) => {
    const response = await fetch(`review/${EUROPE_ID}/${EUROPE_VERSION}/${name}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Could not read ${name}.`);
    return new Uint8Array(await response.arrayBuffer());
  };
  if (heavy !== undefined) return [await benchmarkStrategicLand(read, heavy)];
  return [await benchmarkStrategicLand(read, false), await benchmarkStrategicLand(read, true)];
}
