import type { RegionId } from '../game/models';

// Presentation only: shared edges follow the T02 fixture's adjacency.
// These shapes are illustrative, not real geography or simulation data.
export const regionShapes: Record<RegionId, { points: string; x: number; y: number }> = {
  'alden-vale': { points: '30,16 176,16 186,65 176,116 90,126 16,116', x: 100, y: 65 },
  'reed-coast': { points: '176,16 328,24 344,116 260,106 176,116 186,65', x: 260, y: 65 },
  'amber-plain': { points: '16,116 90,126 176,116 166,168 176,216 98,206 24,216', x: 96, y: 165 },
  'silver-hills': { points: '176,116 260,106 344,116 334,216 258,226 176,216 166,168', x: 260, y: 165 },
  'cedar-basin': { points: '24,216 98,206 176,216 186,270 176,316 42,306', x: 102, y: 265 },
  'dawn-ridge': { points: '176,216 258,226 334,216 320,306 176,316 186,270', x: 256, y: 265 },
};
