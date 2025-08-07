import type { Metadata } from 'next'
import './globals.css'
import { AppProviders } from '@/components/app-providers'
import { AppLayout } from '@/components/app-layout'
import React from 'react'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import { WalletContextProvider } from '@/components/WalletProvider'
import { NetworkProvider } from '@/contexts/NetworkContext'
import { UserSessionProvider } from '@/contexts/UserSessionContext'
import { Toaster } from 'react-hot-toast'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'Asset Exchange - Real World Asset Trading Platform',
  description: 'Trade real-world assets digitally with advanced trading technology',
  keywords: ['Digital Assets', 'Trading', 'RWA', 'Real World Assets', 'Asset Exchange', 'Investment'],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 min-h-screen`}
      >
        <NetworkProvider>
          <WalletContextProvider>
            <UserSessionProvider>
              {children}
              <Toaster position="top-right" toastOptions={{ duration: 4000 }} />
            </UserSessionProvider>
          </WalletContextProvider>
        </NetworkProvider>
      </body>
    </html>
  )
}

// Patch BigInt so we can log it using JSON.stringify without any errors
declare global {
  interface BigInt {
    toJSON(): string
  }
}

BigInt.prototype.toJSON = function () {
  return this.toString()
}
