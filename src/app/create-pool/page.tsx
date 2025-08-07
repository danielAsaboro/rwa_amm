'use client'

import { Suspense, useState, useEffect, useMemo } from 'react'
import { useRwaAmmSdk } from '@/hooks/useRwaAmmSdk'
import { PublicKey } from '@solana/web3.js'
import Header from '@/components/Header'
import { DollarSign, TrendingUp, Shield, Droplets, ChevronDown } from 'lucide-react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useUserSession } from '@/contexts/UserSessionContext'

interface StoredToken {
  address: string
  name: string
  symbol: string
  decimals: number
  supply: number
  createdAt: Date
  hasTransferHook: boolean
  hasKyc: boolean
}

interface PoolConfig {
  tokenA: {
    mint: string
    symbol: string
    decimals: number
  }
  tokenB: {
    mint: string
    symbol: string
    decimals: number
  }
  fee: number // Fee in basis points (e.g., 30 = 0.3%)
  initialPrice: number
  initialLiquidityA: number
  initialLiquidityB: number
}

const COMMON_TOKENS = [
  {
    mint: 'So11111111111111111111111111111111111111112',
    symbol: 'SOL',
    decimals: 9,
    name: 'Solana',
  },
  {
    mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    symbol: 'USDC',
    decimals: 6,
    name: 'USD Coin',
  },
  {
    mint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
    symbol: 'USDT',
    decimals: 6,
    name: 'Tether USD',
  },
]

const FEE_TIERS = [
  { bps: 1, percentage: '0.01%', label: 'Stable pairs' },
  { bps: 5, percentage: '0.05%', label: 'Standard pairs' },
  { bps: 30, percentage: '0.30%', label: 'Volatile pairs' },
  { bps: 100, percentage: '1.00%', label: 'Exotic pairs' },
]

