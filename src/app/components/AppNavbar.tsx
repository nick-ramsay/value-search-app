"use client";

import React, { Suspense } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import SearchBar from "./SearchBar";
import ThemeSwitcher from "./ThemeSwitcher";
import { LOGIN_MODAL_ID } from "./LoginModal";

type AppNavbarProps = {
  searchInitialQuery?: string;
  searchSelected?: boolean;
};

export default function AppNavbar({
  searchInitialQuery = "",
  searchSelected = false,
}: AppNavbarProps) {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const formAction = pathname === "/portfolio" ? "/portfolio" : "/";

  const isPortfolio = pathname === "/portfolio";
  const isMonthlyBalances = pathname === "/monthly-balances";
  const isSectorAssessments = pathname === "/sector-assessments";
  const isEconomyAssessment = pathname === "/economy-assessment";
  const hideNavbarSearch =
    pathname?.startsWith("/monthly-balances") === true ||
    isSectorAssessments ||
    isEconomyAssessment;
  const headerHref = isPortfolio ? "/portfolio" : "/";

  const handleLogout = async () => {
    await signOut({ callbackUrl: "/" });
  };

  const displayName =
    session?.user?.name ||
    [
      (session?.user as { firstname?: string })?.firstname,
      (session?.user as { lastname?: string })?.lastname,
    ]
      .filter(Boolean)
      .join(" ") ||
    session?.user?.email ||
    "User";

  const userLabel = status === "loading" ? "Loading…" : displayName;

  const authDropdownItems = (
    <>
      <li className="px-3 py-2 d-flex align-items-center gap-2">
        <span
          className="d-inline-flex align-items-center justify-content-center rounded-circle text-white fw-medium"
          style={{
            width: 24,
            height: 24,
            background: "linear-gradient(135deg, var(--accent) 0%, #30B0C7 100%)",
            fontSize: "0.75rem",
            flexShrink: 0,
          }}
        >
          {userLabel.charAt(0).toUpperCase()}
        </span>
        <small className="text-muted fw-semibold text-truncate">{userLabel}</small>
      </li>
      <ThemeSwitcher inline />
      <li><hr className="dropdown-divider my-2" /></li>
      <li>
        <Link href="/" className="dropdown-item d-flex align-items-center gap-2 py-2">
          <i className="bi bi-house" aria-hidden /> Home
        </Link>
      </li>
      {pathname !== "/portfolio" && (
        <li>
          <Link href="/portfolio" className="dropdown-item d-flex align-items-center gap-2 py-2">
            <i className="bi bi-grid" aria-hidden /> Portfolio
          </Link>
        </li>
      )}
      {!isMonthlyBalances && (
        <li>
          <Link href="/monthly-balances" className="dropdown-item d-flex align-items-center gap-2 py-2">
            <i className="bi bi-table" aria-hidden /> Monthly Balances
          </Link>
        </li>
      )}
      {!isSectorAssessments && (
        <li>
          <Link href="/sector-assessments" className="dropdown-item d-flex align-items-center gap-2 py-2">
            <i className="bi bi-bar-chart-steps" aria-hidden /> Sector Assessments
          </Link>
        </li>
      )}
      {!isEconomyAssessment && (
        <li>
          <Link href="/economy-assessment" className="dropdown-item d-flex align-items-center gap-2 py-2">
            <i className="bi bi-globe-americas" aria-hidden /> Economy Assessments
          </Link>
        </li>
      )}
      {pathname !== "/about" && (
        <li>
          <Link href="/about" className="dropdown-item d-flex align-items-center gap-2 py-2">
            <i className="bi bi-info-circle" aria-hidden /> About
          </Link>
        </li>
      )}
      <li><hr className="dropdown-divider my-2" /></li>
      <li>
        <button
          type="button"
          className="dropdown-item dropdown-item-danger d-flex align-items-center gap-2 py-2"
          onClick={handleLogout}
        >
          <i className="bi bi-box-arrow-right" aria-hidden /> Logout
        </button>
      </li>
    </>
  );

  const unauthDropdownItems = (
    <>
      <ThemeSwitcher inline />
      <li><hr className="dropdown-divider my-2" /></li>
      <li>
        <Link href="/" className="dropdown-item d-flex align-items-center gap-2 py-2">
          <i className="bi bi-house" aria-hidden /> Home
        </Link>
      </li>
      {!isSectorAssessments && (
        <li>
          <Link href="/sector-assessments" className="dropdown-item d-flex align-items-center gap-2 py-2">
            <i className="bi bi-bar-chart-steps" aria-hidden /> Sector Assessments
          </Link>
        </li>
      )}
      {!isEconomyAssessment && (
        <li>
          <Link href="/economy-assessment" className="dropdown-item d-flex align-items-center gap-2 py-2">
            <i className="bi bi-globe-americas" aria-hidden /> Economy Assessments
          </Link>
        </li>
      )}
      {pathname !== "/about" && (
        <li>
          <Link href="/about" className="dropdown-item d-flex align-items-center gap-2 py-2">
            <i className="bi bi-info-circle" aria-hidden /> About
          </Link>
        </li>
      )}
      <li><hr className="dropdown-divider my-2" /></li>
      <li>
        <button
          type="button"
          className="dropdown-item d-flex align-items-center gap-2 py-2"
          data-bs-toggle="modal"
          data-bs-target={`#${LOGIN_MODAL_ID}`}
        >
          <i className="bi bi-person-circle" aria-hidden /> Sign in
        </button>
      </li>
    </>
  );

  return (
    <nav
      className="navbar navbar-expand-lg fixed-top w-100 liquid-navbar"
      style={{ padding: "0.5rem 0" }}
    >
      <div className="container-fluid px-3">
        <div className="d-flex flex-row align-items-center gap-2 w-100 flex-nowrap">

          {/* Brand */}
          <span className="navbar-brand mb-0 h1 text-truncate" style={{ minWidth: 0 }}>
            <Link href={headerHref} className="navbar-brand-link">
              valuesearch.app
            </Link>
          </span>

          {/* Right group */}
          <div className="ms-auto d-flex align-items-center gap-2" style={{ minWidth: 0 }}>

            {/* Search — always visible when applicable */}
            {!hideNavbarSearch ? (
              <div className="flex-grow-1" style={{ maxWidth: "460px" }}>
                <Suspense fallback={<div className="search-input-glass search-input-glass--skeleton" aria-hidden="true" />}>
                  <SearchBar
                    initialQuery={searchSelected ? "" : searchInitialQuery}
                    formAction={formAction}
                  />
                </Suspense>
              </div>
            ) : null}

            {/* ── Nav menu — every item except search lives in this single dropdown, at every breakpoint ── */}
            {status === "loading" ? (
              <div
                className="btn btn-sm theme-switcher-btn dropdown-toggle d-flex align-items-center gap-2"
                aria-hidden="true"
              >
                <div className="navbar-auth-skeleton__avatar" />
                <div className="navbar-auth-skeleton__name d-none d-sm-block" />
              </div>
            ) : (
              <div className="dropdown d-flex">
                <button
                  type="button"
                  className="btn btn-sm theme-switcher-btn dropdown-toggle d-flex align-items-center gap-2"
                  data-bs-toggle="dropdown"
                  aria-expanded="false"
                  aria-label="Menu"
                >
                  {status === "authenticated" ? (
                    <>
                      <span
                        className="d-inline-flex align-items-center justify-content-center rounded-circle text-white fw-medium"
                        style={{
                          width: 28,
                          height: 28,
                          background: "linear-gradient(135deg, var(--accent) 0%, #30B0C7 100%)",
                          fontSize: "0.8rem",
                        }}
                      >
                        {userLabel.charAt(0).toUpperCase()}
                      </span>
                      <span className="d-none d-sm-inline text-truncate" style={{ maxWidth: "120px" }}>
                        {userLabel}
                      </span>
                    </>
                  ) : (
                    <span
                      className="d-inline-flex align-items-center justify-content-center rounded-circle navbar-guest-avatar"
                      style={{ width: 28, height: 28, fontSize: "0.95rem" }}
                    >
                      <i className="bi bi-list" aria-hidden />
                    </span>
                  )}
                </button>
                <ul className="dropdown-menu dropdown-menu-end user-dropdown-menu">
                  {status === "authenticated" ? authDropdownItems : unauthDropdownItems}
                </ul>
              </div>
            )}

          </div>
        </div>
      </div>
    </nav>
  );
}
