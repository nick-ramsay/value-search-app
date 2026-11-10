import mongoose from "mongoose";

/** "interested" = aligns with what the user wants to invest in right now;
 * "avoid" = what they want to steer clear of. Lets future card-level logic
 * flag a stock as matching or contradicting the user's current thesis. */
export type ThesisDirection = "interested" | "avoid";
export type ThesisStatus = "active" | "inactive";

export interface IThesisPoint extends mongoose.Document {
  userId: string;
  text: string;
  direction: ThesisDirection;
  status: ThesisStatus;
  createdAt: Date;
  updatedAt: Date;
}

const ThesisPointSchema = new mongoose.Schema<IThesisPoint>(
  {
    userId: { type: String, required: true, index: true },
    text: { type: String, required: true, trim: true, maxlength: 500 },
    direction: { type: String, enum: ["interested", "avoid"], required: true },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },
  },
  { timestamps: true },
);

// Explicit collection name, matching this app's kebab-case convention.
export default mongoose.models.ThesisPoint ||
  mongoose.model<IThesisPoint>("ThesisPoint", ThesisPointSchema, "thesis-points");
