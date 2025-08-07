'use client'

import { Suspense, useState, useEffect, useCallback } from 'react'
import { useRwaAmmSdk } from '@/hooks/useRwaAmmSdk'
import { PublicKey } from '@solana/web3.js'
import Header from '@/components/Header'
import KycStatusCard from '@/components/KycStatusCard'
import TransferHookIndicator, { SimpleTransferHookIndicator } from '@/components/TransferHookIndicator'
import ComplianceStatus from '@/components/ComplianceStatus'
import PoolSelector from '@/components/PoolSelector'
import { ArrowUpDown, Settings, Droplets, AlertTriangle, TrendingUp, Zap, ExternalLink } from 'lucide-react'
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

interface SwapConfig {
  inputToken: {
    mint: string
    symbol: string
    decimals: number
    balance: number
  }
  outputToken: {
    mint: string
    symbol: string
    decimals: number
    balance: number
  }
  inputAmount: number
  outputAmount: number
  slippage: number
  priceImpact: number
  selectedPool?: any
}

interface Pool {
  address: PublicKey
  tokenAMint: PublicKey
  tokenBMint: PublicKey
  liquidity: any
  sqrtPrice: any
  tokenAHasHook?: boolean
  tokenBHasHook?: boolean
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

const SLIPPAGE_PRESETS = [0.1, 0.5, 1.0, 3.0]

function TradePageInner() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { 
    sessionData, 
    markStepCompleted,
    getTokenByAddress,
    addNotification,
    updatePreferences,
    getSmartDefaults 
  } = useUserSession()

  // URL Parameters for auto-fill
  const prePoolAddress = searchParams?.get('pool')
  const preTokenA = searchParams?.get('tokenA')
  const preTokenB = searchParams?.get('tokenB')
  const autoFill = searchParams?.get('autoFill') === 'true'

