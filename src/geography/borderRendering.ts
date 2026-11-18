import type { AtlasShape, AtlasSize } from './atlas';
import { globeRenderSize } from './globeMesh.ts';
import { geographicVector, transitionZoom, type WorldCamera } from './worldCamera.ts';

export const smoothDetail = (value: number) => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };

/** One framebuffer pixel in both renderers, independent of geographic zoom. */
export function borderStyle(camera: WorldCamera, size: AtlasSize, pixelRatio: number) {
  return { width: size.width / globeRenderSize(size.width, size.height, pixelRatio).width, opacity: .72 + .28 * smoothDetail((camera.zoom - 1) / 2) };
}
/** Let the projection handoff finish before introducing country-detail geometry. */
export function countryDetailZoomRange(camera: WorldCamera, size: AtlasSize): [number, number] {
  if (camera.flatOnly) return [8, 12];
  const handoff = transitionZoom(camera, size);
  return [handoff * 1.15, handoff * 1.8];
}
export function countryDetailAmount(camera: WorldCamera, size: AtlasSize) {
  if (camera.projection === 'globe') return 0;
  const [start, end] = countryDetailZoomRange(camera, size);
  return smoothDetail((camera.zoom - start) / (end - start));
}

/** Existing source outlines only; GPU clips the far hemisphere. Build on LOD changes. */
export function globeBorderVertices(shapes: AtlasShape[]): Float32Array {
  const vertices: number[] = [];
  for (const shape of shapes) for (const part of shape.parts) {
    let previous: [number, number] | null = null;
    for (const match of part.outline.matchAll(/([ML])([\d.e+-]+),([\d.e+-]+)/g)) {
      const point: [number, number] = [Number(match[2]) - 180, 90 - Number(match[3])];
      if (match[1] === 'L' && previous) {
        // Subdivide source straight lon/lat edges, not a new political boundary.
        const steps = Math.max(1, Math.ceil(Math.max(Math.abs(point[0] - previous[0]), Math.abs(point[1] - previous[1])) / 2));
        let start = geographicVector(previous);
        for (let i = 1; i <= steps; i++) {
          const end = geographicVector([previous[0] + (point[0] - previous[0]) * i / steps, previous[1] + (point[1] - previous[1]) * i / steps]);
          vertices.push(...start, ...end); start = end;
        }
      }
      previous = point;
    }
  }
  return new Float32Array(vertices);
}
