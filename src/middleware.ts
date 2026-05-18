import { withAuth } from "next-auth/middleware";

export default withAuth({
  pages: { signIn: "/login" },
});

/** Public routes (no matcher entry): /, /about, /sector-assessments, auth pages, etc. */
export const config = {
  matcher: ["/portfolio", "/monthly-balances", "/monthly-balances/upload"],
};
