import * as api from '../../economy-engine/src/integration/index.ts';
import { advanceSyntheticMobility, encodeSyntheticMobility, restoreSyntheticMobility, startSyntheticMobility } from '../../src/game/mobility/syntheticScenario.ts';

const runtime = { api };
let game = startSyntheticMobility(runtime);
game.transportDrafts = [
  { kind: 'transport', divisionId: 'alden-first', routeId: 'island-outbound' },
  { kind: 'transport', divisionId: 'alden-second', routeId: 'island-outbound' },
];
game = advanceSyntheticMobility(runtime, game);
console.log('Week 1 results', game.mobility.results);
game = await restoreSyntheticMobility(runtime, await encodeSyntheticMobility(runtime, game));
game = advanceSyntheticMobility(runtime, game);
console.log('Week 2 results after checkpoint restore', game.mobility.results);
