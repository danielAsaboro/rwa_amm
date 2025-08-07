'use client'

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { PublicKey } from '@solana/web3.js'

// Types for all stored data
interface StoredToken {
  address: string
  name: string
  symbol: string
  decimals: number
  supply: number
  createdAt: Date
  hasTransferHook: boolean
  hasKyc: boolean
  assetClass?: string
  jurisdiction?: string
}

interface StoredPool {
  address: string
  tokenAMint: string
  tokenBMint: string
  tokenASymbol: string
  tokenBSymbol: string
  liquidity: number
  sqrtPrice: number
  createdAt: Date
  isOwner: boolean
  feeRate: number
  tokenAHasHook?: boolean
  tokenBHasHook?: boolean
}

interface StoredConfig {
  address: string
  name: string
  feeRate: number
  activationType: number
  collectFeeMode: number
  createdAt: Date
  isDefault: boolean
}

interface KycStatus {
  exists: boolean
  level?: number
  country?: string
  state?: string
  city?: string
  canTradeRwa: boolean
  lastUpdated: Date
}

interface UserJourney {
  currentStep: number
  completedSteps: number[]
  skipOnboarding: boolean
  preferredAssetClass: string
  lastKycLevel: number
  hasCreatedToken: boolean
  hasCreatedPool: boolean
  hasExecutedSwap: boolean
  onboardingCompleted: boolean
}

interface TradingPreferences {
  defaultSlippage: number
  preferredTokens: string[]
  lastUsedPools: string[]
  tradingLimits: {
    maxDailyVolume: number
    maxSingleTrade: number
  }
  autoFillForms: boolean
  showAdvancedOptions: boolean
  skipOnboarding?: boolean
}

interface Notification {
  id: string
  type: 'success' | 'info' | 'warning' | 'error'
  title: string
  message: string
  action?: {
    label: string
    href: string
  }
  timestamp: Date
  read: boolean
}

interface SmartDefaults {
  // Token defaults
  suggestedTokenPair: {
    tokenA: string | null
    tokenB: string | null
  }
  // Pool defaults
  recommendedFeeRate: number
  recommendedLiquidity: {
    tokenA: number
    tokenB: number
  }
  // Trading defaults
  preferredSlippage: number
  suggestedAmounts: {
    small: number
    medium: number
    large: number
  }
  // KYC recommendations
  suggestedKycLevel: number
  // Asset class suggestions
  recommendedAssetClass: string
}

interface UserSessionData {
  // Core data
  tokens: StoredToken[]
  pools: StoredPool[]
  configs: StoredConfig[]
  userKyc: KycStatus
  journey: UserJourney
  preferences: TradingPreferences
  notifications: Notification[]

  // Metadata
  walletAddress?: string
  lastActivity: Date
  sessionVersion: string
}

interface UserSessionContextType {
  // Data
  sessionData: UserSessionData

  // Tokens
  addToken: (token: StoredToken) => void
  removeToken: (address: string) => void
  getTokenByAddress: (address: string) => StoredToken | undefined
  cleanupInvalidTokens: () => void

  // Pools
  addPool: (pool: StoredPool) => void
  removePool: (address: string) => void
  getPoolsByToken: (tokenAddress: string) => StoredPool[]

  // Configs
  addConfig: (config: StoredConfig) => void
  removeConfig: (address: string) => void
  getDefaultConfig: () => StoredConfig | undefined

  // KYC
  updateKycStatus: (kyc: Partial<KycStatus>) => void

  // Journey
  setCurrentStep: (step: number) => void
  markStepCompleted: (step: number) => void
  resetJourney: () => void
  getNextStep: () => number | null

  // Preferences
  updatePreferences: (prefs: Partial<TradingPreferences>) => void

  // Notifications
  addNotification: (notification: Omit<Notification, 'id' | 'timestamp' | 'read'>) => void
  markNotificationRead: (id: string) => void
  clearNotifications: () => void
  getUnreadCount: () => number

