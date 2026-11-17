import { geographicVector, rotateVector, type Quaternion } from './worldCamera.ts';

/** Genuine unit-sphere mesh. Duplicate the UV seam; never connect u=0 to u=1. */
export function createGlobeMesh(longitudes = 96, latitudes = 64) {
  const vertices: number[] = [], indices: number[] = [];
  for (let y = 0; y <= latitudes; y++) for (let x = 0; x <= longitudes; x++) {
    vertices.push(...geographicVector([x / longitudes * 360 - 180, 90 - y / latitudes * 180]), x / longitudes, y / latitudes);
  }
  for (let y = 0; y < latitudes; y++) for (let x = 0; x < longitudes; x++) {
    const a = y * (longitudes + 1) + x, b = a + longitudes + 1;
    indices.push(a, b, a + 1, a + 1, b, b + 1);
  }
  return { vertices: new Float32Array(vertices), indices: new Uint16Array(indices) };
}
export function globeRotationMatrix(q: Quaternion): Float32Array {
  return new Float32Array([...rotateVector(q, [1, 0, 0]), ...rotateVector(q, [0, 1, 0]), ...rotateVector(q, [0, 0, 1])]);
}

export function globeRenderSize(width: number, height: number, pixelRatio: number) {
  const ratio = Math.min(2, Math.max(1, pixelRatio), Math.sqrt(2_000_000 / Math.max(1, width * height)));
  return { width: Math.max(1, Math.round(width * ratio)), height: Math.max(1, Math.round(height * ratio)) };
}
