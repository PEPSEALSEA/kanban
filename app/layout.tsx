import type { Metadata } from "next";
import { Inter, Mali, Roboto_Mono } from "next/font/google";
import { GoogleOAuthProvider } from '@react-oauth/google';
import { DataProvider } from "@/components/DataProvider";
import { UiVersionProvider } from "@/components/UiVersionProvider";
import ConditionalHeaderNav from "@/components/ConditionalHeaderNav";
import UiVersionSwitcher from "@/components/UiVersionSwitcher";
import SyncToast from "@/components/SyncToast";
import AnalyticsTracker from "@/components/AnalyticsTracker";
import GoogleAutoLogin from "@/components/GoogleAutoLogin";
import ChatWidget from "@/components/ChatWidget";
import "./globals.css";
import "katex/dist/katex.min.css";

const mali = Mali({
  weight: ['200', '300', '400', '500', '600', '700'],
  subsets: ["latin", "thai"],
  variable: "--font-mali",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
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
  themeColor: '#010102',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${mali.variable} ${inter.variable} ${robotoMono.variable}`}>
        <GoogleOAuthProvider clientId="787988651964-gf258mnif89bu6g0jao2mpdsm72j96da.apps.googleusercontent.com">
          <DataProvider>
            <GoogleAutoLogin />
            <UiVersionProvider>
              <AnalyticsTracker />
              <SyncToast />
              <ChatWidget />
              <ConditionalHeaderNav />
              <UiVersionSwitcher />
              {children}
            </UiVersionProvider>
          </DataProvider>
        </GoogleOAuthProvider>
      </body>
    </html>
  );
}
