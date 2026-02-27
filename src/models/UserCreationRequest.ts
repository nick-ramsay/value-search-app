import mongoose from "mongoose";

const UserCreationRequestSchema = new mongoose.Schema(
  {
    email: { type: String, required: true },
    emailVerificationToken: { type: String, required: true },
  },
  { timestamps: true }
);

export default mongoose.models.UserCreationRequest ||
  mongoose.model("UserCreationRequest", UserCreationRequestSchema);
