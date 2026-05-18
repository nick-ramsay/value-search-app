"use client";

import { useState } from "react";
import {
  ASSESSMENT_GROUP_TITLES,
  formatAssessmentValue,
  groupForFieldKey,
  labelForFieldKey,
  type AssessmentFieldGroup,
} from "@/lib/stock-card-display";

type AssessmentDetailData = {
  quote: Record<string, unknown> | null;
  fundamentals: Record<string, unknown> | null;
  industry: string | null;
  sector: string | null;
  country: string | null;
  investmentDescription: string | null;
};

const GROUP_ORDER: AssessmentFieldGroup[] = [
  "context",
  "valuation",
  "profitability",
  "balance",
  "technical",
  "other",
];

function collectGroupedFields(
  data: AssessmentDetailData,
): Map<AssessmentFieldGroup, { key: string; label: string; value: string }[]> {
  const groups = new Map<AssessmentFieldGroup, { key: string; label: string; value: string }[]>();

  const add = (group: AssessmentFieldGroup, key: string, value: string) => {
    const list = groups.get(group) ?? [];
    list.push({ key, label: labelForFieldKey(key), value });
    groups.set(group, list);
  };

  if (data.industry) add("context", "industry", data.industry);
  if (data.sector) add("context", "sector", data.sector);
  if (data.country) add("context", "country", data.country);
  if (data.investmentDescription) {
    add("context", "investmentDescription", data.investmentDescription);
  }

  const ingest = (obj: Record<string, unknown> | null, defaultGroup: AssessmentFieldGroup) => {
    if (!obj) return;
    for (const [k, v] of Object.entries(obj)) {
      if (v === undefined || v === null) continue;
      const group =
        defaultGroup === "other" ? groupForFieldKey(k) : groupForFieldKey(k);
      const resolved = group === "other" ? defaultGroup : group;
      add(resolved, k, formatAssessmentValue(k, v));
    }
  };

  ingest(data.quote, "valuation");
  ingest(data.fundamentals, "other");

  for (const [, rows] of groups) {
    rows.sort((a, b) => a.label.localeCompare(b.label));
  }

  return groups;
}

export default function AssessmentDetailView({ data }: { data: AssessmentDetailData }) {
  const [showRaw, setShowRaw] = useState(false);
  const groups = collectGroupedFields(data);
  const hasContent = GROUP_ORDER.some((g) => (groups.get(g)?.length ?? 0) > 0);

  if (!hasContent) {
    return (
      <p className="mb-0 small text-secondary">
        No structured data available for this symbol.
      </p>
    );
  }

  return (
    <div className="stock-card__assessment-detail">
      {GROUP_ORDER.map((group) => {
        const rows = groups.get(group);
        if (!rows?.length) return null;
        return (
          <section key={group} className="stock-card__detail-group">
            <h4 className="stock-card__detail-group-title">
              {ASSESSMENT_GROUP_TITLES[group]}
            </h4>
            <div className="stock-card__detail-dl mb-0" role="list">
              {rows.map((row) => (
                <div key={`${group}-${row.key}`} className="stock-card__detail-dl-row" role="listitem">
                  <span className="stock-card__detail-dl-label">{row.label}</span>
                  <span className="stock-card__detail-dl-value">{row.value}</span>
                </div>
              ))}
            </div>
          </section>
        );
      })}

      <button
        type="button"
        className="btn btn-link btn-sm stock-card__detail-raw-toggle px-0"
        onClick={() => setShowRaw((v) => !v)}
        aria-expanded={showRaw}
      >
        {showRaw ? "Hide all fields" : "View all fields"}
      </button>

      {showRaw ? (
        <div className="table-responsive mt-2">
          <table className="table table-sm table-borderless mb-0 stock-card__detail-table">
            <thead>
              <tr>
                <th scope="col" className="text-secondary small">
                  Field
                </th>
                <th scope="col" className="text-secondary small">
                  Value
                </th>
              </tr>
            </thead>
            <tbody>
              {GROUP_ORDER.flatMap((group) => {
                const rows = groups.get(group) ?? [];
                return rows.map((row) => (
                  <tr key={`raw-${group}-${row.key}`}>
                    <td className="small text-secondary">{row.label}</td>
                    <td className="small text-break">{row.value}</td>
                  </tr>
                ));
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
