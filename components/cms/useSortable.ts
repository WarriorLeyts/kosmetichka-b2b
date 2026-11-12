"use client";
import { useRef, useState } from "react";

/**
 * Drag-and-drop ordering on pointer events: works with a mouse, a pen and a finger (HTML5 drag-and-drop
 * does not work on touch screens). Lists and grids: the item under the pointer — the one with the
 * nearest centre — takes the dragged item's place while dragging; `onEnd` runs once on release.
 */
export function useSortable(onMove: (from: number, to: number) => void, onEnd?: () => void) {
  const [dragging, setDragging] = useState<number | null>(null);
  const cur = useRef<number | null>(null);
  const els = useRef<(HTMLElement | null)[]>([]);

  const itemRef = (i: number) => (el: HTMLElement | null) => {
    els.current[i] = el;
  };

  const handleProps = (i: number) => ({
    onPointerDown: (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
      cur.current = i;
      setDragging(i);
    },
    onPointerMove: (e: React.PointerEvent) => {
      const from = cur.current;
      if (from == null) return;
      let best = from;
      let bestD = Infinity;
      els.current.forEach((el, k) => {
        if (!el) return;
        const r = el.getBoundingClientRect();
        const d = Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2));
        if (d < bestD) {
          bestD = d;
          best = k;
        }
      });
      if (best !== from) {
        onMove(from, best);
        cur.current = best;
        setDragging(best);
      }
    },
    onPointerUp: () => {
      if (cur.current == null) return;
      cur.current = null;
      setDragging(null);
      onEnd?.();
    },
    onPointerCancel: () => {
      cur.current = null;
      setDragging(null);
    },
    style: { touchAction: "none" as const, cursor: "grab" },
  });

  return { dragging, itemRef, handleProps };
}
