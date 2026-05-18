import AppNavbar from "../components/AppNavbar";
import ScoreExplanationModal from "../components/ScoreExplanationModal";
import PortfolioStatusTabs from "../components/PortfolioStatusTabs";
import PortfolioCurrentSelection from "../components/PortfolioCurrentSelection";
import { getValueBySymbol } from "@/lib/value-search";

type PortfolioPageProps = {
  searchParams?: Promise<{
    q?: string;
    selected?: string;
  }>;
};

export default async function PortfolioPage({
  searchParams,
}: PortfolioPageProps) {
  const resolved = await searchParams;
  const query = resolved?.q?.trim() ?? "";
  const isSelected = resolved?.selected === "1";
  const symbol = isSelected && query.length > 0 ? query : null;

  const stock = symbol ? await getValueBySymbol(symbol) : null;

  return (
    <div className="min-vh-100">
      <AppNavbar
        searchInitialQuery={query}
        searchSelected={isSelected}
      />
      <main className="container pt-5 mt-4 portfolio-page">
        <ScoreExplanationModal />
        <div className="row justify-content-center">
          <div className="col-lg-8">
            <section
              className="card glass-card monthly-balances-page-heading portfolio-page__title"
              aria-label="Portfolio"
            >
              <div className="card-body monthly-balances-page-heading-body px-3 px-sm-4">
                <h2 className="h5 mb-0">Portfolio</h2>
              </div>
            </section>
            <PortfolioCurrentSelection
              initialSymbol={symbol}
              initialStock={stock}
            />
            <PortfolioStatusTabs />
          </div>
        </div>
      </main>
    </div>
  );
}
