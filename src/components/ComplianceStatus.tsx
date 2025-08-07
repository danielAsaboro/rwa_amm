'use client'

import { useState, useEffect } from 'react'
import { Shield, AlertTriangle, CheckCircle, UserCheck, Clock, ExternalLink } from 'lucide-react'
import { useRwaAmmSdk } from '@/hooks/useRwaAmmSdk'

interface ComplianceStatusProps {
  inputMint?: string
  outputMint?: string
  amount?: number
  className?: string
  showDetails?: boolean
  onComplianceChange?: (canTrade: boolean, reason?: string) => void
}

export default function ComplianceStatus({
  inputMint,
  outputMint,
  amount = 0,
  className = '',
  showDetails = true,
  onComplianceChange
}: ComplianceStatusProps) {
  const { 
    validateSwap, 
    getUserKycStatus, 
    checkTransferHookStatus,
    connected 
  } = useRwaAmmSdk()
  
  const [validationStatus, setValidationStatus] = useState<{
    canSwap: boolean
    reason?: string
    requiredKycLevel?: number
    inputHookStatus?: any
    outputHookStatus?: any
    loading: boolean
  }>({ canSwap: false, loading: false })

  const [userKyc, setUserKyc] = useState<{
    exists: boolean
    level?: number
    canTradeRwa: boolean
    loading: boolean
  }>({ exists: false, canTradeRwa: false, loading: false })

  useEffect(() => {
    async function loadUserKyc() {
      if (!connected) {
        setUserKyc({ exists: false, canTradeRwa: false, loading: false })
        return
      }

      setUserKyc(prev => ({ ...prev, loading: true }))
      try {
        const status = await getUserKycStatus()
        setUserKyc({ ...status, loading: false })
      } catch (err) {
        console.error('Error getting KYC status:', err)
        setUserKyc({ exists: false, canTradeRwa: false, loading: false })
      }
    }

    loadUserKyc()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected])

  useEffect(() => {
    async function validateTransaction() {
      if (!inputMint || !outputMint || !connected) {
        setValidationStatus({ canSwap: false, loading: false })
        onComplianceChange?.(false, 'Incomplete transaction details')
        return
      }

      setValidationStatus(prev => ({ ...prev, loading: true }))
      try {
        const validation = await validateSwap(inputMint, outputMint, amount)
        setValidationStatus({ ...validation, loading: false })
        onComplianceChange?.(validation.canSwap, validation.reason)
      } catch (err) {
        console.error('Error validating swap:', err)
        const errorStatus = { 
          canSwap: false, 
          reason: 'Unable to validate compliance',
          loading: false 
        }
        setValidationStatus(errorStatus)
        onComplianceChange?.(false, errorStatus.reason)
      }
    }

    validateTransaction()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputMint, outputMint, amount, connected])

  const getStatusInfo = () => {
    if (!connected) {
      return {
        icon: AlertTriangle,
        label: 'Connect Wallet',
        color: 'text-gray-600',
        bgColor: 'bg-gray-100',
        description: 'Connect your wallet to check compliance status'
      }
    }

    if (validationStatus.loading || userKyc.loading) {
      return {
        icon: Clock,
        label: 'Checking Compliance...',
        color: 'text-blue-600',
        bgColor: 'bg-blue-100',
        description: 'Validating transaction compliance requirements'
      }
    }

    if (validationStatus.canSwap) {
      return {
        icon: CheckCircle,
        label: 'Compliant',
        color: 'text-green-600',
        bgColor: 'bg-green-100',
        description: 'Transaction meets all compliance requirements'
      }
    }

    if (validationStatus.reason?.includes('KYC required')) {
      return {
        icon: UserCheck,
        label: 'KYC Required',
        color: 'text-red-600',
        bgColor: 'bg-red-100',
        description: validationStatus.reason
      }
    }

    if (validationStatus.reason?.includes('Enhanced KYC')) {
      return {
        icon: Shield,
        label: 'Enhanced KYC Required',
        color: 'text-yellow-600',
        bgColor: 'bg-yellow-100',
        description: validationStatus.reason
      }
    }

    return {
      icon: AlertTriangle,
      label: 'Compliance Issue',
      color: 'text-red-600',
      bgColor: 'bg-red-100',
      description: validationStatus.reason || 'Unable to validate compliance'
    }
  }

  const statusInfo = getStatusInfo()
  const Icon = statusInfo.icon

  const hasRwaTokens = validationStatus.inputHookStatus?.hasHook || 
                      validationStatus.outputHookStatus?.hasHook

  return (
    <div className={`${className}`}>
      {/* Main Status Indicator */}
      <div className={`inline-flex items-center space-x-3 rounded-lg ${statusInfo.bgColor} px-4 py-3`}>
        <Icon className={`w-5 h-5 ${statusInfo.color}`} />
        <div>
          <div className={`font-semibold ${statusInfo.color}`}>
            {statusInfo.label}
          </div>
          <div className={`text-sm ${statusInfo.color} opacity-80`}>
            {statusInfo.description}
          </div>
        </div>
      </div>

      {/* Detailed Status (if enabled) */}
      {showDetails && connected && (
        <div className="mt-4 space-y-3">
          {/* User KYC Status */}
          <div className="bg-white/50 rounded-lg p-3">
            <h4 className="font-medium text-gray-700 mb-2">Your KYC Status</h4>
            <div className="flex items-center space-x-2">
              {userKyc.exists ? (
                <>
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span className="text-sm text-gray-600">
                    Level {userKyc.level} KYC 
                    {userKyc.canTradeRwa && (
                      <span className="text-green-600 font-medium"> (RWA Enabled)</span>
                    )}
                  </span>
                </>
              ) : (
                <>
                  <AlertTriangle className="w-4 h-4 text-red-500" />
                  <span className="text-sm text-gray-600">No KYC verification</span>
                  <button
                    onClick={() => window.location.href = '/kyc'}
                    className="ml-2 text-blue-500 hover:text-blue-700 text-sm flex items-center space-x-1"
                  >
                    <span>Setup KYC</span>
                    <ExternalLink className="w-3 h-3" />
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Token Compliance Requirements */}
          {hasRwaTokens && (
            <div className="bg-white/50 rounded-lg p-3">
              <h4 className="font-medium text-gray-700 mb-2">Token Requirements</h4>
              <div className="space-y-2">
                {validationStatus.inputHookStatus?.hasHook && (
                  <div className="flex items-center space-x-2">
                    <Shield className="w-4 h-4 text-blue-500" />
                    <span className="text-sm text-gray-600">
                      Input token: RWA compliance required
                    </span>
                  </div>
                )}
                {validationStatus.outputHookStatus?.hasHook && (
                  <div className="flex items-center space-x-2">
                    <Shield className="w-4 h-4 text-blue-500" />
                    <span className="text-sm text-gray-600">
                      Output token: RWA compliance required
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Action Items */}
          {!validationStatus.canSwap && validationStatus.reason && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
              <h4 className="font-medium text-yellow-800 mb-2">Required Actions</h4>
              <div className="text-sm text-yellow-700">
                {validationStatus.reason.includes('KYC required') && (
                  <div className="flex items-center justify-between">
                    <span>Complete KYC verification</span>
                    <button
                      onClick={() => window.location.href = '/kyc'}
                      className="px-3 py-1 bg-yellow-500 text-white rounded text-xs hover:bg-yellow-600"
                    >
                      Setup KYC
                    </button>
                  </div>
                )}
                {validationStatus.reason.includes('Enhanced KYC') && (
                  <div className="flex items-center justify-between">
                    <span>Upgrade to Enhanced KYC (Level {validationStatus.requiredKycLevel})</span>
                    <button
                      onClick={() => window.location.href = '/kyc'}
                      className="px-3 py-1 bg-yellow-500 text-white rounded text-xs hover:bg-yellow-600"
                    >
                      Upgrade KYC
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}