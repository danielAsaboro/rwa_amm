'use client'

import { Suspense, useState, useEffect, useCallback, useMemo } from 'react'
import { useRwaAmmSdk } from '@/hooks/useRwaAmmSdk'
import { useConnection } from '@solana/wallet-adapter-react'
import { PublicKey } from '@solana/web3.js'
import Header from '@/components/Header'
import KycStatusCard from '@/components/KycStatusCard'
import TransferHookIndicator, { SimpleTransferHookIndicator } from '@/components/TransferHookIndicator'
import ComplianceStatus from '@/components/ComplianceStatus'
import PoolSelector from '@/components/PoolSelector'
import { Droplets, Settings, AlertTriangle, TrendingUp, Zap, ExternalLink, Plus } from 'lucide-react'
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

interface LiquidityConfig {
  selectedPool?: any
  tokenA: {
    mint: string
    symbol: string
    decimals: number
    balance: number
    amount: number
  }
  tokenB: {
    mint: string
    symbol: string
    decimals: number
    balance: number
    amount: number
  }
  slippage: number
  priceImpact: number
  liquidityAmount: number
}

interface Pool {
  address: PublicKey
  tokenAMint: PublicKey
  tokenBMint: PublicKey
  liquidity: any
  sqrtPrice: any
  tokenAHasHook?: boolean
  tokenBHasHook?: boolean
  tokenASymbol?: string
  tokenBSymbol?: string
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

function AddLiquidityPageInner() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { 
    sessionData, 
    markStepCompleted,
    getTokenByAddress,
    addNotification,
    updatePreferences,
    getSmartDefaults,
    addPool 
  } = useUserSession()

  // URL Parameters for auto-fill
  const prePoolAddress = searchParams?.get('pool')
  const preTokenA = searchParams?.get('tokenA')
  const preTokenB = searchParams?.get('tokenB')
  const autoFill = searchParams?.get('autoFill') === 'true'

  const { 
    addLiquidity,
    createPosition, 
    getPoolQuote, 
    getAvailablePools,
    getPoolInfo,
    getUserTokenBalance,
    getMintDecimals,
    checkTransferHookStatus,
    getUserKycStatus,
    loading, 
    error, 
    connected, 
    clearError 
  } = useRwaAmmSdk()
  
  // Get connection for vault balance fetching
  const { connection } = useConnection()

  const [submitStatus, setSubmitStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle')
  const [transactionSignature, setTransactionSignature] = useState<string | null>(null)
  const [balanceRefreshing, setBalanceRefreshing] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showPoolSelector, setShowPoolSelector] = useState(false)
  const [availablePools, setAvailablePools] = useState<Pool[]>([])
  const [complianceStatus, setComplianceStatus] = useState<{ canTrade: boolean; reason?: string }>({ canTrade: false })
  const [storedTokens, setStoredTokens] = useState<StoredToken[]>([])
  const [poolStats, setPoolStats] = useState<{
    totalLiquidity?: number
    volume24h?: number
    fees24h?: number
    apy?: number
    priceRatio?: number
  }>({})
  const [calculatingRatio, setCalculatingRatio] = useState(false)

  // Get smart defaults
  const smartDefaults = getSmartDefaults()

  const [liquidityConfig, setLiquidityConfig] = useState<LiquidityConfig>({
    selectedPool: null,
    tokenA: {
      mint: preTokenA || smartDefaults.suggestedTokenPair.tokenA || '',
      symbol: 'SOL',
      decimals: 9,
      balance: 0,
      amount: 0,
    },
    tokenB: {
      mint: preTokenB || smartDefaults.suggestedTokenPair.tokenB || '',
      symbol: 'USDC',
      decimals: 6,
      balance: 0,
      amount: 0,
    },
    slippage: smartDefaults.preferredSlippage,
    priceImpact: 0,
    liquidityAmount: 0,
  })

  // Load stored tokens from session data
  useEffect(() => {
    setStoredTokens(sessionData.tokens)
  }, [sessionData.tokens])

  // Get real token balance from blockchain
  const getTokenBalance = useCallback(async (mint: string): Promise<number> => {
    if (!connected || !mint) return 0
    
    try {
      const result = await getUserTokenBalance(mint)
      return result.balance
    } catch (error) {
      console.error('Error fetching token balance:', error)
      return 0
    }
  }, [connected, getUserTokenBalance])