function CreatePoolPageInner() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { sessionData, addPool, markStepCompleted, getTokenByAddress, addNotification, getSmartDefaults } =
    useUserSession()

  // URL Parameters for auto-fill
  const preMintAddress = searchParams?.get('mint') || searchParams?.get('tokenA')
  const preTokenB = searchParams?.get('tokenB')
  const autoFill = searchParams?.get('autoFill') === 'true'

  const { createConfig, createPool, addLiquidity, loading, error, connected, clearError } = useRwaAmmSdk()
  const [step, setStep] = useState(1)
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle')
  const [createdPoolAddress, setCreatedPoolAddress] = useState<string | null>(null)
  // Derived token list (common tokens + session tokens). Memoized to avoid stale state
  const storedTokens = useMemo<StoredToken[]>(() => {
    const common: StoredToken[] = COMMON_TOKENS.map((t) => ({
      address: t.mint,
      name: t.name,
      symbol: t.symbol,
      decimals: t.decimals,
      supply: 0,
      createdAt: new Date(),
      hasTransferHook: false,
      hasKyc: false,
    }))
    const map = new Map<string, StoredToken>()
    for (const tok of common) map.set(tok.address, tok)
    for (const tok of sessionData.tokens) map.set(tok.address, tok)
    return Array.from(map.values())
  }, [sessionData.tokens])
  const [showTokenADropdown, setShowTokenADropdown] = useState(false)
  const [showTokenBDropdown, setShowTokenBDropdown] = useState(false)

  // Get smart defaults
  const smartDefaults = getSmartDefaults()

  const [poolConfig, setPoolConfig] = useState<PoolConfig>({
    tokenA: {
      mint: preMintAddress || smartDefaults.suggestedTokenPair.tokenA || '',
      symbol: '',
      decimals: 6, // Default to 6 for RWA tokens
    },
    tokenB: {
      mint: preTokenB || smartDefaults.suggestedTokenPair.tokenB || '',
      symbol: '',
      decimals: 6,
    },
    fee: smartDefaults.recommendedFeeRate, // Smart fee based on token types
    initialPrice: 1.0,
    initialLiquidityA: smartDefaults.recommendedLiquidity.tokenA,
    initialLiquidityB: smartDefaults.recommendedLiquidity.tokenB,
  })

  // Auto-fill from session data (storedTokens now derived via useMemo)

  // Auto-fill form based on URL parameters and user preferences
  useEffect(() => {
    if (autoFill && sessionData.preferences.autoFillForms) {
      // Auto-fill token A if specified
      if (preMintAddress) {
        const tokenA = getTokenByAddress(preMintAddress) || COMMON_TOKENS.find((t) => t.mint === preMintAddress)
        if (tokenA) {
          setPoolConfig((prev) => ({
            ...prev,
            tokenA: {
              mint: 'address' in tokenA ? tokenA.address : tokenA.mint,
              symbol: tokenA.symbol,
              decimals: tokenA.decimals,
            },
          }))
        }
      }

      // Auto-fill token B if specified
      if (preTokenB) {
        const tokenB = getTokenByAddress(preTokenB) || COMMON_TOKENS.find((t) => t.mint === preTokenB)
        if (tokenB) {
          setPoolConfig((prev) => ({
            ...prev,
            tokenB: {
              mint: 'address' in tokenB ? tokenB.address : tokenB.mint,
              symbol: tokenB.symbol,
              decimals: tokenB.decimals,
            },
          }))
        }
      }

      // Auto-fill default pair if no tokens specified
      if (!preMintAddress && !preTokenB && sessionData.tokens.length > 0) {
        const lastCreatedToken = sessionData.tokens[sessionData.tokens.length - 1]
        const defaultQuote = COMMON_TOKENS.find((t) => t.symbol === 'USDC')

        if (lastCreatedToken && defaultQuote) {
          setPoolConfig((prev) => ({
            ...prev,
            tokenA: {
              mint: lastCreatedToken.address,
              symbol: lastCreatedToken.symbol,
              decimals: lastCreatedToken.decimals,
            },
            tokenB: {
              mint: defaultQuote.mint,
              symbol: defaultQuote.symbol,
              decimals: defaultQuote.decimals,
            },
          }))
        }
      }
    }
  }, [
    autoFill,
    preMintAddress,
    preTokenB,
    sessionData.preferences.autoFillForms,
    sessionData.tokens,
    getTokenByAddress,
  ])

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element
      if (!target.closest('.token-dropdown')) {
        setShowTokenADropdown(false)
        setShowTokenBDropdown(false)
      }
    }

    if (showTokenADropdown || showTokenBDropdown) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showTokenADropdown, showTokenBDropdown])

  const updatePoolConfig = (path: string, value: any) => {
    setPoolConfig((prev) => {
      const keys = path.split('.')
      const newData = { ...prev }
      let current: any = newData

      for (let i = 0; i < keys.length - 1; i++) {
        current = current[keys[i]]
      }
      current[keys[keys.length - 1]] = value

      return newData
    })
  }

  // Auto-populate token info when selected
  const selectToken = (token: StoredToken, side: 'A' | 'B') => {
    const path = side === 'A' ? 'tokenA' : 'tokenB'
    updatePoolConfig(`${path}.mint`, token.address)
    updatePoolConfig(`${path}.symbol`, token.symbol)
    updatePoolConfig(`${path}.decimals`, token.decimals)

    // Close dropdown
    if (side === 'A') {
      setShowTokenADropdown(false)
    } else {
      setShowTokenBDropdown(false)
    }
  }

  // Get available tokens for dropdown (excluding already selected)
  const getAvailableTokens = (excludeToken?: string) => {
    return storedTokens.filter((token) => token.address !== excludeToken)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!connected) {
      alert('Please connect your wallet first')
      return
    }

    if (!poolConfig.tokenA.mint || !poolConfig.tokenB.mint) {
      alert('Please select both assets')
      return
    }

    if (poolConfig.tokenA.mint === poolConfig.tokenB.mint) {
      alert('Cannot create pool with the same token')
      return
    }

    setSubmitStatus('submitting')
    clearError()

    try {
      console.log('Creating pool with configuration:', poolConfig)

      // Import BN and constants for big number operations
      const { BN } = await import('@coral-xyz/anchor')
      const { MIN_SQRT_PRICE, MAX_SQRT_PRICE } = await import('@/lib/program')

      // Use the constant from the test file
      const MIN_LP_AMOUNT = MIN_SQRT_PRICE // Use the same pattern as the test

      // Step 1: Create config first
      console.log('Step 1: Creating AMM config...')
      const createConfigParams = {
        poolFees: {
          baseFee: {
            cliffFeeNumerator: new BN(2_500_000), // 0.25% base fee
            numberOfPeriod: 0,
            reductionFactor: new BN(0),
            periodFrequency: new BN(0),
            feeSchedulerMode: 0,
          },
          padding: [],
          dynamicFee: null,
        },
        sqrtMinPrice: new BN(MIN_SQRT_PRICE),
        sqrtMaxPrice: new BN(MAX_SQRT_PRICE),
        vaultConfigKey: new PublicKey('11111111111111111111111111111111'), // Default
        poolCreatorAuthority: new PublicKey('11111111111111111111111111111111'), // Default
        activationType: 0, // slot-based
        collectFeeMode: 0, // both tokens
      }

      const configAddress = await createConfig(createConfigParams)
      console.log('✅ Config created:', configAddress)

      // Wait a moment to ensure config is fully settled
      console.log('Waiting for config to settle...')
      await new Promise((resolve) => setTimeout(resolve, 2000))

      // Step 2: Calculate liquidity and sqrt price (like the working test)
      console.log('Step 2: Calculating pool parameters...')

      // Use MIN_LP_AMOUNT directly like the test does
      const liquidity = new BN(MIN_LP_AMOUNT)
      const sqrtPrice = new BN(MIN_SQRT_PRICE)

      // Step 3: Create the pool
      console.log('Step 3: Creating pool...')

      // Validate and parse public keys with clear errors
      const resolvedConfigAddress =
        typeof configAddress === 'string'
          ? configAddress
          : ((configAddress as any)?.configAddress ?? (configAddress as any)?.toString?.())
      console.log('Using addresses for pool creation:', {
        config: resolvedConfigAddress,
        mintA: poolConfig.tokenA.mint,
        mintB: poolConfig.tokenB.mint,
      })
      let configKey: PublicKey
      let mintAKey: PublicKey
      let mintBKey: PublicKey
      try {
        configKey = new PublicKey(String(resolvedConfigAddress).trim())
      } catch (e) {
        console.error('Invalid config address:', configAddress)
        setSubmitStatus('error')
        addNotification({
          type: 'error',
          title: 'Invalid Config Address',
          message: 'The returned config address is invalid. Please retry creating the config.',
        })
        return
      }

      try {
        mintAKey = new PublicKey(String(poolConfig.tokenA.mint).trim())
      } catch (e) {
        console.error('Invalid mintA:', poolConfig.tokenA.mint)
        setSubmitStatus('error')
        addNotification({
          type: 'error',
          title: 'Invalid Asset A Mint',
          message: 'Asset A mint address is invalid. Please re-select Asset A.',
        })
        return
      }

      try {
        mintBKey = new PublicKey(String(poolConfig.tokenB.mint).trim())
      } catch (e) {
        console.error('Invalid mintB:', poolConfig.tokenB.mint)
        setSubmitStatus('error')
        addNotification({
          type: 'error',
          title: 'Invalid Asset B Mint',
          message: 'Asset B mint address is invalid. Please re-select Asset B.',
        })
        return
      }

      const poolParams = {
        config: configKey,
        mintA: mintAKey,
        mintB: mintBKey,
        liquidity: liquidity,
        sqrtPrice: sqrtPrice,
        activationPoint: null,
      }

      console.log('Pool params:', {
        config: poolParams.config.toString(),
        mintA: poolParams.mintA.toString(),
        mintB: poolParams.mintB.toString(),
        liquidity: poolParams.liquidity.toString(),
        sqrtPrice: poolParams.sqrtPrice.toString(),
      })

      const poolAddress = await createPool(poolParams)
      console.log('✅ Pool created:', poolAddress)

      // Save pool to session data
      const newPool = {
        address: poolAddress,
        tokenAMint: poolConfig.tokenA.mint,
        tokenBMint: poolConfig.tokenB.mint,
        tokenASymbol: poolConfig.tokenA.symbol,
        tokenBSymbol: poolConfig.tokenB.symbol,
        liquidity: poolConfig.initialLiquidityA + poolConfig.initialLiquidityB,
        sqrtPrice: parseFloat(sqrtPrice.toString()),
        createdAt: new Date(),
        isOwner: true,
        feeRate: poolConfig.fee,
        tokenAHasHook: storedTokens.find((t) => t.address === poolConfig.tokenA.mint)?.hasTransferHook,
        tokenBHasHook: storedTokens.find((t) => t.address === poolConfig.tokenB.mint)?.hasTransferHook,
      }

      addPool(newPool)
      markStepCompleted(5) // Pool creation step

      // Add success notification
      addNotification({
        type: 'success',
        title: 'Pool Created Successfully!',
        message: `${poolConfig.tokenA.symbol}/${poolConfig.tokenB.symbol} pool is ready for trading`,
        action: {
          label: 'Add Liquidity',
          href: `/add-liquidity?pool=${poolAddress}&autoFill=true`,
        },
      })

      setCreatedPoolAddress(poolAddress)
      setSubmitStatus('success')

      console.log('✅ Pool creation completed successfully')
    } catch (err) {
      console.error('Failed to create pool:', err)
      setSubmitStatus('error')
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-neutral-900 to-neutral-950">
      <Header />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Progress Steps */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            {[1, 2, 3].map((stepNumber) => (
              <div key={stepNumber} className="flex items-center">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold ${
                    step >= stepNumber
                      ? 'bg-gradient-to-b from-neutral-800 to-neutral-950 text-white'
                      : 'bg-white/10 text-gray-400'
                  }`}
                >
                  {stepNumber}
                </div>
                {stepNumber < 3 && (
                  <div
                    className={`w-16 h-1 mx-2 ${
                      step > stepNumber ? 'bg-gradient-to-b from-neutral-800 to-neutral-950' : 'bg-white/10'
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
          <div className="flex justify-between mt-2 text-sm text-gray-400">
            <span>Token Pair</span>
            <span>Pool Settings</span>
            <span>Review & Create</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Step 1: Token Pair Selection */}
          {step === 1 && (
            <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6">
              <h2 className="text-xl font-semibold text-white mb-6 flex items-center">
                <TrendingUp className="w-5 h-5 mr-2" />
                Select Asset Pair
              </h2>

              {/* Asset A */}
              <div className="mb-8">
                <h3 className="text-lg font-medium text-white mb-4 flex items-center">
                  <div className="w-3 h-3 bg-gray-600 rounded-full mr-2"></div>
                  Asset A (Base Asset)
                </h3>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Select Asset A</label>
                    <div className="relative token-dropdown">
                      <button
                        type="button"
                        onClick={() => setShowTokenADropdown(!showTokenADropdown)}
                        className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-gray-500 flex items-center justify-between"
                      >
                        <span>
                          {poolConfig.tokenA.symbol
                            ? `${poolConfig.tokenA.symbol} - ${getTokenByAddress(poolConfig.tokenA.mint)?.name || 'Unknown'}`
                            : 'Select Asset A'}
                        </span>
                        <ChevronDown
                          className={`w-4 h-4 transition-transform ${showTokenADropdown ? 'rotate-180' : ''}`}
                        />
                      </button>

                      {showTokenADropdown && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-neutral-800 border border-white/20 rounded-lg shadow-xl z-10 max-h-60 overflow-y-auto">
                          {getAvailableTokens(poolConfig.tokenB.mint).map((token) => (
                            <button
                              key={token.address}
                              type="button"
                              onClick={() => selectToken(token, 'A')}
                              className="w-full text-left px-4 py-3 hover:bg-white/10 transition-colors border-b border-white/10 last:border-b-0"
                            >
                              <div className="flex items-center justify-between">
                                <div>
                                  <span className="text-white font-medium">{token.symbol}</span>
                                  <span className="text-gray-400 ml-2">{token.name}</span>
                                </div>
                                {token.hasTransferHook && (
                                  <span className="px-2 py-1 bg-blue-500/20 text-blue-400 text-xs rounded">RWA</span>
                                )}
                              </div>
                              <div className="text-gray-500 text-xs mt-1 font-mono">
                                {token.address.substring(0, 8)}...{token.address.slice(-8)}
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {poolConfig.tokenA.mint && (
                    <div className="text-sm text-gray-400">
                      <p>Selected: {getTokenByAddress(poolConfig.tokenA.mint)?.name}</p>
                      <p className="font-mono text-xs">{poolConfig.tokenA.mint}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Asset B */}
              <div>
                <h3 className="text-lg font-medium text-white mb-4 flex items-center">
                  <div className="w-3 h-3 bg-gray-500 rounded-full mr-2"></div>
                  Asset B (Quote Asset)
                </h3>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Select Asset B</label>
                    <div className="relative token-dropdown">
                      <button
                        type="button"
                        onClick={() => setShowTokenBDropdown(!showTokenBDropdown)}
                        className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-gray-500 flex items-center justify-between"
                      >
                        <span>
                          {poolConfig.tokenB.symbol
                            ? `${poolConfig.tokenB.symbol} - ${getTokenByAddress(poolConfig.tokenB.mint)?.name || 'Unknown'}`
                            : 'Select Asset B'}
                        </span>
                        <ChevronDown
                          className={`w-4 h-4 transition-transform ${showTokenBDropdown ? 'rotate-180' : ''}`}
                        />
                      </button>

                      {showTokenBDropdown && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-neutral-800 border border-white/20 rounded-lg shadow-xl z-10 max-h-60 overflow-y-auto">
                          {getAvailableTokens(poolConfig.tokenA.mint).map((token) => (
                            <button
                              key={token.address}
                              type="button"
                              onClick={() => selectToken(token, 'B')}
                              className="w-full text-left px-4 py-3 hover:bg-white/10 transition-colors border-b border-white/10 last:border-b-0"
                            >
                              <div className="flex items-center justify-between">
                                <div>
                                  <span className="text-white font-medium">{token.symbol}</span>
                                  <span className="text-gray-400 ml-2">{token.name}</span>
                                </div>
                                {token.hasTransferHook && (
                                  <span className="px-2 py-1 bg-blue-500/20 text-blue-400 text-xs rounded">RWA</span>
                                )}
                              </div>
                              <div className="text-gray-500 text-xs mt-1 font-mono">
                                {token.address.substring(0, 8)}...{token.address.slice(-8)}
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {poolConfig.tokenB.mint && (
                    <div className="text-sm text-gray-400">
                      <p>Selected: {getTokenByAddress(poolConfig.tokenB.mint)?.name}</p>
                      <p className="font-mono text-xs">{poolConfig.tokenB.mint}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Pool Settings */}
          {step === 2 && (
            <div className="space-y-6">
              {/* Fee Tier Selection */}
              <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6">
                <h3 className="text-lg font-semibold text-white flex items-center mb-4">
                  <DollarSign className="w-5 h-5 mr-2" />
                  Fee Tier
                </h3>
                <p className="text-gray-400 mb-4">
                  Select the trading fee for your pool. Higher fees provide more returns to liquidity providers but may
                  reduce trading volume.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {FEE_TIERS.map((tier) => (
                    <div
                      key={tier.bps}
                      className={`border rounded-xl p-4 cursor-pointer transition-all ${
                        poolConfig.fee === tier.bps
                          ? 'border-gray-600 bg-gray-600/10'
                          : 'border-white/20 hover:border-white/40'
                      }`}
                      onClick={() => updatePoolConfig('fee', tier.bps)}
                    >
                      <div className="text-center">
                        <p className="text-lg font-semibold text-white">{tier.percentage}</p>
                        <p className="text-sm text-gray-400">{tier.label}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Initial Liquidity */}
              <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6">
                <h3 className="text-lg font-semibold text-white flex items-center mb-4">
                  <Droplets className="w-5 h-5 mr-2" />
                  Initial Funding
                </h3>
                <p className="text-gray-400 mb-6">
                  Set the initial funding amounts and price for your pool. This establishes the starting price ratio.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      {poolConfig.tokenA.symbol || 'Asset A'} Amount
                    </label>
                    <input
                      type="number"
                      value={poolConfig.initialLiquidityA}
                      onChange={(e) => updatePoolConfig('initialLiquidityA', parseFloat(e.target.value))}
                      className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      {poolConfig.tokenB.symbol || 'Asset B'} Amount
                    </label>
                    <input
                      type="number"
                      value={poolConfig.initialLiquidityB}
                      onChange={(e) => updatePoolConfig('initialLiquidityB', parseFloat(e.target.value))}
                      className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500"
                    />
                  </div>
                </div>

                <div className="mt-4 bg-black/20 rounded-lg p-4">
                  <p className="text-sm text-gray-400">Initial Price:</p>
                  <p className="text-lg font-semibold text-white">
                    1 {poolConfig.tokenA.symbol || 'Asset A'} ={' '}
                    {poolConfig.initialLiquidityA > 0
                      ? (poolConfig.initialLiquidityB / poolConfig.initialLiquidityA).toFixed(6)
                      : '0'}{' '}
                    {poolConfig.tokenB.symbol || 'Asset B'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Review */}
          {step === 3 && (
            <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6">
              <h2 className="text-xl font-semibold text-white mb-6 flex items-center">
                <Shield className="w-5 h-5 mr-2" />
                Review Pool Configuration
              </h2>

              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h3 className="text-lg font-medium text-white mb-3">Token Pair</h3>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-gray-300">
                        <span>Asset A:</span>
                        <span>{poolConfig.tokenA.symbol || 'Unknown'}</span>
                      </div>
                      <div className="flex items-center justify-between text-gray-300">
                        <span>Asset B:</span>
                        <span>{poolConfig.tokenB.symbol || 'Unknown'}</span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-lg font-medium text-white mb-3">Pool Settings</h3>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-gray-300">
                        <span>Fee Tier:</span>
                        <span>{(poolConfig.fee / 100).toFixed(2)}%</span>
                      </div>
                      <div className="flex items-center justify-between text-gray-300">
                        <span>Initial Price:</span>
                        <span>
                          {poolConfig.initialLiquidityA > 0
                            ? (poolConfig.initialLiquidityB / poolConfig.initialLiquidityA).toFixed(6)
                            : '0'}{' '}
                          {poolConfig.tokenB.symbol}/{poolConfig.tokenA.symbol}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-medium text-white mb-3">Initial Funding</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-black/20 rounded-lg p-4">
                      <p className="text-sm text-gray-400">{poolConfig.tokenA.symbol} Amount</p>
                      <p className="text-lg font-semibold text-white">
                        {poolConfig.initialLiquidityA.toLocaleString()}
                      </p>
                    </div>
                    <div className="bg-black/20 rounded-lg p-4">
                      <p className="text-sm text-gray-400">{poolConfig.tokenB.symbol} Amount</p>
                      <p className="text-lg font-semibold text-white">
                        {poolConfig.initialLiquidityB.toLocaleString()}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Success/Error Messages */}
          {submitStatus === 'success' && createdPoolAddress && (
            <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-6">
              <h3 className="text-lg font-semibold text-green-400 mb-2">🎉 Trading Pool Successfully Created!</h3>
              <p className="text-gray-300 mb-4">Your trading pool is now active and ready for trading.</p>
              <div className="bg-black/20 rounded-lg p-4">
                <p className="text-sm text-gray-400 mb-2">Pool Address:</p>
                <p className="text-green-400 font-mono text-sm break-all">{createdPoolAddress}</p>
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  onClick={() => {
                    const params = new URLSearchParams({
                      pool: createdPoolAddress,
                      tokenA: poolConfig.tokenA.mint,
                      tokenB: poolConfig.tokenB.mint,
                      autoFill: 'true',
                    })
                    router.push(`/trade?${params.toString()}`)
                  }}
                  className="px-4 py-2 bg-gradient-to-b from-neutral-800 to-neutral-950 text-white rounded-lg hover:from-neutral-700 hover:to-neutral-900 transition-all"
                >
                  Start Trading
                </button>
                <button
                  onClick={() => {
                    const params = new URLSearchParams({
                      pool: createdPoolAddress,
                      autoFill: 'true',
                    })
                    router.push(`/add-liquidity?${params.toString()}`)
                  }}
                  className="px-4 py-2 border border-blue-500 text-blue-400 rounded-lg hover:bg-blue-500/10 transition-all"
                >
                  Add Liquidity
                </button>
                <button
                  onClick={() => navigator.clipboard.writeText(createdPoolAddress)}
                  className="px-4 py-2 border border-green-500 text-green-400 rounded-lg hover:bg-green-500/10 transition-all"
                >
                  Copy Address
                </button>
                <button
                  onClick={() => router.push('/onboard')}
                  className="px-4 py-2 border border-purple-500 text-purple-400 rounded-lg hover:bg-purple-500/10 transition-all"
                >
                  Continue Journey
                </button>
              </div>
            </div>
          )}

          {(error || submitStatus === 'error') && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-6">
              <h3 className="text-lg font-semibold text-red-400 mb-2">❌ Trading Pool Creation Failed</h3>
              <p className="text-gray-300 mb-2">There was an error creating your trading pool:</p>
              <p className="text-red-400 text-sm bg-black/20 rounded-lg p-4">{error || 'Unknown error occurred'}</p>
              <button
                onClick={() => {
                  clearError()
                  setSubmitStatus('idle')
                }}
                className="mt-4 px-4 py-2 border border-red-500 text-red-400 rounded-lg hover:bg-red-500/10 transition-all"
              >
                Try Again
              </button>
            </div>
          )}

          {/* Navigation Buttons */}
          <div className="flex justify-between">
            {step > 1 && (
              <button
                type="button"
                onClick={() => setStep(step - 1)}
                className="px-6 py-3 border border-white/20 text-white rounded-lg hover:bg-white/10 transition-all"
              >
                Previous
              </button>
            )}

            {step < 3 ? (
              <button
                type="button"
                onClick={() => {
                  // Validation before advancing to next step
                  if (step === 1) {
                    if (!poolConfig.tokenA.mint || !poolConfig.tokenB.mint) {
                      alert('Please select both Asset A and Asset B')
                      return
                    }
                    if (poolConfig.tokenA.mint === poolConfig.tokenB.mint) {
                      alert('Asset A and Asset B cannot be the same')
                      return
                    }
                  }
                  setStep(step + 1)
                }}
                disabled={step === 1 && (!poolConfig.tokenA.mint || !poolConfig.tokenB.mint)}
                className={`px-6 py-3 rounded-lg transition-all ml-auto ${
                  step === 1 && (!poolConfig.tokenA.mint || !poolConfig.tokenB.mint)
                    ? 'bg-gray-500 cursor-not-allowed'
                    : 'bg-gradient-to-b from-neutral-800 to-neutral-950 hover:from-neutral-700 hover:to-neutral-900'
                } text-white`}
              >
                Next
              </button>
            ) : (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault()
                  handleSubmit(e as any)
                }}
                disabled={!connected || submitStatus === 'submitting' || loading}
                className={`px-8 py-3 text-white rounded-lg transition-all ml-auto flex items-center ${
                  !connected || submitStatus === 'submitting' || loading
                    ? 'bg-gray-500 cursor-not-allowed'
                    : submitStatus === 'success'
                      ? 'bg-green-500 hover:bg-green-600'
                      : 'bg-gradient-to-b from-neutral-800 to-neutral-950 hover:from-neutral-700 hover:to-neutral-900'
                }`}
              >
                <Droplets className="w-5 h-5 mr-2" />
                {!connected
                  ? 'Connect Wallet First'
                  : submitStatus === 'submitting' || loading
                    ? 'Creating Trading Pool...'
                    : submitStatus === 'success'
                      ? 'Trading Pool Created!'
                      : 'Create Pool'}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}

export default function CreatePoolPage() {
  return (
    <Suspense fallback={<div />}>
      <CreatePoolPageInner />
    </Suspense>
  )
}
