import AppNavbar from "../components/AppNavbar";
import MonthlyBalancesHeader from "./MonthlyBalancesHeader";
import MonthlyBalancesClient from "./MonthlyBalancesClient";

export default function MonthlyBalancesPage() {
  return (
    <div className="min-vh-100">
      <AppNavbar />
      <main className="container pt-5 mt-4">
        <div className="row justify-content-center">
          <div className="col-12 col-xl-11">
            <MonthlyBalancesHeader />
            <MonthlyBalancesClient />
          </div>
        </div>
      </main>
    </div>
  );
}
