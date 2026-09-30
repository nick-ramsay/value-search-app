"use client";

import { useLayoutEffect, useState, type RefObject } from "react";

/** Tracks a container's clientWidth via ResizeObserver — used by the "fit
 * to screen" chart mode (the default) to size the plot to whatever space is
 * actually available, instead of the natural (possibly wider, scrollable)
 * width. Measures in a layout effect, before paint, so the default "fit"
 * view doesn't flash wide-then-compress on first render. */
export function useContainerWidth(ref: RefObject<HTMLElement | null>): number | null {
  const [width, setWidth] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);

  return width;
}