  // Helper function to set token config with real balance and decimals
  const setTokenWithBalance = useCallback(async (
    path: 'tokenA' | 'tokenB', 
    token: { mint: string; symbol: string; decimals?: number; name?: string }
  ) => {
    const mint = ('address' in token) ? (token as any).address : token.mint
    updateLiquidityConfig(`${path}.mint`, mint)
    updateLiquidityConfig(`${path}.symbol`, token.symbol)
    updateLiquidityConfig(`${path}.balance`, 0) // Set to 0 initially
    
    if (connected && mint) {
      try {
        // Fetch real decimals from blockchain instead of using provided decimals
        const actualDecimals = await getMintDecimals(mint)
        updateLiquidityConfig(`${path}.decimals`, actualDecimals)
        console.log(`💱 Set ${token.symbol} decimals to ${actualDecimals} (from blockchain)`)
        
        // Fetch real balance asynchronously
        const balance = await getTokenBalance(mint)
        updateLiquidityConfig(`${path}.balance`, balance)
        console.log(`💰 Set ${token.symbol} balance to ${balance}`)
      } catch (error) {
        console.error('Error setting token balance/decimals:', error)
        // Fallback to provided decimals if available
        const fallbackDecimals = token.decimals || 6
        updateLiquidityConfig(`${path}.decimals`, fallbackDecimals)
        updateLiquidityConfig(`${path}.balance`, 0)
        console.warn(`⚠️ Using fallback decimals (${fallbackDecimals}) for ${token.symbol}`)
      }
    } else {
      // Use provided decimals as fallback when not connected
      const fallbackDecimals = token.decimals || 6
      updateLiquidityConfig(`${path}.decimals`, fallbackDecimals)
    }
  }, [connected, getTokenBalance, getMintDecimals])

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
            setTokenWithBalance('tokenA', {
              mint: ('address' in tokenA) ? tokenA.address : tokenA.mint,
              symbol: tokenA.symbol,
              decimals: tokenA.decimals
            })
          }

          if (tokenB) {
            setTokenWithBalance('tokenB', {
              mint: ('address' in tokenB) ? tokenB.address : tokenB.mint,
              symbol: tokenB.symbol,
              decimals: tokenB.decimals
            })
          }

          // Set the pool as selected
          const poolData = {
            address: new PublicKey(prePoolAddress),
            tokenAMint: poolInfo.tokenAMint,
            tokenBMint: poolInfo.tokenBMint,
            liquidity: poolInfo.liquidity,
            sqrtPrice: poolInfo.sqrtPrice,
            tokenASymbol: tokenA?.symbol,
            tokenBSymbol: tokenB?.symbol,
          }
          setLiquidityConfig(prev => ({ ...prev, selectedPool: poolData }))

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
    if (liquidityConfig.tokenA.mint && liquidityConfig.tokenB.mint && availablePools.length > 0) {
      const matchingPool = availablePools.find(pool => 
        (pool.tokenAMint.toString() === liquidityConfig.tokenA.mint && pool.tokenBMint.toString() === liquidityConfig.tokenB.mint) ||
        (pool.tokenBMint.toString() === liquidityConfig.tokenA.mint && pool.tokenAMint.toString() === liquidityConfig.tokenB.mint)
      )
      
      if (matchingPool && !liquidityConfig.selectedPool) {
        updateLiquidityConfig('selectedPool', matchingPool)
      }
    }
  }, [liquidityConfig.tokenA.mint, liquidityConfig.tokenB.mint, availablePools])

  const updateLiquidityConfig = (path: string, value: any) => {
    setLiquidityConfig((prev) => {
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

  // Calculate liquidity amounts based on pool ratio
  const calculateLiquidityAmounts = useCallback(async (inputToken: 'tokenA' | 'tokenB', inputAmount: number) => {
    if (inputAmount <= 0 || !liquidityConfig.selectedPool || calculatingRatio) {
      if (inputAmount <= 0 || !liquidityConfig.selectedPool) {
        updateLiquidityConfig('tokenA.amount', 0)
        updateLiquidityConfig('tokenB.amount', 0)
        updateLiquidityConfig('liquidityAmount', 0)
        updateLiquidityConfig('priceImpact', 0)
      }
      return
    }

    setCalculatingRatio(true)

    try {
      // Get current pool state to get vault addresses
      const poolInfo = await getPoolInfo(liquidityConfig.selectedPool.address.toString())
      if (!poolInfo || !poolInfo.tokenAVault || !poolInfo.tokenBVault) {
        console.warn('Pool info or vault addresses not available, using fallback calculation')
        throw new Error('Pool vault information not available')
      }

      // Import AccountLayout to decode vault balances  
      const { AccountLayout } = await import('@solana/spl-token')

      // Fetch actual token balances from the pool vaults using AccountLayout
      const [tokenAVaultAccountInfo, tokenBVaultAccountInfo] = await Promise.all([
        connection.getAccountInfo(poolInfo.tokenAVault),
        connection.getAccountInfo(poolInfo.tokenBVault)
      ])

      if (!tokenAVaultAccountInfo?.data || !tokenBVaultAccountInfo?.data) {
        throw new Error('Unable to fetch vault account data')
      }

      const tokenAVaultBalance = Number(AccountLayout.decode(tokenAVaultAccountInfo.data).amount)
      const tokenBVaultBalance = Number(AccountLayout.decode(tokenBVaultAccountInfo.data).amount)

      console.log('🏦 Pool vault balances:', {
        tokenAVault: poolInfo.tokenAVault.toString(),
        tokenBVault: poolInfo.tokenBVault.toString(),
        tokenABalance: tokenAVaultBalance,
        tokenBBalance: tokenBVaultBalance,
        tokenASymbol: liquidityConfig.tokenA.symbol,
        tokenBSymbol: liquidityConfig.tokenB.symbol
      })

      // Calculate pool ratio: tokenB per tokenA using UI amounts (no decimal conversion needed)
      let ratio = 1.0 // Default 1:1 fallback
      if (tokenAVaultBalance > 0 && tokenBVaultBalance > 0) {
        // Get actual decimals for proper normalization of RAW vault balances
        const [tokenADecimals, tokenBDecimals] = await Promise.all([
          getMintDecimals(liquidityConfig.tokenA.mint),
          getMintDecimals(liquidityConfig.tokenB.mint)
        ])
        
        console.log(`🔢 Converting RAW vault balances to UI amounts:`)
        console.log(`  TokenA vault: ${tokenAVaultBalance} raw → ${tokenAVaultBalance / Math.pow(10, tokenADecimals)} UI`)
        console.log(`  TokenB vault: ${tokenBVaultBalance} raw → ${tokenBVaultBalance / Math.pow(10, tokenBDecimals)} UI`)
        
        // Convert RAW vault balances to UI amounts for ratio calculation
        const tokenAVaultUI = tokenAVaultBalance / Math.pow(10, tokenADecimals)
        const tokenBVaultUI = tokenBVaultBalance / Math.pow(10, tokenBDecimals)
        
        // Calculate ratio using UI amounts
        ratio = tokenBVaultUI / tokenAVaultUI
        console.log('💱 Calculated pool ratio:', {
          tokenAVaultUI,
          tokenBVaultUI,
          ratio: `1 ${liquidityConfig.tokenA.symbol} = ${ratio.toFixed(6)} ${liquidityConfig.tokenB.symbol}`,
          inputToken,
          inputAmount
        })
      } else {
        console.warn('One or both vault balances are zero, using 1:1 ratio')
      }

      // Calculate the other token amount based on current pool ratio
      // All amounts here are UI amounts (what users see)
      let tokenAAmount, tokenBAmount
      
      if (inputToken === 'tokenA') {
        tokenAAmount = inputAmount
        tokenBAmount = inputAmount * ratio
      } else {
        tokenBAmount = inputAmount
        tokenAAmount = inputAmount / ratio
      }

      console.log(`📊 UI Amount Calculation: Input ${inputAmount} ${inputToken === 'tokenA' ? liquidityConfig.tokenA.symbol : liquidityConfig.tokenB.symbol}`)
      console.log(`  → TokenA: ${tokenAAmount} ${liquidityConfig.tokenA.symbol}`)
      console.log(`  → TokenB: ${tokenBAmount} ${liquidityConfig.tokenB.symbol}`)

      // Update both amounts (including the input token to ensure consistency)
      updateLiquidityConfig('tokenA.amount', tokenAAmount)
      updateLiquidityConfig('tokenB.amount', tokenBAmount)
      updateLiquidityConfig('liquidityAmount', Math.sqrt(tokenAAmount * tokenBAmount))
      
      // Price impact calculation using UI amounts (converting vault to UI for comparison)
      const tokenAVaultUI = tokenAVaultBalance / Math.pow(10, await getMintDecimals(liquidityConfig.tokenA.mint))
      const tokenBVaultUI = tokenBVaultBalance / Math.pow(10, await getMintDecimals(liquidityConfig.tokenB.mint))
      const maxVaultUI = Math.max(tokenAVaultUI, tokenBVaultUI)
      updateLiquidityConfig('priceImpact', Math.min((inputAmount / maxVaultUI) * 100, 5))

    } catch (err) {
      console.error('Error calculating liquidity amounts:', err)
      // Fallback to simple 1:1 calculation
      let tokenAAmount, tokenBAmount
      
      if (inputToken === 'tokenA') {
        tokenAAmount = inputAmount
        tokenBAmount = inputAmount // 1:1 fallback
      } else {
        tokenBAmount = inputAmount
        tokenAAmount = inputAmount // 1:1 fallback
      }
      
      updateLiquidityConfig('tokenA.amount', tokenAAmount)
      updateLiquidityConfig('tokenB.amount', tokenBAmount)
      updateLiquidityConfig('liquidityAmount', inputAmount)
      updateLiquidityConfig('priceImpact', 0.1)
    } finally {
      setCalculatingRatio(false)
    }
  }, [liquidityConfig.selectedPool, liquidityConfig.tokenA.decimals, liquidityConfig.tokenB.decimals, liquidityConfig.tokenA.symbol, liquidityConfig.tokenB.symbol, getPoolInfo, connection, calculatingRatio])

  // Combine common tokens with stored tokens for selection
  const allAvailableTokens = useMemo(() => [
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
  ], [storedTokens])

  const handleAddLiquidity = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!connected) {
      alert('Please connect your wallet first')
      return
    }

    if (!liquidityConfig.selectedPool) {
      alert('Please select a pool')
      return
    }

    if (liquidityConfig.tokenA.amount <= 0 || liquidityConfig.tokenB.amount <= 0) {
      alert('Please enter valid amounts for both tokens')
      return
    }

    // Check if user has sufficient balance
    if (liquidityConfig.tokenA.amount > liquidityConfig.tokenA.balance) {
      alert(`Insufficient ${liquidityConfig.tokenA.symbol} balance`)
      return
    }

    if (liquidityConfig.tokenB.amount > liquidityConfig.tokenB.balance) {
      alert(`Insufficient ${liquidityConfig.tokenB.symbol} balance`)
      return
    }

    setSubmitStatus('submitting')
    clearError()

    try {
      console.log('Adding liquidity:', liquidityConfig)

      // Import BN for big number operations
      const { BN } = await import('@coral-xyz/anchor')

      // Step 1: Create position first
      console.log('Step 1: Creating position...')
      const createPositionParams = {
        poolAddress: liquidityConfig.selectedPool.address,
      }

      const positionAddress = await createPosition(createPositionParams)
      console.log('✅ Position created:', positionAddress)

      // Step 2: Add liquidity to the position
      console.log('Step 2: Adding liquidity to position...')

      // Convert UI amounts to smallest token units using actual decimals from blockchain
      const [tokenADecimals, tokenBDecimals] = await Promise.all([
        getMintDecimals(liquidityConfig.tokenA.mint),
        getMintDecimals(liquidityConfig.tokenB.mint)
      ])
      
      const tokenAAmountInSmallestUnits = liquidityConfig.tokenA.amount * Math.pow(10, tokenADecimals)
      const tokenBAmountInSmallestUnits = liquidityConfig.tokenB.amount * Math.pow(10, tokenBDecimals)
      
      console.log(`🔢 Converting amounts with actual decimals:`)
      console.log(`  ${liquidityConfig.tokenA.symbol}: ${liquidityConfig.tokenA.amount} × 10^${tokenADecimals} = ${tokenAAmountInSmallestUnits}`)
      console.log(`  ${liquidityConfig.tokenB.symbol}: ${liquidityConfig.tokenB.amount} × 10^${tokenBDecimals} = ${tokenBAmountInSmallestUnits}`)
      
      // Calculate slippage thresholds
      const tokenAMinAmount = tokenAAmountInSmallestUnits * (1 - liquidityConfig.slippage / 100)
      const tokenBMinAmount = tokenBAmountInSmallestUnits * (1 - liquidityConfig.slippage / 100)

      const addLiquidityParams = {
        poolAddress: liquidityConfig.selectedPool.address,
        position: new PublicKey(positionAddress),
        liquidityDelta: liquidityConfig.liquidityAmount, // Liquidity amount is used as-is, not scaled by decimals
        tokenAAmountThreshold: tokenAMinAmount,
        tokenBAmountThreshold: tokenBMinAmount,
      }
      
      console.log(`📊 Liquidity parameters:`)
      console.log(`  liquidityDelta: ${liquidityConfig.liquidityAmount} (unscaled)`)
      console.log(`  tokenAAmountThreshold: ${tokenAMinAmount} (${liquidityConfig.tokenA.symbol})`)
      console.log(`  tokenBAmountThreshold: ${tokenBMinAmount} (${liquidityConfig.tokenB.symbol})`)

      const signature = await addLiquidity(addLiquidityParams)
      setTransactionSignature(signature)
      setSubmitStatus('success')

      // Mark liquidity step as completed
      markStepCompleted(8) // Add liquidity step

      // Add success notification
      addNotification({
        type: 'success',
        title: 'Liquidity Added Successfully!',
        message: `Added ${liquidityConfig.tokenA.amount} ${liquidityConfig.tokenA.symbol} + ${liquidityConfig.tokenB.amount} ${liquidityConfig.tokenB.symbol}`,
        action: {
          label: 'View Transaction',
          href: `https://explorer.solana.com/tx/${signature}?cluster=custom&customUrl=http%3A%2F%2Flocalhost%3A8899`
        }
      })

      console.log('Liquidity added successfully:', signature)

      // Reset amounts
      updateLiquidityConfig('tokenA.amount', 0)
      updateLiquidityConfig('tokenB.amount', 0)
      updateLiquidityConfig('liquidityAmount', 0)

      // Refresh token balances after successful addition - with proper async handling
      try {
        setBalanceRefreshing(true)
        console.log('🔄 Refreshing balances after liquidity addition...')
        
        const balancePromises = []
        
        if (liquidityConfig.tokenA.mint) {
          balancePromises.push(
            getTokenBalance(liquidityConfig.tokenA.mint).then(balance => {
              console.log(`💰 Updated ${liquidityConfig.tokenA.symbol} balance:`, balance)
              updateLiquidityConfig('tokenA.balance', balance)
              return balance
            })
          )
        }
        
        if (liquidityConfig.tokenB.mint) {
          balancePromises.push(
            getTokenBalance(liquidityConfig.tokenB.mint).then(balance => {
              console.log(`💰 Updated ${liquidityConfig.tokenB.symbol} balance:`, balance)
              updateLiquidityConfig('tokenB.balance', balance)
              return balance
            })
          )
        }

        // Wait for all balance updates to complete
        await Promise.all(balancePromises)
        console.log('✅ All balances refreshed successfully')
        
      } catch (balanceError) {
        console.error('⚠️ Error refreshing balances after liquidity addition:', balanceError)
        // Don't fail the whole operation if balance refresh fails
      } finally {
        setBalanceRefreshing(false)
      }

    } catch (err) {
      console.error('Add liquidity failed:', err)
      setSubmitStatus('error')
    }
  }

  const handleComplianceChange = useCallback((canTrade: boolean, reason?: string) => {
    setComplianceStatus({ canTrade, reason })
  }, [])

  return (
    <div className="min-h-screen bg-gradient-to-b from-neutral-900 to-neutral-950">
      <Header />

      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Liquidity Card */}
        <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-white flex items-center">
              <Droplets className="w-5 h-5 mr-2" />
              Add Liquidity
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
              <h3 className="text-lg font-medium text-white mb-3">Liquidity Settings</h3>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Slippage Tolerance</label>
                <div className="flex space-x-2">
                  {SLIPPAGE_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      onClick={() => updateLiquidityConfig('slippage', preset)}
                      className={`px-3 py-2 rounded-lg text-sm transition-all ${
                        liquidityConfig.slippage === preset
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
                      value={liquidityConfig.slippage}
                      onChange={(e) => updateLiquidityConfig('slippage', parseFloat(e.target.value))}
                      className="w-16 bg-white/10 border border-white/20 rounded-lg px-2 py-1 text-white text-sm"
                    />
                    <span className="ml-1 text-gray-400">%</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Selected Pool Info */}
          {liquidityConfig.selectedPool ? (
            <div className="bg-black/20 rounded-lg p-4 mb-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-400">Selected Pool</span>
                <button
                  onClick={() => setShowPoolSelector(true)}
                  className="text-blue-400 hover:text-blue-300 text-sm flex items-center space-x-1"
                >
                  <span>Change Pool</span>
                  <ExternalLink className="w-3 h-3" />
                </button>
              </div>
              <div className="flex items-center justify-between">
                <div className="text-lg font-semibold text-white">
                  {liquidityConfig.tokenA.symbol}/{liquidityConfig.tokenB.symbol}
                </div>
                <div className="text-sm text-gray-300 font-mono">
                  {liquidityConfig.selectedPool.address.toString().slice(0, 8)}...
                  {liquidityConfig.selectedPool.address.toString().slice(-8)}
                </div>
              </div>
              {(liquidityConfig.selectedPool.tokenAHasHook || liquidityConfig.selectedPool.tokenBHasHook) && (
                <div className="mt-2 flex items-center space-x-2">
                  <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                  <span className="text-xs text-blue-400">RWA Compliance Pool</span>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4 mb-6">
              <div className="flex items-center space-x-2">
                <AlertTriangle className="w-5 h-5 text-yellow-400" />
                <span className="text-yellow-400">Please select a pool to add liquidity</span>
              </div>
              <button
                onClick={() => setShowPoolSelector(true)}
                className="mt-2 px-4 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 transition-all"
              >
                Select Pool
              </button>
            </div>
          )}

          {/* Pool Selector Modal */}
          {showPoolSelector && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
                <div className="p-4 border-b border-gray-200 flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Select Liquidity Pool</h3>
                  <button
                    onClick={() => setShowPoolSelector(false)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    ✕
                  </button>
                </div>
                <PoolSelector
                  onPoolSelect={(pool) => {
                    updateLiquidityConfig('selectedPool', pool)
                    // Auto-fill tokens based on selected pool
                    if (pool.tokenAMint && pool.tokenBMint) {
                      const tokenA = allAvailableTokens.find(t => t.mint === pool.tokenAMint.toString())
                      const tokenB = allAvailableTokens.find(t => t.mint === pool.tokenBMint.toString())
                      
                      if (tokenA) {
                        setTokenWithBalance('tokenA', tokenA)
                      }
                      if (tokenB) {
                        setTokenWithBalance('tokenB', tokenB)
                      }
                    }
                    setShowPoolSelector(false)
                  }}
                  selectedPool={liquidityConfig.selectedPool}
                />
              </div>
            </div>
          )}

          <form onSubmit={handleAddLiquidity} className="space-y-4">
            {/* Token A Input */}
            <div className="bg-black/20 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <label className="text-sm font-medium text-gray-400">Token A Amount</label>
                <span className="text-sm text-gray-400 flex items-center gap-1">
                  Balance: {liquidityConfig.tokenA.balance.toFixed(Math.min(4, liquidityConfig.tokenA.decimals))}
                  {balanceRefreshing && <span className="animate-spin">⟳</span>}
                </span>
              </div>

              <div className="flex items-center space-x-3">
                <div className="flex-1">
                  <input
                    type="number"
                    step={Math.pow(10, -Math.min(6, liquidityConfig.tokenA.decimals)).toString()}
                    value={liquidityConfig.tokenA.amount || ''}
                    onChange={(e) => {
                      const amount = parseFloat(e.target.value) || 0
                      if (amount <= 0) {
                        updateLiquidityConfig('tokenA.amount', 0)
                        updateLiquidityConfig('tokenB.amount', 0)
                        updateLiquidityConfig('liquidityAmount', 0)
                        updateLiquidityConfig('priceImpact', 0)
                      } else {
                        calculateLiquidityAmounts('tokenA', amount)
                      }
                    }}
                    placeholder="0.0"
                    className="w-full bg-transparent text-2xl font-semibold text-white placeholder-gray-500 focus:outline-none"
                  />
                </div>

                <div className="flex items-center space-x-2">
                  <div className="w-8 h-8 bg-gray-600 rounded-full"></div>
                  <div className="flex items-center space-x-2">
                    <p className="font-semibold text-white">{liquidityConfig.tokenA.symbol}</p>
                    {liquidityConfig.tokenA.mint && (
                      <SimpleTransferHookIndicator 
                        mintAddress={liquidityConfig.tokenA.mint}
                        size="sm"
                      />
                    )}
                  </div>
                </div>
              </div>

              {liquidityConfig.tokenA.balance > 0 && (
                <div className="mt-3 flex space-x-2">
                  {[25, 50, 75, 100].map((percentage) => (
                    <button
                      key={percentage}
                      type="button"
                      onClick={() => {
                        const amount = (liquidityConfig.tokenA.balance * percentage) / 100
                        calculateLiquidityAmounts('tokenA', amount)
                      }}
                      className="px-3 py-1 rounded text-xs bg-white/10 text-gray-300 hover:bg-white/20 transition-all"
                    >
                      {percentage}%
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Plus Icon */}
            <div className="flex justify-center">
              <div className="p-2 bg-white/10 rounded-full">
                <Plus className="w-5 h-5 text-gray-400" />
              </div>
            </div>

            {/* Token B Input */}
            <div className="bg-black/20 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <label className="text-sm font-medium text-gray-400">Token B Amount</label>
                <span className="text-sm text-gray-400 flex items-center gap-1">
                  Balance: {liquidityConfig.tokenB.balance.toFixed(Math.min(4, liquidityConfig.tokenB.decimals))}
                  {balanceRefreshing && <span className="animate-spin">⟳</span>}
                </span>
              </div>

              <div className="flex items-center space-x-3">
                <div className="flex-1">
                  <input
                    type="number"
                    step={Math.pow(10, -Math.min(6, liquidityConfig.tokenB.decimals)).toString()}
                    value={liquidityConfig.tokenB.amount || ''}
                    onChange={(e) => {
                      const amount = parseFloat(e.target.value) || 0
                      if (amount <= 0) {
                        updateLiquidityConfig('tokenA.amount', 0)
                        updateLiquidityConfig('tokenB.amount', 0)
                        updateLiquidityConfig('liquidityAmount', 0)
                        updateLiquidityConfig('priceImpact', 0)
                      } else {
                        calculateLiquidityAmounts('tokenB', amount)
                      }
                    }}
                    placeholder="0.0"
                    className="w-full bg-transparent text-2xl font-semibold text-white placeholder-gray-500 focus:outline-none"
                  />
                </div>

                <div className="flex items-center space-x-2">
                  <div className="w-8 h-8 bg-gray-500 rounded-full"></div>
                  <div className="flex items-center space-x-2">
                    <p className="font-semibold text-white">{liquidityConfig.tokenB.symbol}</p>
                    {liquidityConfig.tokenB.mint && (
                      <SimpleTransferHookIndicator 
                        mintAddress={liquidityConfig.tokenB.mint}
                        size="sm"
                      />
                    )}
                  </div>
                </div>
              </div>

              {liquidityConfig.tokenB.balance > 0 && (
                <div className="mt-3 flex space-x-2">
                  {[25, 50, 75, 100].map((percentage) => (
                    <button
                      key={percentage}
                      type="button"
                      onClick={() => {
                        const amount = (liquidityConfig.tokenB.balance * percentage) / 100
                        calculateLiquidityAmounts('tokenB', amount)
                      }}
                      className="px-3 py-1 rounded text-xs bg-white/10 text-gray-300 hover:bg-white/20 transition-all"
                    >
                      {percentage}%
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Compliance Status */}
            {(liquidityConfig.tokenA.mint || liquidityConfig.tokenB.mint) && (
              <ComplianceStatus
                inputMint={liquidityConfig.tokenA.mint}
                outputMint={liquidityConfig.tokenB.mint}
                amount={liquidityConfig.tokenA.amount}
                onComplianceChange={handleComplianceChange}
                showDetails={false}
              />
            )}

            {/* Liquidity Info */}
            {liquidityConfig.liquidityAmount > 0 && (
              <div className="bg-black/20 rounded-lg p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Liquidity Amount</span>
                  <span className="text-gray-300">{liquidityConfig.liquidityAmount.toFixed(6)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Share of Pool</span>
                  <span className="text-gray-300">~0.01%</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Price Impact</span>
                  <span className={`${liquidityConfig.priceImpact > 1 ? 'text-yellow-400' : 'text-gray-300'}`}>
                    {liquidityConfig.priceImpact.toFixed(2)}%
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Network Fee</span>
                  <span className="text-gray-300">~0.0001 SOL</span>
                </div>
              </div>
            )}

            {/* Price Impact Warning */}
            {liquidityConfig.priceImpact > 1 && (
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 flex items-center space-x-2">
                <AlertTriangle className="w-5 h-5 text-yellow-400 flex-shrink-0" />
                <p className="text-yellow-400 text-sm">
                  Adding this much liquidity may cause price impact.
                </p>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={
                !connected || 
                submitStatus === 'submitting' || 
                loading || 
                !liquidityConfig.selectedPool ||
                liquidityConfig.tokenA.amount <= 0 || 
                liquidityConfig.tokenB.amount <= 0 ||
                !complianceStatus.canTrade
              }
              className={`w-full py-4 text-white rounded-xl transition-all font-semibold ${
                !connected || 
                submitStatus === 'submitting' || 
                loading || 
                !liquidityConfig.selectedPool ||
                liquidityConfig.tokenA.amount <= 0 || 
                liquidityConfig.tokenB.amount <= 0 ||
                !complianceStatus.canTrade
                  ? 'bg-gray-500 cursor-not-allowed'
                  : submitStatus === 'success'
                    ? 'bg-green-500 hover:bg-green-600'
                    : 'bg-gradient-to-b from-neutral-800 to-neutral-950 hover:from-neutral-700 hover:to-neutral-900'
              }`}
            >
              {!connected
                ? 'Connect Wallet'
                : !liquidityConfig.selectedPool
                  ? 'Select Pool First'
                : liquidityConfig.tokenA.amount <= 0 || liquidityConfig.tokenB.amount <= 0
                  ? 'Enter token amounts'
                : !complianceStatus.canTrade
                  ? complianceStatus.reason || 'Compliance check required'
                : submitStatus === 'submitting' || loading
                  ? 'Adding Liquidity...'
                  : submitStatus === 'success'
                    ? 'Liquidity Added!'
                    : `Add ${liquidityConfig.tokenA.symbol}/${liquidityConfig.tokenB.symbol} Liquidity`}
            </button>
          </form>
        </div>

        {/* KYC Status Card */}
        <KycStatusCard />

        {/* Success Message */}
        {submitStatus === 'success' && transactionSignature && (
          <div className="mt-6 bg-green-500/10 border border-green-500/30 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-green-400 mb-2">🎉 Liquidity Added Successfully!</h3>
            <p className="text-gray-300 mb-4">Your liquidity has been added to the pool and you'll earn fees from trades.</p>
            <div className="bg-black/20 rounded-lg p-4">
              <p className="text-sm text-gray-400 mb-2">Transaction:</p>
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
                Copy Transaction
              </button>
            </div>
          </div>
        )}

        {/* Error Message */}
        {(error || submitStatus === 'error') && (
          <div className="mt-6 bg-red-500/10 border border-red-500/30 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-red-400 mb-2">❌ Add Liquidity Failed</h3>
            <p className="text-gray-300 mb-2">There was an error adding liquidity:</p>
            <div className="bg-black/20 rounded-lg p-4 mb-4">
              <p className="text-red-400 text-sm">{error || 'Unknown error occurred'}</p>
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
            </div>
          </div>
        )}

        {/* Info Cards */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Liquidity Benefits */}
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-blue-400 mb-4 flex items-center">
              <TrendingUp className="w-5 h-5 mr-2" />
              Liquidity Provider Benefits
            </h3>
            <div className="space-y-3 text-sm text-gray-300">
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                <span>Earn trading fees from every swap</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                <span>Proportional share of pool rewards</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                <span>Passive income generation</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                <span>LP tokens as proof of ownership</span>
              </div>
            </div>
          </div>

          {/* Risks Warning */}
          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-yellow-400 mb-4 flex items-center">
              <AlertTriangle className="w-5 h-5 mr-2" />
              Important Considerations
            </h3>
            <div className="space-y-3 text-sm text-gray-300">
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-yellow-400 rounded-full"></div>
                <span>Impermanent loss risk</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-yellow-400 rounded-full"></div>
                <span>Price volatility exposure</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-yellow-400 rounded-full"></div>
                <span>Smart contract risks</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-yellow-400 rounded-full"></div>
                <span>Ensure compliance requirements</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function AddLiquidityPage() {
  return (
    <Suspense fallback={<div />}>
      <AddLiquidityPageInner />
    </Suspense>
  )
}