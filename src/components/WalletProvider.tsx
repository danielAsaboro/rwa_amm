'use client'

import React, { FC, ReactNode, useMemo } from 'react'
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react'
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base'
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets'
import { WalletModalProvider, WalletDisconnectButton, WalletMultiButton } from '@solana/wallet-adapter-react-ui'
import { clusterApiUrl } from '@solana/web3.js'
import { useNetwork } from '@/contexts/NetworkContext'

// Import wallet adapter CSS
import '@solana/wallet-adapter-react-ui/styles.css'

interface WalletContextProviderProps {
  children: ReactNode
}

export const WalletContextProvider: FC<WalletContextProviderProps> = ({ children }) => {
  const { endpoint } = useNetwork()

  const wallets = useMemo(() => [new PhantomWalletAdapter(), new SolflareWalletAdapter()], [])

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  )
}

// Custom wallet button component to match our design
export const CustomWalletButton: FC = () => {
  return (
    <div className="custom-wallet-btn">
      <WalletMultiButton
        className="!bg-gradient-to-b !from-neutral-800 !to-neutral-950 !text-white !px-6 !py-2 !rounded-lg !font-medium hover:!from-neutral-700 hover:!to-neutral-900 !transition-all !border-0 !shadow-lg"
        style={{
          backgroundColor: 'transparent',
          color: 'white',
          fontWeight: '500',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
        }}
      />
    </div>
  )
}

export const CustomDisconnectButton: FC = () => {
  return (
    <WalletDisconnectButton
      className="!bg-red-500 !text-white !px-4 !py-2 !rounded-lg !font-medium hover:!bg-red-600 !transition-all !border-0 !shadow-lg"
      style={{
        backgroundColor: 'transparent',
        color: 'white',
        fontWeight: '500',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
      }}
    />
  )
}
