import { useEffect, useRef, useState } from 'react';

/** A short camera-matched dissolve, not an expensive projection morph. */
export function useProjectionTransition(flat: boolean, active: boolean, ready: boolean, flatOnly: boolean) {
  const [blend, setBlend] = useState(0);
  const current = useRef(0);
  useEffect(() => {
    if (!ready) return;
    const target = flat ? 1 : 0;
    if (flatOnly || !active || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { current.current = target; setBlend(target); return; }
    if (current.current === target) return;
    const from = current.current, started = performance.now();
    let frame = 0;
    function animate(time: number) {
      const t = Math.min(1, (time - started) / 220), eased = t * t * (3 - 2 * t);
      current.current = from + (target - from) * eased;
      setBlend(current.current);
      if (t < 1) frame = requestAnimationFrame(animate);
    }
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [flat, active, ready, flatOnly]);
  return flatOnly ? 1 : blend;
}
