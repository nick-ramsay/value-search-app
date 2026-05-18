import type { ValueRecord } from "@/lib/value-search";
import { buildCardMetrics } from "@/lib/stock-card-display";

type StockCardMetricsProps = {
  item: ValueRecord;
  compact?: boolean;
};

export default function StockCardMetrics({ item, compact = false }: StockCardMetricsProps) {
  const metrics = buildCardMetrics(item);
  if (metrics.length === 0) return null;

  return (
    <section className="stock-card__metrics" aria-label="Key metrics">
      <div
        className={`stock-card__metrics-inner${compact ? " stock-card__metrics-inner--compact" : ""}`}
      >
        {metrics.map((m) => (
          <div key={m.label} className="stock-card__metrics-row" title={m.title}>
            <span className="stock-card__metrics-label">{m.label}</span>
            <span
              className={`stock-card__metrics-value${
                m.tone ? ` stock-card__metrics-value--${m.tone}` : ""
              }`}
            >
              {m.value}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
