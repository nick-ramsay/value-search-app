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
    <div className="about-page-header">
      <div className="about-page-header__row">
        <div className="about-page-header__back-cell">
          <button
            type="button"
            onClick={handleBack}
            className="btn btn-sm about-page-header__back d-inline-flex align-items-center justify-content-center"
            aria-label="Go back"
          >
            <i className="bi bi-chevron-left" aria-hidden />
          </button>
        </div>
        <section
          className="card glass-card monthly-balances-page-heading about-page__title about-page-header__title"
          aria-label="About"
        >
          <div className="card-body monthly-balances-page-heading-body px-3 px-sm-4">
            <h2 className="h5 mb-0">About</h2>
          </div>
        </section>
        <div className="about-page-header__spacer" aria-hidden="true" />
      </div>
    </div>
  );
}
