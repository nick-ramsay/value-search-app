"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Scrolls to the top of the page on every route change and disables the
 * browser's native scroll restoration so hard reloads don't re-apply a
 * remembered scroll offset.
 */
export default function ScrollToTop() {
  // Disable browser scroll restoration once on mount
  useEffect(() => {
    if (typeof window !== "undefined" && "scrollRestoration" in history) {
      history.scrollRestoration = "manual";
    }
  }, []);

  const pathname = usePathname();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [pathname]);

  return null;
}
