import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose-connect";
import User from "@/models/User";
import ResetPasswordRequest from "@/models/ResetPasswordRequest";
import { sendPasswordResetEmail } from "@/lib/nodemailer";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

function generateCode() {
  return Math.floor(Math.random() * 900000 + 100000).toString();
}

// A code is valid for 15 minutes (ResetPasswordRequest's TTL index) — a
// resend inside that window reuses the same cooldown rather than needing a
// separate constant.
const RESEND_COOLDOWN_SECONDS = 60;

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

    // IP throttle guards against someone sweeping many different target
    // emails from one source (spam/enumeration), independent of the
    // per-email cooldown below.
    const ipAllowed = await checkRateLimit(
      `reset-password-request:ip:${getClientIp(request)}`,
      5,
      600
    );
    if (!ipAllowed) {
      return NextResponse.json(
        { message: "Too many requests. Please try again later." },
        { status: 429 }
      );
    }

    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return NextResponse.json(
        { message: "No account found with this email." },
        { status: 404 }
      );
    }

    const recentRequest = await ResetPasswordRequest.findOne({
      email: normalizedEmail,
      createdAt: { $gte: new Date(Date.now() - RESEND_COOLDOWN_SECONDS * 1000) },
    });
    if (recentRequest) {
      return NextResponse.json(
        { message: "A code was already sent — please wait a minute before requesting another." },
        { status: 429 }
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
