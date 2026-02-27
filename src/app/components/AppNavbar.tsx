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

  const userLabel =
    status === "loading" ? "Loading…" : displayName;

  return (
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
              href={session ? "/portfolio" : "/"}
              style={{
                color: "var(--text-primary)",
                textDecoration: "none",
              }}
            >
              valuesearch.app
            </Link>
          </span>
          <div
            className="ms-auto d-flex align-items-center gap-2"
            style={{ minWidth: 0 }}
          >
            <div className="flex-grow-1" style={{ maxWidth: "460px" }}>
              <SearchBar
                initialQuery={searchSelected ? "" : searchInitialQuery}
                formAction={formAction}
              />
            </div>

            {status === "authenticated" ? (
              <div className="dropdown">
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
                      background:
                        "linear-gradient(135deg, var(--accent) 0%, #5856d6 100%)",
                      fontSize: "0.8rem",
                    }}
                  >
                    {userLabel.charAt(0).toUpperCase()}
                  </span>
                  <span className="d-none d-sm-inline text-truncate" style={{ maxWidth: "120px" }}>
                    {userLabel}
                  </span>
                </button>
                <ul
                  className="dropdown-menu dropdown-menu-end user-dropdown-menu"
                  aria-labelledby="userDropdown"
                >
                  <li>
                    <Link
                      href="/portfolio"
                      className="dropdown-item d-flex align-items-center gap-2 py-2"
                    >
                      <i className="bi bi-grid" aria-hidden />
                      Portfolio
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/"
                      className="dropdown-item d-flex align-items-center gap-2 py-2"
                    >
                      <i className="bi bi-house" aria-hidden />
                      Home
                    </Link>
                  </li>
                  <li>
                    <hr className="dropdown-divider my-2" />
                  </li>
                  <li className="px-2 py-1">
                    <span className="dropdown-item-text small fw-semibold text-muted">
                      Theme
                    </span>
                  </li>
                  <ThemeSwitcher inline />
                  <li>
                    <hr className="dropdown-divider my-2" />
                  </li>
                  <li>
                    <button
                      type="button"
                      className="dropdown-item d-flex align-items-center gap-2 py-2"
                      onClick={handleLogout}
                    >
                      <i className="bi bi-box-arrow-right" aria-hidden />
                      Logout
                    </button>
                  </li>
                </ul>
              </div>
            ) : (
              <>
                <ThemeSwitcher />
                <button
                  type="button"
                  className="btn btn-sm theme-switcher-btn"
                  aria-label="Sign in"
                  title="Sign in"
                  data-bs-toggle="modal"
                  data-bs-target={`#${LOGIN_MODAL_ID}`}
                >
                  <i className="bi bi-person-circle" aria-hidden />
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
