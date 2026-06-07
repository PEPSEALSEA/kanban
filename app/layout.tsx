import type { Metadata } from "next";
import { Mali, Roboto_Mono } from "next/font/google";
import { GoogleOAuthProvider } from '@react-oauth/google';
import { DataProvider } from "@/components/DataProvider";
import HeaderNav from "@/components/HeaderNav";
import SyncToast from "@/components/SyncToast";
import AnalyticsTracker from "@/components/AnalyticsTracker";
import "./globals.css";
import "katex/dist/katex.min.css";

const mali = Mali({
  weight: ['200', '300', '400', '500', '600', '700'],
  subsets: ["latin", "thai"],
  variable: "--font-mali",
});

const robotoMono = Roboto_Mono({
  subsets: ["latin"],
  variable: "--font-roboto-mono",
});

export const metadata: Metadata = {
  title: "StudyFlow - Homework Sorter",
  description: "Organize your workflow with style.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${mali.variable} ${robotoMono.variable}`}>
        <GoogleOAuthProvider clientId="787988651964-gf258mnif89bu6g0jao2mpdsm72j96da.apps.googleusercontent.com">
          <DataProvider>
            <AnalyticsTracker />
            <SyncToast />
            <HeaderNav />
            {children}
          </DataProvider>
        </GoogleOAuthProvider>
      </body>
    </html>
  );
}
