import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AtlasCatalog, AtlasShape, AtlasSize } from '../geography/atlas';
import { createTerrainData, projectHydrology, type HydrologyFeature } from '../geography/terrain';
import type { WorldCamera } from '../geography/worldCamera';
import { globeBorderVertices } from '../geography/borderRendering';
import { createGlobeRenderer } from './globeRenderer';
import { useGeographicFade } from './useGeographicFade';

type Props = { camera: WorldCamera; size: AtlasSize; catalog: AtlasCatalog | null; shapes: AtlasShape[]; selected?: AtlasShape;
  terrain: boolean; active: boolean; revision: number; onUnavailable: () => void; onReady: (ready: boolean) => void; onStatus: (status: string) => void };

export function AtlasGlobe(props: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const textureCanvas = useRef<HTMLCanvasElement | null>(null);
  const renderer = useRef<ReturnType<typeof createGlobeRenderer> | null>(null);
  const borders = useGeographicFade(props.shapes, props.active);
  const borderVertices = useMemo(() => globeBorderVertices(borders.current), [borders.current]);
  const previousVertices = useMemo(() => borders.previous ? globeBorderVertices(borders.previous) : undefined, [borders.previous]);
  const current = useRef({ ...props, borderMix: borders.mix }); current.current = { ...props, borderMix: borders.mix };
  const frame = useRef(0);
  const source = useRef<ReturnType<typeof createTerrainData> | null>(null);
  source.current ??= createTerrainData(import.meta.env.BASE_URL);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [water, setWater] = useState<HydrologyFeature[]>([]);
  const [error, setError] = useState('');
  const schedule = useCallback(() => {
    if (!frame.current) frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      const p = current.current;
      if (p.active) renderer.current?.draw(p.camera, p.size, p.borderMix);
    });
  }, []);
  useEffect(() => {
    const element = canvas.current!;
    function lost(event: Event) { event.preventDefault(); props.onUnavailable(); }
    element.addEventListener('webglcontextlost', lost);
    try { renderer.current = createGlobeRenderer(element); schedule(); }
    catch { props.onUnavailable(); }
    return () => { element.removeEventListener('webglcontextlost', lost); cancelAnimationFrame(frame.current); frame.current = 0; renderer.current?.dispose(); renderer.current = null; };
  }, [props.onUnavailable, schedule]);
  useEffect(() => {
    if (!props.active || !props.terrain || !renderer.current) return;
    const controller = new AbortController(); setError('');
    (async () => {
      try {
        const m = await source.current!.loadManifest(controller.signal);
        const [url, hydro] = await Promise.all([source.current!.loadRaster(m.raster.overview, controller.signal), source.current!.loadHydrology(m.hydrology['110m'], controller.signal)]);
        const bitmap = new Image();
        await new Promise<void>((resolve, reject) => { bitmap.onload = () => resolve(); bitmap.onerror = () => reject(new Error('Image unavailable')); bitmap.src = url; });
        if (!controller.signal.aborted) { setImage(bitmap); setWater(hydro.features); }
      } catch { if (!controller.signal.aborted) setError('Physical globe overview unavailable.'); }
    })();
    return () => controller.abort();
  }, [props.active, props.terrain, props.revision]);
  useEffect(() => { props.onStatus(props.terrain && props.active ? error : ''); }, [props.terrain, props.active, props.onStatus, error]);
  useEffect(() => () => source.current?.dispose(), []);
  useEffect(() => { schedule(); }, [props.camera, props.size, props.active, borders.mix, schedule]);
  useEffect(() => {
    if (!renderer.current || !borders.current.length || !props.active) return;
    try { renderer.current.uploadBorders(borderVertices, previousVertices); schedule(); }
    catch { props.onUnavailable(); }
  }, [borderVertices, previousVertices, props.active, props.onUnavailable, schedule]);
  useEffect(() => {
    if (!renderer.current || !props.active) return;
    try {
      if (props.selected) {
        // A single alpha mask follows the existing sphere UVs. The world
        // texture and its terrain are left intact when selection changes.
        const bitmap = document.createElement('canvas');
        bitmap.width = renderer.current.textureWidth; bitmap.height = bitmap.width / 2;
        const context = bitmap.getContext('2d');
        if (!context) throw new Error('Selection canvas unavailable');
        context.scale(bitmap.width / 360, bitmap.height / 180);
        for (const part of props.selected.parts) context.fill(new Path2D(part.path), 'evenodd');
        renderer.current.uploadSelection(bitmap, globeBorderVertices([props.selected]));
        bitmap.width = bitmap.height = 1;
      } else {
        renderer.current.uploadSelection(null);
      }
      schedule();
    } catch { props.onUnavailable(); }
  }, [props.selected, props.active, props.onUnavailable, schedule]);
  useEffect(() => {
    if (!renderer.current || !props.catalog || !props.shapes.length || !props.active) return;
    try {
      const bitmap = textureCanvas.current ??= document.createElement('canvas');
      bitmap.width = renderer.current.textureWidth; bitmap.height = bitmap.width / 2;
      const context = bitmap.getContext('2d');
      if (!context) throw new Error('Texture canvas unavailable');
      context.scale(bitmap.width / 360, bitmap.height / 180);
      context.fillStyle = '#182d3d'; context.fillRect(0, 0, 360, 180);
      const colors = new Map(props.catalog.countries.map(c => [c.id, c.color]));
      for (const shape of props.shapes) {
        context.fillStyle = colors.get(shape.id) ?? '#8d9693';
        for (const part of shape.parts) context.fill(new Path2D(part.path), 'evenodd');
      }
      if (props.terrain && image) {
        context.globalCompositeOperation = 'multiply'; context.globalAlpha = .8;
        context.drawImage(image, 0, 0, 360, 180);
        context.globalCompositeOperation = 'source-over'; context.globalAlpha = 1;
        for (const feature of water) {
          const path = new Path2D(projectHydrology(feature));
          context.fillStyle = '#518597'; context.strokeStyle = '#72a5b6'; context.lineWidth = .1;
          if (feature.kind === 'lake') context.fill(path, 'evenodd');
          else context.stroke(path);
        }
      }
      renderer.current.upload(bitmap); schedule(); props.onReady(true);
    } catch { props.onUnavailable(); }
  }, [props.catalog, props.shapes, props.terrain, props.active, image, water, props.onReady, props.onUnavailable, schedule]);
  return <canvas ref={canvas} className="atlas-globe" aria-hidden="true" data-renderer="webgl-sphere" data-selected-country={props.selected?.id} />;
}