  // Utility
  exportData: () => string
  importData: (data: string) => boolean
  clearAllData: () => void
  isNewUser: () => boolean
  getSmartDefaults: () => SmartDefaults
}

// Default data structures
const defaultKycStatus: KycStatus = {
  exists: false,
  canTradeRwa: false,
  lastUpdated: new Date(),
}

const defaultJourney: UserJourney = {
  currentStep: 1,
  completedSteps: [],
  skipOnboarding: false,
  preferredAssetClass: 'Real Estate',
  lastKycLevel: 0,
  hasCreatedToken: false,
  hasCreatedPool: false,
  hasExecutedSwap: false,
  onboardingCompleted: false,
}

const defaultPreferences: TradingPreferences = {
  defaultSlippage: 0.5,
  preferredTokens: [],
  lastUsedPools: [],
  tradingLimits: {
    maxDailyVolume: 100000,
    maxSingleTrade: 10000,
  },
  autoFillForms: true,
  showAdvancedOptions: false,
}

const defaultSessionData: UserSessionData = {
  tokens: [],
  pools: [],
  configs: [],
  userKyc: defaultKycStatus,
  journey: defaultJourney,
  preferences: defaultPreferences,
  notifications: [],
  lastActivity: new Date(),
  sessionVersion: '1.0.0',
}

const STORAGE_KEY = 'rwa_amm_user_session'
const STORAGE_VERSION = '1.0.0'

// Create context
const UserSessionContext = createContext<UserSessionContextType | null>(null)

// Storage utilities
const saveToStorage = (data: UserSessionData) => {
  try {
    const serializedData = {
      ...data,
      lastActivity: data.lastActivity.toISOString(),
      userKyc: {
        ...data.userKyc,
        lastUpdated: data.userKyc.lastUpdated.toISOString(),
      },
      tokens: data.tokens.map((token) => ({
        ...token,
        createdAt: token.createdAt.toISOString(),
      })),
      pools: data.pools.map((pool) => ({
        ...pool,
        createdAt: pool.createdAt.toISOString(),
      })),
      configs: data.configs.map((config) => ({
        ...config,
        createdAt: config.createdAt.toISOString(),
      })),
      notifications: data.notifications.map((notif) => ({
        ...notif,
        timestamp: notif.timestamp.toISOString(),
      })),
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(serializedData))
    console.log('Session data saved to localStorage:', STORAGE_KEY, data.tokens.length, 'tokens')
  } catch (error) {
    console.error('Error saving session data:', error)
  }
}

const loadFromStorage = (): UserSessionData => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) {
      console.log('No session data found in localStorage, using defaults')
      return defaultSessionData
    }

    const parsed = JSON.parse(stored)

    // Version check
    if (parsed.sessionVersion !== STORAGE_VERSION) {
      console.warn('Session data version mismatch, resetting...')
      return defaultSessionData
    }

    // Parse dates back
    const loadedData = {
      ...parsed,
      lastActivity: new Date(parsed.lastActivity),
      userKyc: {
        ...parsed.userKyc,
        lastUpdated: new Date(parsed.userKyc.lastUpdated),
      },
      tokens: parsed.tokens.map((token: any) => ({
        ...token,
        createdAt: token.createdAt ? new Date(token.createdAt) : new Date(),
      })),
      pools: parsed.pools.map((pool: any) => ({
        ...pool,
        createdAt: new Date(pool.createdAt),
      })),
      configs: parsed.configs.map((config: any) => ({
        ...config,
        createdAt: new Date(config.createdAt),
      })),
      notifications: parsed.notifications.map((notif: any) => ({
        ...notif,
        timestamp: new Date(notif.timestamp),
      })),
    }

    console.log('Session data loaded from localStorage:', loadedData.tokens.length, 'tokens')
    return loadedData
  } catch (error) {
    console.error('Error loading session data:', error)
    return defaultSessionData
  }
}


