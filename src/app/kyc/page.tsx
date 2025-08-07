'use client'

import { useState, useEffect } from 'react'
import { useRwaAmmSdk } from '@/hooks/useRwaAmmSdk'
import { useUserSession } from '@/contexts/UserSessionContext'
import Header from '@/components/Header'
import toast from 'react-hot-toast'
import {
  UserCheck,
  Shield,
  CheckCircle,
  AlertTriangle,
  Globe,
  MapPin,
  Clock,
  TrendingUp,
  FileText,
  ExternalLink,
  RefreshCw,
} from 'lucide-react'

interface KycLevel {
  level: number
  name: string
  description: string
  requirements: string[]
  tradingLimits: {
    daily: string
    monthly: string
    perTransaction: string
  }
  features: string[]
  rwaAccess: boolean
}

export default function KycManagement() {
  const { createUserKyc, getUserKycStatus, connected, publicKey, loading, error, clearError } = useRwaAmmSdk()
  const { updateKycStatus } = useUserSession()

  const [currentKycStatus, setCurrentKycStatus] = useState<{
    exists: boolean
    level?: number
    country?: string
    state?: string
    city?: string
    canTradeRwa: boolean
    loading: boolean
  }>({ exists: false, canTradeRwa: false, loading: false })

  const [selectedLevel, setSelectedLevel] = useState<number>(2)
  const [kycForm, setKycForm] = useState({
    country: 'US',
    state: 'CA',
    city: 'San Francisco',
  })

  const [submitStatus, setSubmitStatus] = useState<'idle' | 'creating' | 'success' | 'error'>('idle')
  const [transactionSignature, setTransactionSignature] = useState<string | null>(null)

  // KYC Level Definitions
  const KYC_LEVELS: KycLevel[] = [
    {
      level: 1,
      name: 'Basic KYC',
      description: 'Essential verification for standard token trading',
      requirements: ['Email verification', 'Basic identity validation', 'Geographic compliance check'],
      tradingLimits: {
        daily: '$5,000',
        monthly: '$50,000',
        perTransaction: '$1,000',
      },
      features: ['Standard token trading', 'Basic liquidity provision', 'Access to commodity tokens'],
      rwaAccess: false,
    },
    {
      level: 2,
      name: 'Enhanced KYC',
      description: 'Advanced verification for RWA token access',
      requirements: [
        'Government ID verification',
        'Address proof documentation',
        'Enhanced due diligence',
        'Accredited investor status (optional)',
      ],
      tradingLimits: {
        daily: '$100,000',
        monthly: '$1,000,000',
        perTransaction: '$50,000',
      },
      features: [
        'All Basic KYC features',
        'RWA token trading access',
        'Real estate token access',
        'Fixed income securities',
        'Priority customer support',
      ],
      rwaAccess: true,
    },
    {
      level: 3,
      name: 'Institutional KYC',
      description: 'Maximum verification for institutional trading',
      requirements: [
        'Corporate documentation',
        'Beneficial ownership disclosure',
        'Regulatory compliance audit',
        'Accredited investor verification',
        'AML/CFT compliance check',
      ],
      tradingLimits: {
        daily: '$10,000,000',
        monthly: '$100,000,000',
        perTransaction: '$5,000,000',
      },
      features: [
        'All Enhanced KYC features',
        'Equity securities access',
        'Private placement tokens',
        'Institutional pool access',
        'Dedicated account manager',
        'Custom compliance solutions',
      ],
      rwaAccess: true,
    },
  ]

  // Load current KYC status
  useEffect(() => {
    async function loadKycStatus() {
      if (!connected) {
        setCurrentKycStatus({ exists: false, canTradeRwa: false, loading: false })
        return
      }

      setCurrentKycStatus((prev) => ({ ...prev, loading: true }))
      try {
        const status = await getUserKycStatus()
        setCurrentKycStatus({ ...status, loading: false })
        // Persist into session for onboarding progress
        updateKycStatus({
          exists: !!status.exists,
          level: status.level,
          country: status.country,
          state: status.state,
          city: status.city,
          canTradeRwa: !!status.canTradeRwa,
        })
      } catch (err) {
        console.error('Error loading KYC status:', err)
        setCurrentKycStatus({ exists: false, canTradeRwa: false, loading: false })
      }
    }

    loadKycStatus()
  }, [connected])

  // Prefill form from current KYC status when available
  useEffect(() => {
    if (currentKycStatus.exists) {
      if (currentKycStatus.level) setSelectedLevel(currentKycStatus.level)
      setKycForm((prev) => ({
        country: currentKycStatus.country || prev.country,
        state: currentKycStatus.state || prev.state,
        city: currentKycStatus.city || prev.city,
      }))
    }
  }, [currentKycStatus])

  // Handle KYC creation/upgrade
  const handleCreateKyc = async () => {
    if (!connected || !publicKey) {
      alert('Please connect your wallet first')
      return
    }

    setSubmitStatus('creating')
    clearError()

    try {
      const signature = await createUserKyc({
        kycLevel: selectedLevel,
        country: kycForm.country,
        state: kycForm.state,
        city: kycForm.city,
        userPublicKey: publicKey,
      })

      setTransactionSignature(signature)
      setSubmitStatus('success')
      toast.success('KYC updated successfully')

      // Refresh KYC status
      setTimeout(async () => {
        const newStatus = await getUserKycStatus()
        setCurrentKycStatus({ ...newStatus, loading: false })
        updateKycStatus({
          exists: !!newStatus.exists,
          level: newStatus.level,
          country: newStatus.country,
          state: newStatus.state,
          city: newStatus.city,
          canTradeRwa: !!newStatus.canTradeRwa,
        })
      }, 2000)

      console.log('KYC created/updated successfully:', signature)
    } catch (err) {
      console.error('Failed to create/update KYC:', err)
      setSubmitStatus('error')
      const message = err instanceof Error ? err.message : 'Failed to update KYC'
      toast.error(message)
    }
  }

  const refreshKycStatus = async () => {
    if (!connected) return

    setCurrentKycStatus((prev) => ({ ...prev, loading: true }))
    try {
      const status = await getUserKycStatus()
      setCurrentKycStatus({ ...status, loading: false })
      updateKycStatus({
        exists: !!status.exists,
        level: status.level,
        country: status.country,
        state: status.state,
        city: status.city,
        canTradeRwa: !!status.canTradeRwa,
      })
      toast.success('KYC status refreshed')
    } catch (err) {
      console.error('Error refreshing KYC status:', err)
      setCurrentKycStatus((prev) => ({ ...prev, loading: false }))
      toast.error('Failed to refresh KYC status')
    }
  }

  const getKycStatusColor = (level?: number) => {
    if (!level) return 'text-gray-400'
    if (level >= 3) return 'text-purple-400'
    if (level >= 2) return 'text-green-400'
    return 'text-blue-400'
  }

  const getKycStatusBg = (level?: number) => {
    if (!level) return 'bg-gray-500/10 border-gray-500/20'
    if (level >= 3) return 'bg-purple-500/10 border-purple-500/20'
    if (level >= 2) return 'bg-green-500/10 border-green-500/20'
    return 'bg-blue-500/10 border-blue-500/20'
  }

  if (!connected) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-neutral-900 to-neutral-950">
        <Header />
        <div className="max-w-2xl mx-auto px-4 py-20 text-center">
          <UserCheck className="w-16 h-16 text-gray-400 mx-auto mb-6" />
          <h1 className="text-3xl font-bold text-white mb-4">KYC Verification</h1>
          <p className="text-gray-400 mb-8">
            Connect your wallet to manage your KYC status and unlock RWA token trading.
          </p>
          <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6">
            <p className="text-gray-300 mb-4">Enhanced verification enables:</p>
            <ul className="text-sm text-gray-400 space-y-1">
              <li>• Real estate token trading</li>
              <li>• Fixed income securities access</li>
              <li>• Higher trading limits</li>
              <li>• Institutional features</li>
            </ul>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-neutral-900 to-neutral-950">
      <Header />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white flex items-center">
            <UserCheck className="w-8 h-8 mr-3 text-blue-400" />
            KYC Verification Center
          </h1>
          <p className="text-gray-400 mt-2">
            Manage your identity verification level to access RWA tokens and increased trading limits
          </p>
        </div>

        {/* Success Message */}
        {submitStatus === 'success' && transactionSignature && (
          <div className="mb-8 bg-green-500/10 border border-green-500/30 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-green-400 mb-2">🎉 KYC Updated Successfully!</h3>
            <p className="text-gray-300 mb-4">Your KYC level has been updated. You can now access enhanced features.</p>
            <div className="bg-black/20 rounded-lg p-4">
              <p className="text-sm text-gray-400 mb-2">Transaction Signature:</p>
              <div className="flex items-center space-x-2">
                <p className="text-green-400 font-mono text-sm flex-1 break-all">{transactionSignature}</p>
                <button
                  onClick={() =>
                    window.open(
                      `https://explorer.solana.com/tx/${transactionSignature}?cluster=custom&customUrl=http%3A%2F%2Flocalhost%3A8899`,
                      '_blank',
                    )
                  }
                  className="text-green-400 hover:text-green-300"
                >
                  <ExternalLink className="w-4 h-4" />
                </button>
              </div>
            </div>
            <button
              onClick={() => setSubmitStatus('idle')}
              className="mt-4 px-4 py-2 border border-green-500 text-green-400 rounded-lg hover:bg-green-500/10"
            >
              Continue
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Current KYC Status */}
          <div className="lg:col-span-1">
            <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6 sticky top-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">Current Status</h3>
                <button
                  onClick={refreshKycStatus}
                  disabled={currentKycStatus.loading}
                  className="p-1 text-gray-400 hover:text-white disabled:opacity-50"
                >
                  <RefreshCw className={`w-4 h-4 ${currentKycStatus.loading ? 'animate-spin' : ''}`} />
                </button>
              </div>

              {currentKycStatus.loading ? (
                <div className="text-center py-4">
                  <Clock className="w-8 h-8 text-gray-400 mx-auto mb-2 animate-pulse" />
                  <p className="text-gray-400">Checking KYC status...</p>
                </div>
              ) : currentKycStatus.exists ? (
                <div className={`p-4 rounded-lg border ${getKycStatusBg(currentKycStatus.level)}`}>
                  <div className="flex items-center space-x-3 mb-3">
                    <Shield className={`w-6 h-6 ${getKycStatusColor(currentKycStatus.level)}`} />
                    <div>
                      <p className={`font-semibold ${getKycStatusColor(currentKycStatus.level)}`}>
                        {KYC_LEVELS.find((l) => l.level === currentKycStatus.level)?.name || 'Unknown Level'}
                      </p>
                      <p className="text-xs text-gray-400">Level {currentKycStatus.level}</p>
                    </div>
                  </div>

                  <div className="space-y-2 text-sm">
                    <div className="flex items-center space-x-2">
                      <Globe className="w-4 h-4 text-gray-400" />
                      <span className="text-gray-300">{currentKycStatus.country}</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <MapPin className="w-4 h-4 text-gray-400" />
                      <span className="text-gray-300">
                        {currentKycStatus.state}, {currentKycStatus.city}
                      </span>
                    </div>
                    <div className="flex items-center space-x-2">
                      {currentKycStatus.canTradeRwa ? (
                        <>
                          <CheckCircle className="w-4 h-4 text-green-400" />
                          <span className="text-green-400">RWA Trading Enabled</span>
                        </>
                      ) : (
                        <>
                          <AlertTriangle className="w-4 h-4 text-yellow-400" />
                          <span className="text-yellow-400">RWA Trading Disabled</span>
                        </>
                      )}
                    </div>
                  </div>

                  {currentKycStatus.level && currentKycStatus.level < 3 && (
                    <div className="mt-4 pt-4 border-t border-gray-600">
                      <p className="text-xs text-gray-400 mb-2">Upgrade Available</p>
                      <button
                        onClick={() => setSelectedLevel(Math.min(currentKycStatus.level! + 1, 3))}
                        className="text-xs text-blue-400 hover:text-blue-300"
                      >
                        Upgrade to Level {Math.min(currentKycStatus.level + 1, 3)} →
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-6">
                  <AlertTriangle className="w-8 h-8 text-yellow-400 mx-auto mb-3" />
                  <p className="text-white font-medium mb-2">No KYC Verification</p>
                  <p className="text-sm text-gray-400 mb-4">
                    Complete KYC verification to access RWA tokens and increased trading limits.
                  </p>
                  <div className="text-xs text-gray-500">Limited to standard tokens only</div>
                </div>
              )}
            </div>
          </div>

          {/* KYC Levels and Form */}
          <div className="lg:col-span-2 space-y-6">
            {/* KYC Level Selection */}
            <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6">
              <h3 className="text-xl font-semibold text-white mb-6">Choose Your KYC Level</h3>
              <div className="space-y-4">
                {KYC_LEVELS.map((level) => (
                  <div
                    key={level.level}
                    className={`p-4 rounded-lg border cursor-pointer transition-all ${
                      selectedLevel === level.level
                        ? 'border-blue-500 bg-blue-500/10'
                        : 'border-gray-600 bg-gray-800/50 hover:border-gray-500'
                    }`}
                    onClick={() => setSelectedLevel(level.level)}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h4 className="text-lg font-medium text-white flex items-center">
                          {level.name}
                          {level.rwaAccess && (
                            <span className="ml-2 px-2 py-1 bg-green-500/20 text-green-400 text-xs rounded">
                              RWA Access
                            </span>
                          )}
                        </h4>
                        <p className="text-sm text-gray-400">{level.description}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-gray-400">Daily Limit</p>
                        <p className="text-white font-medium">{level.tradingLimits.daily}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-gray-400 mb-2">Requirements:</p>
                        <ul className="space-y-1">
                          {level.requirements.map((req, i) => (
                            <li key={i} className="flex items-center space-x-2">
                              <div className="w-1.5 h-1.5 bg-gray-400 rounded-full"></div>
                              <span className="text-gray-300">{req}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div>
                        <p className="text-gray-400 mb-2">Features:</p>
                        <ul className="space-y-1">
                          {level.features.slice(0, 3).map((feature, i) => (
                            <li key={i} className="flex items-center space-x-2">
                              <CheckCircle className="w-3 h-3 text-green-400" />
                              <span className="text-gray-300">{feature}</span>
                            </li>
                          ))}
                          {level.features.length > 3 && (
                            <li className="text-blue-400 text-xs">+{level.features.length - 3} more features</li>
                          )}
                        </ul>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Application Form */}
            <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6">
              <h3 className="text-xl font-semibold text-white mb-6">
                {currentKycStatus.exists ? 'Update' : 'Apply for'}{' '}
                {KYC_LEVELS.find((l) => l.level === selectedLevel)?.name}
              </h3>

              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Country</label>
                    <select
                      value={kycForm.country}
                      onChange={(e) => setKycForm({ ...kycForm, country: e.target.value })}
                      className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="US">United States</option>
                      <option value="CA">Canada</option>
                      <option value="UK">United Kingdom</option>
                      <option value="DE">Germany</option>
                      <option value="FR">France</option>
                      <option value="JP">Japan</option>
                      <option value="SG">Singapore</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">State/Province</label>
                    <input
                      type="text"
                      value={kycForm.state}
                      onChange={(e) => setKycForm({ ...kycForm, state: e.target.value })}
                      className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="CA"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">City</label>
                    <input
                      type="text"
                      value={kycForm.city}
                      onChange={(e) => setKycForm({ ...kycForm, city: e.target.value })}
                      className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="San Francisco"
                    />
                  </div>
                </div>

                {/* Compliance Notice */}
                <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4">
                  <div className="flex items-start space-x-3">
                    <FileText className="w-5 h-5 text-yellow-400 mt-0.5" />
                    <div>
                      <p className="text-yellow-400 font-medium mb-1">Compliance Notice</p>
                      <p className="text-sm text-yellow-300/80">
                        By proceeding, you confirm that you meet all regulatory requirements for your jurisdiction and
                        agree to provide additional documentation if requested for verification purposes.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Submit Button */}
                <button
                  onClick={handleCreateKyc}
                  disabled={submitStatus === 'creating' || loading}
                  className={`w-full py-3 rounded-lg font-semibold transition-all ${
                    submitStatus === 'creating' || loading
                      ? 'bg-gray-500 cursor-not-allowed text-gray-300'
                      : selectedLevel > (currentKycStatus.level || 0)
                        ? 'bg-gradient-to-b from-green-600 to-green-700 hover:from-green-500 hover:to-green-600 text-white'
                        : 'bg-gradient-to-b from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white'
                  }`}
                >
                  {submitStatus === 'creating'
                    ? 'Processing KYC...'
                    : currentKycStatus.exists && selectedLevel <= (currentKycStatus.level || 0)
                      ? 'Update Information'
                      : `Apply for ${KYC_LEVELS.find((l) => l.level === selectedLevel)?.name}`}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Features Comparison */}
        <div className="mt-12 bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6">
          <h3 className="text-xl font-semibold text-white mb-6">KYC Level Comparison</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="text-left py-3 text-gray-400">Feature</th>
                  {KYC_LEVELS.map((level) => (
                    <th key={level.level} className="text-center py-3 text-gray-400">
                      Level {level.level}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                <tr>
                  <td className="py-3 text-gray-300">Daily Trading Limit</td>
                  {KYC_LEVELS.map((level) => (
                    <td key={level.level} className="text-center py-3 text-white">
                      {level.tradingLimits.daily}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="py-3 text-gray-300">RWA Token Access</td>
                  {KYC_LEVELS.map((level) => (
                    <td key={level.level} className="text-center py-3">
                      {level.rwaAccess ? (
                        <CheckCircle className="w-5 h-5 text-green-400 mx-auto" />
                      ) : (
                        <div className="w-5 h-5 mx-auto"></div>
                      )}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="py-3 text-gray-300">Per Transaction Limit</td>
                  {KYC_LEVELS.map((level) => (
                    <td key={level.level} className="text-center py-3 text-white">
                      {level.tradingLimits.perTransaction}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
