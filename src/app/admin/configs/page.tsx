'use client'

import { useState } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { useRwaAmmSdk } from '@/hooks/useRwaAmmSdk'
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui'
import { BN } from '@coral-xyz/anchor'
import { PublicKey } from '@solana/web3.js'

export default function ConfigsManagement() {
  const { connected, publicKey } = useWallet()
  const { createConfig, loading, error } = useRwaAmmSdk()
  
  const [configData, setConfigData] = useState({
    baseFeeCliffNumerator: '2500000',
    baseFeeNumberOfPeriod: '0',
    baseFeeReductionFactor: '0',
    baseFeePeriodFrequency: '0',
    baseFeeFeeSchedulerMode: '0',
    activationType: '0',
    collectFeeMode: '0'
  })
  const [txSignature, setTxSignature] = useState<string>('')

  const handleInputChange = (field: string, value: string) => {
    setConfigData(prev => ({
      ...prev,
      [field]: value
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!connected || !publicKey) {
      alert('Please connect your wallet first')
      return
    }

    try {
      const signature = await createConfig({
        poolFees: {
          baseFee: {
            cliffFeeNumerator: new BN(configData.baseFeeCliffNumerator),
            numberOfPeriod: parseInt(configData.baseFeeNumberOfPeriod),
            reductionFactor: new BN(configData.baseFeeReductionFactor),
            periodFrequency: new BN(configData.baseFeePeriodFrequency),
            feeSchedulerMode: parseInt(configData.baseFeeFeeSchedulerMode),
          },
          padding: [],
          dynamicFee: null,
        },
        sqrtMinPrice: new BN('4295048016'),
        sqrtMaxPrice: new BN('79226673515401279992447579055'),
        vaultConfigKey: PublicKey.default,
        poolCreatorAuthority: PublicKey.default,
        activationType: parseInt(configData.activationType),
        collectFeeMode: parseInt(configData.collectFeeMode),
      })
      setTxSignature(signature)
      console.log('Config created successfully:', signature)
    } catch (err) {
      console.error('Failed to create config:', err)
    }
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">AMM Configuration Management</h1>
        
        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Wallet Connection</h2>
          <WalletMultiButton />
          {connected && publicKey && (
            <p className="mt-2 text-sm text-gray-400">
              Connected: {publicKey.toString().slice(0, 8)}...{publicKey.toString().slice(-8)}
            </p>
          )}
        </div>

        <div className="bg-gray-800 rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Create AMM Configuration</h2>
          
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="border-b border-gray-700 pb-6">
              <h3 className="text-lg font-medium mb-4 text-blue-400">Base Fee Configuration</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Cliff Fee Numerator</label>
                  <input
                    type="text"
                    value={configData.baseFeeCliffNumerator}
                    onChange={(e) => handleInputChange('baseFeeCliffNumerator', e.target.value)}
                    className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg text-white"
                    placeholder="2500000"
                  />
                  <p className="text-xs text-gray-400 mt-1">Default: 2,500,000 (0.25% fee)</p>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Number of Period</label>
                  <input
                    type="number"
                    value={configData.baseFeeNumberOfPeriod}
                    onChange={(e) => handleInputChange('baseFeeNumberOfPeriod', e.target.value)}
                    className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg text-white"
                    placeholder="0"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Reduction Factor</label>
                  <input
                    type="text"
                    value={configData.baseFeeReductionFactor}
                    onChange={(e) => handleInputChange('baseFeeReductionFactor', e.target.value)}
                    className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg text-white"
                    placeholder="0"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Period Frequency</label>
                  <input
                    type="text"
                    value={configData.baseFeePeriodFrequency}
                    onChange={(e) => handleInputChange('baseFeePeriodFrequency', e.target.value)}
                    className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg text-white"
                    placeholder="0"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium mb-2">Fee Scheduler Mode</label>
                  <select
                    value={configData.baseFeeFeeSchedulerMode}
                    onChange={(e) => handleInputChange('baseFeeFeeSchedulerMode', e.target.value)}
                    className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg text-white"
                  >
                    <option value="0">Fixed Fee (0)</option>
                    <option value="1">Dynamic Fee (1)</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Activation Type</label>
                <select
                  value={configData.activationType}
                  onChange={(e) => handleInputChange('activationType', e.target.value)}
                  className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg text-white"
                >
                  <option value="0">Immediate (0)</option>
                  <option value="1">Timed (1)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Collect Fee Mode</label>
                <select
                  value={configData.collectFeeMode}
                  onChange={(e) => handleInputChange('collectFeeMode', e.target.value)}
                  className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg text-white"
                >
                  <option value="0">Protocol Fee (0)</option>
                  <option value="1">LP Fee (1)</option>
                </select>
              </div>
            </div>

            <button
              type="submit"
              disabled={!connected || loading}
              className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white py-3 px-6 rounded-lg font-medium"
            >
              {loading ? 'Creating Configuration...' : 'Create Configuration'}
            </button>
          </form>

          {error && (
            <div className="mt-4 p-3 bg-red-900 border border-red-700 rounded-lg">
              <p className="text-red-100 text-sm">Error: {error}</p>
            </div>
          )}

          {txSignature && (
            <div className="mt-4 p-3 bg-green-900 border border-green-700 rounded-lg">
              <p className="text-green-100 text-sm">
                ✅ Configuration created successfully!
              </p>
              <p className="text-green-200 text-xs break-all mt-1">
                Transaction: {txSignature}
              </p>
            </div>
          )}
        </div>

        <div className="bg-gray-800 rounded-lg p-6 mt-6">
          <h3 className="text-lg font-semibold mb-3">Configuration Guide</h3>
          <div className="space-y-3 text-sm text-gray-300">
            <div>
              <strong className="text-blue-400">Cliff Fee Numerator:</strong>
              <p>Base fee rate as a numerator. 2,500,000 = 0.25% fee (2,500,000 / 1,000,000,000)</p>
            </div>
            <div>
              <strong className="text-blue-400">Activation Type:</strong>
              <p>Immediate (0) - Pool becomes active immediately | Timed (1) - Pool activates at specific time</p>
            </div>
            <div>
              <strong className="text-blue-400">Collect Fee Mode:</strong>
              <p>Protocol Fee (0) - Fees go to protocol | LP Fee (1) - Fees distributed to liquidity providers</p>
            </div>
            <div>
              <strong className="text-blue-400">Fee Scheduler Mode:</strong>
              <p>Fixed Fee (0) - Static fee rate | Dynamic Fee (1) - Variable fee based on market conditions</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}