import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from 'react';
import { constrainMapView, initialMapView, mapScale, moveMapView, type MapSize, type MapView, type Point } from './mapViewport';

type Contact = { point: Point; start: Point; target: Element };
const DRAG_THRESHOLD = 6; // CSS pixels, independent of zoom and screen density.

export function useMapNavigation() {
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState<MapSize>({ width: 360, height: 332 });
  const [view, setView] = useState(initialMapView);
  const [dragging, setDragging] = useState(false);
  const viewRef = useRef(view);
  const sizeRef = useRef(size);
  const contacts = useRef(new Map<number, Contact>());
  const pinchStart = useRef<{ view: MapView; points: Point[] } | null>(null);
  const gestureUsed = useRef(false);

  function commit(next: MapView) {
    viewRef.current = next;
    setView(next);
  }

  function localPoint(clientX: number, clientY: number): Point {
    const rect = svgRef.current!.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  function cancelGesture() {
    if (contacts.current.size) gestureUsed.current = true;
    const previous = [...contacts.current.entries()];
    contacts.current.clear();
    pinchStart.current = null;
    for (const [id, contact] of previous) {
      if (contact.target.hasPointerCapture(id)) contact.target.releasePointerCapture(id);
    }
    setDragging(false);
  }

  useEffect(() => {
    const svg = svgRef.current!;
    const observer = new ResizeObserver(() => {
      const { width, height } = svg.getBoundingClientRect();
      if (!width || !height) {
        cancelGesture();
        return; // Hidden tabs retain their last valid camera and size.
      }
      cancelGesture();
      const next = { width, height };
      sizeRef.current = next;
      setSize(next);
      commit(constrainMapView(viewRef.current, next));
    });
    observer.observe(svg);
    function wheel(event: WheelEvent) {
      event.preventDefault(); // A non-passive listener keeps wheel zoom inside the map.
      if (contacts.current.size) return;
      const viewport = sizeRef.current;
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewport.height : 1);
      const factor = Math.exp(-Math.max(-120, Math.min(120, delta)) * 0.002);
      const point = localPoint(event.clientX, event.clientY);
      commit(moveMapView(viewRef.current, viewport, point, point, viewRef.current.zoom * factor));
    }
    svg.addEventListener('wheel', wheel, { passive: false });
    window.addEventListener('blur', cancelGesture);
    return () => {
      observer.disconnect();
      svg.removeEventListener('wheel', wheel);
      window.removeEventListener('blur', cancelGesture);
      cancelGesture();
    };
  }, []);

  function pointerDown(event: ReactPointerEvent<SVGSVGElement>) {
    if (event.button !== 0) return;
    if (!contacts.current.size) gestureUsed.current = false;
    const point = localPoint(event.clientX, event.clientY);
    const target = event.target as Element;
    contacts.current.set(event.pointerId, { point, start: point, target });
    // Keep capture on the original target so a stationary tap still clicks its region.
    target.setPointerCapture(event.pointerId);
    if (contacts.current.size > 1) {
      pinchStart.current = { view: viewRef.current, points: [...contacts.current.values()].slice(0, 2).map(item => item.point) };
      gestureUsed.current = true;
      setDragging(true);
    }
  }

  function pointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    const contact = contacts.current.get(event.pointerId);
    if (!contact) return;
    const before = [...contacts.current.values()].slice(0, 2).map(item => item.point);
    const point = localPoint(event.clientX, event.clientY);
    contact.point = point;
    if (!gestureUsed.current) {
      if (Math.hypot(point.x - contact.start.x, point.y - contact.start.y) < DRAG_THRESHOLD) return;
      before[0] = contact.start;
      gestureUsed.current = true;
      setDragging(true);
    }
    const after = [...contacts.current.values()].slice(0, 2).map(item => item.point);
    const midpoint = (points: Point[]) => points.length === 1 ? points[0]
      : { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 };
    if (before.length === 2) {
      const distance = (points: Point[]) => Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
      const start = pinchStart.current ?? (pinchStart.current = { view: viewRef.current, points: before });
      const previousDistance = distance(start.points);
      if (previousDistance > 0) {
        // Anchor the whole pinch, rather than accumulating clamp/rounding errors
        // as browsers deliver the two contacts' moves one at a time.
        commit(moveMapView(start.view, sizeRef.current, midpoint(start.points), midpoint(after), start.view.zoom * distance(after) / previousDistance));
      } else {
        pinchStart.current = { view: viewRef.current, points: after };
      }
      return;
    }
    commit(moveMapView(viewRef.current, sizeRef.current, midpoint(before), midpoint(after)));
  }

  function pointerUp(event: ReactPointerEvent<SVGSVGElement>) {
    if (!contacts.current.has(event.pointerId)) return;
    pointerMove(event); // Also reject a release displaced without an intervening move.
    contacts.current.delete(event.pointerId);
    pinchStart.current = null;
    if (!contacts.current.size) setDragging(false);
  }

  function pointerCancelled(event: ReactPointerEvent<SVGSVGElement>) {
    if (!contacts.current.has(event.pointerId)) return;
    gestureUsed.current = true;
    contacts.current.delete(event.pointerId);
    pinchStart.current = null;
    if (!contacts.current.size) setDragging(false);
  }

  function zoomBy(factor: number) {
    cancelGesture();
    const viewport = sizeRef.current;
    const center = { x: viewport.width / 2, y: viewport.height / 2 };
    commit(moveMapView(viewRef.current, viewport, center, center, viewRef.current.zoom * factor));
  }

  function reset() {
    cancelGesture();
    commit(initialMapView());
  }

  function keyDown(event: ReactKeyboardEvent<SVGSVGElement>) {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === '+' || event.key === '=') zoomBy(1.25);
    else if (event.key === '-' || event.key === '_') zoomBy(1 / 1.25);
    else if (event.key === '0' || event.key === 'Home') reset();
    else {
      const step = event.shiftKey ? 100 : 40;
      const deltas: Record<string, Point> = { ArrowLeft: { x: step, y: 0 }, ArrowRight: { x: -step, y: 0 }, ArrowUp: { x: 0, y: step }, ArrowDown: { x: 0, y: -step } };
      const delta = deltas[event.key];
      if (!delta) return;
      cancelGesture();
      commit(moveMapView(viewRef.current, sizeRef.current, { x: 0, y: 0 }, delta));
    }
    event.preventDefault();
  }

  function revealRegion(element: SVGGElement) {
    if (!element.matches(':focus-visible')) return;
    const bounds = element.getBBox();
    const current = viewRef.current;
    const viewport = sizeRef.current;
    const scale = mapScale(current, viewport);
    const left = (bounds.x - current.center.x) * scale + viewport.width / 2;
    const top = (bounds.y - current.center.y) * scale + viewport.height / 2;
    if (left < 8 || top < 8 || left + bounds.width * scale > viewport.width - 8 || top + bounds.height * scale > viewport.height - 8) {
      commit(constrainMapView({ ...current, center: { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 } }, viewport));
    }
  }

  const scale = mapScale(view, size);
  return {
    svgRef, view, size, dragging, zoomBy, reset, revealRegion,
    transform: `translate(${size.width / 2 - view.center.x * scale} ${size.height / 2 - view.center.y * scale}) scale(${scale})`,
    events: {
      onPointerDown: pointerDown, onPointerMove: pointerMove, onPointerUp: pointerUp,
      onPointerCancel: pointerCancelled, onLostPointerCapture: pointerCancelled,
      onKeyDown: keyDown,
      onClickCapture: (event: ReactMouseEvent<SVGSVGElement>) => {
        // Interactive overlays own their tap/drag checks and do not enter map gestures.
        if ((event.target as Element).closest('[data-map-interactive]')) return;
        // Keyboard/assistive clicks have detail 0; drag/pinch compatibility clicks do not.
        if (gestureUsed.current && event.detail !== 0) {
          event.preventDefault();
          event.stopPropagation();
        }
      },
    },
  };
}
