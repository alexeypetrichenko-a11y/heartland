import type { EconomyRuntime } from './economyBridge.ts';

export function loadEconomyApi() {
  return import('../../economy-engine/src/integration/index.ts');
}

/**
 * Load the economic engine and the pre-built week-1 economy of the fictional scenario.
 * Both are downloaded only when this function runs, which the app does when a fictional
 * game starts (after country selection), never to display the globe. This is the only
 * place that loads `economy-engine/` (INT-01; CODEX_HANDOFF.md section 2).
 */
export async function loadEconomyRuntime(): Promise<EconomyRuntime> {
  const [api, save] = await Promise.all([
    loadEconomyApi(),
    import('../../economy-engine/scenarios/fictional-week1.economy.json?raw'),
  ]);
  return { api, startingSave: save.default };
}

const europeReviewEnabled = import.meta.env.PROD && import.meta.env.MODE === 'world04-local';
let europeRequest: Promise<import('./europeScenario.ts').EuropeScenario> | undefined;

export async function loadEuropeRuntime() {
  if (!europeReviewEnabled) throw new Error('This local save requires the restricted Europe 2023 review build.');
  const [api, scenario] = await Promise.all([loadEconomyApi(), import('./europeScenario.ts')]);
  europeRequest ??= scenario.readEuropeScenario({ api }, async filename => {
    const response = await fetch(`${import.meta.env.BASE_URL}review/${scenario.EUROPE_ID}/${scenario.EUROPE_VERSION}/${filename}`);
    if (!response.ok || response.headers.get('content-type')?.includes('text/html')) throw new Error(`The local Europe 2023 package is missing ${filename}.`);
    return new Uint8Array(await response.arrayBuffer());
  }).catch(error => { europeRequest = undefined; throw error; });
  return { api, europe: await europeRequest };
}
