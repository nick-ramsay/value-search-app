import AppNavbar from "../components/AppNavbar";
import ThesisClient from "./ThesisClient";

export default function ThesisPage() {
  return (
    <div className="min-vh-100 d-flex flex-column">
      <AppNavbar />
      <main className="container pt-5 mt-4 thesis-page flex-grow-1 d-flex flex-column">
        <div className="row justify-content-center flex-grow-1">
          <div className="col-lg-8 d-flex flex-column">
            <section
              className="card glass-card monthly-balances-page-heading thesis-page__title"
              aria-label="Thesis"
            >
              <div className="card-body monthly-balances-page-heading-body px-3 px-sm-4">
                <h2 className="h5 mb-0">Thesis</h2>
                <p className="thesis-page__lead mb-0">
                  What you&apos;re interested in right now, and what you want to avoid.
                </p>
              </div>
            </section>
            <ThesisClient />
          </div>
        </div>
      </main>
    </div>
  );
}
