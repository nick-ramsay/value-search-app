import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { currencyDisplayNameEn } from "@/lib/iso4217-currencies";
import {
  isRealEstateAsset,
  isUnvestedRsuAsset,
  type BalanceAccountKind,
} from "@/lib/monthly-balances";

export type AccountDetailsPdfAccount = {
  id: string;
  name: string;
  kind: BalanceAccountKind;
  accountType: string;
  currency: string;
  vestingDate?: string;
  annualGrowthPercent?: number;
  exemptFromNetWorth?: boolean;
};

function accountDetailCell(account: AccountDetailsPdfAccount): string {
  const parts: string[] = [];
  if (isUnvestedRsuAsset(account.kind, account.accountType) && account.vestingDate) {
    parts.push(`Vests ${account.vestingDate}`);
  }
  if (
    isRealEstateAsset(account.kind, account.accountType) &&
    typeof account.annualGrowthPercent === "number"
  ) {
    parts.push(`${account.annualGrowthPercent}% annual growth`);
  }
  if (account.exemptFromNetWorth) {
    parts.push("Excluded from net worth");
  }
  return parts.join(" · ") || "—";
}

/**
 * Builds a PDF listing every account entered on the Monthly Balances page —
 * name, type, and currency — grouped into Assets and Debts (matching the
 * page's own account-kind split), each sorted alphabetically by name. This
 * lists accounts themselves, not month-by-month balances (Export CSV
 * already covers that).
 */
export function buildAccountDetailsPdf(accounts: AccountDetailsPdfAccount[]): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const marginX = 40;
  const pageHeight = doc.internal.pageSize.getHeight();
  let cursorY = 48;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Account Details", marginX, cursorY);

  cursorY += 16;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(110);
  const generated = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  doc.text(`Generated ${generated}`, marginX, cursorY);
  doc.setTextColor(0);

  cursorY += 20;

  const groups: { title: string; kind: BalanceAccountKind }[] = [
    { title: "Assets", kind: "Asset" },
    { title: "Debts", kind: "Debt" },
  ];

  let anyGroupDrawn = false;

  for (const group of groups) {
    const rows = accounts
      .filter((a) => a.kind === group.kind)
      .sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));
    if (rows.length === 0) continue;

    if (anyGroupDrawn && cursorY > pageHeight - 80) {
      doc.addPage();
      cursorY = 48;
    }
    anyGroupDrawn = true;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(0);
    doc.text(group.title, marginX, cursorY);

    autoTable(doc, {
      startY: cursorY + 8,
      margin: { left: marginX, right: marginX },
      head: [["Account", "Type", "Currency", "Details"]],
      body: rows.map((a) => [
        a.name,
        a.accountType,
        `${a.currency.toUpperCase()} — ${currencyDisplayNameEn(a.currency)}`,
        accountDetailCell(a),
      ]),
      styles: { fontSize: 9, cellPadding: 6 },
      headStyles: { fillColor: [0, 128, 102], textColor: 255 },
      theme: "striped",
    });

    cursorY = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 28;
  }

  if (!anyGroupDrawn) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text("No accounts have been added yet.", marginX, cursorY);
  }

  return doc;
}
