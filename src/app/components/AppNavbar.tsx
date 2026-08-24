"use client";

import React from "react";
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
            <i className="bi bi-table" aria-hidden /> Monthly balances
          </Link>
        </li>
      )}
      {!isSectorAssessments && (
        <li>
          <Link href="/sector-assessments" className="dropdown-item d-flex align-items-center gap-2 py-2">
            <i className="bi bi-bar-chart-steps" aria-hidden /> Sector assessments
          </Link>
        </li>
      )}
      {!isEconomyAssessment && (
        <li>
          <Link href="/economy-assessment" className="dropdown-item d-flex align-items-center gap-2 py-2">
            <i className="bi bi-globe-americas" aria-hidden /> Economy assessment
          </Link>
        </li>
      )}
      <li className="px-2 py-1">
        <span className="dropdown-item-text small fw-semibold text-muted">Theme</span>
      </li>
      <ThemeSwitcher inline />
      <li><hr className="dropdown-divider my-2" /></li>
      <li>
        <Link href="/" className="dropdown-item d-flex align-items-center gap-2 py-2">
          <i className="bi bi-house" aria-hidden /> Home
        </Link>
      </li>
      {pathname !== "/about" && (
        <li>
          <Link href="/about" className="dropdown-item d-flex align-items-center gap-2 py-2">
            <i className="bi bi-info-circle" aria-hidden /> About
          </Link>
        </li>
      )}
      <li>
        <button
          type="button"
          className="dropdown-item d-flex align-items-center gap-2 py-2"
          onClick={handleLogout}
        >
          <i className="bi bi-box-arrow-right" aria-hidden /> Logout
        </button>
      </li>
    </>
  );

  const unauthDropdownItems = (
    <>
      <li className="px-2 py-1">
        <span className="dropdown-item-text small fw-semibold text-muted">Theme</span>
      </li>
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
            <i className="bi bi-bar-chart-steps" aria-hidden /> Sectors
          </Link>
        </li>
      )}
      {!isEconomyAssessment && (
        <li>
          <Link href="/economy-assessment" className="dropdown-item d-flex align-items-center gap-2 py-2">
            <i className="bi bi-globe-americas" aria-hidden /> Economy
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
                <SearchBar
                  initialQuery={searchSelected ? "" : searchInitialQuery}
                  formAction={formAction}
                />
              </div>
            ) : null}

            {/* ── Desktop nav items (sm+, hidden on mobile) ── */}
            {status === "authenticated" ? (
              <div className="dropdown d-none d-sm-flex">
                <button
                  type="button"
                  className="btn btn-sm theme-switcher-btn dropdown-toggle d-flex align-items-center gap-2"
                  data-bs-toggle="dropdown"
                  aria-expanded="false"
                  aria-label="User menu"
                >
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
                </button>
                <ul className="dropdown-menu dropdown-menu-end user-dropdown-menu" aria-labelledby="userDropdown">
                  {authDropdownItems}
                </ul>
              </div>
            ) : status === "unauthenticated" ? (
              <div className="d-none d-sm-flex align-items-center gap-2">
                <ThemeSwitcher />
                <Link
                  href="/"
                  className="btn btn-sm theme-switcher-btn"
                  aria-label="Home"
                  title="Home"
                >
                  <i className="bi bi-house" aria-hidden />
                </Link>
                {!isSectorAssessments && (
                  <Link
                    href="/sector-assessments"
                    className="btn btn-sm theme-switcher-btn navbar-text-btn"
                    aria-label="Sector assessments"
                    title="Sector assessments"
                  >
                    <i className="bi bi-bar-chart-steps" aria-hidden />
                    <span className="navbar-btn-label">Sectors</span>
                  </Link>
                )}
                {!isEconomyAssessment && (
                  <Link
                    href="/economy-assessment"
                    className="btn btn-sm theme-switcher-btn navbar-text-btn"
                    aria-label="Economy assessment"
                    title="Economy assessment"
                  >
                    <i className="bi bi-globe-americas" aria-hidden />
                    <span className="navbar-btn-label">Economy</span>
                  </Link>
                )}
                {pathname !== "/about" && (
                  <Link
                    href="/about"
                    className="btn btn-sm theme-switcher-btn navbar-text-btn"
                    aria-label="About valuesearch.app"
                    title="About valuesearch.app"
                  >
                    <i className="bi bi-info-circle" aria-hidden />
                    <span className="navbar-btn-label">About</span>
                  </Link>
                )}
                <button
                  type="button"
                  className="btn btn-sm theme-switcher-btn navbar-text-btn"
                  aria-label="Sign in"
                  title="Sign in"
                  data-bs-toggle="modal"
                  data-bs-target={`#${LOGIN_MODAL_ID}`}
                >
                  <i className="bi bi-person-circle" aria-hidden />
                  <span className="navbar-btn-label">Sign in</span>
                </button>
              </div>
            ) : (
              <div className="d-none d-sm-flex navbar-auth-skeleton" aria-hidden="true">
                <div className="navbar-auth-skeleton__avatar" />
                <div className="navbar-auth-skeleton__name" />
              </div>
            )}

            {/* ── Mobile hamburger (hidden on sm+) ── */}
            {status === "loading" ? (
              <div className="d-flex d-sm-none navbar-auth-skeleton" aria-hidden="true">
                <div className="navbar-auth-skeleton__avatar" />
                <i className="bi bi-chevron-down navbar-auth-skeleton__caret" />
              </div>
            ) : (
              <div className="dropdown d-flex d-sm-none">
                <button
                  type="button"
                  className={`btn btn-sm theme-switcher-btn d-flex align-items-center gap-2${status === "authenticated" ? " dropdown-toggle" : ""}`}
                  data-bs-toggle="dropdown"
                  aria-expanded="false"
                  aria-label="Menu"
                >
                  {status === "authenticated" ? (
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
                  ) : (
                    <i className="bi bi-list" style={{ fontSize: "1.25rem", lineHeight: 1 }} aria-hidden />
                  )}
                </button>
                <ul className="dropdown-menu dropdown-menu-end user-dropdown-menu">
                  {status === "authenticated" ? (
                    <>
                      <li className="px-3 py-2">
                        <small className="text-muted fw-semibold">{userLabel}</small>
                      </li>
                      <li><hr className="dropdown-divider my-1" /></li>
                      {authDropdownItems}
                    </>
                  ) : (
                    unauthDropdownItems
                  )}
                </ul>
              </div>
            )}

          </div>
        </div>
      </div>
    </nav>
  );
}
