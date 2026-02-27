import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { connectDB } from "@/lib/mongoose-connect";
import User from "@/models/User";

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        await connectDB();
        const user = await User.findOne({
          email: credentials.email.toLowerCase().trim(),
        });
        if (!user) return null;
        if (user.approved !== true) {
          throw new Error("AccountNotApproved");
        }
        const match = await user.comparePassword(credentials.password);
        if (!match) return null;
        return {
          id: user._id.toString(),
          email: user.email,
          name: `${user.firstname} ${user.lastname}`,
          firstname: user.firstname,
          lastname: user.lastname,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id ?? (token.id as string | undefined);
        const hasNames =
          (user as { firstname?: string | null }).firstname ||
          (user as { lastname?: string | null }).lastname;
        if (hasNames) {
          token.firstname = (user as { firstname?: string }).firstname;
          token.lastname = (user as { lastname?: string }).lastname;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as { id?: string }).id = token.id as string;
        (session.user as { firstname?: string }).firstname =
          token.firstname as string;
        (session.user as { lastname?: string }).lastname =
          token.lastname as string;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  session: { strategy: "jwt", maxAge: 24 * 60 * 60 },
  secret:
    process.env.NEXTAUTH_SECRET ||
    (process.env.NODE_ENV === "development"
      ? "value-search-app-dev-secret-at-least-32-characters"
      : undefined),
};
