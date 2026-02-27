import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose-connect";
import User from "@/models/User";
import ResetPasswordRequest from "@/models/ResetPasswordRequest";
import { sendPasswordResetEmail } from "@/lib/nodemailer";

function generateCode() {
  return Math.floor(Math.random() * 900000 + 100000).toString();
}

export async function POST(request: Request) {
  try {
    const { email } = await request.json();
    if (!email || !email.includes("@") || !email.includes(".")) {
      return NextResponse.json(
        { message: "Valid email is required" },
        { status: 422 }
      );
    }

    const normalizedEmail = (email as string).toLowerCase().trim();
    await connectDB();

    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return NextResponse.json(
        { message: "No account found with this email." },
        { status: 404 }
      );
    }

    const code = generateCode();
    await ResetPasswordRequest.replaceOne(
      { email: normalizedEmail },
      { email: normalizedEmail, resetCode: code },
      { upsert: true }
    );

    await sendPasswordResetEmail(normalizedEmail, code);

    return NextResponse.json({
      success: true,
      message: "Password reset code sent to your email",
    });
  } catch (error) {
    console.error("reset-password-request error:", error);
    return NextResponse.json(
      { message: "Failed to send reset code" },
      { status: 500 }
    );
  }
}
