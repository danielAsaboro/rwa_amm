'use client'

import { useState, useEffect } from 'react'
import { Search, ExternalLink, TrendingUp, Droplets } from 'lucide-react'
import { useRwaAmmSdk } from '@/hooks/useRwaAmmSdk'
import { PublicKey } from '@solana/web3.js'
import { BN } from '@coral-xyz/anchor'
import TransferHookIndicator from './TransferHookIndicator'

interface Pool {
  address: PublicKey
  tokenAMint: PublicKey
  tokenBMint: PublicKey
  liquidity: BN
  sqrtPrice: BN
  tokenAHasHook?: boolean
  tokenBHasHook?: boolean
}

interface PoolSelectorProps {
  onPoolSelect: (pool: Pool) => void
  selectedPool?: Pool | null
  inputToken?: string
  outputToken?: string
  className?: string
}

export default function PoolSelector({
  onPoolSelect,
  selectedPool,
  inputToken,
  outputToken,
  className = ''
}: PoolSelectorProps) {
  const { getAvailablePools, connected } = useRwaAmmSdk()
  const [pools, setPools] = useState<Pool[]>([])
  const [loading, setLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    async function loadPools() {
      if (!connected) return
      
      setLoading(true)
      try {
        const availablePools = await getAvailablePools()
        setPools(availablePools)
      } catch (err) {
        console.error('Error loading pools:', err)
      } finally {
        setLoading(false)
      }
    }

    loadPools()
  }, [connected, getAvailablePools])

  const filteredPools = pools.filter(pool => {
    // Filter by search term
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase()
      const tokenAMatch = pool.tokenAMint.toString().toLowerCase().includes(searchLower)
      const tokenBMatch = pool.tokenBMint.toString().toLowerCase().includes(searchLower)
      if (!tokenAMatch && !tokenBMatch) return false
    }

    // Filter by selected tokens (if provided)
    if (inputToken && outputToken) {
      const hasInputToken = pool.tokenAMint.toString() === inputToken || 
                           pool.tokenBMint.toString() === inputToken
      const hasOutputToken = pool.tokenAMint.toString() === outputToken || 
                            pool.tokenBMint.toString() === outputToken
      return hasInputToken && hasOutputToken
    }

    return true
  })

  const displayPools = showAll ? filteredPools : filteredPools.slice(0, 5)

  const formatLiquidity = (liquidity: BN) => {
    const value = liquidity.toNumber()
    if (value > 1_000_000) {
      return `${(value / 1_000_000).toFixed(2)}M`
    } else if (value > 1_000) {
      return `${(value / 1_000).toFixed(2)}K`
    }
    return value.toLocaleString()
  }

  const formatTokenAddress = (address: PublicKey) => {
    const str = address.toString()
    return `${str.slice(0, 6)}...${str.slice(-6)}`
  }

  if (!connected) {
    return (
      <div className={`bg-gray-100 rounded-lg p-6 text-center ${className}`}>
        <Droplets className="w-8 h-8 text-gray-400 mx-auto mb-2" />
        <p className="text-gray-600">Connect wallet to view available pools</p>
      </div>
    )
  }

  return (
    <div className={`bg-white rounded-lg border border-gray-200 ${className}`}>
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 flex items-center">
          <TrendingUp className="w-5 h-5 mr-2" />
          Available Pools
        </h3>
        
        {/* Search */}
        <div className="mt-3 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input
            type="text"
            placeholder="Search by token address..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
      </div>

      {/* Pool List */}
      <div className="max-h-96 overflow-y-auto">
        {loading ? (
          <div className="p-6 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
            <p className="text-gray-600 mt-2">Loading pools...</p>
          </div>
        ) : displayPools.length === 0 ? (
          <div className="p-6 text-center">
            <Droplets className="w-8 h-8 text-gray-400 mx-auto mb-2" />
            <p className="text-gray-600">
              {searchTerm ? 'No pools found matching your search' : 'No pools available'}
            </p>
            {inputToken && outputToken && (
              <button
                onClick={() => window.location.href = `/create-pool?tokenA=${inputToken}&tokenB=${outputToken}`}
                className="mt-3 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
              >
                Create Pool for This Pair
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {displayPools.map((pool, index) => (
              <div
                key={pool.address.toString()}
                className={`p-4 hover:bg-gray-50 cursor-pointer transition-colors ${
                  selectedPool?.address.equals(pool.address) ? 'bg-blue-50 border-l-4 border-l-blue-500' : ''
                }`}
                onClick={() => onPoolSelect(pool)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    {/* Token Pair */}
                    <div className="flex items-center space-x-3 mb-2">
                      <div className="flex items-center space-x-2">
                        <span className="font-medium text-gray-900">
                          {formatTokenAddress(pool.tokenAMint)}
                        </span>
                        <TransferHookIndicator 
                          mintAddress={pool.tokenAMint.toString()} 
                          showLabel={false}
                          size="sm"
                        />
                      </div>
                      <span className="text-gray-400">↔</span>
                      <div className="flex items-center space-x-2">
                        <span className="font-medium text-gray-900">
                          {formatTokenAddress(pool.tokenBMint)}
                        </span>
                        <TransferHookIndicator 
                          mintAddress={pool.tokenBMint.toString()} 
                          showLabel={false}
                          size="sm"
                        />
                      </div>
                    </div>

                    {/* Pool Details */}
                    <div className="flex items-center space-x-4 text-sm text-gray-600">
                      <div className="flex items-center space-x-1">
                        <Droplets className="w-4 h-4" />
                        <span>Liquidity: {formatLiquidity(pool.liquidity)}</span>
                      </div>
                      
                      {(pool.tokenAHasHook || pool.tokenBHasHook) && (
                        <div className="flex items-center space-x-1">
                          <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                          <span>RWA Pool</span>
                        </div>
                      )}
                    </div>

                    {/* Pool Address */}
                    <div className="mt-2 flex items-center space-x-2">
                      <span className="text-xs text-gray-500 font-mono">
                        {formatTokenAddress(pool.address)}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          window.open(
                            `https://explorer.solana.com/tx/${pool.address.toString()}?cluster=custom&customUrl=http%3A%2F%2Flocalhost%3A8899`,
                            '_blank'
                          )
                        }}
                        className="text-gray-400 hover:text-gray-600"
                      >
                        <ExternalLink className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  {/* Selection Indicator */}
                  {selectedPool?.address.equals(pool.address) && (
                    <div className="ml-3">
                      <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Show More Button */}
      {filteredPools.length > 5 && !showAll && (
        <div className="p-4 border-t border-gray-200">
          <button
            onClick={() => setShowAll(true)}
            className="w-full py-2 text-blue-600 hover:text-blue-800 font-medium"
          >
            Show {filteredPools.length - 5} more pools
          </button>
        </div>
      )}

      {/* Create Pool CTA */}
      {filteredPools.length === 0 && !loading && inputToken && outputToken && (
        <div className="p-4 border-t border-gray-200 bg-gray-50">
          <p className="text-sm text-gray-600 mb-3">
            No pools exist for this token pair. Create one to enable trading.
          </p>
          <button
            onClick={() => window.location.href = `/create-pool?tokenA=${inputToken}&tokenB=${outputToken}`}
            className="w-full py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-medium"
          >
            Create Pool
          </button>
        </div>
      )}
    </div>
  )
}