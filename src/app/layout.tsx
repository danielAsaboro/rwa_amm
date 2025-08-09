import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { WalletContextProvider } from "@/components/WalletProvider";
import { NetworkProvider } from "@/contexts/NetworkContext";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Asset Exchange - Real World Asset Trading Platform",
  description:
    "Trade real-world assets digitally with advanced trading technology",
  keywords: [
    "Digital Assets",
    "Trading",
    "RWA",
    "Real World Assets",
    "Asset Exchange",
    "Investment",
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 min-h-screen`}
      >
        <NetworkProvider>
          <WalletContextProvider>{children}</WalletContextProvider>
        </NetworkProvider>
      </body>
    </html>
  );
}
