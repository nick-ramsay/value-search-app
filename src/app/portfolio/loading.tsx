"use client";

import AppNavbar from "../components/AppNavbar";

export default function PortfolioLoading() {
  return (
    <div className="min-vh-100">
      <AppNavbar />
      <main className="container pt-5 mt-5" style={{ marginTop: "4.5rem" }}>
        <div className="row justify-content-center">
          <div className="col-lg-8">
            <div className="d-flex flex-column align-items-center justify-content-center py-5">
              <span className="spinner-border" aria-hidden />
              <span className="small text-muted mt-3">Loading portfolio…</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

