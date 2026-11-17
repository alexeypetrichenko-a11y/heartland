import { useEffect, useRef, useState } from 'react';
import type { AtlasShape } from '../geography/atlas';
import { smoothDetail } from '../geography/borderRendering';

/** Crossfade source LOD arrivals; camera movement never rebuilds geometry. */
export function useGeographicFade(shapes: AtlasShape[], active: boolean) {
  const target = useRef(shapes);
  const [layers, setLayers] = useState({ previous: null as AtlasShape[] | null, current: shapes, mix: 1 });
  useEffect(() => {
    if (shapes === target.current) {
      setLayers(old => old.previous ? { previous: null, current: shapes, mix: 1 } : old); return;
    }
    const previous = target.current; target.current = shapes;
    if (!active || !previous.length || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setLayers({ previous: null, current: shapes, mix: 1 }); return;
    }
    const started = performance.now(); let frame = 0;
    setLayers({ previous, current: shapes, mix: 0 });
    function animate(time: number) {
      const t = Math.min(1, (time - started) / 280);
      setLayers({ previous: t < 1 ? previous : null, current: shapes, mix: smoothDetail(t) });
      if (t < 1) frame = requestAnimationFrame(animate);
    }
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [shapes, active]);
  return layers;
}
