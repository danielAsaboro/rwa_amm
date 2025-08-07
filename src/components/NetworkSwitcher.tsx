"use client";

import { useState, useEffect } from 'react';
import { ChevronDownIcon } from 'lucide-react';

export type NetworkType = 'localnet' | 'devnet' | 'mainnet';

interface NetworkSwitcherProps {
  currentNetwork: NetworkType;
  onNetworkChange: (network: NetworkType) => void;
}

interface NetworkConfig {
  name: string;
  value: NetworkType;
  endpoint: string;
  color: string;
  status: string;
}

const networks: NetworkConfig[] = [
  {
    name: 'Localnet',
    value: 'localnet',
    endpoint: 'http://localhost:8899',
    color: 'bg-yellow-500',
    status: 'Development'
  },
  {
    name: 'Devnet',
    value: 'devnet',
    endpoint: 'https://api.devnet.solana.com',
    color: 'bg-blue-500',
    status: 'Testing'
  },
  {
    name: 'Mainnet',
    value: 'mainnet',
    endpoint: 'https://api.mainnet-beta.solana.com',
    color: 'bg-green-500',
    status: 'Production'
  }
];

export default function NetworkSwitcher({ currentNetwork, onNetworkChange }: NetworkSwitcherProps) {
  const [isOpen, setIsOpen] = useState(false);
  
  const currentNetworkConfig = networks.find(n => n.value === currentNetwork) || networks[1]; // Default to devnet

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.network-switcher')) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [isOpen]);

  const handleNetworkSelect = (network: NetworkType) => {
    if (network !== currentNetwork) {
      // Show a brief notification
      const notification = document.createElement('div');
      notification.className = 'fixed top-4 right-4 bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg z-50 transition-opacity';
      notification.textContent = `Switched to ${networks.find(n => n.value === network)?.name}`;
      document.body.appendChild(notification);
      
      setTimeout(() => {
        notification.style.opacity = '0';
        setTimeout(() => {
          document.body.removeChild(notification);
        }, 300);
      }, 2000);
    }
    
    onNetworkChange(network);
    setIsOpen(false);
  };

  return (
    <div className="network-switcher relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-2 px-3 py-2 bg-white/10 backdrop-blur-sm border border-white/20 rounded-lg hover:bg-white/20 transition-all"
      >
        <div className={`w-2 h-2 rounded-full ${currentNetworkConfig.color}`} />
        <span className="text-white text-sm font-medium">{currentNetworkConfig.name}</span>
        <ChevronDownIcon 
          className={`w-4 h-4 text-white/70 transition-transform ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {isOpen && (
        <div className="fixed top-16 right-4 w-64 bg-gray-900/95 backdrop-blur-sm border border-white/20 rounded-lg shadow-xl z-50">
          <div className="p-2">
            <div className="text-xs text-gray-400 uppercase tracking-wide px-3 py-2 border-b border-white/10 mb-2">
              Select Network
            </div>
            {networks.map((network) => (
              <button
                key={network.value}
                onClick={() => handleNetworkSelect(network.value)}
                className={`w-full flex items-center justify-between px-3 py-3 rounded-md transition-all ${
                  currentNetwork === network.value
                    ? 'bg-white/10 border border-white/20'
                    : 'hover:bg-white/5'
                }`}
              >
                <div className="flex items-center space-x-3">
                  <div className={`w-2 h-2 rounded-full ${network.color}`} />
                  <div className="text-left">
                    <div className="text-white text-sm font-medium">{network.name}</div>
                    <div className="text-gray-400 text-xs">{network.status}</div>
                  </div>
                </div>
                {currentNetwork === network.value && (
                  <div className="text-green-400 text-xs">✓</div>
                )}
              </button>
            ))}
          </div>
          
          <div className="border-t border-white/10 px-3 py-2">
            <div className="text-xs text-gray-400">
              <div className="font-medium mb-1">Current Endpoint:</div>
              <div className="font-mono break-all">{currentNetworkConfig.endpoint}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}