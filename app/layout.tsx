import type { Metadata } from "next";
import { Mali, Roboto_Mono } from "next/font/google";
import { GoogleOAuthProvider } from '@react-oauth/google';
import { DataProvider } from "@/components/DataProvider";
import HeaderNav from "@/components/ui/classic/HeaderNav";
import SyncToast from "@/components/SyncToast";
import AnalyticsTracker from "@/components/AnalyticsTracker";
import { GOOGLE_CLIENT_ID } from '@/lib/googleClientId';
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

const BASE_PATH = '/kanban';

export const metadata: Metadata = {
  title: "StudyFlow - Homework Sorter",
  description: "Organize your workflow with style.",
  applicationName: "StudyFlow",
  appleWebApp: {
    capable: true,
    title: "StudyFlow",
    statusBarStyle: "default",
  },
  icons: {
    icon: [{ url: `${BASE_PATH}/icon.png`, type: 'image/png' }],
    apple: [{ url: `${BASE_PATH}/apple-icon.png`, type: 'image/png', sizes: '180x180' }],
  },
};

export const viewport = {
  themeColor: '#bae6fd',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${mali.variable} ${robotoMono.variable}`}>
        <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
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
