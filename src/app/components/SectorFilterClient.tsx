"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

type SectorFilterClientProps = {
  sectors: string[];
  selectedSector: string;
  children: React.ReactNode;
};

export default function SectorFilterClient({
  sectors,
  selectedSector,
  children,
}: SectorFilterClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const goTo = (href: string) => {
    startTransition(() => {
      router.push(href);
    });
  };

  return (
    <>
      <section className="sector-assessments-filters" aria-label="Filter by sector">
        <nav
          className="sector-pill-list"
          aria-label="Sector filter"
          style={{ pointerEvents: isPending ? "none" : undefined, opacity: isPending ? 0.7 : 1 }}
        >
          <button
            type="button"
            className={`sector-pill${!selectedSector ? " sector-pill--active" : ""}`}
            onClick={() => goTo("/sector-assessments")}
            disabled={isPending}
          >
            All
          </button>
          {sectors.map((s) => (
            <button
              key={s}
              type="button"
              className={`sector-pill${selectedSector === s ? " sector-pill--active" : ""}`}
              onClick={() => goTo(`/sector-assessments?sector=${encodeURIComponent(s)}`)}
              disabled={isPending}
            >
              {s}
            </button>
          ))}
        </nav>
      </section>

      <div className="position-relative">
        {isPending && (
          <div
            className="pagination-loading-overlay position-absolute top-0 start-0 end-0 bottom-0 d-flex flex-column align-items-center justify-content-center rounded"
            role="status"
            aria-live="polite"
            aria-busy="true"
          >
            <span className="spinner-border" aria-hidden />
          </div>
        )}
        <div className={isPending ? "filters-form--pending" : undefined}>
          {children}
        </div>
      </div>
    </>
  );
}
