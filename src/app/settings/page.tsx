import AppNavbar from "../components/AppNavbar";
import SettingsClient from "../components/SettingsClient";

/**
 * Login-required (see middleware.ts's matcher — no role check, unlike
 * /admin: any authenticated user can pick a background theme).
 */
export default function SettingsPage() {
  return (
    <div className="min-vh-100 d-flex flex-column">
      <AppNavbar />
      <main className="container pt-5 mt-4 flex-grow-1 d-flex flex-column">
        <div className="row justify-content-center">
          <div className="col-lg-8">
            <section className="card glass-card monthly-balances-page-heading" aria-label="Settings">
              <div className="card-body monthly-balances-page-heading-body">
                <h2 className="h5 mb-0">Settings</h2>
                <p className="economy-assessment-lead mb-0">
                  Pick a background theme for valuesearch.app.
                </p>
              </div>
            </section>
            <SettingsClient />
          </div>
        </div>
      </main>
    </div>
  );
}
