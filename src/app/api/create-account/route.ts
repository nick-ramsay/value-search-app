import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose-connect";
import User from "@/models/User";
import UserCreationRequest from "@/models/UserCreationRequest";

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

    const requestDoc = await UserCreationRequest.findOne({
      email: normalizedEmail,
      emailVerificationToken: String(emailVerificationToken).trim(),
    });

    if (!requestDoc) {
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
