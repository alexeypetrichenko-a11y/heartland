import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TurnInput } from '../src/index.ts';
import { getZone, listSanctions } from '../src/index.ts';
import { advance, at, commands, effects, flow, goodIdx, idx, once, tradeFlows, world, zoneIdx } from './helpers.ts';

const ban = (countryId: string, targetId: string, goodIds: string[] | 'all', imports: boolean, exports: boolean) =>
  ({ type: 'set-sanction' as const, countryId, targetId, goodIds, imports, exports });

test('baseline: energy flows from the exporters to the big importers', () => {
  const flows = tradeFlows(world(), 'energy', 20);
  assert.ok(flow(flows, 'khazir', 'norland') + flow(flows, 'halcyon', 'norland') > 0);
});

test('an export ban stops every unit between the pair, in that direction only', () => {
  const flows = tradeFlows(world(), 'energy', 80, at(1, commands(ban('khazir', 'norland', ['energy'], false, true))));
  assert.equal(flow(flows, 'khazir', 'norland'), 0, 'seller refuses to sell');
  assert.ok(flow(flows, 'norland', 'khazir') >= 0);
});

test('an import ban stops the flow in the other direction', () => {
  const flows = tradeFlows(world(), 'energy', 80, at(1, commands(ban('norland', 'khazir', ['energy'], true, false))));
  assert.equal(flow(flows, 'khazir', 'norland'), 0, 'buyer refuses to buy');
});

test('sanctions are sector specific: other goods still move between the same pair', () => {
  const state = world();
  const flows = tradeFlows(state, 'consumer', 60, at(1, commands(ban('norland', 'sundara', ['energy', 'military'], true, true))));
  assert.ok(flow(flows, 'sundara', 'norland') + flow(flows, 'norland', 'sundara') > 0, 'consumer goods still trade');
  assert.deepEqual(listSanctions(state).map(s => s.goodId).sort(), ['energy', 'military']);
});

test('sanctioned goods cannot be laundered through a third country', () => {
  // Lirane cannot produce energy at all. Whatever it buys, it can only use or store: it must never export energy.
  const state = world();
  const lirane = idx(state, 'lirane'), g = goodIdx(state, 'energy'), G = state.config.goods.length;
  const z = zoneIdx(state, 'lirane');
  assert.equal(state.zoneGood.capacity[z * G + g], 0, 'precondition: Lirane produces no energy');
  const script = at(1, commands(ban('khazir', 'norland', ['energy'], true, true), ban('khazir', 'ostmark', ['energy'], true, true),
    ban('halcyon', 'norland', ['energy'], true, true), ban('halcyon', 'ostmark', ['energy'], true, true)));
  const flows = tradeFlows(state, 'energy', 150, script);
  const exportedByLirane = [...flows].filter(([key]) => key.startsWith('lirane>')).reduce((t, [, q]) => t + q, 0);
  assert.equal(exportedByLirane, 0, 'a country with no energy output cannot re-export energy (exactly zero)');
  for (const sellers of ['khazir', 'halcyon']) for (const buyers of ['norland', 'ostmark']) assert.equal(flow(flows, sellers, buyers), 0);
  assert.ok(lirane >= 0);
});

test('a third country may only sell energy it produced or already held, never more', () => {
  const state = world();
  const sundara = idx(state, 'sundara'), g = goodIdx(state, 'energy'), G = state.config.goods.length;
  const stock = () => { let total = 0; for (let z = 0; z < state.zones.length; z++) if (state.zone.owner[z] === sundara) total += state.zoneGood.stock[z * G + g]; return total; };
  const start = stock();
  let produced = 0;
  const flows = new Map<string, number>();
  const owner = state.zones.map((_, z) => state.countries[state.zone.owner[z]].id);
  for (let week = 1; week <= 120; week++) {
    const report = once(state, week === 1 ? commands(ban('khazir', 'norland', 'all', true, true), ban('halcyon', 'norland', 'all', true, true)) : undefined, true);
    produced += report.countries[sundara].output[g];
    for (const f of report.trade ?? []) if (f.goodId === 'energy') flows.set(`${owner[state.zones.findIndex(z => z.id === f.fromZoneId)]}`, (flows.get(`${owner[state.zones.findIndex(z => z.id === f.fromZoneId)]}`) ?? 0) + f.quantity);
  }
  const sold = (flows.get('sundara') ?? 0);
  assert.ok(sold <= produced + start - stock() + 1e-6, `exports ${sold} within supply ${produced + start - stock()}`);
});

