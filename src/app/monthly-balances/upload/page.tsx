import AppNavbar from "@/app/components/AppNavbar";
import UploadWizardClient from "./UploadWizardClient";

export const metadata = {
  title: "Upload Monthly Balances · CSV",
};

export default function MonthlyBalancesUploadPage() {
  return (
    <div className="min-vh-100">
      <AppNavbar />
      <main className="container pt-5 mt-4">
        <div className="row justify-content-center">
          <div className="col-12 col-xl-11">
            <UploadWizardClient />
          </div>
        </div>
      </main>
    </div>
  );
}
