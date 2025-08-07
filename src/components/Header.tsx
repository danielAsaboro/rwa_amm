"use client";

import { TrendingUp } from "lucide-react";
import { CustomWalletButton } from "./WalletProvider";
import NetworkSwitcher from "./NetworkSwitcher";
import NotificationPanel from "./NotificationPanel";
import { useNetwork } from "@/contexts/NetworkContext";

export default function Header() {
  const { network, setNetwork } = useNetwork();

  return (
    <header className="border-b border-white/10 bg-white/5 backdrop-blur-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center py-6">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-gradient-to-r from-purple-500 to-pink-500 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-white" />
            </div>
            <a
              href="/"
              className="text-xl font-bold text-white hover:text-gray-300 transition-colors"
            >
              Asset Exchange
            </a>
          </div>
          <nav className="hidden lg:flex space-x-8">
            <a
              href="/trade"
              className="text-gray-300 hover:text-white transition-colors"
            >
              Trade
            </a>
            <a
              href="/create-pool"
              className="text-gray-300 hover:text-white transition-colors"
            >
              Trading Pools
            </a>
            <a
              href="/add-liquidity"
              className="text-gray-300 hover:text-white transition-colors"
            >
              Add Liquidity
            </a>
            <a
              href="/create-mint"
              className="text-gray-300 hover:text-white transition-colors"
            >
              Create Asset
            </a>
            <a
              href="/airdrop"
              className="text-gray-300 hover:text-white transition-colors"
            >
              Airdrop
            </a>
            <a
              href="/charts"
              className="text-gray-300 hover:text-white transition-colors"
            >
              Analytics
            </a>
          </nav>
          <div className="flex items-center space-x-2 md:space-x-4">
            {/* Notification Panel */}
            <NotificationPanel />
            
            {/* Mobile network indicator */}
            <div className="sm:hidden">
              <div className="flex items-center space-x-1 px-2 py-1 bg-white/5 rounded-lg">
                <div className={`w-1.5 h-1.5 rounded-full ${
                  network === 'localnet' ? 'bg-yellow-500' :
                  network === 'devnet' ? 'bg-blue-500' : 'bg-green-500'
                }`} />
                <span className="text-white text-xs font-medium">
                  {network === 'localnet' ? 'Local' : network === 'devnet' ? 'Dev' : 'Main'}
                </span>
              </div>
            </div>
            
            {/* Desktop network switcher */}
            <div className="hidden sm:block">
              <NetworkSwitcher 
                currentNetwork={network} 
                onNetworkChange={setNetwork}
              />
            </div>
            <CustomWalletButton />
          </div>
        </div>
      </div>
    </header>
  );
}
