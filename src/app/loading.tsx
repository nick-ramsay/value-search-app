"use client";

import Link from "next/link";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import SearchBar from "./components/SearchBar";
import ThemeSwitcher from "./components/ThemeSwitcher";

function PageLoadingContent() {
  const searchParams = useSearchParams();
  const pageParam = searchParams.get("page");
  const currentPage = Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1);

  return (
    <div className="min-vh-100 d-flex flex-column">
      <nav
        className="navbar navbar-expand-lg fixed-top w-100 liquid-navbar"
        style={{ padding: "0.5rem 0" }}
      >
        <div className="container-fluid px-3">
          <div className="d-flex flex-row align-items-center gap-2 w-100 flex-nowrap">
            <span
              className="navbar-brand mb-0 h1 text-truncate"
              style={{ minWidth: 0, fontWeight: 600 }}
            >
              <Link
                href="/"
                style={{ color: "var(--text-primary)", textDecoration: "none" }}
              >
                valuesearch.app
              </Link>
            </span>
            <div
              className="ms-auto d-flex align-items-center gap-2"
              style={{ minWidth: 0 }}
            >
              <div className="flex-grow-1" style={{ maxWidth: "460px" }}>
                <SearchBar initialQuery="" />
              </div>
              <ThemeSwitcher />
            </div>
          </div>
        </div>
      </nav>
      <main className="container pt-5 mt-4 page-loading-main flex-grow-1 d-flex flex-column">
        <div className="row justify-content-center flex-grow-1">
          <div className="col-lg-8 d-flex flex-column">
            <section className="card-body pb-2">
              <p className="text-muted small mb-0 text-center">
                0 results
              </p>
            </section>
            <section className="card liquid-glass-card mb-4 pt-3 page-loading-results-card flex-grow-1 d-flex flex-column">
              <div className="card-body pt-0 page-loading-results-card-body">
                <nav
                  aria-label="Results pages"
                  className="d-flex align-items-center justify-content-between mb-4"
                  aria-busy="true"
                  aria-live="polite"
                >
                  <span
                    className="page-change-icon page-change-icon-disabled"
                    style={{ width: "40px", cursor: "not-allowed" }}
                    aria-hidden
                  >
                    <i className="bi bi-chevron-left" />
                  </span>
                  <span className="align-self-center">Page {currentPage}</span>
                  <span
                    className="page-change-icon page-change-icon-disabled"
                    style={{ width: "40px", cursor: "not-allowed" }}
                    aria-hidden
                  >
                    <i className="bi bi-chevron-right" />
                  </span>
                </nav>
                <div
                  className="d-flex flex-column align-items-center justify-content-center flex-grow-1"
                  role="status"
                  aria-live="polite"
                >
                  <span className="spinner-border" aria-hidden />
                </div>
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}

function PageLoadingFallback() {
  return (
    <div className="min-vh-100 d-flex flex-column">
      <nav
        className="navbar navbar-expand-lg fixed-top w-100 liquid-navbar"
        style={{ padding: "0.5rem 0" }}
      >
        <div className="container-fluid px-3">
          <div className="d-flex flex-row align-items-center gap-2 w-100 flex-nowrap">
            <span
              className="navbar-brand mb-0 h1 text-truncate"
              style={{ minWidth: 0, fontWeight: 600 }}
            >
              <Link
                href="/"
                style={{ color: "var(--text-primary)", textDecoration: "none" }}
              >
                valuesearch.app
              </Link>
            </span>
            <div
              className="ms-auto d-flex align-items-center gap-2"
              style={{ minWidth: 0 }}
            >
              <div className="flex-grow-1" style={{ maxWidth: "460px" }}>
                <SearchBar initialQuery="" />
              </div>
              <ThemeSwitcher />
            </div>
          </div>
        </div>
      </nav>
      <main className="container pt-5 mt-4 page-loading-main flex-grow-1 d-flex flex-column">
        <div className="row justify-content-center flex-grow-1">
          <div className="col-lg-8 d-flex flex-column">
            <section className="card-body pb-2">
              <p className="text-muted small mb-0 text-center">
                0 results
              </p>
            </section>
            <section className="card liquid-glass-card mb-4 pt-3 page-loading-results-card flex-grow-1 d-flex flex-column">
              <div className="card-body pt-0 page-loading-results-card-body">
                <nav
                  aria-label="Results pages"
                  className="d-flex align-items-center justify-content-between mb-4"
                  aria-busy="true"
                >
                  <span
                    className="page-change-icon page-change-icon-disabled"
                    style={{ width: "40px" }}
                    aria-hidden
                  >
                    <i className="bi bi-chevron-left" />
                  </span>
                  <span className="align-self-center">Page 1</span>
                  <span
                    className="page-change-icon page-change-icon-disabled"
                    style={{ width: "40px" }}
                    aria-hidden
                  >
                    <i className="bi bi-chevron-right" />
                  </span>
                </nav>
                <div
                  className="d-flex flex-column align-items-center justify-content-center flex-grow-1"
                  role="status"
                >
                  <span className="spinner-border" aria-hidden />
                </div>
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function Loading() {
  return (
    <Suspense fallback={<PageLoadingFallback />}>
      <PageLoadingContent />
    </Suspense>
  );
}
