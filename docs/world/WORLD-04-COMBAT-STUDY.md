# WORLD-04 · Combat balance study

This is a design proposal for owner review. The acceptance correction changes the interface and save feedback. Combat balance, outcomes and force initialization are unchanged.

## Current resolver

Run `node scripts/economy/study_world04_combat.ts` with Node.js 24. It exercises the production land resolver on a synthetic frontier. Each full division starts with 25,000 personnel equivalents. Defenders hold their position and attackers receive standing orders in the opening week. The first three rows are snapshots after one settlement. Remaining rows continue until the attack orders clear.

| Trial | Settled weeks | Attacker losses | Defender losses | Attacker strength remaining | Defender strength remaining | Outcome |
|---|---:|---:|---:|---|---|---|
| 1 vs 1, first week | 1 | 6,250 | 12,500 | 18,750 | 12,500 | Defender holds, attack active |
| 1 vs 2, first week | 1 | 12,500 | 12,500 | 12,500 | 12,500 + 25,000 | Defender holds, attack active |
| 1 vs 3, first week | 1 | 18,750 | 12,500 | 6,250 | 12,500 + 25,000 + 25,000 | Defender holds, attack active |
| 3 vs 1 | 2 | 9,375 | 25,000 | 18,750 + 21,875 + 25,000 | 0 | Capture Week 1, outstanding order clears Week 2 |
| 1 vs 1, repeated | 3 | 10,157 | 25,000 | 14,843 | 0 | Capture Week 3 |
| 1 vs 2, repeated | 3 | 25,000 | 20,312 | 0 | 4,688 + 25,000 | Defender holds, attacker destroyed |
| 1 vs 3, repeated | 2 | 25,000 | 15,625 | 0 | 9,375 + 25,000 + 25,000 | Defender holds, attacker destroyed |
| 3 vs 2 | 3 | 32,813 | 50,000 | 9,375 + 14,062 + 18,750 | 0 | Capture Week 2, outstanding order clears Week 3 |
| 2 vs 2 | 5 | 38,236 | 50,000 | 2,928 + 8,836 | 0 | Capture Week 4, outstanding order clears Week 5 |
| 25,000 + 10,000 vs 2, stronger unit first | 3 | 35,000 | 26,249 | 0 + 0 | 0 + 23,751 | Defender holds |
| Same forces, depleted unit first | 3 | 35,000 | 27,187 | 0 + 0 | 0 + 22,813 | Defender holds |

One attacker deals half its current strength per round. The full surviving garrison returns damage equal to one quarter of its pre-round strength, capped by the attacker’s manpower. With three defenders the attacker loses 75% in the first week and cannot retreat automatically. Repeated attacks naturally reproduce complete destruction. No combat log was supplied for the original device session, so these runs explain a plausible mechanism without reconstructing the specific battle.

The resolver treats attacking divisions sequentially by ID. Each can face the full remaining garrison and later units fight defenders already depleted by earlier rounds. Reversing ID priority changes losses even when total starting strength is identical. A province changes controller only after a surviving attacker eliminates every defender. A subsequent settlement can still cancel an obsolete order that was processed before the capture.

## Proposed strategic model

1. **Settle one engagement per target and side each week.** Snapshot participating attackers and defenders before casualties. Allocate losses across participating divisions by strength or frontage with deterministic rounding. Decide how simultaneous attacks from opposing sides share priority before adding multi-actor engagements.
2. **Cap ordinary weekly attrition.** Start calibration with reduced weekly loss ceilings expressed as shares of engaged strength. Preserve differentiating effects for strength, terrain and supply. Reserve destruction for exceptional conditions such as encirclement and failed withdrawal, subject to separate design approval.
3. **Track progress and withdrawal.** Let pressure accumulate week to week while a valid engagement persists. Evaluate voluntary cancellation and an automatic disengagement threshold from morale or effective strength. A unit with a legal fallback should retain survivors when it retreats. A division with no legal withdrawal route needs an explicit future rule.
4. **Model defensive advantage through a bounded modifier.** Test terrain and holding posture before adding entrenchment or logistics complexity. Cap the benefit so stronger coordinated attacks can succeed without requiring universal numerical superiority. Decide capture from engagement progress and defender withdrawal or defeat, with a separate territorial settlement.
5. **Keep uncertainty player-facing.** Show only observed defenders and compatible estimates. Compare signed force ratios only when both strength estimates have an approved information source. Reports should distinguish ongoing combat, disengagement and capture.

Before implementation, approve the loss scale, defensive modifier, engagement progress, retreat trigger and fallback rules. Re-run these cases with permutations of attacker IDs, unequal strengths, multi-week saves and simultaneous orders. Compare losses, survival, capture times and territory outcomes across the European scenarios and short-session playtests. Preserve the existing resolver for older rulesets and version any new combat model.