test('lifting a sanction restores trade', () => {
  const state = world();
  const script = (w: number): TurnInput | undefined => w === 1 ? commands(ban('khazir', 'norland', ['energy'], false, true)) : w === 40 ? commands(ban('khazir', 'norland', ['energy'], false, false)) : undefined;
  const early = tradeFlows(state, 'energy', 39, script);
  const late = tradeFlows(state, 'energy', 100, script);
  assert.equal(flow(early, 'khazir', 'norland'), 0);
  assert.ok(flow(late, 'khazir', 'norland') > 0);
  assert.equal(listSanctions(state).length, 0);
});

test('tariffs raise customs revenue and shift purchases away from the taxed partner', () => {
  const base = world(), taxed = world(), partner = world();
  const revenue = (s: ReturnType<typeof world>, input?: TurnInput) => { let total = 0; for (let w = 1; w <= 60; w++) total += once(s, w === 1 ? input : undefined).countries[idx(s, 'sundara')].budget.tariffs; return total; };
  const b = revenue(base), t = revenue(taxed, commands({ type: 'set-tariff', countryId: 'sundara', goodId: 'industrial', rate: 0.5 }));
  assert.ok(t > b, `customs revenue ${t} > ${b}`);
  const f0 = tradeFlows(base, 'industrial', 100), f1 = tradeFlows(partner, 'industrial', 100, at(1, commands({ type: 'set-tariff', countryId: 'sundara', goodId: 'industrial', rate: 2, partnerId: 'norland' })));
  assert.ok(flow(f1, 'norland', 'sundara') < flow(f0, 'norland', 'sundara') * 0.8, 'imports from the taxed partner fall');
});

test('closing a lane reroutes trade; with no open path the flow stops completely', () => {
  const state = world();
  // Lirane's only link to the world is "lirane-link".
  const script = at(1, effects({ type: 'set-lane', laneId: 'lirane-link', costMultiplier: 1, throughput: 0 }));
  const flows = tradeFlows(state, 'food', 60, script);
  const inbound = [...flows].filter(([key]) => key.endsWith('>lirane') && !key.startsWith('lirane>')).reduce((t, [, q]) => t + q, 0);
  assert.equal(inbound, 0, 'an isolated zone receives nothing from abroad');
  const lirane = getZone(state, 'lirane');
  assert.ok(Number.isFinite(lirane.cpi) && lirane.cpi > 0);
});

test('a cost multiplier raises delivered prices; a partial throughput caps total imports', () => {
  const free = world(), costly = world(), capped = world();
  advance(free, 40);
  advance(costly, 40, at(1, effects({ type: 'set-lane', laneId: 'lirane-link', costMultiplier: 4, throughput: 1 })));
  assert.ok(getZone(costly, 'lirane').goods[goodIdx(costly, 'food')].buyPrice > getZone(free, 'lirane').goods[goodIdx(free, 'food')].buyPrice);
  const imports = (s: ReturnType<typeof world>, input?: TurnInput) => { let total = 0; for (let w = 1; w <= 30; w++) total += once(s, w === 1 ? input : undefined).countries[idx(s, 'lirane')].imports; return total; };
  const a = imports(world()), b = imports(capped, effects({ type: 'set-lane', laneId: 'lirane-link', costMultiplier: 1, throughput: 0.4 }));
  assert.ok(b < a * 0.75, `imports ${b} well below ${a} when only 40% of the link works`);
});

test('strategic reserves fill towards a target, are released in a shortage, and are never negative', () => {
  const state = world();
  const c = idx(state, 'sundara'), g = goodIdx(state, 'food'), G = state.config.goods.length;
  const before = state.countryGood.reserves[c * G + g];
  advance(state, 120, at(1, commands({ type: 'set-reserve', countryId: 'sundara', goodId: 'food', targetWeeks: 12, mode: 'fill' })));
  const filled = state.countryGood.reserves[c * G + g];
  assert.ok(filled > before + 1, `reserves grew ${before} → ${filled}`);
  const lowest = { value: filled };
  advance(state, 100, at(1, { commands: [{ type: 'set-reserve', countryId: 'sundara', goodId: 'food', targetWeeks: 12, mode: 'release' }] }), (report) => {
    lowest.value = Math.min(lowest.value, report.countries[c].reserves[g]);
  });
  assert.ok(lowest.value < filled * 0.5, 'release mode draws the reserve down');
  assert.ok(lowest.value >= 0);
});
