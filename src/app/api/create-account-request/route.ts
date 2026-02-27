import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose-connect";
import User from "@/models/User";
import UserCreationRequest from "@/models/UserCreationRequest";
import { sendVerificationEmail } from "@/lib/nodemailer";

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
