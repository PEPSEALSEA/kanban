import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { GoogleOAuthProvider } from '@react-oauth/google';
import { DataProvider } from "@/components/DataProvider";
import HeaderNav from "@/components/HeaderNav";
import SyncToast from "@/components/SyncToast";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <GoogleOAuthProvider clientId="787988651964-gf258mnif89bu6g0jao2mpdsm72j96da.apps.googleusercontent.com">
          <DataProvider>
            <SyncToast />
            <HeaderNav />
            {children}
          </DataProvider>
        </GoogleOAuthProvider>
      </body>
    </html>
  );
}
