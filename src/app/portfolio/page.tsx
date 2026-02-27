import Link from "next/link";
import AppNavbar from "../components/AppNavbar";
import StockResultCard from "../components/StockResultCard";
import ScoreExplanationModal from "../components/ScoreExplanationModal";
import PortfolioStatusTabs from "../components/PortfolioStatusTabs";
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
            {stock ? (
              <>
                <div className="d-flex align-items-center justify-content-center gap-2 mb-3">
                  <h2 className="glass-heading fs-6 fw-semibold mb-0">
                    Current Selection
                  </h2>
                  <Link
                    href="/portfolio"
                    className="btn theme-switcher-btn rounded-circle d-flex align-items-center justify-content-center p-0"
                    style={{ width: "1.5rem", height: "1.5rem", minWidth: "1.5rem" }}
                    aria-label="Clear selection"
                    title="Clear selection"
                  >
                    <i className="bi bi-x" style={{ fontSize: "0.75rem" }} aria-hidden />
                  </Link>
                </div>
                <div className="mb-4">
                  <StockResultCard item={stock} compact />
                </div>
              </>
            ) : (
              <section className="card liquid-glass-card p-4">
                <div className="card-body">
                  <p className="text-muted mb-0 text-center">
                    {symbol
                      ? "No results found for that symbol."
                      : "Search for a stock above to view its card here."}
                  </p>
                </div>
              </section>
            )}
            <PortfolioStatusTabs />
          </div>
        </div>
      </main>
    </div>
  );
}
