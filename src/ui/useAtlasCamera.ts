import { useEffect, useRef, useState, type PointerEvent as Pointer, type KeyboardEvent as Key } from 'react';
import { atlasScale, constrainAtlasView, initialAtlasView, moveAtlasView, type AtlasPoint, type AtlasSize, type AtlasView } from '../geography/atlas';

/** Independent atlas camera. Fictional scenario navigation retains its existing limits. */
export function useAtlasCamera() {
  const ref = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState<AtlasSize>({ width: 360, height: 180 });
  const [view, setView] = useState(initialAtlasView);
  const camera = useRef({ view, size });
  const contacts = useRef(new Map<number, { start: AtlasPoint; point: AtlasPoint }>());
  const pinch = useRef<{ view: AtlasView; points: AtlasPoint[] } | null>(null);
  const moved = useRef(false);
  const commit = (next: AtlasView) => { camera.current.view = next; setView(next); };
  function cancel() {
    for (const id of contacts.current.keys()) if (ref.current?.hasPointerCapture(id)) ref.current.releasePointerCapture(id);
    contacts.current.clear(); pinch.current = null; moved.current = false;
  }
  function point(x: number, y: number) {
    const rect = ref.current!.getBoundingClientRect();
    return { x: x - rect.left, y: y - rect.top };
  }
  useEffect(() => {
    const svg = ref.current!;
    const observer = new ResizeObserver(() => {
      const { width, height } = svg.getBoundingClientRect();
      cancel();
      if (!width || !height) return;
      const next = { width, height };
      camera.current.size = next; setSize(next);
      commit(constrainAtlasView(camera.current.view, next));
    });
    observer.observe(svg);
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      if (contacts.current.size) return;
      const { view, size } = camera.current;
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? size.height : 1);
      const p = point(event.clientX, event.clientY);
      commit(moveAtlasView(view, size, p, p, view.zoom * Math.exp(-Math.max(-160, Math.min(160, delta)) * .003)));
    };
    svg.addEventListener('wheel', wheel, { passive: false });
    window.addEventListener('blur', cancel);
    return () => { observer.disconnect(); svg.removeEventListener('wheel', wheel); window.removeEventListener('blur', cancel); cancel(); };
  }, []);
  function pointerDown(event: Pointer<SVGSVGElement>) {
    if (event.button !== 0) return;
    const p = point(event.clientX, event.clientY);
    if (!contacts.current.size) moved.current = false;
    contacts.current.set(event.pointerId, { start: p, point: p });
    event.currentTarget.setPointerCapture(event.pointerId);
    if (contacts.current.size === 2) {
      moved.current = true;
      pinch.current = { view: camera.current.view, points: [...contacts.current.values()].map(c => c.point) };
    }
  }
  function pointerMove(event: Pointer<SVGSVGElement>) {
    const contact = contacts.current.get(event.pointerId);
    if (!contact) return;
    const previous = contact.point;
    contact.point = point(event.clientX, event.clientY);
    if (!moved.current && Math.hypot(contact.point.x - contact.start.x, contact.point.y - contact.start.y) < 6) return;
    const from = moved.current ? previous : contact.start;
    moved.current = true;
    const current = [...contacts.current.values()].slice(0, 2).map(c => c.point);
    if (current.length === 2) {
      const start = pinch.current ?? (pinch.current = { view: camera.current.view, points: current });
      const midpoint = (p: AtlasPoint[]) => ({ x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 });
      const distance = (p: AtlasPoint[]) => Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
      if (distance(start.points) > 0) commit(moveAtlasView(start.view, camera.current.size, midpoint(start.points), midpoint(current), start.view.zoom * distance(current) / distance(start.points)));
    } else commit(moveAtlasView(camera.current.view, camera.current.size, from, contact.point));
  }
  function pointerUp(event: Pointer<SVGSVGElement>) {
    if (!contacts.current.has(event.pointerId)) return;
    if (event.type === 'pointerup') pointerMove(event);
    contacts.current.delete(event.pointerId); pinch.current = null;
    // A remaining finger begins a fresh pan from its current location.
    for (const c of contacts.current.values()) c.start = c.point;
  }
  function zoomBy(factor: number) {
    cancel();
    const { view, size } = camera.current;
    const p = { x: size.width / 2, y: size.height / 2 };
    commit(moveAtlasView(view, size, p, p, view.zoom * factor));
  }
  function reset() { cancel(); commit(initialAtlasView()); }
  function keyDown(event: Key<SVGSVGElement>) {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (['+', '='].includes(event.key)) zoomBy(1.5);
    else if (['-', '_'].includes(event.key)) zoomBy(1 / 1.5);
    else if (['0', 'Home'].includes(event.key)) reset();
    else {
      const step = event.shiftKey ? 120 : 40;
      const delta: Record<string, AtlasPoint> = { ArrowLeft: { x: step, y: 0 }, ArrowRight: { x: -step, y: 0 }, ArrowUp: { x: 0, y: step }, ArrowDown: { x: 0, y: -step } };
      if (!delta[event.key]) return;
      cancel(); commit(moveAtlasView(camera.current.view, camera.current.size, { x: 0, y: 0 }, delta[event.key]));
    }
    event.preventDefault();
  }
  const scale = atlasScale(view, size);
  return { ref, view, size, scale, zoomBy, reset,
    transform: `translate(${size.width / 2 - view.center.x * scale} ${size.height / 2 - view.center.y * scale}) scale(${scale})`,
    events: { onPointerDown: pointerDown, onPointerMove: pointerMove, onPointerUp: pointerUp,
      onPointerCancel: pointerUp, onLostPointerCapture: pointerUp, onKeyDown: keyDown } };
}
