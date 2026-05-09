import mongoose from "mongoose";

export interface IBalanceAccount {
  id: string;
  name: string;
  kind: "Asset" | "Debt";
  accountType: string;
  /** ISO 4217 code, e.g. USD */
  currency: string;
  /** ISO calendar date `YYYY-MM-DD` when account type is Unvested RSU. */
  vestingDate?: string;
  /** Annual percentage growth used for Real Estate auto-growth (e.g. 4 = 4%). */
  annualGrowthPercent?: number;
  /** When true, balances are omitted from the monthly Net (USD) total. */
  exemptFromNetWorth?: boolean;
  /** When true, account is hidden from the UI but kept for restore and history. */
  archived?: boolean;
}

export interface IMonthBalanceRow {
  monthKey: string;
  balances: Record<string, number>;
}

export interface IUserMonthlyBalanceSheet extends mongoose.Document {
  userId: string;
  accounts: IBalanceAccount[];
  monthRows: IMonthBalanceRow[];
  hiddenColumnIds?: string[];
  /**
   * When true, `UserNetWorthYearlyAverage` rows match this sheet’s balances/columns.
   * Set false on any sheet mutation that can change yearly Net; GET runs sync only while false.
   */
  yearlyNetWorthAveragesMatchSheet?: boolean;
}

const BalanceAccountSchema = new mongoose.Schema<IBalanceAccount>(
  {
    id: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    kind: { type: String, enum: ["Asset", "Debt"], required: true },
    accountType: { type: String, required: true },
    vestingDate: { type: String, trim: true },
    annualGrowthPercent: { type: Number },
    exemptFromNetWorth: { type: Boolean, default: false },
    currency: { type: String, required: true, default: "USD", trim: true, uppercase: true },
    archived: { type: Boolean, default: false },
  },
  { _id: false },
);

const MonthBalanceRowSchema = new mongoose.Schema<IMonthBalanceRow>(
  {
    monthKey: { type: String, required: true },
    balances: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { _id: false },
);

const UserMonthlyBalanceSheetSchema = new mongoose.Schema<IUserMonthlyBalanceSheet>(
  {
    userId: { type: String, required: true, unique: true, index: true },
    accounts: { type: [BalanceAccountSchema], default: [] },
    monthRows: { type: [MonthBalanceRowSchema], default: [] },
    hiddenColumnIds: { type: [String], default: [] },
    yearlyNetWorthAveragesMatchSheet: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export default mongoose.models.UserMonthlyBalanceSheet ||
  mongoose.model<IUserMonthlyBalanceSheet>(
    "UserMonthlyBalanceSheet",
    UserMonthlyBalanceSheetSchema,
  );
