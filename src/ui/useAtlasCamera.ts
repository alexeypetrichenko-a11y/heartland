import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as Pointer, type KeyboardEvent as Key } from 'react';
import type { AtlasPoint, AtlasSize } from '../geography/atlas';
import { smoothDetail } from '../geography/borderRendering';
import { desiredProjection, dragWorldCamera, flatFallback, initialWorldCamera, moveWorldCamera, positionWorldCamera, worldLayout,
  wrapLongitude, type WorldCamera } from '../geography/worldCamera';

/** Atlas-only input; the fictional map and division gestures are independent. */
export function useAtlasCamera(active: boolean, onManualNavigation: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<AtlasSize>({ width: 360, height: 360 });
  const [view, setView] = useState(initialWorldCamera);
  const camera = useRef({ view, size });
  const frame = useRef(0);
  const flight = useRef(0);
  const [flying, setFlying] = useState(false);
  const contacts = useRef(new Map<number, { start: AtlasPoint; point: AtlasPoint }>());
  const pinch = useRef<{ view: WorldCamera; points: AtlasPoint[] } | null>(null);
  const moved = useRef(false);
  const commit = useCallback((next: WorldCamera) => {
    camera.current.view = next;
    if (!frame.current) frame.current = requestAnimationFrame(() => { frame.current = 0; setView(camera.current.view); });
  }, []);
  const stopFlight = useCallback(() => {
    if (!flight.current) return;
    cancelAnimationFrame(flight.current);
    flight.current = 0;
    setFlying(false);
  }, []);
  useEffect(() => { if (!active) stopFlight(); }, [active, stopFlight]);
  const cancel = useCallback(() => {
    for (const id of contacts.current.keys()) if (ref.current?.hasPointerCapture(id)) ref.current.releasePointerCapture(id);
    contacts.current.clear(); pinch.current = null; moved.current = false;
  }, []);
  function point(x: number, y: number) {
    const rect = ref.current!.getBoundingClientRect();
    return { x: x - rect.left, y: y - rect.top };
  }
  useEffect(() => {
    const element = ref.current!;
    const observer = new ResizeObserver(() => {
      const { width, height } = element.getBoundingClientRect();
      cancel();
      if (!width || !height) return;
      if (width !== camera.current.size.width || height !== camera.current.size.height) stopFlight();
      const next = { width, height };
      camera.current.size = next; setSize(next);
      commit({ ...camera.current.view, projection: desiredProjection(camera.current.view, next) });
    });
    observer.observe(element);
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      if (contacts.current.size) return;
      stopFlight();
      onManualNavigation();
      const { view, size } = camera.current;
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? size.height : 1);
      const p = point(event.clientX, event.clientY);
      commit(moveWorldCamera(view, size, p, p, view.zoom * Math.exp(-Math.max(-160, Math.min(160, delta)) * .003)));
    };
    element.addEventListener('wheel', wheel, { passive: false });
    window.addEventListener('blur', cancel);
    return () => {
      observer.disconnect(); element.removeEventListener('wheel', wheel); window.removeEventListener('blur', cancel);
      cancel(); cancelAnimationFrame(frame.current); frame.current = 0;
      cancelAnimationFrame(flight.current); flight.current = 0;
    };
  }, [cancel, commit, stopFlight, onManualNavigation]);
  function pointerDown(event: Pointer<HTMLDivElement>) {
    if (event.button !== 0 || contacts.current.size >= 2) return;
    stopFlight();
    const p = point(event.clientX, event.clientY);
    if (!contacts.current.size) moved.current = false;
    contacts.current.set(event.pointerId, { start: p, point: p });
    event.currentTarget.setPointerCapture(event.pointerId);
    if (contacts.current.size === 2) {
      moved.current = true;
      onManualNavigation();
      pinch.current = { view: camera.current.view, points: [...contacts.current.values()].map(c => c.point) };
    }
  }
  function pointerMove(event: Pointer<HTMLDivElement>) {
    const contact = contacts.current.get(event.pointerId);
    if (!contact) return;
    const previous = contact.point;
    contact.point = point(event.clientX, event.clientY);
    if (!moved.current && Math.hypot(contact.point.x - contact.start.x, contact.point.y - contact.start.y) < 6) return;
    const from = moved.current ? previous : contact.start;
    if (!moved.current) onManualNavigation();
    moved.current = true;
    const current = [...contacts.current.values()].map(c => c.point);
    if (current.length === 2) {
      const start = pinch.current ?? (pinch.current = { view: camera.current.view, points: current });
      const midpoint = (p: AtlasPoint[]) => ({ x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 });
      const distance = (p: AtlasPoint[]) => Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
      if (distance(start.points) > 0) commit(moveWorldCamera(start.view, camera.current.size, midpoint(start.points), midpoint(current), start.view.zoom * distance(current) / distance(start.points)));
    } else commit(dragWorldCamera(camera.current.view, camera.current.size, from, contact.point));
  }
  function pointerUp(event: Pointer<HTMLDivElement>) {
    const contact = contacts.current.get(event.pointerId);
    if (!contact) return null;
    if (event.type === 'pointerup') pointerMove(event);
    const tap = event.type === 'pointerup' && !moved.current && contacts.current.size === 1 ? contact.point : null;
    contacts.current.delete(event.pointerId); pinch.current = null;
    for (const c of contacts.current.values()) c.start = c.point;
    return tap;
  }
  function zoomBy(factor: number) {
    cancel(); stopFlight();
    onManualNavigation();
    const { view, size } = camera.current, p = { x: size.width / 2, y: size.height / 2 };
    commit(moveWorldCamera(view, size, p, p, view.zoom * factor));
  }
  function reset() { cancel(); stopFlight(); onManualNavigation(); commit(initialWorldCamera(camera.current.view.flatOnly)); }
  const fallbackToFlat = useCallback(() => {
    cancel(); stopFlight(); commit(flatFallback(camera.current.view, camera.current.size));
  }, [cancel, commit, stopFlight]);
  const flyTo = useCallback((target: WorldCamera) => {
    cancel(); stopFlight();
    const { view: start, size } = camera.current;
    const dx = wrapLongitude(target.focus[0] - start.focus[0]), dy = target.focus[1] - start.focus[1];
    const distance = Math.hypot(dx, dy);
    const panTime = distance > .01 ? Math.min(360, 180 + distance * 2) : 0;
    const zoomTime = Math.abs(Math.log(target.zoom / start.zoom)) > .001 ? 440 : 0;
    if (panTime + zoomTime === 0 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      commit(target);
      return;
    }
    cancelAnimationFrame(frame.current);
    frame.current = 0;
    setFlying(true);
    const started = performance.now();
    function draw(now: number) {
      const elapsed = now - started;
      // The fallback is locked to the whole world at 1×, so start its pan and zoom together.
      const duration = panTime + zoomTime;
      const progress = smoothDetail(elapsed / duration);
      const pan = start.flatOnly && start.zoom === 1 ? progress : panTime ? smoothDetail(elapsed / panTime) : 1;
      const zoom = start.flatOnly && start.zoom === 1 ? progress : zoomTime ? smoothDetail((elapsed - panTime) / zoomTime) : 1;
      const next = elapsed >= duration ? target : positionWorldCamera(camera.current.view, size,
        [start.focus[0] + dx * pan, start.focus[1] + dy * pan], start.zoom * (target.zoom / start.zoom) ** zoom);
      camera.current.view = next;
      setView(next);
      if (elapsed < duration) flight.current = requestAnimationFrame(draw);
      else { flight.current = 0; setFlying(false); }
    }
    flight.current = requestAnimationFrame(draw);
  }, [cancel, commit, stopFlight]);
  function keyDown(event: Key<HTMLDivElement>) {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (['+', '='].includes(event.key)) zoomBy(1.5);
    else if (['-', '_'].includes(event.key)) zoomBy(1 / 1.5);
    else if (['0', 'Home'].includes(event.key)) reset();
    else {
      const step = event.shiftKey ? 120 : 40;
      const delta: Record<string, AtlasPoint> = { ArrowLeft: { x: step, y: 0 }, ArrowRight: { x: -step, y: 0 }, ArrowUp: { x: 0, y: step }, ArrowDown: { x: 0, y: -step } };
      if (!delta[event.key]) return;
      cancel(); stopFlight();
      onManualNavigation();
      const { view, size } = camera.current, center = { x: size.width / 2, y: size.height / 2 };
      commit(dragWorldCamera(view, size, center, { x: center.x + delta[event.key].x, y: center.y + delta[event.key].y }));
    }
    event.preventDefault();
  }
  const layout = useMemo(() => worldLayout(view, size), [view, size]);
  return { ref, view, size, layout, flying, flyTo, stopFlight, zoomBy, reset, fallbackToFlat,
    events: { onPointerDown: pointerDown, onPointerMove: pointerMove, onPointerUp: pointerUp,
      onPointerCancel: pointerUp, onLostPointerCapture: pointerUp, onKeyDown: keyDown } };
}
