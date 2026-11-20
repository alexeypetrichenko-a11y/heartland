/**
 * Counter-based pseudo-random numbers.
 *
 * Every draw is a pure function of (seed, turn, stream, index). There is no
 * hidden generator state: nothing extra has to be saved, the order in which
 * draws are requested cannot change a result, and a restored game produces
 * exactly the numbers the original would have produced.
 *
 * Only 32-bit integer operations are used, so results are identical on every
 * JavaScript engine.
 */

function mix(hash: number, value: number): number {
  let k = Math.imul(value | 0, 0xcc9e2d51);
  k = (k << 15) | (k >>> 17);
  k = Math.imul(k, 0x1b873593);
  let h = hash ^ k;
  h = (h << 13) | (h >>> 19);
  return (Math.imul(h, 5) + 0xe6546b64) | 0;
}

/** Named streams keep unrelated uses of randomness independent. */
export const RANDOM_STREAM = { regime: 1, investment: 2, harvest: 3, worldBuilder: 4 } as const;

/** Uniform number in [0, 1). `turn` may be any non-negative safe integer. */
export function randomUnit(seed: number, turn: number, stream: number, index: number): number {
  let h = mix(0x9e3779b9, seed);
  h = mix(h, turn % 4294967296);
  h = mix(h, Math.floor(turn / 4294967296));
  h = mix(h, stream);
  h = mix(h, index);
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Uniform number in [-1, 1). */
export function randomSigned(seed: number, turn: number, stream: number, index: number): number {
  return randomUnit(seed, turn, stream, index) * 2 - 1;
}
