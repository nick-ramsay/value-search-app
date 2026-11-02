import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose-connect";
import User from "@/models/User";
import ResetPasswordRequest from "@/models/ResetPasswordRequest";
import bcrypt from "bcryptjs";

// Wrong-code attempts allowed against a single issued code before it's
// invalidated, closing the 6-digit code's otherwise-brute-forceable
// 900,000-value keyspace.
const MAX_VERIFY_ATTEMPTS = 5;

export async function POST(request: Request) {
  try {
    const { email, resetCode, newPassword } = await request.json();

    if (!email || !resetCode || !newPassword) {
      return NextResponse.json(
        {
          message: "Email, reset code, and new password are required",
        },
        { status: 422 }
      );
    }

    if (newPassword.length < 6) {
      return NextResponse.json(
        { message: "Password must be at least 6 characters" },
        { status: 422 }
      );
    }

    const normalizedEmail = (email as string).toLowerCase().trim();
    await connectDB();

    const requestDoc = await ResetPasswordRequest.findOne({ email: normalizedEmail });

    if (!requestDoc || requestDoc.resetCode !== String(resetCode).trim()) {
      if (requestDoc) {
        requestDoc.attempts += 1;
        if (requestDoc.attempts >= MAX_VERIFY_ATTEMPTS) {
          // Too many wrong guesses against this code — invalidate it rather
          // than letting the keyspace keep getting chipped away at. The
          // legitimate user just requests a fresh code.
          await ResetPasswordRequest.deleteOne({ _id: requestDoc._id });
        } else {
          await requestDoc.save();
        }
      }
      return NextResponse.json(
        { message: "Invalid or expired reset code" },
        { status: 400 }
      );
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await User.updateOne(
      { email: normalizedEmail },
      { $set: { password: hashedPassword } }
    );
    await ResetPasswordRequest.deleteOne({ email: normalizedEmail });

    return NextResponse.json({
      success: true,
      message: "Password reset successfully. Please log in.",
    });
  } catch (error) {
    console.error("reset-password error:", error);
    return NextResponse.json(
      { message: "Failed to reset password" },
      { status: 500 }
    );
  }
}
