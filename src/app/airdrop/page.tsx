"use client";

import { useState } from 'react';
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { useNetwork } from '@/contexts/NetworkContext';
import { useWallet } from '@solana/wallet-adapter-react';
import Header from '@/components/Header';
import { ArrowDownIcon, RefreshCwIcon, CheckCircleIcon, XCircleIcon, WalletIcon } from 'lucide-react';

export default function AirdropPage() {
  const [address, setAddress] = useState('');
  const [amount, setAmount] = useState('2');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{
    type: 'success' | 'error' | 'info' | null;
    message: string;
  }>({ type: null, message: '' });
  
  const { network, endpoint } = useNetwork();
  const { publicKey } = useWallet();

  const validateAddress = (addr: string): boolean => {
    try {
      new PublicKey(addr);
      return true;
    } catch {
      return false;
    }
  };

  const requestAirdrop = async () => {
    if (!address.trim()) {
      setStatus({ type: 'error', message: 'Please enter a wallet address' });
      return;
    }

    if (!validateAddress(address)) {
      setStatus({ type: 'error', message: 'Invalid wallet address format' });
      return;
    }

    const airdropAmount = parseFloat(amount);
    if (isNaN(airdropAmount) || airdropAmount <= 0 || airdropAmount > 10) {
      setStatus({ type: 'error', message: 'Amount must be between 0.1 and 10 SOL' });
      return;
    }

    if (network === 'mainnet') {
      setStatus({ type: 'error', message: 'Airdrops are not available on Mainnet' });
      return;
    }

    setLoading(true);
    setStatus({ type: 'info', message: 'Requesting airdrop...' });

    try {
      const connection = new Connection(endpoint, 'confirmed');
      const pubkey = new PublicKey(address);
      
      // Check if we're on localnet or devnet
      const airdropAmountLamports = airdropAmount * LAMPORTS_PER_SOL;
      
      // For localnet, we might need to use different limits
      const maxAmount = network === 'localnet' ? 10 : 5; // 10 SOL for localnet, 5 for devnet
      
      if (airdropAmount > maxAmount) {
        setStatus({ 
          type: 'error', 
          message: `Maximum airdrop amount for ${network} is ${maxAmount} SOL` 
        });
        return;
      }

      console.log(`Requesting ${airdropAmount} SOL airdrop to ${address} on ${network}`);
      
      const signature = await connection.requestAirdrop(pubkey, airdropAmountLamports);
      
      setStatus({ 
        type: 'info', 
        message: 'Airdrop requested, confirming transaction...' 
      });

      // Wait for confirmation
      await connection.confirmTransaction(signature, 'confirmed');
      
      // Get the new balance
      const balance = await connection.getBalance(pubkey);
      const balanceInSol = balance / LAMPORTS_PER_SOL;

      setStatus({ 
        type: 'success', 
        message: `Successfully airdropped ${airdropAmount} SOL! New balance: ${balanceInSol.toFixed(4)} SOL`
      });

    } catch (error: any) {
      console.error('Airdrop error:', error);
      
      let errorMessage = 'Failed to request airdrop';
      
      if (error.message?.includes('airdrop request limit exceeded')) {
        errorMessage = 'Airdrop limit exceeded. Try again later or use a smaller amount.';
      } else if (error.message?.includes('blockhash')) {
        errorMessage = 'Network issue. Please try again.';
      } else if (error.message) {
        errorMessage = error.message;
      }

      setStatus({ type: 'error', message: errorMessage });
    } finally {
      setLoading(false);
    }
  };

  const useConnectedWallet = () => {
    if (publicKey) {
      setAddress(publicKey.toString());
    }
  };

  const getStatusIcon = () => {
    switch (status.type) {
      case 'success':
        return <CheckCircleIcon className="w-5 h-5 text-green-400" />;
      case 'error':
        return <XCircleIcon className="w-5 h-5 text-red-400" />;
      case 'info':
        return <RefreshCwIcon className="w-5 h-5 text-blue-400 animate-spin" />;
      default:
        return null;
    }
  };

  const networkLimits = {
    localnet: { max: 10, available: true },
    devnet: { max: 5, available: true },
    mainnet: { max: 0, available: false }
  };

  const currentLimit = networkLimits[network];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <Header />
      
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
            SOL Airdrop
          </h1>
          <p className="text-xl text-gray-300 max-w-2xl mx-auto">
            Get test SOL tokens for development and testing on {network}
          </p>
        </div>

        <div className="max-w-2xl mx-auto">
          <div className="bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 p-8">
            
            {/* Network Status */}
            <div className="mb-8 p-4 bg-white/5 rounded-lg border border-white/10">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-white font-semibold">Current Network</h3>
                  <p className="text-gray-300 text-sm">{endpoint}</p>
                </div>
                <div className="text-right">
                  <div className={`inline-flex items-center space-x-2 px-3 py-1 rounded-lg ${
                    network === 'localnet' ? 'bg-yellow-500/20 text-yellow-400' :
                    network === 'devnet' ? 'bg-blue-500/20 text-blue-400' :
                    'bg-red-500/20 text-red-400'
                  }`}>
                    <div className={`w-2 h-2 rounded-full ${
                      network === 'localnet' ? 'bg-yellow-500' :
                      network === 'devnet' ? 'bg-blue-500' : 'bg-red-500'
                    }`} />
                    <span className="font-medium capitalize">{network}</span>
                  </div>
                  <p className="text-gray-400 text-sm mt-1">
                    {currentLimit.available ? `Max: ${currentLimit.max} SOL` : 'Unavailable'}
                  </p>
                </div>
              </div>
            </div>

            {/* Airdrop Form */}
            <div className="space-y-6">
              <div>
                <label htmlFor="address" className="block text-sm font-medium text-gray-300 mb-2">
                  Wallet Address
                </label>
                <div className="relative">
                  <input
                    type="text"
                    id="address"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Enter Solana wallet address..."
                    className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent pr-12"
                  />
                  {publicKey && (
                    <button
                      onClick={useConnectedWallet}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-purple-400 hover:text-purple-300 transition-colors"
                      title="Use connected wallet"
                    >
                      <WalletIcon className="w-5 h-5" />
                    </button>
                  )}
                </div>
                {publicKey && (
                  <button
                    onClick={useConnectedWallet}
                    className="mt-2 text-sm text-purple-400 hover:text-purple-300 transition-colors"
                  >
                    Use connected wallet: {publicKey.toString().slice(0, 8)}...{publicKey.toString().slice(-8)}
                  </button>
                )}
              </div>

              <div>
                <label htmlFor="amount" className="block text-sm font-medium text-gray-300 mb-2">
                  Amount (SOL)
                </label>
                <input
                  type="number"
                  id="amount"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  min="0.1"
                  max={currentLimit.max}
                  step="0.1"
                  className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  disabled={!currentLimit.available}
                />
              </div>

              {/* Status Message */}
              {status.message && (
                <div className={`flex items-center space-x-3 p-4 rounded-lg ${
                  status.type === 'success' ? 'bg-green-500/20 border border-green-500/30' :
                  status.type === 'error' ? 'bg-red-500/20 border border-red-500/30' :
                  'bg-blue-500/20 border border-blue-500/30'
                }`}>
                  {getStatusIcon()}
                  <p className={`text-sm ${
                    status.type === 'success' ? 'text-green-400' :
                    status.type === 'error' ? 'text-red-400' :
                    'text-blue-400'
                  }`}>
                    {status.message}
                  </p>
                </div>
              )}

              {/* Submit Button */}
              <button
                onClick={requestAirdrop}
                disabled={loading || !currentLimit.available}
                className={`w-full flex items-center justify-center space-x-2 py-4 px-6 rounded-lg font-semibold transition-all ${
                  loading || !currentLimit.available
                    ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                    : 'bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white shadow-lg hover:shadow-xl'
                }`}
              >
                {loading ? (
                  <RefreshCwIcon className="w-5 h-5 animate-spin" />
                ) : (
                  <ArrowDownIcon className="w-5 h-5" />
                )}
                <span>
                  {loading ? 'Requesting Airdrop...' : 
                   !currentLimit.available ? 'Airdrop Unavailable' :
                   'Request Airdrop'}
                </span>
              </button>
            </div>

            {/* Info Section */}
            <div className="mt-8 pt-6 border-t border-white/10">
              <h3 className="text-white font-semibold mb-3">Airdrop Information</h3>
              <div className="space-y-2 text-sm text-gray-300">
                <p>• <strong>Localnet:</strong> Up to 10 SOL per request</p>
                <p>• <strong>Devnet:</strong> Up to 5 SOL per request (rate limited)</p>
                <p>• <strong>Mainnet:</strong> Airdrops not available</p>
                <p>• Test tokens have no real value</p>
                <p>• Use for development and testing only</p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}