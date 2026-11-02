import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose-connect";
import User from "@/models/User";
import UserCreationRequest from "@/models/UserCreationRequest";

// Wrong-code attempts allowed against a single issued code before it's
// invalidated, closing the 6-digit code's otherwise-brute-forceable
// 900,000-value keyspace.
const MAX_VERIFY_ATTEMPTS = 5;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      email,
      emailVerificationToken,
      firstname,
      lastname,
      password,
    } = body;

    if (
      !email ||
      !emailVerificationToken ||
      !firstname ||
      !lastname ||
      !password
    ) {
      return NextResponse.json(
        { message: "All fields are required" },
        { status: 422 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { message: "Password must be at least 6 characters" },
        { status: 422 }
      );
    }

    const normalizedEmail = (email as string).toLowerCase().trim();
    await connectDB();

    const requestDoc = await UserCreationRequest.findOne({ email: normalizedEmail });

    if (!requestDoc || requestDoc.emailVerificationToken !== String(emailVerificationToken).trim()) {
      if (requestDoc) {
        requestDoc.attempts += 1;
        if (requestDoc.attempts >= MAX_VERIFY_ATTEMPTS) {
          // Too many wrong guesses against this code — invalidate it rather
          // than letting the keyspace keep getting chipped away at. The
          // legitimate user just requests a fresh code.
          await UserCreationRequest.deleteOne({ _id: requestDoc._id });
        } else {
          await requestDoc.save();
        }
      }
      return NextResponse.json(
        { message: "Invalid or expired verification code" },
        { status: 400 }
      );
    }

    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      return NextResponse.json(
        { message: "An account already exists with this email." },
        { status: 400 }
      );
    }

    await User.create({
      email: normalizedEmail,
      firstname: (firstname as string).trim(),
      lastname: (lastname as string).trim(),
      password: password as string,
      approved: false,
    });

    await UserCreationRequest.deleteOne({ email: normalizedEmail });

    return NextResponse.json({
      success: true,
      message: "Account created successfully. Please log in after approval.",
    });
  } catch (error) {
    console.error("create-account error:", error);
    return NextResponse.json(
      { message: "Failed to create account" },
      { status: 500 }
    );
  }
}
