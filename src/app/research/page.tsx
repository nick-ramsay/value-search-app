import AppNavbar from "../components/AppNavbar";
import ResearchClient from "./ResearchClient";

export default function ResearchPage() {
  return (
    <div className="min-vh-100 d-flex flex-column">
      <AppNavbar />
      <main className="container pt-5 mt-4 research-page flex-grow-1 d-flex flex-column">
        <div className="row justify-content-center flex-grow-1">
          <div className="col-lg-8 d-flex flex-column">
            <section
              className="card glass-card monthly-balances-page-heading research-page__title"
              aria-label="Research"
            >
              <div className="card-body monthly-balances-page-heading-body px-3 px-sm-4">
                <h2 className="h5 mb-0">Research</h2>
              </div>
            </section>
            <ResearchClient />
          </div>
        </div>
      </main>
    </div>
  );
}
