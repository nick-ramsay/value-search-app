import type { Metadata } from "next";
import { IBM_Plex_Mono } from "next/font/google";
import "bootstrap/dist/css/bootstrap.min.css";
import BootstrapClient from "./bootstrap-client";
import "bootstrap-icons/font/bootstrap-icons.css";
import "./globals.css";
import ThemeInitScript from "./components/ThemeInitScript";
import SessionProvider from "./components/SessionProvider";
import LoginModal from "./components/LoginModal";
import ScrollToTop from "./components/ScrollToTop";

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "valuesearch.app",
  description: "AI-powered value investing research. Search stocks by name or ticker to get AI assessments, value scores, and sector outlooks.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={plexMono.variable}>
        <ThemeInitScript />
        <SessionProvider>
          <ScrollToTop />
          <BootstrapClient />
          {children}
          <LoginModal />
        </SessionProvider>
      </body>
    </html>
  );
}
