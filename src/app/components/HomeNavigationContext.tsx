"use client";

import { createContext, useContext, useTransition, type ReactNode, type TransitionStartFunction } from "react";

type HomeNavigationContextValue = {
  isPending: boolean;
  startTransition: TransitionStartFunction;
};

const HomeNavigationContext = createContext<HomeNavigationContextValue | null>(null);

/**
 * Shares one `isPending` flag across the filters form, active-filter chips,
 * and pagination — all three trigger navigations that change the results
 * list, so a change from any one of them should show a loading state over
 * the results (via PaginationWithLoader's overlay) rather than only its own
 * local control.
 */
export function HomeNavigationProvider({ children }: { children: ReactNode }) {
  const [isPending, startTransition] = useTransition();
  return (
    <HomeNavigationContext.Provider value={{ isPending, startTransition }}>
      {children}
    </HomeNavigationContext.Provider>
  );
}

export function useHomeNavigation(): HomeNavigationContextValue {
  const ctx = useContext(HomeNavigationContext);
  if (!ctx) {
    throw new Error("useHomeNavigation must be used within a HomeNavigationProvider");
  }
  return ctx;
}

/**
 * Same shared pending/transition state as useHomeNavigation, but returns
 * null instead of throwing when no HomeNavigationProvider is present. For
 * components (like SearchBar) that render on pages other than the home page,
 * where no provider wraps them — those callers fall back to a plain
 * navigation with no shared pending state to report to.
 */
export function useOptionalHomeNavigation(): HomeNavigationContextValue | null {
  return useContext(HomeNavigationContext);
}
