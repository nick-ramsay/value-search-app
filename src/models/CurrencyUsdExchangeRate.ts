import mongoose from "mongoose";

/** How many USD one unit of {@link currency} is worth (e.g. 1 AUD → ~0.714 USD). */
export interface ICurrencyUsdExchangeRate extends mongoose.Document {
  currency: string;
  usdPerUnit?: number | null;
}

const CurrencyUsdExchangeRateSchema = new mongoose.Schema<ICurrencyUsdExchangeRate>(
  {
    currency: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    usdPerUnit: { type: Number, required: false, default: undefined },
  },
  { timestamps: true },
);

export default mongoose.models.CurrencyUsdExchangeRate ||
  mongoose.model<ICurrencyUsdExchangeRate>(
    "CurrencyUsdExchangeRate",
    CurrencyUsdExchangeRateSchema,
  );
