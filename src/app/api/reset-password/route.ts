import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose-connect";
import User from "@/models/User";
import ResetPasswordRequest from "@/models/ResetPasswordRequest";
import bcrypt from "bcryptjs";

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

    const requestDoc = await ResetPasswordRequest.findOne({
      email: normalizedEmail,
      resetCode: String(resetCode).trim(),
    });

    if (!requestDoc) {
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
