/**
 * Placeholder that mirrors StockResultCard's real DOM shape (ticker, company
 * name, meta row, price, badges, action row) using the same structural
 * classes, so loading → loaded causes no layout shift. Matching the real
 * nesting exactly matters here — several real rows (e.g. the price row) use
 * negative margins tuned against specific sibling content, so skipping a
 * placeholder (like the company name) throws those off and blocks overlap.
 */
export default function SkeletonStockCard() {
  return (
    <div className="stock-card stock-card--compact skeleton-stock-card" aria-hidden="true">
      <div className="stock-card__head">
        <div className="stock-card__head-row">
          <div className="stock-card__identity">
            <span className="skel skel--ticker" />
            <span className="skel skel--name" />
          </div>
          <span className="skel skel--info-btn" />
        </div>
        <p className="skeleton-stock-card__meta mb-0">
          <span className="skel skel--meta" />
          <span className="skel skel--meta" />
          <span className="skel skel--meta" />
        </p>
      </div>
      <div className="stock-card__price-row">
        <div className="stock-card__price-row-inner">
          <span className="skel skel--price" />
        </div>
      </div>
      <div className="stock-card__signals">
        <span className="skel skel--badge" />
        <span className="skel skel--badge skel--badge-sm" />
      </div>
      <div className="stock-card__actions">
        <span className="skel skel--action" />
        <span className="skel skel--action" />
        <span className="skel skel--action" />
      </div>
    </div>
  );
}