  const { 
    swap, 
    getPoolQuote, 
    getAvailablePools,
    getPoolInfo,
    calculateMaxSwapAmount,
    getUserTokenBalance,
    getMintDecimals,
    checkTransferHookStatus,
    validateSwap,
    getUserKycStatus,
    loading, 
    error, 
    connected, 
    clearError 
  } = useRwaAmmSdk()
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle')
  const [transactionSignature, setTransactionSignature] = useState<string | null>(null)
  const [balanceRefreshing, setBalanceRefreshing] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showPoolSelector, setShowPoolSelector] = useState(false)
  const [availablePools, setAvailablePools] = useState<Pool[]>([])
  const [complianceStatus, setComplianceStatus] = useState<{ canTrade: boolean; reason?: string }>({ canTrade: false })
  const [storedTokens, setStoredTokens] = useState<StoredToken[]>([])
  const [priceRangeInfo, setPriceRangeInfo] = useState<{
    maxSafeAmount?: number
    priceRangeWarning?: boolean
    liquidityWarning?: boolean
    poolSize?: number
    isEstimate?: boolean
    error?: string
    currentPrice?: number
    minPrice?: number
    maxPrice?: number
  }>({})

  // Get smart defaults
  const smartDefaults = getSmartDefaults();

  const [swapConfig, setSwapConfig] = useState<SwapConfig>({
    inputToken: {
      mint: preTokenA || smartDefaults.suggestedTokenPair.tokenA || '',
      symbol: 'SOL',
      decimals: 9,
      balance: 0,
    },
    outputToken: {
      mint: preTokenB || smartDefaults.suggestedTokenPair.tokenB || '',
      symbol: 'USDC',
      decimals: 6,
      balance: 0,
    },
    inputAmount: 0,
    outputAmount: 0,
    slippage: smartDefaults.preferredSlippage,
    priceImpact: 0,
    selectedPool: null,
  })

  // Load stored tokens from session data
  useEffect(() => {
    setStoredTokens(sessionData.tokens)
  }, [sessionData.tokens])

  // Get real token balance from blockchain
  const getTokenBalance = useCallback(async (mint: string): Promise<number> => {
    if (!connected || !mint) return 0;
    
    try {
      const result = await getUserTokenBalance(mint);
      return result.balance;
    } catch (error) {
      console.error('Error fetching token balance:', error);
      return 0;
    }
  }, [connected, getUserTokenBalance]);

  // Helper function to set token config with real balance and decimals
  const setTokenWithBalance = useCallback(async (
    path: 'inputToken' | 'outputToken', 
    token: { mint: string; symbol: string; decimals?: number; name?: string }
  ) => {
    const mint = ('address' in token) ? (token as any).address : token.mint;
    updateSwapConfig(`${path}.mint`, mint);
    updateSwapConfig(`${path}.symbol`, token.symbol);
    updateSwapConfig(`${path}.balance`, 0); // Set to 0 initially
    
    if (connected && mint) {
      try {
        // Fetch real decimals from blockchain instead of using provided decimals
        const actualDecimals = await getMintDecimals(mint);
        updateSwapConfig(`${path}.decimals`, actualDecimals);
        console.log(`💱 Set ${token.symbol} decimals to ${actualDecimals} (from blockchain)`);
        
        // Fetch real balance asynchronously
        const balance = await getTokenBalance(mint);
        updateSwapConfig(`${path}.balance`, balance);
        console.log(`💰 Set ${token.symbol} balance to ${balance}`);
      } catch (error) {
        console.error('Error setting token balance/decimals:', error);
        // Fallback to provided decimals if available
        const fallbackDecimals = token.decimals || 6;
        updateSwapConfig(`${path}.decimals`, fallbackDecimals);
        updateSwapConfig(`${path}.balance`, 0);
        console.warn(`⚠️ Using fallback decimals (${fallbackDecimals}) for ${token.symbol}`);
      }
    } else {
      // Use provided decimals as fallback when not connected
      const fallbackDecimals = token.decimals || 6;
      updateSwapConfig(`${path}.decimals`, fallbackDecimals);
    }
  }, [connected, getTokenBalance, getMintDecimals]);

  // Auto-fill form based on URL parameters and user preferences
  useEffect(() => {
    if (autoFill && sessionData.preferences.autoFillForms) {
      // Auto-fill input token if specified
      if (preTokenA) {
        const tokenA = getTokenByAddress(preTokenA) || 
                      COMMON_TOKENS.find(t => t.mint === preTokenA);
        if (tokenA) {
          setTokenWithBalance('inputToken', {
            mint: ('address' in tokenA) ? tokenA.address : tokenA.mint,
            symbol: tokenA.symbol,
            decimals: tokenA.decimals
          });
        }
      }

      // Auto-fill output token if specified
      if (preTokenB) {
        const tokenB = getTokenByAddress(preTokenB) || 
                      COMMON_TOKENS.find(t => t.mint === preTokenB);
        if (tokenB) {
          setTokenWithBalance('outputToken', {
            mint: ('address' in tokenB) ? tokenB.address : tokenB.mint,
            symbol: tokenB.symbol,
            decimals: tokenB.decimals
          });
        }
      }

      // Use last used tokens if no specific tokens provided
      if (!preTokenA && !preTokenB && sessionData.preferences.preferredTokens.length > 0) {
        const lastInputToken = sessionData.preferences.preferredTokens[0];
        const lastOutputToken = sessionData.preferences.preferredTokens[1] || 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'; // USDC

        const inputToken = getTokenByAddress(lastInputToken) || COMMON_TOKENS.find(t => t.mint === lastInputToken);
        const outputToken = getTokenByAddress(lastOutputToken) || COMMON_TOKENS.find(t => t.mint === lastOutputToken);

        if (inputToken) {
          setTokenWithBalance('inputToken', {
            mint: ('address' in inputToken) ? inputToken.address : inputToken.mint,
            symbol: inputToken.symbol,
            decimals: inputToken.decimals
          });
        }

        if (outputToken) {
          setTokenWithBalance('outputToken', {
            mint: ('address' in outputToken) ? outputToken.address : outputToken.mint,
            symbol: outputToken.symbol,
            decimals: outputToken.decimals
          });
        }
      }
    }
  }, [autoFill, preTokenA, preTokenB, sessionData.preferences, getTokenByAddress, setTokenWithBalance])

  // Load available pools when connected
  useEffect(() => {
    async function loadPools() {
      if (!connected) return
      
      try {
        const pools = await getAvailablePools()
        setAvailablePools(pools)
      } catch (err) {
        console.error('Error loading pools:', err)
      }
    }

    loadPools()
  }, [connected, getAvailablePools])

  // Fetch pool data from URL parameter and auto-select tokens
  useEffect(() => {
    async function fetchPoolAndSetTokens() {
      if (!prePoolAddress || !connected) return
      
      try {
        const poolInfo = await getPoolInfo(prePoolAddress)
        if (poolInfo) {
          // Find token details for tokenAMint
          const tokenA = getTokenByAddress(poolInfo.tokenAMint.toString()) || 
                        COMMON_TOKENS.find(t => t.mint === poolInfo.tokenAMint.toString()) ||
                        storedTokens.find(t => t.address === poolInfo.tokenAMint.toString())
          
          // Find token details for tokenBMint  
          const tokenB = getTokenByAddress(poolInfo.tokenBMint.toString()) || 
                        COMMON_TOKENS.find(t => t.mint === poolInfo.tokenBMint.toString()) ||
                        storedTokens.find(t => t.address === poolInfo.tokenBMint.toString())

          if (tokenA) {
            setTokenWithBalance('inputToken', {
              mint: ('address' in tokenA) ? tokenA.address : tokenA.mint,
              symbol: tokenA.symbol,
              decimals: tokenA.decimals
            });
          }

          if (tokenB) {
            setTokenWithBalance('outputToken', {
              mint: ('address' in tokenB) ? tokenB.address : tokenB.mint,
              symbol: tokenB.symbol,
              decimals: tokenB.decimals
            });
          }

          // Set the pool as selected
          const poolData = {
            address: new PublicKey(prePoolAddress),
            tokenAMint: poolInfo.tokenAMint,
            tokenBMint: poolInfo.tokenBMint,
            liquidity: poolInfo.liquidity,
            sqrtPrice: null, // Will be populated by existing logic
          }
          setSwapConfig(prev => ({ ...prev, selectedPool: poolData }))

          console.log('Pool data fetched and tokens auto-selected:', {
            poolAddress: prePoolAddress,
            tokenA: poolInfo.tokenAMint.toString(),
            tokenB: poolInfo.tokenBMint.toString()
          })
        }
      } catch (err) {
        console.error('Error fetching pool data for auto-selection:', err)
      }
    }

    fetchPoolAndSetTokens()
  }, [prePoolAddress, connected, getPoolInfo, getTokenByAddress, storedTokens, setTokenWithBalance])

  // Auto-select pool based on token pair
  useEffect(() => {
    if (swapConfig.inputToken.mint && swapConfig.outputToken.mint && availablePools.length > 0) {
      const matchingPool = availablePools.find(pool => 
        (pool.tokenAMint.toString() === swapConfig.inputToken.mint && pool.tokenBMint.toString() === swapConfig.outputToken.mint) ||
        (pool.tokenBMint.toString() === swapConfig.inputToken.mint && pool.tokenAMint.toString() === swapConfig.outputToken.mint)
      )
      
      if (matchingPool && !swapConfig.selectedPool) {
        updateSwapConfig('selectedPool', matchingPool)
      }
    }
  }, [swapConfig.inputToken.mint, swapConfig.outputToken.mint, availablePools])

  const updateSwapConfig = (path: string, value: any) => {
    setSwapConfig((prev) => {
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

  // Enhanced swap calculation using real pool data
  const calculateOutput = async (inputAmount: number) => {
    if (inputAmount <= 0) {
      updateSwapConfig('outputAmount', 0)
      updateSwapConfig('priceImpact', 0)
      return
    }

    try {
      // Use selected pool if available
      const poolAddress = swapConfig.selectedPool?.address?.toString()
      const inputMint = swapConfig.inputToken.mint
      const outputMint = swapConfig.outputToken.mint

      let quote
      if (poolAddress && inputMint && outputMint) {
        quote = await getPoolQuote(inputMint, outputMint, inputAmount, poolAddress)
      } else {
        // Fallback to token symbols for common tokens
        quote = await getPoolQuote(swapConfig.inputToken.symbol, swapConfig.outputToken.symbol, inputAmount)
      }

      updateSwapConfig('outputAmount', quote.outputAmount)
      updateSwapConfig('priceImpact', quote.priceImpact)

      // Update price range info if available with enhanced liquidity warnings
      if ('maxSafeAmount' in quote || 'priceRangeWarning' in quote || 'liquidityWarning' in quote) {
        setPriceRangeInfo({
          maxSafeAmount: (quote as any).maxSafeAmount,
          priceRangeWarning: (quote as any).priceRangeWarning,
          liquidityWarning: (quote as any).liquidityWarning,
          poolSize: (quote as any).poolSize,
          isEstimate: (quote as any).isEstimate,
          error: (quote as any).error
        })
      }
    } catch (err) {
      console.error('Error calculating output:', err)
      // Fallback to simple calculation
      const mockRate = swapConfig.inputToken.symbol === 'SOL' ? 100 : 0.01
      const outputAmount = inputAmount * mockRate
      const priceImpact = Math.min(inputAmount * 0.001, 5)

      updateSwapConfig('outputAmount', outputAmount)
      updateSwapConfig('priceImpact', priceImpact)
    }
  }

  const handleInputAmountChange = (amount: number) => {
    updateSwapConfig('inputAmount', amount)
    if (amount > 0) {
      calculateOutput(amount) // Now async, will update state when complete
    } else {
      updateSwapConfig('outputAmount', 0)
      updateSwapConfig('priceImpact', 0)
    }
  }

  const handleTokenSwitch = () => {
    const tempToken = swapConfig.inputToken
    updateSwapConfig('inputToken', swapConfig.outputToken)
    updateSwapConfig('outputToken', tempToken)

    // Only recalculate if there's an input amount
    if (swapConfig.inputAmount > 0) {
      calculateOutput(swapConfig.inputAmount) // Now async
    }
  }

  // Combine common tokens with stored tokens for selection
  const allAvailableTokens = [
    ...COMMON_TOKENS,
    ...storedTokens.map((token) => ({
      mint: token.address,
      symbol: token.symbol,
      decimals: token.decimals,
      name: token.name,
      isCustom: true,
      hasTransferHook: token.hasTransferHook,
      hasKyc: token.hasKyc,
    })),
  ]

  const selectToken = (token: (typeof COMMON_TOKENS)[0], side: 'input' | 'output') => {
    const path = side === 'input' ? 'inputToken' : 'outputToken'
    
    // Use the helper function to set token with real balance
    setTokenWithBalance(path, {
      mint: token.mint,
      symbol: token.symbol,
      decimals: token.decimals
    });

    // Save to preferred tokens for future auto-fill
    const newPreferredTokens = [token.mint, ...sessionData.preferences.preferredTokens.filter(t => t !== token.mint)].slice(0, 5);
    updatePreferences({
      preferredTokens: newPreferredTokens
    });

    // Only recalculate if there's an input amount and we're changing the input token
    if (side === 'input' && swapConfig.inputAmount > 0) {
      calculateOutput(swapConfig.inputAmount) // Now async
    }
  }

  const handleSwap = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!connected) {
      alert('Please connect your wallet first')
      return
    }

    if (swapConfig.inputAmount <= 0) {
      alert('Please enter a valid amount')
      return
    }

    // Enhanced validation for minimum viable swap amounts using actual decimals
    const [inputTokenDecimals, outputTokenDecimals] = await Promise.all([
      getMintDecimals(swapConfig.inputToken.mint),
      getMintDecimals(swapConfig.outputToken.mint)
    ])
    
    const inputAmountInSmallestUnits = swapConfig.inputAmount * Math.pow(10, inputTokenDecimals)
    const minViableAmount = 1 / Math.pow(10, inputTokenDecimals)
    
    console.log(`🔢 Swap validation using actual decimals: ${swapConfig.inputToken.symbol}=${inputTokenDecimals}, ${swapConfig.outputToken.symbol}=${outputTokenDecimals}`)
    console.log(`📊 Amount conversion: ${swapConfig.inputAmount} × 10^${inputTokenDecimals} = ${inputAmountInSmallestUnits}`)
    
    if (inputAmountInSmallestUnits < 1) {
      alert(`Amount too small. Minimum amount is ${minViableAmount} ${swapConfig.inputToken.symbol}`)
      return
    }

    // Check for pool liquidity issues before attempting swap
    if (swapConfig.priceImpact > 50) {
      const confirmed = window.confirm(
        `⚠️ WARNING: This swap will cause ${swapConfig.priceImpact.toFixed(1)}% price impact due to low pool liquidity.\n\n` +
        `This may result in significant slippage or transaction failure.\n\n` +
        `Consider:\n• Adding more liquidity to the pool first\n• Reducing the swap amount\n• Increasing slippage tolerance\n\n` +
        `Do you want to continue anyway?`
      )
      if (!confirmed) return
    }

    // Validate sufficient pool liquidity exists
    if (swapConfig.selectedPool && swapConfig.inputAmount > 0) {
      try {
        const poolInfo = await getPoolInfo(swapConfig.selectedPool.address.toString())
        if (poolInfo) {
          // Rough estimation - this could be more precise with actual vault balances
          const estimatedPoolSize = Number(poolInfo.liquidity?.toString() || '0')
          if (estimatedPoolSize < inputAmountInSmallestUnits * 10) {
            alert(
              `⚠️ Pool Liquidity Warning\n\n` +
              `This pool may have insufficient liquidity for your swap size.\n\n` +
              `Try:\n• Reducing swap amount\n• Adding liquidity to the pool first\n• Using a different pool if available`
            )
            return
          }
        }
      } catch (error) {
        console.warn('Could not validate pool liquidity:', error)
        // Continue with swap attempt
      }
    }

    setSubmitStatus('submitting')
    clearError()

    try {
      console.log('Executing swap:', swapConfig)

      // Validate we have a pool to trade with
      const poolAddress = swapConfig.selectedPool?.address || 
                         (prePoolAddress ? new PublicKey(prePoolAddress) : null)
      
      if (!poolAddress) {
        throw new Error('No pool selected for this token pair. Please select a pool or create one.')
      }

      // Validate compliance before executing
      if (!complianceStatus.canTrade) {
        throw new Error(complianceStatus.reason || 'Compliance validation failed')
      }

      // Convert UI amounts to smallest token units using actual decimals from blockchain
      const actualInputAmountInSmallestUnits = swapConfig.inputAmount * Math.pow(10, inputTokenDecimals)
      const minOutputAmountInSmallestUnits = (swapConfig.outputAmount * (1 - swapConfig.slippage / 100)) * Math.pow(10, outputTokenDecimals)
      
      console.log(`💱 Final swap amounts with actual decimals:`)
      console.log(`  Input: ${swapConfig.inputAmount} ${swapConfig.inputToken.symbol} × 10^${inputTokenDecimals} = ${actualInputAmountInSmallestUnits}`)
      console.log(`  Min Output: ${swapConfig.outputAmount * (1 - swapConfig.slippage / 100)} ${swapConfig.outputToken.symbol} × 10^${outputTokenDecimals} = ${minOutputAmountInSmallestUnits}`)

      const swapParams = {
        poolAddress,
        inputMint: new PublicKey(swapConfig.inputToken.mint || 'So11111111111111111111111111111111111111112'),
        outputMint: new PublicKey(swapConfig.outputToken.mint || 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'),
        inputAmount: actualInputAmountInSmallestUnits,
        minOutputAmount: minOutputAmountInSmallestUnits,
      }

      const signature = await swap(swapParams)
      setTransactionSignature(signature)
      setSubmitStatus('success')

      // Mark swap step as completed and update preferences
      markStepCompleted(7); // Swap execution step
      
      // Update last used pool
      if (swapConfig.selectedPool) {
        updatePreferences({
          lastUsedPools: [
            swapConfig.selectedPool.address.toString(),
            ...sessionData.preferences.lastUsedPools.filter(p => p !== swapConfig.selectedPool.address.toString())
          ].slice(0, 3)
        });
      }

      // Add success notification
      addNotification({
        type: 'success',
        title: 'Trade Executed Successfully!',
        message: `Swapped ${swapConfig.inputAmount} ${swapConfig.inputToken.symbol} for ${swapConfig.outputAmount.toFixed(6)} ${swapConfig.outputToken.symbol}`,
        action: {
          label: 'View Transaction',
          href: `https://explorer.solana.com/tx/${signature}?cluster=custom&customUrl=http%3A%2F%2Flocalhost%3A8899`
        }
      });

      console.log('Swap successful:', signature)

      // Reset amounts
      updateSwapConfig('inputAmount', 0)
      updateSwapConfig('outputAmount', 0)

      // Refresh token balances after successful swap - with proper async handling
      try {
        setBalanceRefreshing(true)
        console.log('🔄 Refreshing balances after swap...')
        
        const balancePromises = []
        
        if (swapConfig.inputToken.mint) {
          balancePromises.push(
            getTokenBalance(swapConfig.inputToken.mint).then(balance => {
              console.log(`💰 Updated ${swapConfig.inputToken.symbol} balance:`, balance)
              updateSwapConfig('inputToken.balance', balance)
              return balance
            })
          )
        }
        
        if (swapConfig.outputToken.mint) {
          balancePromises.push(
            getTokenBalance(swapConfig.outputToken.mint).then(balance => {
              console.log(`💰 Updated ${swapConfig.outputToken.symbol} balance:`, balance)
              updateSwapConfig('outputToken.balance', balance)
              return balance
            })
          )
        }

        // Wait for all balance updates to complete
        await Promise.all(balancePromises)
        console.log('✅ All balances refreshed successfully after swap')
        
      } catch (balanceError) {
        console.error('⚠️ Error refreshing balances after swap:', balanceError)
        // Don't fail the whole operation if balance refresh fails
      } finally {
        setBalanceRefreshing(false)
      }
    } catch (err) {
      console.error('Swap failed:', err)
      setSubmitStatus('error')
    }
  }

  const handleComplianceChange = useCallback((canTrade: boolean, reason?: string) => {
    setComplianceStatus({ canTrade, reason })
  }, [])

  // Debounce the input amount for compliance checking to avoid excessive re-renders
  const [debouncedInputAmount, setDebouncedInputAmount] = useState(swapConfig.inputAmount)

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedInputAmount(swapConfig.inputAmount)
    }, 500) // 500ms debounce delay

    return () => clearTimeout(timer)
  }, [swapConfig.inputAmount])

  return (
    <div className="min-h-screen bg-gradient-to-b from-neutral-900 to-neutral-950">
      <Header />

      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Trading Card */}
        <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-white flex items-center">
              <TrendingUp className="w-5 h-5 mr-2" />
              Trade Assets
            </h2>
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="p-2 text-gray-400 hover:text-white transition-colors"
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>

          {/* Settings Panel */}
          {showSettings && (
            <div className="bg-black/20 rounded-lg p-4 mb-6">
              <h3 className="text-lg font-medium text-white mb-3">Trade Settings</h3>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Slippage Tolerance</label>
                <div className="flex space-x-2">
                  {SLIPPAGE_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      onClick={() => updateSwapConfig('slippage', preset)}
                      className={`px-3 py-2 rounded-lg text-sm transition-all ${
                        swapConfig.slippage === preset
                          ? 'bg-gradient-to-b from-neutral-800 to-neutral-950 text-white'
                          : 'bg-white/10 text-gray-300 hover:bg-white/20'
                      }`}
                    >
                      {preset}%
                    </button>
                  ))}
                  <div className="flex items-center">
                    <input
                      type="number"
                      step="0.1"
                      value={swapConfig.slippage}
                      onChange={(e) => updateSwapConfig('slippage', parseFloat(e.target.value))}
                      className="w-16 bg-white/10 border border-white/20 rounded-lg px-2 py-1 text-white text-sm"
                    />
                    <span className="ml-1 text-gray-400">%</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          <form onSubmit={handleSwap} className="space-y-4">
            {/* Input Token */}
            <div className="bg-black/20 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <label className="text-sm font-medium text-gray-400">Sell</label>
                <span className="text-sm text-gray-400 flex items-center gap-1">
                  Balance: {swapConfig.inputToken.balance.toFixed(Math.min(4, swapConfig.inputToken.decimals))}
                  {balanceRefreshing && <span className="animate-spin">⟳</span>}
                </span>
              </div>

              <div className="flex items-center space-x-3">
                <div className="flex-1">
                  <input
                    type="number"
                    step={Math.pow(10, -Math.min(6, swapConfig.inputToken.decimals)).toString()}
                    value={swapConfig.inputAmount || ''}
                    onChange={(e) => handleInputAmountChange(parseFloat(e.target.value) || 0)}
                    placeholder="0.0"
                    className="w-full bg-transparent text-2xl font-semibold text-white placeholder-gray-500 focus:outline-none"
                  />
                </div>

                <div className="flex items-center space-x-2">
                  <div className="w-8 h-8 bg-gray-600 rounded-full"></div>
                  <div className="flex items-center space-x-2">
                    <p className="font-semibold text-white">{swapConfig.inputToken.symbol}</p>
                    {swapConfig.inputToken.mint && (
                      <SimpleTransferHookIndicator 
                        mintAddress={swapConfig.inputToken.mint}
                        size="sm"
                      />
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-3 space-y-2">
                <div className="flex flex-wrap gap-2">
                  {allAvailableTokens.slice(0, 6).map((token) => (
                    <button
                      key={token.mint}
                      type="button"
                      onClick={() => selectToken(token, 'input')}
                      className={`px-2 py-1 rounded text-xs transition-all flex items-center space-x-1 ${
                        swapConfig.inputToken.symbol === token.symbol
                          ? 'bg-gradient-to-b from-neutral-800 to-neutral-950 text-white'
                          : 'bg-white/10 text-gray-300 hover:bg-white/20'
                      }`}
                    >
                      <span>{token.symbol}</span>
                      {(token as any).isCustom && (token as any).hasTransferHook && (
                        <span className="w-1.5 h-1.5 bg-blue-400 rounded-full" title="Has Transfer Hook" />
                      )}
                    </button>
                  ))}
                  {storedTokens.length > 0 && (
                    <span className="text-xs text-gray-500 px-2 py-1">
                      {storedTokens.length} custom token{storedTokens.length > 1 ? 's' : ''}
                    </span>
                  )}
                </div>
                
                {/* Smart Amount Suggestions */}
                {swapConfig.inputToken.mint && (
                  <div className="flex items-center space-x-2">
                    <span className="text-xs text-gray-500">Quick amounts:</span>
                    {Object.entries(smartDefaults.suggestedAmounts).map(([size, amount]) => (
                      <button
                        key={size}
                        type="button"
                        onClick={() => handleInputAmountChange(amount)}
                        className="px-2 py-1 rounded text-xs bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition-all"
                      >
                        {amount} {swapConfig.inputToken.symbol}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Swap Button */}
            <div className="flex justify-center">
              <button
                type="button"
                onClick={handleTokenSwitch}
                className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-all"
              >
                <ArrowUpDown className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            {/* Output Token */}
            <div className="bg-black/20 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <label className="text-sm font-medium text-gray-400">Buy</label>
                <span className="text-sm text-gray-400 flex items-center gap-1">
                  Balance: {swapConfig.outputToken.balance.toFixed(Math.min(4, swapConfig.outputToken.decimals))}
                  {balanceRefreshing && <span className="animate-spin">⟳</span>}
                </span>
              </div>

              <div className="flex items-center space-x-3">
                <div className="flex-1">
                  <input
                    type="number"
                    value={swapConfig.outputAmount.toFixed(6)}
                    readOnly
                    placeholder="0.0"
                    className="w-full bg-transparent text-2xl font-semibold text-white placeholder-gray-500 focus:outline-none"
                  />
                </div>

                <div className="flex items-center space-x-2">
                  <div className="w-8 h-8 bg-gray-500 rounded-full"></div>
                  <div className="flex items-center space-x-2">
                    <p className="font-semibold text-white">{swapConfig.outputToken.symbol}</p>
                    {swapConfig.outputToken.mint && (
                      <SimpleTransferHookIndicator 
                        mintAddress={swapConfig.outputToken.mint}
                        size="sm"
                      />
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {allAvailableTokens.slice(0, 6).map((token) => (
                  <button
                    key={token.mint}
                    type="button"
                    onClick={() => selectToken(token, 'output')}
                    className={`px-2 py-1 rounded text-xs transition-all flex items-center space-x-1 ${
                      swapConfig.outputToken.symbol === token.symbol
                        ? 'bg-gradient-to-b from-neutral-800 to-neutral-950 text-white'
                        : 'bg-white/10 text-gray-300 hover:bg-white/20'
                    }`}
                  >
                    <span>{token.symbol}</span>
                    {(token as any).isCustom && (token as any).hasTransferHook && (
                      <span className="w-1.5 h-1.5 bg-blue-400 rounded-full" title="Has Transfer Hook" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Selected Pool Info */}
            {swapConfig.selectedPool && (
              <div className="bg-black/20 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-400">Trading via Pool</span>
                  <button
                    onClick={() => setShowPoolSelector(true)}
                    className="text-blue-400 hover:text-blue-300 text-sm flex items-center space-x-1"
                  >
                    <span>Change Pool</span>
                    <ExternalLink className="w-3 h-3" />
                  </button>
                </div>
                <div className="text-sm text-gray-300 font-mono">
                  {swapConfig.selectedPool.address.toString().slice(0, 8)}...
                  {swapConfig.selectedPool.address.toString().slice(-8)}
                </div>
                {(swapConfig.selectedPool.tokenAHasHook || swapConfig.selectedPool.tokenBHasHook) && (
                  <div className="mt-2 flex items-center space-x-2">
                    <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                    <span className="text-xs text-blue-400">RWA Compliance Pool</span>
                  </div>
                )}
              </div>
            )}

            {/* Pool Selector Modal */}
            {showPoolSelector && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
                  <div className="p-4 border-b border-gray-200 flex items-center justify-between">
                    <h3 className="text-lg font-semibold">Select Trading Pool</h3>
                    <button
                      onClick={() => setShowPoolSelector(false)}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      ✕
                    </button>
                  </div>
                  <PoolSelector
                    onPoolSelect={(pool) => {
                      updateSwapConfig('selectedPool', pool)
                      setShowPoolSelector(false)
                    }}
                    selectedPool={swapConfig.selectedPool}
                    inputToken={swapConfig.inputToken.mint}
                    outputToken={swapConfig.outputToken.mint}
                  />
                </div>
              </div>
            )}

            {/* Compliance Status */}
            {(swapConfig.inputToken.mint || swapConfig.outputToken.mint) && (
              <ComplianceStatus
                inputMint={swapConfig.inputToken.mint}
                outputMint={swapConfig.outputToken.mint}
                amount={debouncedInputAmount}
                onComplianceChange={handleComplianceChange}
                showDetails={false}
              />
            )}

            {/* Trade Info */}
            {swapConfig.inputAmount > 0 && (
              <div className="bg-black/20 rounded-lg p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Market Impact</span>
                  <span className={`${swapConfig.priceImpact > 3 ? 'text-red-400' : 'text-gray-300'}`}>
                    {swapConfig.priceImpact.toFixed(2)}%
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">You'll Get At Least</span>
                  <span className="text-gray-300">
                    {(swapConfig.outputAmount * (1 - swapConfig.slippage / 100)).toFixed(6)}{' '}
                    {swapConfig.outputToken.symbol}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Transaction Fee</span>
                  <span className="text-gray-300">~0.0001 SOL</span>
                </div>
                {swapConfig.selectedPool && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Pool</span>
                    <span className="text-gray-300 font-mono text-xs">
                      {swapConfig.selectedPool.address.toString().slice(0, 6)}...
                      {swapConfig.selectedPool.address.toString().slice(-6)}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Price Impact Warning */}
            {swapConfig.priceImpact > 3 && (
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 flex items-center space-x-2">
                <AlertTriangle className="w-5 h-5 text-yellow-400 flex-shrink-0" />
                <p className="text-yellow-400 text-sm">
                  High market impact. You may receive significantly less than expected.
                </p>
              </div>
            )}

            {/* Liquidity Warning */}
            {priceRangeInfo.liquidityWarning && (
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 flex items-center space-x-2">
                <AlertTriangle className="w-5 h-5 text-yellow-400 flex-shrink-0" />
                <div className="text-yellow-400 text-sm flex-1">
                  <p className="font-medium">⚠️ Pool Liquidity Warning</p>
                  <p>This swap may cause high price impact due to limited pool liquidity.</p>
                  {priceRangeInfo.maxSafeAmount && (
                    <p>Recommended max amount: <span className="font-mono">{priceRangeInfo.maxSafeAmount.toFixed(6)} {swapConfig.inputToken.symbol}</span></p>
                  )}
                  {priceRangeInfo.poolSize !== undefined && priceRangeInfo.poolSize > 0 && (
                    <p className="text-xs opacity-75 mt-1">Pool liquidity: ~{(priceRangeInfo.poolSize / 1e9).toFixed(2)} tokens</p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-2">
                    {priceRangeInfo.maxSafeAmount && (
                      <button
                        type="button"
                        onClick={() => handleInputAmountChange(priceRangeInfo.maxSafeAmount!)}
                        className="px-2 py-1 text-xs bg-yellow-500/20 text-yellow-300 rounded hover:bg-yellow-500/30 transition-all"
                      >
                        Use Safe Amount ({priceRangeInfo.maxSafeAmount.toFixed(3)})
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        const params = new URLSearchParams({
                          tokenA: swapConfig.inputToken.mint,
                          tokenB: swapConfig.outputToken.mint,
                        })
                        window.location.href = `/add-liquidity?${params.toString()}`
                      }}
                      className="px-2 py-1 text-xs bg-blue-500/20 text-blue-300 rounded hover:bg-blue-500/30 transition-all"
                    >
                      Add Liquidity
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Price Range Warning */}
            {priceRangeInfo.priceRangeWarning && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 flex items-center space-x-2">
                <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />
                <div className="text-red-400 text-sm flex-1">
                  <p className="font-medium">Amount exceeds price range limits</p>
                  <p>Maximum safe amount: {priceRangeInfo.maxSafeAmount?.toFixed(6)} {swapConfig.inputToken.symbol}</p>
                  <p>Larger amounts would move the pool price outside allowed bounds.</p>
                </div>
              </div>
            )}

            {/* Quote Error Warning */}
            {priceRangeInfo.error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 flex items-center space-x-2">
                <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />
                <div className="text-red-400 text-sm flex-1">
                  <p className="font-medium">Quote Error</p>
                  <p>{priceRangeInfo.error}</p>
                  <p className="text-xs mt-1">Please check pool availability or try a different amount.</p>
                </div>
              </div>
            )}

            {/* Estimate Notice */}
            {priceRangeInfo.isEstimate && !priceRangeInfo.error && (
              <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 flex items-center space-x-2">
                <div className="w-5 h-5 text-blue-400 flex-shrink-0 text-center">ℹ️</div>
                <div className="text-blue-400 text-sm flex-1">
                  <p className="font-medium">Estimated Quote</p>
                  <p>This is an estimated price. Actual swap results may vary based on pool conditions.</p>
                </div>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={!connected || submitStatus === 'submitting' || loading || swapConfig.inputAmount <= 0 || !complianceStatus.canTrade || !swapConfig.selectedPool}
              className={`w-full py-4 text-white rounded-xl transition-all font-semibold ${
                !connected || submitStatus === 'submitting' || loading || swapConfig.inputAmount <= 0 || !complianceStatus.canTrade || !swapConfig.selectedPool
                  ? 'bg-gray-500 cursor-not-allowed'
                  : submitStatus === 'success'
                    ? 'bg-green-500 hover:bg-green-600'
                    : 'bg-gradient-to-b from-neutral-800 to-neutral-950 hover:from-neutral-700 hover:to-neutral-900'
              }`}
            >
              {!connected
                ? 'Connect Wallet'
                : swapConfig.inputAmount <= 0
                  ? 'Enter an amount'
                  : !swapConfig.selectedPool
                    ? 'No pool available - Create one?'
                  : !complianceStatus.canTrade
                    ? complianceStatus.reason || 'Compliance check required'
                  : submitStatus === 'submitting' || loading
                    ? 'Executing Trade...'
                    : submitStatus === 'success'
                      ? 'Trade Successful!'
                      : (swapConfig.selectedPool?.tokenAHasHook || swapConfig.selectedPool?.tokenBHasHook)
                        ? `Trade RWA Tokens (Compliant)`
                        : `Trade ${swapConfig.inputToken.symbol} for ${swapConfig.outputToken.symbol}`}
            </button>

            {/* Pool Creation CTA */}
            {!swapConfig.selectedPool && swapConfig.inputToken.mint && swapConfig.outputToken.mint && !loading && (
              <div className="mt-4 bg-blue-500/10 border border-blue-500/30 rounded-lg p-4 text-center">
                <p className="text-blue-400 mb-3">No pool exists for this token pair</p>
                <button
                  onClick={() => {
                    const params = new URLSearchParams({
                      tokenA: swapConfig.inputToken.mint,
                      tokenB: swapConfig.outputToken.mint,
                    })
                    window.location.href = `/create-pool?${params.toString()}`
                  }}
                  className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-medium"
                >
                  Create Pool for This Pair
                </button>
              </div>
            )}
          </form>
        </div>

        {/* KYC Status Card */}
        <KycStatusCard />

        {/* Success Message */}
        {submitStatus === 'success' && transactionSignature && (
          <div className="mt-6 bg-green-500/10 border border-green-500/30 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-green-400 mb-2">🎉 Trade Successful!</h3>
            <p className="text-gray-300 mb-4">Your assets have been traded successfully with compliance validation.</p>
            <div className="bg-black/20 rounded-lg p-4">
              <p className="text-sm text-gray-400 mb-2">Trade Confirmation:</p>
              <p className="text-green-400 font-mono text-sm break-all">{transactionSignature}</p>
            </div>
            <div className="mt-4 flex space-x-4">
              <button
                onClick={() =>
                  window.open(
                    `https://explorer.solana.com/tx/${transactionSignature}?cluster=custom&customUrl=http%3A%2F%2Flocalhost%3A8899`,
                    '_blank',
                  )
                }
                className="px-4 py-2 bg-gradient-to-b from-neutral-800 to-neutral-950 text-white rounded-lg hover:from-neutral-700 hover:to-neutral-900 transition-all"
              >
                View on Explorer
              </button>
              <button
                onClick={() => navigator.clipboard.writeText(transactionSignature)}
                className="px-4 py-2 border border-green-500 text-green-400 rounded-lg hover:bg-green-500/10 transition-all"
              >
                Copy Confirmation
              </button>
            </div>
          </div>
        )}

        {/* Error Message */}
        {(error || submitStatus === 'error') && (
          <div className="mt-6 bg-red-500/10 border border-red-500/30 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-red-400 mb-2">❌ Trade Failed</h3>
            <p className="text-gray-300 mb-2">There was an error processing your trade:</p>
            <div className="bg-black/20 rounded-lg p-4 mb-4">
              <p className="text-red-400 text-sm">{error || 'Unknown error occurred'}</p>
            </div>

            {/* Common error solutions */}
            <div className="text-sm text-gray-300 space-y-2">
              <p className="font-medium">Common solutions:</p>
              <ul className="list-disc list-inside space-y-1 text-xs text-gray-400">
                <li>Check your wallet balance for sufficient tokens and SOL for gas</li>
                <li>Ensure your KYC status meets the token's compliance requirements</li>
                <li>Try reducing the trade size or increasing slippage tolerance</li>
                <li>Verify you're in an allowed geographic region for these tokens</li>
                <li>Check if trading is within allowed hours for regulated tokens</li>
              </ul>
            </div>

            <div className="flex space-x-3 mt-4">
              <button
                onClick={() => {
                  clearError()
                  setSubmitStatus('idle')
                }}
                className="px-4 py-2 border border-red-500 text-red-400 rounded-lg hover:bg-red-500/10 transition-all"
              >
                Try Again
              </button>
              <button
                onClick={() => window.open('https://docs.anthropic.com/claude-code', '_blank')}
                className="px-4 py-2 bg-gray-600 text-gray-300 rounded-lg hover:bg-gray-700 transition-all"
              >
                View Documentation
              </button>
            </div>
          </div>
        )}

        {/* Token Management Info */}
        {storedTokens.length === 0 && (
          <div className="mt-6 bg-purple-500/10 border border-purple-500/30 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-purple-400 mb-2">Need Custom RWA Tokens?</h3>
            <p className="text-gray-300 mb-4">
              Create your own RWA tokens with compliance features for testing. Tokens you create will automatically
              appear in the dropdown above.
            </p>
            <button
              onClick={() => (window.location.href = '/mint-tokens')}
              className="px-4 py-2 bg-gradient-to-b from-neutral-800 to-neutral-950 text-white rounded-lg hover:from-neutral-700 hover:to-neutral-900 transition-all"
            >
              Create RWA Tokens
            </button>
          </div>
        )}

        {/* Smart Recommendations */}
        {(sessionData.tokens.length > 0 || sessionData.pools.length > 0) && (
          <div className="mt-6 bg-purple-500/10 border border-purple-500/30 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-purple-400 mb-4 flex items-center">
              <Zap className="w-5 h-5 mr-2" />
              Smart Recommendations
            </h3>
            <div className="space-y-3 text-sm">
              {smartDefaults.suggestedTokenPair.tokenA && (
                <div className="flex items-center justify-between bg-black/20 rounded-lg p-3">
                  <span className="text-gray-300">Suggested trade pair:</span>
                  <button
                    onClick={() => {
                      const tokenA = getTokenByAddress(smartDefaults.suggestedTokenPair.tokenA!);
                      const tokenB = getTokenByAddress(smartDefaults.suggestedTokenPair.tokenB!) || 
                                   allAvailableTokens.find(t => t.mint === smartDefaults.suggestedTokenPair.tokenB);
                      if (tokenA) selectToken({
                        mint: ('address' in tokenA) ? (tokenA as any).address : (tokenA as any).mint,
                        symbol: (tokenA as any).symbol,
                        decimals: (tokenA as any).decimals,
                        name: (tokenA as any).name
                      }, 'input');
                      if (tokenB) selectToken({
                        mint: ('address' in tokenB) ? (tokenB as any).address : (tokenB as any).mint,
                        symbol: (tokenB as any).symbol,
                        decimals: (tokenB as any).decimals,
                        name: (tokenB as any).name
                      }, 'output');
                    }}
                    className="px-3 py-1 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-all"
                  >
                    Use Suggested Pair
                  </button>
                </div>
              )}
              
              {sessionData.userKyc.level && sessionData.userKyc.level < smartDefaults.suggestedKycLevel && (
                <div className="flex items-center justify-between bg-yellow-500/10 rounded-lg p-3">
                  <span className="text-gray-300">
                    Consider upgrading to KYC Level {smartDefaults.suggestedKycLevel} for {smartDefaults.recommendedAssetClass} trading
                  </span>
                  <button
                    onClick={() => router.push('/kyc')}
                    className="px-3 py-1 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 transition-all"
                  >
                    Upgrade KYC
                  </button>
                </div>
              )}
              
              {sessionData.preferences.preferredTokens.length === 0 && sessionData.tokens.length > 0 && (
                <div className="flex items-center justify-between bg-blue-500/10 rounded-lg p-3">
                  <span className="text-gray-300">Start trading to build your preferences</span>
                  <span className="text-blue-400 text-xs">Tip: Your choices are saved for faster trading</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* RWA Compliance Info */}
        <div className="mt-6 bg-blue-500/10 border border-blue-500/30 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-blue-400 mb-2 flex items-center">
            <Droplets className="w-5 h-5 mr-2" />
            RWA Compliance Features
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-300">
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-green-400 rounded-full"></div>
              <span>KYC/AML Validation</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-green-400 rounded-full"></div>
              <span>Geographic Compliance</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-green-400 rounded-full"></div>
              <span>Trading Hours Check</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-green-400 rounded-full"></div>
              <span>Amount Limits</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-green-400 rounded-full"></div>
              <span>Trade Logging</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-green-400 rounded-full"></div>
              <span>Automated Compliance</span>
            </div>
          </div>
          <p className="mt-3 text-sm text-gray-400">
            All trades are automatically validated through our compliance system to ensure regulatory requirements.
          </p>
        </div>
      </div>
    </div>
  )
}

export default function TradePage() {
  return (
    <Suspense fallback={<div />}>
      <TradePageInner />
    </Suspense>
  )
}
