"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export type NetworkType = 'localnet' | 'devnet' | 'mainnet';

interface NetworkContextType {
  network: NetworkType;
  setNetwork: (network: NetworkType) => void;
  endpoint: string;
}

const NetworkContext = createContext<NetworkContextType | undefined>(undefined);

interface NetworkProviderProps {
  children: ReactNode;
}

export function NetworkProvider({ children }: NetworkProviderProps) {
  const [network, setNetworkState] = useState<NetworkType>('devnet');

  // Load network preference from localStorage on mount
  useEffect(() => {
    const savedNetwork = localStorage.getItem('solana-network') as NetworkType;
    if (savedNetwork && ['localnet', 'devnet', 'mainnet'].includes(savedNetwork)) {
      setNetworkState(savedNetwork);
    }
  }, []);

  const setNetwork = (newNetwork: NetworkType) => {
    setNetworkState(newNetwork);
    localStorage.setItem('solana-network', newNetwork);
  };

  const getEndpoint = (network: NetworkType): string => {
    switch (network) {
      case 'localnet':
        return 'http://localhost:8899';
      case 'devnet':
        return 'https://api.devnet.solana.com';
      case 'mainnet':
        return 'https://api.mainnet-beta.solana.com';
      default:
        return 'https://api.devnet.solana.com';
    }
  };

  const endpoint = getEndpoint(network);

  return (
    <NetworkContext.Provider value={{ network, setNetwork, endpoint }}>
      {children}
    </NetworkContext.Provider>
  );
}

export function useNetwork() {
  const context = useContext(NetworkContext);
  if (context === undefined) {
    throw new Error('useNetwork must be used within a NetworkProvider');
  }
  return context;
}