import mongoose from "mongoose";

/** Per-calendar-year average of monthly Net (USD), derived from the monthly balance sheet. */
export interface IUserNetWorthYearlyAverage extends mongoose.Document {
  userId: string;
  year: number;
  averageNetUsd: number;
  /** Months in that year that contributed a computable Net (USD) total. */
  monthCount: number;
}

const UserNetWorthYearlyAverageSchema =
  new mongoose.Schema<IUserNetWorthYearlyAverage>(
    {
      userId: { type: String, required: true, index: true },
      year: { type: Number, required: true },
      averageNetUsd: { type: Number, required: true },
      monthCount: { type: Number, required: true },
    },
    { timestamps: true },
  );

UserNetWorthYearlyAverageSchema.index({ userId: 1, year: 1 }, { unique: true });

export default mongoose.models.UserNetWorthYearlyAverage ||
  mongoose.model<IUserNetWorthYearlyAverage>(
    "UserNetWorthYearlyAverage",
    UserNetWorthYearlyAverageSchema,
  );
