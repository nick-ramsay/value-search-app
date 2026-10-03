import AppNavbar from "../components/AppNavbar";
import MonthlyBalancesClient from "./MonthlyBalancesClient";

export default function MonthlyBalancesPage() {
  return (
    <div className="min-vh-100 d-flex flex-column">
      <AppNavbar />
      <main className="container pt-5 mt-4 flex-grow-1 d-flex flex-column">
        <div className="row justify-content-center flex-grow-1">
          <div className="col-12 col-xl-11 d-flex flex-column">
            <MonthlyBalancesClient />
          </div>
        </div>
      </main>
    </div>
  );
}
