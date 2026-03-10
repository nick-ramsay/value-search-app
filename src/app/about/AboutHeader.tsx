"use client";

import { useRouter } from "next/navigation";

export default function AboutHeader() {
  const router = useRouter();

  const handleBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push("/");
    }
  };

  return (
    <div className="about-header-wrap w-100 mb-3 mt-2">
      {/* Left column: back sits at inner edge, immediately left of centered pill */}
      <div className="about-header-back-cell">
        <button
          type="button"
          onClick={handleBack}
          className="btn btn-sm about-header-back d-inline-flex align-items-center justify-content-center"
          aria-label="Go back"
        >
          <i className="bi bi-chevron-left" aria-hidden />
        </button>
      </div>
      {/* Middle column: pill only — 1fr | auto | 1fr keeps this column dead center */}
      <div className="about-header-pill px-3 py-2">
        <span className="small fw-semibold text-uppercase about-header-pill-text">
          About valuesearch.app
        </span>
      </div>
      {/* Right column: balances layout so middle column stays centered */}
      <div className="about-header-spacer" aria-hidden="true" />
    </div>
  );
}

