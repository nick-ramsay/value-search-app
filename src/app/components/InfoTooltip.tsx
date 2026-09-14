"use client";

import { useEffect, useRef, useState } from "react";

type InfoTooltipProps = {
  text: string;
  label?: string;
};

/**
 * Small info-icon tooltip that works on both hover (desktop) and tap
 * (mobile, via onClick) — a plain `title` attribute would cover hover but
 * most mobile browsers don't surface it on tap at all. Closes on
 * mouse-leave/blur for the hover case, and on an outside tap for the
 * tap-to-open case (nothing else naturally closes it there).
 */
export default function InfoTooltip({ text, label = "More information" }: InfoTooltipProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const handleOutside = (event: MouseEvent | TouchEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("touchstart", handleOutside);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("touchstart", handleOutside);
    };
  }, [open]);

  return (
    <span className="info-tooltip" ref={rootRef}>
      <button
        type="button"
        className="info-tooltip__trigger"
        aria-label={label}
        aria-expanded={open}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen((prev) => !prev)}
      >
        <i className="bi bi-info-circle" aria-hidden />
      </button>
      {open ? (
        <span className="info-tooltip__bubble" role="tooltip">
          {text}
        </span>
      ) : null}
    </span>
  );
}
