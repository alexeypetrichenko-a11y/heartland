import assert from 'node:assert/strict';
import { test } from 'node:test';
import { autopilotCommands, advanceEconomyInPlace, auditError, deserializeEconomy, hashEconomy, serializeEconomy } from '../../src/index.ts';
import { allNumbers, world } from '../helpers.ts';

/** Long runs, executed with `npm run test:long` (about a minute). */
const MILESTONES = [100, 1000, 10_000];

test('100 / 1,000 / 10,000 consecutive weeks: bounded, finite, conserved, no explosion, save/restore exact', { timeout: 600_000 }, () => {
  const state = world();
  let worstAudit = 0;
  let maxInflation = 0, minGdp = Infinity, maxGdp = 0, maxDebtRatio = 0;
  let checkpoint: string | null = null;
  const checkpointAt = 5000;
  let tailFingerprint = '';
  for (let week = 1; week <= 10_000; week++) {
    const sample = week % 50 === 0 || MILESTONES.includes(week);
    const report = advanceEconomyInPlace(state, { commands: autopilotCommands(state) }, { audit: week % 25 === 0, report: sample ? 'full' : 'none' });
    if (sample) {
      worstAudit = Math.max(worstAudit, auditError(report.audit));
      assert.equal(report.audit.negativeValues, 0, `week ${week}`);
      assert.equal(report.audit.nonFiniteValues, 0, `week ${week}`);
      maxInflation = Math.max(maxInflation, Math.abs(report.world.inflation));
      minGdp = Math.min(minGdp, report.world.gdpReal); maxGdp = Math.max(maxGdp, report.world.gdpReal);
      for (const c of report.countries) maxDebtRatio = Math.max(maxDebtRatio, c.debtToGdp);
    }
    if (week === checkpointAt) checkpoint = serializeEconomy(state);
    if (week === checkpointAt + 500) tailFingerprint = hashEconomy(state);
  }
  assert.ok(worstAudit < 1e-9, `worst conservation error ${worstAudit}`);
  assert.ok(allNumbers(state).every(Number.isFinite));
  assert.ok(maxInflation < 0.1, `inflation stayed within ±10% (max ${maxInflation})`);
  assert.ok(maxDebtRatio < 1.5, `debt ratio bounded (max ${maxDebtRatio})`);
  assert.ok(minGdp > 0 && maxGdp / minGdp < 1e5, 'no collapse and no unbounded explosion beyond the technology trend');
  // Restore the week-5000 save and replay 500 weeks: must be bit-identical to the original run.
  const restored = deserializeEconomy(checkpoint!);
  for (let week = 1; week <= 500; week++) advanceEconomyInPlace(restored, { commands: autopilotCommands(restored) }, { report: 'none' });
  assert.equal(hashEconomy(restored), tailFingerprint, 'save and restore after 5,000 weeks changes nothing');
});
