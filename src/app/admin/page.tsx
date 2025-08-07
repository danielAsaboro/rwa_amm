'use client'

import { useState, useEffect } from 'react'
import { useRwaAmmSdk } from '@/hooks/useRwaAmmSdk'
import Header from '@/components/Header'
import { 
  Settings, 
  Shield, 
  TrendingUp, 
  Users, 
  DollarSign,
  AlertTriangle,
  CheckCircle,
  ExternalLink,
  Plus,
  Eye
} from 'lucide-react'
import { PublicKey } from '@solana/web3.js'
import BN from 'bn.js'

interface AdminStats {
  totalConfigs: number
  totalPools: number
  totalTVL: number
  activeTokenBadges: number
}

export default function AdminDashboard() {
  const { 
    createConfig, 
    createTokenBadge, 
    getAvailablePools,
    connected, 
    publicKey,
    loading, 
    error, 
    clearError 
  } = useRwaAmmSdk()
  
  const [activeTab, setActiveTab] = useState<'overview' | 'configs' | 'badges' | 'pools'>('overview')
  const [adminStats, setAdminStats] = useState<AdminStats>({
    totalConfigs: 0,
    totalPools: 0,
    totalTVL: 0,
    activeTokenBadges: 0
  })
  
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle')
  const [lastTransaction, setLastTransaction] = useState<string | null>(null)

  // Config creation form
  const [configForm, setConfigForm] = useState({
    feeType: 'standard',
    baseFeeRate: '0.25', // 0.25%
    activationType: 'immediate',
    collectFeeMode: 'protocol'
  })

  // Token badge form
  const [badgeForm, setBadgeForm] = useState({
    tokenMint: '',
    reason: 'compliance',
    notes: ''
  })

  // Load admin stats
  useEffect(() => {
    async function loadStats() {
      if (!connected) return
      
      try {
        const pools = await getAvailablePools()
        
        // Calculate TVL (mock calculation)
        const totalTVL = pools.reduce((sum, pool) => {
          return sum + (pool.liquidity?.toNumber() || 0)
        }, 0)

        setAdminStats({
          totalConfigs: 3, // Mock - would query on-chain configs
          totalPools: pools.length,
          totalTVL: totalTVL / 1e6, // Convert to readable format
          activeTokenBadges: 5 // Mock - would query token badges
        })
      } catch (err) {
        console.error('Error loading admin stats:', err)
      }
    }

    loadStats()
  }, [connected, getAvailablePools])

  // Predefined config templates
  const CONFIG_TEMPLATES = {
    standard: {
      name: 'Standard Trading (0.25%)',
      description: 'Default configuration for most token pairs',
      baseFeeRate: '2500000', // 0.25%
      activationType: 0,
      collectFeeMode: 0
    },
    premium: {
      name: 'Premium Trading (0.05%)',
      description: 'Low fee configuration for high-volume pairs',
      baseFeeRate: '500000', // 0.05%
      activationType: 0,
      collectFeeMode: 0
    },
    experimental: {
      name: 'Experimental (1.0%)',
      description: 'High fee configuration for new/risky tokens',
      baseFeeRate: '10000000', // 1.0%
      activationType: 1,
      collectFeeMode: 1
    }
  }

  // Create AMM configuration
  const handleCreateConfig = async (templateKey: keyof typeof CONFIG_TEMPLATES) => {
    if (!connected || !publicKey) {
      alert('Please connect your wallet first')
      return
    }

    setSubmitStatus('submitting')
    clearError()

    try {
      const template = CONFIG_TEMPLATES[templateKey]
      
      const configParams = {
        poolFees: {
          baseFee: {
            cliffFeeNumerator: new BN(template.baseFeeRate),
            numberOfPeriod: 0,
            reductionFactor: new BN('0'),
            periodFrequency: new BN('0'),
            feeSchedulerMode: 0
          },
          padding: new Array(32).fill(0),
          dynamicFee: null
        },
        sqrtMinPrice: new BN('4295048016'),
        sqrtMaxPrice: new BN('79226673521066979257578248091'),
        vaultConfigKey: new PublicKey('11111111111111111111111111111111'),
        poolCreatorAuthority: publicKey,
        activationType: template.activationType,
        collectFeeMode: template.collectFeeMode
      }

      const signature = await createConfig(configParams)
      setLastTransaction(signature)
      setSubmitStatus('success')
      
      // Update stats
      setAdminStats(prev => ({ ...prev, totalConfigs: prev.totalConfigs + 1 }))
      
      console.log('Config created successfully:', signature)
    } catch (err) {
      console.error('Failed to create config:', err)
      setSubmitStatus('error')
    }
  }

  // Create token badge
  const handleCreateTokenBadge = async () => {
    if (!connected || !publicKey || !badgeForm.tokenMint) {
      alert('Please connect wallet and provide token mint address')
      return
    }

    setSubmitStatus('submitting')
    clearError()

    try {
      const signature = await createTokenBadge(badgeForm.tokenMint)
      
      setLastTransaction(signature)
      setSubmitStatus('success')
      setBadgeForm({ tokenMint: '', reason: 'compliance', notes: '' })
      
      // Update stats
      setAdminStats(prev => ({ ...prev, activeTokenBadges: prev.activeTokenBadges + 1 }))
      
      console.log('Token badge created successfully:', signature)
    } catch (err) {
      console.error('Failed to create token badge:', err)
      setSubmitStatus('error')
    }
  }

  const formatNumber = (num: number) => {
    if (num >= 1e9) return `${(num / 1e9).toFixed(2)}B`
    if (num >= 1e6) return `${(num / 1e6).toFixed(2)}M`
    if (num >= 1e3) return `${(num / 1e3).toFixed(2)}K`
    return num.toFixed(2)
  }

  if (!connected) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-neutral-900 to-neutral-950">
        <Header />
        <div className="max-w-2xl mx-auto px-4 py-20 text-center">
          <Shield className="w-16 h-16 text-gray-400 mx-auto mb-6" />
          <h1 className="text-3xl font-bold text-white mb-4">Admin Dashboard</h1>
          <p className="text-gray-400 mb-8">
            Connect your wallet to access admin functions and manage the RWA AMM protocol.
          </p>
          <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6">
            <p className="text-gray-300 mb-4">Admin access required</p>
            <p className="text-sm text-gray-500">
              This dashboard is for protocol administrators to manage configurations, 
              token badges, and monitor system health.
            </p>
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
            <Shield className="w-8 h-8 mr-3 text-blue-400" />
            Admin Dashboard
          </h1>
          <p className="text-gray-400 mt-2">
            Manage RWA AMM protocol configurations and monitor system health
          </p>
          <div className="mt-2 text-sm text-gray-500">
            Admin: {publicKey?.toString().slice(0, 8)}...{publicKey?.toString().slice(-8)}
          </div>
        </div>

        {/* Success/Error Messages */}
        {submitStatus === 'success' && lastTransaction && (
          <div className="mb-6 bg-green-500/10 border border-green-500/30 rounded-xl p-4">
            <div className="flex items-center space-x-3">
              <CheckCircle className="w-5 h-5 text-green-400" />
              <div>
                <p className="text-green-400 font-medium">Operation completed successfully!</p>
                <div className="flex items-center space-x-2 mt-2">
                  <p className="text-green-300 text-sm font-mono">{lastTransaction}</p>
                  <button
                    onClick={() => window.open(
                      `https://explorer.solana.com/tx/${lastTransaction}?cluster=custom&customUrl=http%3A%2F%2Flocalhost%3A8899`,
                      '_blank'
                    )}
                    className="text-green-400 hover:text-green-300"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {submitStatus === 'error' && error && (
          <div className="mb-6 bg-red-500/10 border border-red-500/30 rounded-xl p-4">
            <div className="flex items-center space-x-3">
              <AlertTriangle className="w-5 h-5 text-red-400" />
              <div>
                <p className="text-red-400 font-medium">Operation failed</p>
                <p className="text-red-300 text-sm mt-1">{error}</p>
              </div>
            </div>
          </div>
        )}

        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-sm">Total Configs</p>
                <p className="text-2xl font-bold text-white">{adminStats.totalConfigs}</p>
              </div>
              <Settings className="w-8 h-8 text-blue-400" />
            </div>
          </div>
          
          <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-sm">Active Pools</p>
                <p className="text-2xl font-bold text-white">{adminStats.totalPools}</p>
              </div>
              <TrendingUp className="w-8 h-8 text-green-400" />
            </div>
          </div>
          
          <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-sm">Total TVL</p>
                <p className="text-2xl font-bold text-white">${formatNumber(adminStats.totalTVL)}</p>
              </div>
              <DollarSign className="w-8 h-8 text-yellow-400" />
            </div>
          </div>
          
          <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-sm">Token Badges</p>
                <p className="text-2xl font-bold text-white">{adminStats.activeTokenBadges}</p>
              </div>
              <Users className="w-8 h-8 text-purple-400" />
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="mb-8">
          <div className="border-b border-gray-700">
            <nav className="flex space-x-8">
              {[
                { key: 'overview', label: 'Overview', icon: Eye },
                { key: 'configs', label: 'Configurations', icon: Settings },
                { key: 'badges', label: 'Token Badges', icon: Shield },
                { key: 'pools', label: 'Pool Management', icon: TrendingUp }
              ].map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => setActiveTab(key as any)}
                  className={`flex items-center space-x-2 py-4 px-1 border-b-2 transition-colors ${
                    activeTab === key
                      ? 'border-blue-400 text-blue-400'
                      : 'border-transparent text-gray-400 hover:text-gray-300'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{label}</span>
                </button>
              ))}
            </nav>
          </div>
        </div>

        {/* Tab Content */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6">
              <h3 className="text-xl font-semibold text-white mb-4">System Health</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="flex items-center space-x-3">
                  <CheckCircle className="w-6 h-6 text-green-400" />
                  <div>
                    <p className="text-white font-medium">Protocol Status</p>
                    <p className="text-sm text-green-400">Operational</p>
                  </div>
                </div>
                <div className="flex items-center space-x-3">
                  <CheckCircle className="w-6 h-6 text-green-400" />
                  <div>
                    <p className="text-white font-medium">Transfer Hooks</p>
                    <p className="text-sm text-green-400">Active</p>
                  </div>
                </div>
                <div className="flex items-center space-x-3">
                  <CheckCircle className="w-6 h-6 text-green-400" />
                  <div>
                    <p className="text-white font-medium">KYC System</p>
                    <p className="text-sm text-green-400">Enabled</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6">
              <h3 className="text-xl font-semibold text-white mb-4">Quick Actions</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <button
                  onClick={() => setActiveTab('configs')}
                  className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg hover:bg-blue-500/20 transition-colors text-left"
                >
                  <Plus className="w-5 h-5 text-blue-400 mb-2" />
                  <p className="text-white font-medium">Create New Config</p>
                  <p className="text-sm text-gray-400">Add new AMM configuration template</p>
                </button>
                <button
                  onClick={() => setActiveTab('badges')}
                  className="p-4 bg-purple-500/10 border border-purple-500/20 rounded-lg hover:bg-purple-500/20 transition-colors text-left"
                >
                  <Shield className="w-5 h-5 text-purple-400 mb-2" />
                  <p className="text-white font-medium">Create Token Badge</p>
                  <p className="text-sm text-gray-400">Approve unsupported tokens for trading</p>
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'configs' && (
          <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6">
            <h3 className="text-xl font-semibold text-white mb-6">AMM Configuration Templates</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {Object.entries(CONFIG_TEMPLATES).map(([key, template]) => (
                <div key={key} className="bg-gray-800/50 rounded-lg p-6 border border-gray-600">
                  <h4 className="text-lg font-medium text-white mb-2">{template.name}</h4>
                  <p className="text-sm text-gray-400 mb-4">{template.description}</p>
                  <div className="space-y-2 mb-4">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">Fee Rate:</span>
                      <span className="text-white">{parseFloat(template.baseFeeRate) / 10000000}%</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">Activation:</span>
                      <span className="text-white">{template.activationType === 0 ? 'Immediate' : 'Timed'}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">Fee Mode:</span>
                      <span className="text-white">{template.collectFeeMode === 0 ? 'Protocol' : 'LP'}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleCreateConfig(key as keyof typeof CONFIG_TEMPLATES)}
                    disabled={submitStatus === 'submitting' || loading}
                    className="w-full py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-500 text-white rounded-lg font-medium transition-colors"
                  >
                    {submitStatus === 'submitting' ? 'Creating...' : 'Deploy Config'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'badges' && (
          <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6">
            <h3 className="text-xl font-semibold text-white mb-6">Token Badge Management</h3>
            <div className="max-w-2xl">
              <div className="mb-6 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                <p className="text-yellow-400 text-sm">
                  <AlertTriangle className="w-4 h-4 inline mr-2" />
                  Token badges allow unsupported Token-2022 extensions to be used in pools. 
                  Only create badges for tokens you trust.
                </p>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Token Mint Address</label>
                  <input
                    type="text"
                    value={badgeForm.tokenMint}
                    onChange={(e) => setBadgeForm({...badgeForm, tokenMint: e.target.value})}
                    className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Enter token mint address..."
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Approval Reason</label>
                  <select
                    value={badgeForm.reason}
                    onChange={(e) => setBadgeForm({...badgeForm, reason: e.target.value})}
                    className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="compliance">Compliance Review Complete</option>
                    <option value="partnership">Official Partnership</option>
                    <option value="audit">Security Audit Passed</option>
                    <option value="testing">Testing/Development</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Notes (Optional)</label>
                  <textarea
                    value={badgeForm.notes}
                    onChange={(e) => setBadgeForm({...badgeForm, notes: e.target.value})}
                    className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 h-20"
                    placeholder="Additional notes about this token..."
                  />
                </div>
                
                <button
                  onClick={handleCreateTokenBadge}
                  disabled={!badgeForm.tokenMint || submitStatus === 'submitting' || loading}
                  className="w-full py-3 bg-purple-500 hover:bg-purple-600 disabled:bg-gray-500 text-white rounded-lg font-medium transition-colors"
                >
                  {submitStatus === 'submitting' ? 'Creating Badge...' : 'Create Token Badge'}
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'pools' && (
          <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6">
            <h3 className="text-xl font-semibold text-white mb-6">Pool Management</h3>
            <div className="text-center py-8">
              <TrendingUp className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-400 mb-4">Advanced pool management features</p>
              <p className="text-sm text-gray-500">
                Monitor liquidity, track performance, and manage pool parameters.
              </p>
              <button
                onClick={() => window.location.href = '/create-pool'}
                className="mt-4 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg"
              >
                Create New Pool
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}