import mongoose from "mongoose";

export type StatusType = "" | "Avoid" | "Watch" | "Own" | "Hold";

export interface IComment {
  id: string;
  text: string;
  createdAt: Date;
}

export interface IUserStockData extends mongoose.Document {
  userId: string;
  symbol: string;
  status: StatusType;
  comments: IComment[];
}

const CommentSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    text: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const UserStockDataSchema = new mongoose.Schema<IUserStockData>(
  {
    userId: { type: String, required: true, index: true },
    symbol: { type: String, required: true, uppercase: true, trim: true },
    status: {
      type: String,
      enum: ["", "Avoid", "Watch", "Own", "Hold"],
      default: "",
    },
    comments: { type: [CommentSchema], default: [] },
  },
  { timestamps: true }
);

UserStockDataSchema.index({ userId: 1, symbol: 1 }, { unique: true });

export default mongoose.models.UserStockData ||
  mongoose.model<IUserStockData>("UserStockData", UserStockDataSchema);
