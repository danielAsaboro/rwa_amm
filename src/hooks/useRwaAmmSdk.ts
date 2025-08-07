import { useState, useEffect, useMemo, useCallback } from 'react'
import { useConnection, useWallet, useAnchorWallet } from '@solana/wallet-adapter-react'
import { AnchorProvider } from '@coral-xyz/anchor'
import { PublicKey } from '@solana/web3.js'
import { RwaAmmSdk } from '@/lib/program'
import { useNetwork } from '@/contexts/NetworkContext'

export const useRwaAmmSdk = () => {
  const { connection } = useConnection()
  const wallet = useAnchorWallet()
  const { publicKey, connected } = useWallet()
  const { network } = useNetwork()
  const [sdk, setSdk] = useState<RwaAmmSdk | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // Cache for mint decimals to avoid repeated blockchain calls
  const [mintDecimalsCache] = useState<Map<string, number>>(new Map())

  // Initialize SDK lazily when first needed
  const initializeSdk = async () => {
    if (sdk || !wallet || !connected || !publicKey) {
      return sdk
    }

    try {
      setLoading(true)
      setError(null)

      const provider = new AnchorProvider(connection, wallet, {
        commitment: 'confirmed',
      })

      const sdkInstance = await RwaAmmSdk.initialize(connection, provider)
      setSdk(sdkInstance)
      return sdkInstance
    } catch (err) {
      console.error('Failed to initialize SDK:', err)
      setError(err instanceof Error ? err.message : 'Failed to initialize SDK')
      setSdk(null)
      throw err
    } finally {
      setLoading(false)
    }
  }

  // Clear SDK when wallet disconnects or network changes
  useEffect(() => {
    if (!wallet || !connected || !publicKey) {
      setSdk(null)
    }
  }, [wallet, connected, publicKey])

  // Clear SDK when network changes to force re-initialization
  useEffect(() => {
    setSdk(null)
  }, [network])

  // SDK methods with error handling and loading states
  const createRwaMint = async (params: any) => {
    const sdkInstance = sdk || (await initializeSdk())
    if (!sdkInstance) throw new Error('SDK not initialized')

    setLoading(true)
    try {
      const result = await sdkInstance.createRwaMint(params)
      return result
    } catch (err) {
      let errorMessage = err instanceof Error ? err.message : 'Failed to create RWA mint'
      // Try to append program logs when available (SendTransactionError)
      try {
        const anyErr: any = err as any
        if (anyErr?.logs && Array.isArray(anyErr.logs)) {
          errorMessage += `\nLogs:\n${JSON.stringify(anyErr.logs, null, 2)}`
        } else if (typeof anyErr?.getLogs === 'function') {
          const logs = await anyErr.getLogs(connection as any)
          if (logs) {
            errorMessage += `\nLogs:\n${JSON.stringify(logs, null, 2)}`
          }
        }
      } catch (_) {}
      setError(errorMessage)
      throw new Error(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  const createConfig = async (params: any) => {
    const sdkInstance = sdk || (await initializeSdk())
    if (!sdkInstance) throw new Error('SDK not initialized')

    setLoading(true)
    try {
      const result = await sdkInstance.createConfig(params)
      return result
    } catch (err) {
      let errorMessage = err instanceof Error ? err.message : 'Failed to create config'
      setError(errorMessage)
      throw new Error(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  const createTokenBadge = async (tokenMint: string) => {
    const sdkInstance = sdk || (await initializeSdk())
    if (!sdkInstance) throw new Error('SDK not initialized')

    setLoading(true)
    try {
      const result = await sdkInstance.createTokenBadge(new PublicKey(tokenMint))
      return result
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create token badge'
      setError(errorMessage)
      throw new Error(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  const mintTokens = async (params: { mintAddress: string; amount: number; recipientAddress?: string }) => {
    const sdkInstance = sdk || (await initializeSdk())
    if (!sdkInstance) throw new Error('SDK not initialized')
    
    setLoading(true)
    try {
      const result = await sdkInstance.mintTokens({
        mintAddress: new PublicKey(params.mintAddress),
        amount: params.amount,
        recipientAddress: params.recipientAddress ? new PublicKey(params.recipientAddress) : undefined
      })
      return result
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to mint tokens'
      setError(errorMessage)
      throw new Error(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  const createPool = async (params: any) => {
    const sdkInstance = sdk || (await initializeSdk())
    if (!sdkInstance) throw new Error('SDK not initialized')

    setLoading(true)
    try {
      const result = await sdkInstance.createPool(params)
      return result
    } catch (err) {
      let errorMessage = err instanceof Error ? err.message : 'Failed to create pool'
      // Try to append program logs when available
      try {
        const anyErr: any = err as any
        if (anyErr?.logs && Array.isArray(anyErr.logs)) {
          errorMessage += `\nLogs:\n${JSON.stringify(anyErr.logs, null, 2)}`
        }
      } catch (_) {}
      setError(errorMessage)
      throw new Error(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  const createPosition = async (params: any) => {
    const sdkInstance = sdk || (await initializeSdk())
    if (!sdkInstance) throw new Error('SDK not initialized')

    setLoading(true)
    try {
      const result = await sdkInstance.createPosition(params)
      return result
    } catch (err) {
      let errorMessage = err instanceof Error ? err.message : 'Failed to create position'
      // Try to append program logs when available
      try {
        const anyErr: any = err as any
        if (anyErr?.logs && Array.isArray(anyErr.logs)) {
          errorMessage += `\nLogs:\n${JSON.stringify(anyErr.logs, null, 2)}`
        }
      } catch (_) {}
      setError(errorMessage)
      throw new Error(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  const addLiquidity = async (params: any) => {
    const sdkInstance = sdk || (await initializeSdk())
    if (!sdkInstance) throw new Error('SDK not initialized')

    setLoading(true)
    try {
      const result = await sdkInstance.addLiquidity(params)
      return result
    } catch (err) {
      let errorMessage = err instanceof Error ? err.message : 'Failed to add liquidity'
      // Try to append program logs when available
      try {
        const anyErr: any = err as any
        if (anyErr?.logs && Array.isArray(anyErr.logs)) {
          errorMessage += `\nLogs:\n${JSON.stringify(anyErr.logs, null, 2)}`
        }
      } catch (_) {}
      setError(errorMessage)
      throw new Error(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  const swap = async (params: any) => {
    const sdkInstance = sdk || (await initializeSdk())
    if (!sdkInstance) throw new Error('SDK not initialized')

    setLoading(true)
    try {
      const result = await sdkInstance.swap(params)
      return result
    } catch (err) {
      let errorMessage = err instanceof Error ? err.message : 'Failed to swap'
      // Try to append program logs when available
      try {
        const anyErr: any = err as any
        if (anyErr?.logs && Array.isArray(anyErr.logs)) {
          errorMessage += `\nLogs:\n${JSON.stringify(anyErr.logs, null, 2)}`
        }
      } catch (_) {}
      setError(errorMessage)
      throw new Error(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  const createUserKyc = async (params: any) => {
    const sdkInstance = sdk || (await initializeSdk())
    if (!sdkInstance) throw new Error('SDK not initialized')

    setLoading(true)
    try {
      try {
        const result = await sdkInstance.createUserKyc(params)
        return result
      } catch (e) {
        let errorMessage = e instanceof Error ? e.message : 'Failed to create user KYC'
        try {
          const anyErr: any = e as any
          if (typeof anyErr?.getLogs === 'function') {
            const logs = await anyErr.getLogs(connection as any)
            if (logs) {
              errorMessage += `\nLogs:\n${JSON.stringify(logs, null, 2)}`
            }
          } else if (anyErr?.logs && Array.isArray(anyErr.logs)) {
            errorMessage += `\nLogs:\n${JSON.stringify(anyErr.logs, null, 2)}`
          }
        } catch (_) {}
        setError(errorMessage)
        throw new Error(errorMessage)
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create user KYC'
      setError(errorMessage)
      throw new Error(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  const createWhitelist = async (params: any) => {
    const sdkInstance = sdk || (await initializeSdk())
    if (!sdkInstance) throw new Error('SDK not initialized')

    setLoading(true)
    try {
      const result = await sdkInstance.createWhitelist(params)
      return result
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create whitelist'
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  // Enhanced pool quote with real pool data and liquidity validation
  const getPoolQuote = async (inputMint: string, outputMint: string, inputAmount: number, poolAddress?: string) => {
    try {
      const sdkInstance = sdk || (await initializeSdk())
      if (!sdkInstance) {
        throw new Error('SDK not initialized')
      }

      // If specific pool provided, use it
      if (poolAddress) {
        try {
          const quote = await sdkInstance.getPoolQuote(
            new PublicKey(poolAddress),
            new PublicKey(inputMint),
            inputAmount,
          )
          
          // Add liquidity validation with proper decimals
          const poolInfo = await sdkInstance.getPoolInfo(new PublicKey(poolAddress))
          if (poolInfo) {
            const estimatedPoolSize = Number(poolInfo.liquidity?.toString() || '0')
            
            // Get actual decimals for the input mint
            const inputDecimals = await getMintDecimals(inputMint)
            const inputAmountInSmallestUnits = inputAmount * Math.pow(10, inputDecimals)
            
            // Check if swap amount is too large relative to pool size
            if (estimatedPoolSize > 0 && inputAmountInSmallestUnits > estimatedPoolSize * 0.1) {
              return {
                ...quote,
                priceImpact: Math.max(quote.priceImpact || 0, 15), // Minimum 15% impact for large swaps
                liquidityWarning: true,
                maxSafeAmount: Math.floor((estimatedPoolSize * 0.05) / Math.pow(10, inputDecimals)), // 5% of pool
                poolSize: estimatedPoolSize,
              }
            }
          }
          
          return quote
        } catch (err) {
          console.warn('Error getting real pool quote, falling back to mock:', err)
        }
      }

      // Try to find a pool for this token pair
      try {
        const pools = await sdkInstance.listPools()
        const matchingPool = pools.find(
          (pool) =>
            (pool.tokenAMint.toString() === inputMint && pool.tokenBMint.toString() === outputMint) ||
            (pool.tokenBMint.toString() === inputMint && pool.tokenAMint.toString() === outputMint),
        )

        if (matchingPool) {
          const quote = await sdkInstance.getPoolQuote(matchingPool.address, new PublicKey(inputMint), inputAmount)
          
          // Add liquidity validation for found pool with proper decimals
          const poolInfo = await sdkInstance.getPoolInfo(matchingPool.address)
          if (poolInfo) {
            const estimatedPoolSize = Number(poolInfo.liquidity?.toString() || '0')
            
            // Get actual decimals for the input mint
            const inputDecimals = await getMintDecimals(inputMint)
            const inputAmountInSmallestUnits = inputAmount * Math.pow(10, inputDecimals)
            
            if (estimatedPoolSize > 0 && inputAmountInSmallestUnits > estimatedPoolSize * 0.1) {
              return {
                ...quote,
                priceImpact: Math.max(quote.priceImpact || 0, 15),
                liquidityWarning: true,
                maxSafeAmount: Math.floor((estimatedPoolSize * 0.05) / Math.pow(10, inputDecimals)),
                poolSize: estimatedPoolSize,
              }
            }
          }
          
          return quote
        }
      } catch (err) {
        console.warn('Error finding pools, using fallback calculation:', err)
      }

      // Fallback to mock calculation for token symbols
      let exchangeRate = 1
      if (inputMint === 'SOL' && outputMint === 'USDC') {
        exchangeRate = 100 // 1 SOL = 100 USDC
      } else if (inputMint === 'USDC' && outputMint === 'SOL') {
        exchangeRate = 0.01 // 1 USDC = 0.01 SOL
      } else {
        exchangeRate = 1 // Default 1:1 for unknown pairs
      }

      const outputAmount = inputAmount * exchangeRate
      const priceImpact = Math.min(inputAmount * 0.001, 5) // Simulate price impact
      const fee = inputAmount * 0.003 // 0.3% fee

      // For fallback calculations, warn if amount seems large
      const basePriceImpact = Math.min(inputAmount * 0.001, 5)
      const fallbackQuote = {
        outputAmount: Math.max(0, outputAmount - fee),
        priceImpact: basePriceImpact,
        fee,
        exchangeRate,
        isEstimate: true, // Mark as estimate when using fallback
      }

      // Add warning for large amounts in fallback mode
      if (inputAmount > 100) { // Arbitrary threshold for large amounts
        return {
          ...fallbackQuote,
          priceImpact: Math.max(basePriceImpact, 10), // Minimum 10% for large amounts
          liquidityWarning: true,
          maxSafeAmount: 50, // Conservative safe amount
          poolSize: 0, // Unknown pool size
        }
      }

      return fallbackQuote
    } catch (err) {
      console.error('Error getting pool quote:', err)
      return {
        outputAmount: 0,
        priceImpact: 100, // Very high impact to indicate error
        fee: 0,
        exchangeRate: 1,
        error: 'Failed to get quote',
      }
    }
  }

  // Get available pools
  const getAvailablePools = async () => {
    try {
      const sdkInstance = sdk || (await initializeSdk())
      if (!sdkInstance) return []

      return await sdkInstance.listPools()
    } catch (err) {
      console.error('Error getting available pools:', err)
      return []
    }
  }

  // Check transfer hook status for a token
  const checkTransferHookStatus = useCallback(async (mintAddress: string) => {
    try {
      const sdkInstance = sdk || (await initializeSdk())
      if (!sdkInstance) return { hasHook: false, requiresKyc: false }

      return await sdkInstance.checkTransferHookStatus(new PublicKey(mintAddress))
    } catch (err) {
      console.error('Error checking transfer hook status:', err)
      return { hasHook: false, requiresKyc: false }
    }
  }, [sdk])

  // Get user KYC status
  const getUserKycStatus = useCallback(async () => {
    try {
      if (!publicKey) return { exists: false, canTradeRwa: false }

      const sdkInstance = sdk || (await initializeSdk())
      if (!sdkInstance) return { exists: false, canTradeRwa: false }

      return await sdkInstance.getUserKycStatus(publicKey)
    } catch (err) {
      console.error('Error getting KYC status:', err)
      return { exists: false, canTradeRwa: false }
    }
  }, [sdk, publicKey])

  // Validate swap before execution
  const validateSwap = useCallback(async (inputMint: string, outputMint: string, amount: number) => {
    try {
      if (!publicKey) {
        return {
          canSwap: false,
          reason: 'Wallet not connected',
        }
      }

      const sdkInstance = sdk || (await initializeSdk())
      if (!sdkInstance) {
        return {
          canSwap: false,
          reason: 'SDK not initialized',
        }
      }

      return await sdkInstance.validateSwap(publicKey, new PublicKey(inputMint), new PublicKey(outputMint), amount)
    } catch (err) {
      console.error('Error validating swap:', err)
      return {
        canSwap: false,
        reason: 'Unable to validate swap',
      }
    }
  }, [sdk, publicKey])

  // Get pool information
  const getPoolInfo = useCallback(async (poolAddress: string) => {
    try {
      const sdkInstance = sdk || (await initializeSdk())
      if (!sdkInstance) return null

      return await sdkInstance.getPoolInfo(new PublicKey(poolAddress))
    } catch (err) {
      console.error('Error getting pool info:', err)
      return null
    }
  }, [sdk])

  // Calculate maximum safe swap amount
  const calculateMaxSwapAmount = useCallback(async (poolAddress: string, inputMint: string, isTokenA: boolean) => {
    try {
      const sdkInstance = sdk || (await initializeSdk())
      if (!sdkInstance) return null

      return await sdkInstance.calculateMaxSwapAmount(new PublicKey(poolAddress), new PublicKey(inputMint), isTokenA)
    } catch (err) {
      console.error('Error calculating max swap amount:', err)
      return null
    }
  }, [sdk])

  // Get user token balance
  const getUserTokenBalance = useCallback(async (mintAddress: string, userPublicKey?: string) => {
    try {
      if (!publicKey && !userPublicKey) return { balance: 0, exists: false }
      
      const sdkInstance = sdk || (await initializeSdk())
      if (!sdkInstance) return { balance: 0, exists: false }

      const userPubkey = userPublicKey ? new PublicKey(userPublicKey) : publicKey!
      return await sdkInstance.getUserTokenBalance(new PublicKey(mintAddress), userPubkey)
    } catch (err) {
      console.error('Error getting user token balance:', err)
      return { balance: 0, exists: false }
    }
  }, [sdk, publicKey])

  // Get mint decimals with caching
  const getMintDecimals = useCallback(async (mintAddress: string): Promise<number> => {
    // Check cache first
    if (mintDecimalsCache.has(mintAddress)) {
      return mintDecimalsCache.get(mintAddress)!
    }

    try {
      // Import the necessary types for mint info
      const { getMint } = await import('@solana/spl-token')
      
      const mintInfo = await getMint(connection, new PublicKey(mintAddress))
      const decimals = mintInfo.decimals
      
      // Cache the result
      mintDecimalsCache.set(mintAddress, decimals)
      console.log(`📏 Fetched decimals for ${mintAddress.slice(0, 8)}...: ${decimals}`)
      
      return decimals
    } catch (error) {
      console.error(`Error fetching decimals for mint ${mintAddress}:`, error)
      
      // Fallback to reasonable defaults based on common patterns
      if (mintAddress === 'So11111111111111111111111111111111111111112') {
        mintDecimalsCache.set(mintAddress, 9) // SOL
        return 9
      } else if (mintAddress.includes('USDC') || mintAddress === 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v') {
        mintDecimalsCache.set(mintAddress, 6) // USDC
        return 6
      } else if (mintAddress.includes('USDT') || mintAddress === 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB') {
        mintDecimalsCache.set(mintAddress, 6) // USDT
        return 6
      }
      
      // Default fallback - most custom tokens use 6 decimals
      mintDecimalsCache.set(mintAddress, 6)
      console.warn(`Using fallback decimals (6) for mint ${mintAddress}`)
      return 6
    }
  }, [connection, mintDecimalsCache])

  // Helper function to clear error
  const clearError = () => setError(null)

  return {
    sdk,
    connected,
    publicKey,
    loading,
    error,
    clearError,
    // SDK methods
    createRwaMint,
    createConfig,
    createPool,
    createPosition,
    addLiquidity,
    swap,
    createUserKyc,
    createTokenBadge,
    mintTokens,
    createWhitelist,
    setupTransferHookAccounts: async (tokenAMint: any, tokenBMint: any, userPubkey: any) => {
      const sdkInstance = sdk || (await initializeSdk())
      if (!sdkInstance) throw new Error('SDK not initialized')
      return sdkInstance.setupTransferHookAccounts(tokenAMint, tokenBMint, userPubkey)
    },
    // Enhanced pool utilities
    getPoolQuote,
    getAvailablePools,
    getPoolInfo,
    calculateMaxSwapAmount,
    getUserTokenBalance,
    // Transfer hook and compliance utilities
    checkTransferHookStatus,
    getUserKycStatus,
    validateSwap,
    // Helper methods
    getMintDecimals,
    getUserKycAddress: (userPubkey: any) => sdk?.getUserKycAddress(userPubkey),
    getWhitelistAddress: (mintPubkey: any) => sdk?.getWhitelistAddress(mintPubkey),
    getExtraAccountMetaListAddress: (mintPubkey: any) => sdk?.getExtraAccountMetaListAddress(mintPubkey),
  }
}
