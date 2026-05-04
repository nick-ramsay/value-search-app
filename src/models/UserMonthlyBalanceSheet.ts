import mongoose from "mongoose";

export interface IBalanceAccount {
  id: string;
  name: string;
  kind: "Asset" | "Debt";
  accountType: string;
  /** ISO 4217 code, e.g. USD */
  currency: string;
}

export interface IMonthBalanceRow {
  monthKey: string;
  balances: Record<string, number>;
}

export interface IUserMonthlyBalanceSheet extends mongoose.Document {
  userId: string;
  accounts: IBalanceAccount[];
  monthRows: IMonthBalanceRow[];
}

const BalanceAccountSchema = new mongoose.Schema<IBalanceAccount>(
  {
    id: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    kind: { type: String, enum: ["Asset", "Debt"], required: true },
    accountType: { type: String, required: true },
    currency: { type: String, required: true, default: "USD", trim: true, uppercase: true },
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
  },
  { timestamps: true },
);

export default mongoose.models.UserMonthlyBalanceSheet ||
  mongoose.model<IUserMonthlyBalanceSheet>(
    "UserMonthlyBalanceSheet",
    UserMonthlyBalanceSheetSchema,
  );
