import mongoose from "mongoose";

const UserCreationRequestSchema = new mongoose.Schema(
  {
    email: { type: String, required: true },
    emailVerificationToken: { type: String, required: true },
    // Failed verify attempts against this code — see create-account/route.ts.
    // Capped there at 5 before the doc is deleted, closing the brute-force
    // window regardless of the 6-digit code's small keyspace.
    attempts: { type: Number, required: true, default: 0 },
  },
  { timestamps: true }
);

// Codes expire 15 minutes after being issued rather than living forever.
UserCreationRequestSchema.index({ createdAt: 1 }, { expireAfterSeconds: 900 });

export default mongoose.models.UserCreationRequest ||
  mongoose.model("UserCreationRequest", UserCreationRequestSchema);