// Provider component
export const UserSessionProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [sessionData, setSessionData] = useState<UserSessionData>(defaultSessionData)
  const [isLoaded, setIsLoaded] = useState(false)

  // Load data on mount and cleanup invalid tokens
  useEffect(() => {
    const loaded = loadFromStorage()

    // Clean up any invalid tokens that may exist in loaded data
    const cleanedTokens = loaded.tokens.filter((token) => {
      try {
        new PublicKey(token.address.trim())
        return true
      } catch {
        console.log('Removing invalid token address during load:', token.address)
        return false
      }
    })

    // Update loaded data with cleaned tokens if any were removed
    const cleanedData = cleanedTokens.length !== loaded.tokens.length ? { ...loaded, tokens: cleanedTokens } : loaded

    setSessionData(cleanedData)
    setIsLoaded(true)
  }, [])

  // Save data whenever it changes
  useEffect(() => {
    if (isLoaded) {
      console.log('SessionData changed, saving to localStorage. Tokens count:', sessionData.tokens.length)
      saveToStorage(sessionData)
    }
  }, [sessionData, isLoaded])

  // Auto-save activity timestamp
  useEffect(() => {
    const updateActivity = () => {
      setSessionData((prev) => ({
        ...prev,
        lastActivity: new Date(),
      }))
    }

    const interval = setInterval(updateActivity, 30000) // Every 30 seconds
    window.addEventListener('beforeunload', updateActivity)

    return () => {
      clearInterval(interval)
      window.removeEventListener('beforeunload', updateActivity)
    }
  }, [])

  // Token management
  const addToken = (token: StoredToken) => {
    console.log('addToken called with:', token)
    
    // Validate token address is a valid Solana PublicKey before storing
    try {
      new PublicKey(token.address)
    } catch (error) {
      console.error('Invalid token address provided to addToken:', token.address, error)
      return // Don't store invalid addresses
    }

    // Ensure address is properly formatted (no extra whitespace)
    const cleanedToken = {
      ...token,
      address: token.address.trim(),
    }

    console.log('Adding cleaned token to session:', cleanedToken)

    setSessionData((prev) => {
      const newTokens = [...prev.tokens.filter((t) => t.address !== cleanedToken.address), cleanedToken]
      console.log('New tokens array length:', newTokens.length)
      
      return {
        ...prev,
        tokens: newTokens,
        journey: {
          ...prev.journey,
          hasCreatedToken: true,
          completedSteps: Array.from(new Set([...prev.journey.completedSteps, 3])),
        },
      }
    })
  }

  const removeToken = (address: string) => {
    setSessionData((prev) => ({
      ...prev,
      tokens: prev.tokens.filter((t) => t.address !== address),
    }))
  }

  const getTokenByAddress = (address: string) => {
    return sessionData.tokens.find((t) => t.address === address)
  }

  // Pool management
  const addPool = (pool: StoredPool) => {
    setSessionData((prev) => ({
      ...prev,
      pools: [...prev.pools.filter((p) => p.address !== pool.address), pool],
      journey: {
        ...prev.journey,
        hasCreatedPool: true,
        completedSteps: Array.from(new Set([...prev.journey.completedSteps, 5])),
      },
    }))
  }

  const removePool = (address: string) => {
    setSessionData((prev) => ({
      ...prev,
      pools: prev.pools.filter((p) => p.address !== address),
    }))
  }

  const getPoolsByToken = (tokenAddress: string) => {
    return sessionData.pools.filter((p) => p.tokenAMint === tokenAddress || p.tokenBMint === tokenAddress)
  }

  // Config management
  const addConfig = (config: StoredConfig) => {
    setSessionData((prev) => ({
      ...prev,
      configs: [...prev.configs.filter((c) => c.address !== config.address), config],
    }))
  }

  const removeConfig = (address: string) => {
    setSessionData((prev) => ({
      ...prev,
      configs: prev.configs.filter((c) => c.address !== address),
    }))
  }

  const getDefaultConfig = () => {
    return sessionData.configs.find((c) => c.isDefault) || sessionData.configs[0]
  }

  // KYC management
  const updateKycStatus = (kyc: Partial<KycStatus>) => {
    setSessionData((prev) => ({
      ...prev,
      userKyc: {
        ...prev.userKyc,
        ...kyc,
        lastUpdated: new Date(),
      },
      journey: {
        ...prev.journey,
        lastKycLevel: kyc.level || prev.journey.lastKycLevel,
        completedSteps: kyc.exists
          ? Array.from(new Set([...prev.journey.completedSteps, 2]))
          : prev.journey.completedSteps,
      },
    }))
  }

  // Journey management
  const setCurrentStep = (step: number) => {
    setSessionData((prev) => ({
      ...prev,
      journey: { ...prev.journey, currentStep: step },
    }))
  }

  const markStepCompleted = (step: number) => {
    setSessionData((prev) => ({
      ...prev,
      journey: {
        ...prev.journey,
        completedSteps: Array.from(new Set([...prev.journey.completedSteps, step])),
      },
    }))
  }

  const resetJourney = () => {
    setSessionData((prev) => ({
      ...prev,
      journey: defaultJourney,
    }))
  }

  const getNextStep = (): number | null => {
    const { journey } = sessionData
    const allSteps = [1, 2, 3, 4, 5, 6, 7] // All possible steps

    for (const step of allSteps) {
      if (!journey.completedSteps.includes(step)) {
        return step
      }
    }

    return null // All steps completed
  }

  // Preferences management
  const updatePreferences = (prefs: Partial<TradingPreferences>) => {
    setSessionData((prev) => ({
      ...prev,
      preferences: { ...prev.preferences, ...prefs },
    }))
  }

  // Token cleanup utilities
  const cleanupInvalidTokens = () => {
    console.log('Cleaning up invalid tokens')
    // setSessionData((prev) => ({
    //   ...prev,
    //   tokens: prev.tokens.filter((token) => {
    //     try {
    //       new PublicKey(token.address.trim())
    //       return true
    //     } catch {
    //       console.log('Removing invalid token address from storage:', token.address)
    //       return false
    //     }
    //   })
    // }))
  }

  // Notification management
  const addNotification = (notification: Omit<Notification, 'id' | 'timestamp' | 'read'>) => {
    const newNotification: Notification = {
      ...notification,
      id: Date.now().toString(),
      timestamp: new Date(),
      read: false,
    }

    setSessionData((prev) => ({
      ...prev,
      notifications: [newNotification, ...prev.notifications.slice(0, 49)], // Keep only 50 notifications
    }))
  }

  const markNotificationRead = (id: string) => {
    setSessionData((prev) => ({
      ...prev,
      notifications: prev.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)),
    }))
  }

  const clearNotifications = () => {
    setSessionData((prev) => ({
      ...prev,
      notifications: [],
    }))
  }

  const getUnreadCount = () => {
    return sessionData.notifications.filter((n) => !n.read).length
  }

  // Utility functions
  const exportData = (): string => {
    return JSON.stringify(sessionData, null, 2)
  }

  const importData = (data: string): boolean => {
    try {
      const parsed = JSON.parse(data)
      // Validate the structure
      if (parsed.sessionVersion && parsed.tokens && parsed.pools) {
        setSessionData(parsed)
        return true
      }
      return false
    } catch {
      return false
    }
  }

  const clearAllData = () => {
    setSessionData(defaultSessionData)
    localStorage.removeItem(STORAGE_KEY)
  }

  const isNewUser = () => {
    return (
      sessionData.tokens.length === 0 &&
      sessionData.pools.length === 0 &&
      !sessionData.userKyc.exists &&
      sessionData.journey.completedSteps.length === 0
    )
  }

  const getSmartDefaults = (): SmartDefaults => {
    const { tokens, pools, preferences, userKyc, journey } = sessionData

    // Smart token pair suggestions
    let suggestedTokenPair: { tokenA: string | null; tokenB: string | null } = {
      tokenA: null,
      tokenB: null,
    }

    if (tokens.length > 0) {
      // Use most recently created token as tokenA
      const recentToken = tokens[tokens.length - 1]
      suggestedTokenPair.tokenA = recentToken.address

      // Suggest USDC as tokenB for new tokens
      suggestedTokenPair.tokenB = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' // USDC
    } else if (preferences.preferredTokens.length >= 2) {
      // Use preferred tokens
      suggestedTokenPair.tokenA = preferences.preferredTokens[0]
      suggestedTokenPair.tokenB = preferences.preferredTokens[1]
    }

    // Smart fee rate based on asset class and token types
    let recommendedFeeRate = 30 // Default 0.3%
    if (tokens.length > 0) {
      const hasRwaTokens = tokens.some((t) => t.hasTransferHook)
      if (hasRwaTokens) {
        recommendedFeeRate = 50 // Higher fee for RWA tokens (0.5%)
      }
    }

    // Smart liquidity recommendations based on previous pools
    let recommendedLiquidity = { tokenA: 1000, tokenB: 1000 }
    if (pools.length > 0) {
      const avgLiquidity = pools.reduce((sum, pool) => sum + pool.liquidity, 0) / pools.length
      recommendedLiquidity = {
        tokenA: Math.max(avgLiquidity * 0.8, 500),
        tokenB: Math.max(avgLiquidity * 0.8, 500),
      }
    }

    // Smart slippage based on trading history
    let preferredSlippage = preferences.defaultSlippage || 0.5
    if (preferences.lastUsedPools.length > 0) {
      // For RWA pools, suggest higher slippage
      preferredSlippage = 1.0
    }

    // Smart amount suggestions based on user's trading patterns
    const suggestedAmounts = {
      small: 10,
      medium: 100,
      large: 1000,
    }

    // KYC level suggestions based on asset class preference
    let suggestedKycLevel = 1
    if (journey.preferredAssetClass) {
      switch (journey.preferredAssetClass) {
        case 'Real Estate':
        case 'Fixed Income':
          suggestedKycLevel = 2
          break
        case 'Equity Securities':
          suggestedKycLevel = 3
          break
        default:
          suggestedKycLevel = 1
      }
    }

    // Asset class recommendation based on current holdings
    let recommendedAssetClass = journey.preferredAssetClass || 'Real Estate'
    if (tokens.length > 0) {
      const assetClassCounts = tokens.reduce(
        (acc, token) => {
          const assetClass = token.assetClass || 'Real Estate'
          acc[assetClass] = (acc[assetClass] || 0) + 1
          return acc
        },
        {} as Record<string, number>,
      )

      const mostCommonAssetClass = Object.entries(assetClassCounts).sort(([, a], [, b]) => b - a)[0]?.[0]

      if (mostCommonAssetClass) {
        recommendedAssetClass = mostCommonAssetClass
      }
    }

    return {
      suggestedTokenPair,
      recommendedFeeRate,
      recommendedLiquidity,
      preferredSlippage,
      suggestedAmounts,
      suggestedKycLevel,
      recommendedAssetClass,
    }
  }

  const contextValue: UserSessionContextType = {
    sessionData,
    addToken,
    removeToken,
    getTokenByAddress,
    cleanupInvalidTokens,
    addPool,
    removePool,
    getPoolsByToken,
    addConfig,
    removeConfig,
    getDefaultConfig,
    updateKycStatus,
    setCurrentStep,
    markStepCompleted,
    resetJourney,
    getNextStep,
    updatePreferences,
    addNotification,
    markNotificationRead,
    clearNotifications,
    getUnreadCount,
    exportData,
    importData,
    clearAllData,
    isNewUser,
    getSmartDefaults,
  }

  return <UserSessionContext.Provider value={contextValue}>{children}</UserSessionContext.Provider>
}

// Hook to use the context
export const useUserSession = (): UserSessionContextType => {
  const context = useContext(UserSessionContext)
  if (!context) {
    throw new Error('useUserSession must be used within a UserSessionProvider')
  }
  return context
}

export type {
  StoredToken,
  StoredPool,
  StoredConfig,
  KycStatus,
  UserJourney,
  TradingPreferences,
  Notification,
  UserSessionData,
  SmartDefaults,
}
