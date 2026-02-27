import nodemailer from "nodemailer";
import { google } from "googleapis";

function createPasswordTransporter(): nodemailer.Transporter | null {
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASSWORD;
  if (!user || !pass) return null;
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST || "smtp.gmail.com",
    port: parseInt(process.env.EMAIL_PORT || "465", 10),
    secure: process.env.EMAIL_SECURE !== "false",
    auth: { user, pass },
  });
}

async function getTransporter(): Promise<nodemailer.Transporter> {
  const clientId =
    process.env.GMAIL_CLIENT_ID || process.env.REACT_APP_GMAIL_CLIENT_ID;
  const clientSecret =
    process.env.GMAIL_CLIENT_SECRET || process.env.REACT_APP_CLIENT_SECRET;
  const refreshToken =
    process.env.GMAIL_REFRESH_TOKEN || process.env.REACT_APP_REFRESH_TOKEN;
  const user =
    process.env.EMAIL_USER || process.env.REACT_APP_GMAIL_USER_ID;

  if (clientId && clientSecret && refreshToken && user) {
    const oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      "https://developers.google.com/oauthplayground"
    );
    oauth2Client.setCredentials({ refresh_token: refreshToken });
    const result = await oauth2Client.getAccessToken();
    const accessToken = result.token;
    if (!accessToken) throw new Error("Failed to get Gmail OAuth2 access token");

    return nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: {
        type: "OAuth2",
        user,
        clientId,
        clientSecret,
        refreshToken,
        accessToken,
      },
    });
  }

  const password = createPasswordTransporter();
  if (password) {
    return password;
  }

  throw new Error(
    "Email not configured: set (GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN, EMAIL_USER) for Gmail OAuth2, or (EMAIL_USER, EMAIL_PASSWORD) for SMTP."
  );
}

export async function sendVerificationEmail(to: string, code: string) {
  const transporter = await getTransporter();
  await transporter.sendMail({
    from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
    to,
    subject: "Your valuesearch.app verification code",
    text: `Your verification code is: ${code}`,
  });
}

export async function sendPasswordResetEmail(to: string, code: string) {
  const transporter = await getTransporter();
  await transporter.sendMail({
    from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
    to,
    subject: "Your valuesearch.app password reset code",
    text: `Your password reset code is: ${code}`,
  });
}
