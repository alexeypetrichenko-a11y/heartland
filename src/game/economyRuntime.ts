import type { EconomyRuntime } from './economyBridge.ts';

/**
 * Load the economic engine and the pre-built week-1 economy of the fictional scenario.
 * Both are downloaded only when this function runs, which the app does when a fictional
 * game starts (after country selection), never to display the globe. This is the only
 * place that loads `economy-engine/` (INT-01; CODEX_HANDOFF.md section 2).
 */
export async function loadEconomyRuntime(): Promise<EconomyRuntime> {
  const [api, save] = await Promise.all([
    import('../../economy-engine/src/integration/index.ts'),
    import('../../economy-engine/scenarios/fictional-week1.economy.json?raw'),
  ]);
  return { api, startingSave: save.default };
}
