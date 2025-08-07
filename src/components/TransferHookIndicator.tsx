'use client'

import { useState, useEffect } from 'react'
import { Shield, AlertTriangle, CheckCircle, Clock } from 'lucide-react'
import { useRwaAmmSdk } from '@/hooks/useRwaAmmSdk'

interface TransferHookIndicatorProps {
  mintAddress: string
  className?: string
  showLabel?: boolean
  size?: 'sm' | 'md' | 'lg'
}

export default function TransferHookIndicator({
  mintAddress,
  className = '',
  showLabel = true,
  size = 'md'
}: TransferHookIndicatorProps) {
  const { checkTransferHookStatus, getUserKycStatus, connected } = useRwaAmmSdk()
  const [hookStatus, setHookStatus] = useState<{
    hasHook: boolean
    requiresKyc: boolean
    requiredKycLevel?: number
    loading: boolean
  }>({ hasHook: false, requiresKyc: false, loading: true })
  
  const [userKycStatus, setUserKycStatus] = useState<{
    exists: boolean
    level?: number
    canTradeRwa: boolean
    loading: boolean
  }>({ exists: false, canTradeRwa: false, loading: true })

  useEffect(() => {
    async function loadHookStatus() {
      if (!mintAddress || mintAddress === '') {
        setHookStatus({ hasHook: false, requiresKyc: false, loading: false })
        return
      }

      try {
        const status = await checkTransferHookStatus(mintAddress)
        setHookStatus({
          ...status,
          loading: false
        })
      } catch (err) {
        console.error('Error checking transfer hook status:', err)
        setHookStatus({ hasHook: false, requiresKyc: false, loading: false })
      }
    }

    loadHookStatus()
  }, [mintAddress, checkTransferHookStatus])

  useEffect(() => {
    async function loadUserKyc() {
      if (!connected) {
        setUserKycStatus({ exists: false, canTradeRwa: false, loading: false })
        return
      }

      try {
        const status = await getUserKycStatus()
        setUserKycStatus({
          ...status,
          loading: false
        })
      } catch (err) {
        console.error('Error getting user KYC status:', err)
        setUserKycStatus({ exists: false, canTradeRwa: false, loading: false })
      }
    }

    loadUserKyc()
  }, [connected, getUserKycStatus])

  const getDisplayInfo = () => {
    if (hookStatus.loading || userKycStatus.loading) {
      return {
        icon: Clock,
        label: 'Loading...',
        color: 'text-gray-400',
        bgColor: 'bg-gray-100',
        description: 'Checking compliance status...'
      }
    }

    if (!hookStatus.hasHook) {
      return {
        icon: CheckCircle,
        label: 'Standard Token',
        color: 'text-green-600',
        bgColor: 'bg-green-100',
        description: 'No special compliance requirements'
      }
    }

    // RWA Token with transfer hook
    const hasRequiredKyc = userKycStatus.canTradeRwa && 
                          userKycStatus.level && 
                          userKycStatus.level >= (hookStatus.requiredKycLevel || 2)

    if (!connected) {
      return {
        icon: Shield,
        label: 'RWA Token',
        color: 'text-blue-600',
        bgColor: 'bg-blue-100',
        description: 'Connect wallet to check compliance status'
      }
    }

    if (!userKycStatus.exists) {
      return {
        icon: AlertTriangle,
        label: 'KYC Required',
        color: 'text-red-600',
        bgColor: 'bg-red-100',
        description: 'KYC verification required for trading'
      }
    }

    if (!hasRequiredKyc) {
      return {
        icon: AlertTriangle,
        label: 'Enhanced KYC Required',
        color: 'text-yellow-600',
        bgColor: 'bg-yellow-100',
        description: `Level ${hookStatus.requiredKycLevel || 2} KYC required for RWA trading`
      }
    }

    return {
      icon: Shield,
      label: 'RWA Compliant',
      color: 'text-green-600',
      bgColor: 'bg-green-100',
      description: 'Compliance validated - trading enabled'
    }
  }

  const displayInfo = getDisplayInfo()
  const Icon = displayInfo.icon

  const sizeClasses = {
    sm: {
      icon: 'w-3 h-3',
      text: 'text-xs',
      container: 'px-2 py-1'
    },
    md: {
      icon: 'w-4 h-4',
      text: 'text-sm',
      container: 'px-3 py-1.5'
    },
    lg: {
      icon: 'w-5 h-5', 
      text: 'text-base',
      container: 'px-4 py-2'
    }
  }

  const sizes = sizeClasses[size]

  if (!showLabel) {
    return (
      <div 
        className={`inline-flex items-center justify-center rounded-full ${displayInfo.bgColor} ${sizes.container} ${className}`}
        title={displayInfo.description}
      >
        <Icon className={`${displayInfo.color} ${sizes.icon}`} />
      </div>
    )
  }

  return (
    <div 
      className={`inline-flex items-center space-x-2 rounded-full ${displayInfo.bgColor} ${sizes.container} ${className}`}
      title={displayInfo.description}
    >
      <Icon className={`${displayInfo.color} ${sizes.icon}`} />
      <span className={`font-medium ${displayInfo.color} ${sizes.text}`}>
        {displayInfo.label}
      </span>
    </div>
  )
}

// Simplified version for just showing hook status without KYC validation
export function SimpleTransferHookIndicator({ 
  mintAddress, 
  className = '',
  size = 'sm'
}: Omit<TransferHookIndicatorProps, 'showLabel'>) {
  const { checkTransferHookStatus } = useRwaAmmSdk()
  const [hasHook, setHasHook] = useState<boolean | null>(null)

  useEffect(() => {
    async function checkHook() {
      if (!mintAddress || mintAddress === '') {
        setHasHook(false)
        return
      }

      try {
        const status = await checkTransferHookStatus(mintAddress)
        setHasHook(status.hasHook)
      } catch (err) {
        setHasHook(false)
      }
    }

    checkHook()
  }, [mintAddress, checkTransferHookStatus])

  if (hasHook === null) {
    return null // Loading
  }

  if (!hasHook) {
    return null // Don't show anything for standard tokens
  }

  const sizeClass = size === 'sm' ? 'w-2 h-2' : size === 'md' ? 'w-3 h-3' : 'w-4 h-4'

  return (
    <div 
      className={`${sizeClass} bg-blue-500 rounded-full ${className}`}
      title="RWA Token with Transfer Hook"
    />
  )
}