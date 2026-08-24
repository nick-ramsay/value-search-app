import AppNavbar from "../components/AppNavbar";

export default function EconomyAssessmentLoading() {
  return (
    <div className="min-vh-100">
      <AppNavbar />
      <main className="container pt-5 mt-4">
        <div className="row justify-content-center">
          <div className="col-lg-8 economy-assessment-page">
            <section
              className="card glass-card monthly-balances-page-heading economy-assessment-heading"
              aria-label="Economy assessment"
            >
              <div className="card-body monthly-balances-page-heading-body">
                <h2 className="h5 mb-0">Economy &amp; Market Assessment</h2>
                <p className="economy-assessment-lead mb-0">
                  AI-generated synthesis of every sector &amp; industry assessment, refreshed weekly.
                </p>
              </div>
            </section>

            <section
              className="card glass-card economy-assessment-loading mb-4"
              role="status"
              aria-live="polite"
              aria-busy="true"
              aria-label="Loading assessment"
            >
              <div className="economy-assessment-loading-body d-flex flex-column align-items-center justify-content-center gap-3 text-secondary">
                <span className="spinner-border" aria-hidden />
                <span className="small">Loading assessment…</span>
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
