import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Context, SCENARIOS } from '../sim/scenarios.ts';

const context = new Context();
for (const scenario of SCENARIOS) {
  test(`mandatory scenario ${scenario.id}: ${scenario.title} - every mechanism check passes`, () => {
    const result = scenario.run(context);
    assert.ok(result.checks.length >= 4, 'scenario has meaningful checks');
    assert.ok(result.indicators.length >= 5, 'scenario reports measured indicators');
    assert.ok(result.mechanisms.length >= 3, 'scenario explains the mechanisms');
    for (const check of result.checks) assert.ok(check.pass, `${check.name}: ${check.detail}`);
  });
}
