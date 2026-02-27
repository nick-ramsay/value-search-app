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
      <main className="container pt-5 mt-5" style={{ marginTop: "4.5rem" }}>
        <ScoreExplanationModal />
        <div className="row justify-content-center">
          <div className="col-lg-8">
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
