import AppNavbar from "../components/AppNavbar";

export default function SectorAssessmentsLoading() {
  return (
    <div className="min-vh-100">
      <AppNavbar />
      <main className="container pt-5 mt-4">
        <div className="row justify-content-center">
          <div className="col-lg-8 sector-assessments-page">
            <section
              className="card glass-card monthly-balances-page-heading sector-assessments-heading"
              aria-label="Sector assessments"
            >
              <div className="card-body monthly-balances-page-heading-body">
                <h2 className="h5 mb-0">Sector &amp; Industry Assessments</h2>
                <p className="sector-assessments-lead mb-0">
                  AI-generated outlooks by sector and industry, refreshed on weekends.
                </p>
              </div>
            </section>

            <section
              className="card glass-card sector-assessments-loading mb-4"
              role="status"
              aria-live="polite"
              aria-busy="true"
              aria-label="Loading assessments"
            >
              <div className="sector-assessments-loading-body d-flex flex-column align-items-center justify-content-center gap-3 text-secondary">
                <span className="spinner-border" aria-hidden />
                <span className="small">Loading assessments…</span>
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
