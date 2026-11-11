import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import AppNavbar from "../components/AppNavbar";
import EconomyAssessmentRefreshButton from "../components/EconomyAssessmentRefreshButton";
import UndervaluedPicksRefreshButton from "../components/UndervaluedPicksRefreshButton";

export default async function AdminPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/login?callbackUrl=%2Fadmin");
  }
  if (session.user.role !== "admin") {
    redirect("/");
  }

  return (
    <div className="min-vh-100 d-flex flex-column">
      <AppNavbar />
      <main className="container pt-5 mt-4 flex-grow-1 d-flex flex-column">
        <div className="row justify-content-center">
          <div className="col-lg-8">

            <section
              className="card glass-card monthly-balances-page-heading"
              aria-label="Admin"
            >
              <div className="card-body monthly-balances-page-heading-body">
                <h2 className="h5 mb-0">Admin</h2>
                <p className="economy-assessment-lead mb-0">
                  Manual data-refresh controls, admin-only.
                </p>
              </div>
            </section>

            <section className="card glass-card admin-tool-card mt-4" aria-label="Economy assessment">
              <div className="card-body">
                <h3 className="h6 admin-tool-card__title">Economy &amp; Market Assessment</h3>
                <EconomyAssessmentRefreshButton />
              </div>
            </section>

            <section className="card glass-card admin-tool-card mt-4 mb-4" aria-label="Undervalued picks">
              <div className="card-body">
                <h3 className="h6 admin-tool-card__title">Undervalued Picks</h3>
                <UndervaluedPicksRefreshButton />
              </div>
            </section>

          </div>
        </div>
      </main>
    </div>
  );
}
