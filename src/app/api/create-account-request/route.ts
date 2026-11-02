import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose-connect";
import User from "@/models/User";
import UserCreationRequest from "@/models/UserCreationRequest";
import { sendVerificationEmail } from "@/lib/nodemailer";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

function generateCode() {
  return Math.floor(Math.random() * 900000 + 100000).toString();
}

// A code is valid for 15 minutes (UserCreationRequest's TTL index) — a
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
      `create-account-request:ip:${getClientIp(request)}`,
      5,
      600
    );
    if (!ipAllowed) {
      return NextResponse.json(
        { message: "Too many requests. Please try again later." },
        { status: 429 }
      );
    }

    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      return NextResponse.json(
        {
          message:
            "An account already exists with this email. Try logging in.",
        },
        { status: 400 }
      );
    }

    const recentRequest = await UserCreationRequest.findOne({
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
    await UserCreationRequest.replaceOne(
      { email: normalizedEmail },
      { email: normalizedEmail, emailVerificationToken: code },
      { upsert: true }
    );

    await sendVerificationEmail(normalizedEmail, code);

    return NextResponse.json({
      success: true,
      message: "Verification code sent to your email",
    });
  } catch (error) {
    console.error("create-account-request error:", error);
    return NextResponse.json(
      { message: "Failed to send verification email" },
      { status: 500 }
    );
  }
}
