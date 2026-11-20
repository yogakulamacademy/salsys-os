"use client";

import { useEffect, useRef, useState, type HTMLAttributes, type ReactNode } from "react";

/**
 * One horizontal row of chips. Drag it with the mouse (or swipe, or use the
 * mouse wheel) to see the chips on the right. A drag never triggers a click.
 */
export function DragScrollRow({ children, className = "", ...rest }: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ x: number; left: number; moved: boolean; id: number } | null>(null);
  const [edges, setEdges] = useState({ start: false, end: false });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setEdges({ start: el.scrollLeft > 2, end: el.scrollLeft + el.clientWidth < el.scrollWidth - 2 });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    el.addEventListener("scroll", update, { passive: true });
    // A vertical wheel moves the row sideways while the pointer is over it.
    const onWheel = (event: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
      event.preventDefault();
      el.scrollLeft += event.deltaY;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => { ro.disconnect(); el.removeEventListener("scroll", update); el.removeEventListener("wheel", onWheel); };
  }, []);

  return (
    <div
      {...rest}
      ref={ref}
      data-fade-start={edges.start || undefined}
      data-fade-end={edges.end || undefined}
      className={`ibx-drag-row ${className}`}
      onPointerDown={(event) => {
        if (event.pointerType !== "mouse" || event.button !== 0 || !ref.current) return;
        drag.current = { x: event.clientX, left: ref.current.scrollLeft, moved: false, id: event.pointerId };
      }}
      onPointerMove={(event) => {
        const d = drag.current;
        if (!d || !ref.current) return;
        const dx = event.clientX - d.x;
        if (!d.moved && Math.abs(dx) > 4) {
          d.moved = true;
          ref.current.setPointerCapture(d.id);
          ref.current.dataset.dragging = "true";
        }
        if (d.moved) ref.current.scrollLeft = d.left - dx;
      }}
      onPointerUp={() => {
        const el = ref.current;
        if (el?.dataset.dragging) {
          // Swallow the click that follows a drag.
          const stop = (e: Event) => { e.stopPropagation(); e.preventDefault(); };
          el.addEventListener("click", stop, { capture: true, once: true });
          window.setTimeout(() => el.removeEventListener("click", stop, { capture: true }), 0);
          delete el.dataset.dragging;
        }
        drag.current = null;
      }}
      onPointerCancel={() => { drag.current = null; if (ref.current) delete ref.current.dataset.dragging; }}
    >
      {children}
    </div>
  );
}
