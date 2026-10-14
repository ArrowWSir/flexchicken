"use client";
import { useCallback, useEffect, useRef, useState } from "react";

// Past this many pixels a press counts as a slide, so letting go doesn't
// also tap the chip under the pointer.
const DRAG_PX = 6;

const sameEdges = (a, b) => a.start === b.start && a.end === b.end;

/**
 * A sideways row that slides with a finger (native), a mouse drag, or the
 * mouse wheel. `edges` says which ends still hide chips, for the fade.
 */
export default function useDragScroll() {
  const ref = useRef(null);
  const drag = useRef(null);
  const wasDragged = useRef(false);
  const [edges, setEdges] = useState({ start: false, end: false });

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    const next = { start: el.scrollLeft > 1, end: el.scrollLeft < max - 1 };
    setEdges((prev) => (sameEdges(prev, next) ? prev : next));
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    // A wheel turned over the row slides it, until an end is reached; then
    // the page scrolls as usual. Non-passive so the page doesn't move too.
    const onWheel = (e) => {
      if (Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return;
      const max = el.scrollWidth - el.clientWidth;
      const isStuck = (e.deltaY < 0 && el.scrollLeft <= 0) || (e.deltaY > 0 && el.scrollLeft >= max - 1);
      if (max <= 0 || isStuck) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      observer.disconnect();
      el.removeEventListener("wheel", onWheel);
    };
  }, [measure]);

  // Touch and pen already slide natively; only the mouse needs dragging.
  const onPointerDown = (e) => {
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    drag.current = { id: e.pointerId, x: e.clientX, left: ref.current.scrollLeft, isMoving: false };
  };

  const onPointerMove = (e) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    if (!d.isMoving && Math.abs(dx) < DRAG_PX) return;
    if (!d.isMoving) {
      drag.current = { ...d, isMoving: true };
      ref.current.setPointerCapture(e.pointerId);
    }
    ref.current.scrollLeft = d.left - dx;
  };

  const onPointerEnd = (e) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    wasDragged.current = d.isMoving;
    drag.current = null;
  };

  const onClickCapture = (e) => {
    if (!wasDragged.current) return;
    wasDragged.current = false;
    e.preventDefault();
    e.stopPropagation();
  };

  const fade = edges.start && edges.end ? "both" : edges.start ? "start" : edges.end ? "end" : undefined;

  return {
    ref,
    "data-fade": fade,
    onScroll: measure,
    onPointerDown,
    onPointerMove,
    onPointerUp: onPointerEnd,
    onPointerCancel: onPointerEnd,
    onClickCapture,
  };
}
