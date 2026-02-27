import mongoose from "mongoose";

const ResetPasswordRequestSchema = new mongoose.Schema(
  {
    email: { type: String, required: true },
    resetCode: { type: String, required: true },
  },
  { timestamps: true }
);

export default mongoose.models.ResetPasswordRequest ||
  mongoose.model("ResetPasswordRequest", ResetPasswordRequestSchema);
