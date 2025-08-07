'use client'

import { Suspense, useState, useEffect } from 'react'
import { useRwaAmmSdk } from '@/hooks/useRwaAmmSdk'
import { PublicKey } from '@solana/web3.js'
import Header from '@/components/Header'
import { Coins, Plus, Trash2, Copy, ExternalLink } from 'lucide-react'
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
  assetClass?: string
  jurisdiction?: string
}

function MintTokensPageInner() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { sessionData, addToken, removeToken, markStepCompleted, addNotification, updatePreferences } = useUserSession()

  // URL Parameters for auto-fill
  const assetClass = searchParams?.get('assetClass') || 'Real Estate'
  const autoFill = searchParams?.get('autoFill') === 'true'

  const { createRwaMint, mintTokens, connected, publicKey, loading, error, clearError } = useRwaAmmSdk()
  const [storedTokens, setStoredTokens] = useState<StoredToken[]>([])
  const [selectedToken, setSelectedToken] = useState<string>('')
  const [mintAmount, setMintAmount] = useState<number>(100)
  const [showCreateForm, setShowCreateForm] = useState(autoFill || false)

  // RWA Token Templates
  const RWA_TEMPLATES = {
    realEstate: {
      name: 'RWA Real Estate Token',
      symbol: 'RWRE',
      supply: 1000000,
      decimals: 6,
      hasTransferHook: true,
      hasKyc: true,
      country: 'US',
      jurisdiction: 'Delaware',
      assetClass: 'Real Estate',
      description: 'Tokenized commercial real estate property with transfer restrictions and KYC requirements',
    },
    commodities: {
      name: 'RWA Commodity Token',
      symbol: 'RWCO',
      supply: 500000,
      decimals: 6,
      hasTransferHook: true,
      hasKyc: true,
      country: 'US',
      jurisdiction: 'Delaware',
      assetClass: 'Commodities',
      description: 'Tokenized precious metals or commodities with compliance controls',
    },
    bonds: {
      name: 'RWA Bond Token',
      symbol: 'RWBO',
      supply: 100000,
      decimals: 6,
      hasTransferHook: true,
      hasKyc: true,
      country: 'US',
      jurisdiction: 'Delaware',
      assetClass: 'Fixed Income',
      description: 'Tokenized corporate or government bonds with regulatory compliance',
    },
    equity: {
      name: 'RWA Equity Token',
      symbol: 'RWEQ',
      supply: 1000000,
      decimals: 6,
      hasTransferHook: true,
      hasKyc: true,
      country: 'US',
      jurisdiction: 'Delaware',
      assetClass: 'Equity Securities',
      description: 'Tokenized equity shares with transfer restrictions and investor accreditation',
    },
  }

  // Auto-select template based on URL parameter
  const getTemplateFromAssetClass = (assetClass: string): keyof typeof RWA_TEMPLATES => {
    switch (assetClass.toLowerCase()) {
      case 'real estate':
        return 'realEstate'
      case 'commodities':
        return 'commodities'
      case 'fixed income':
        return 'bonds'
      case 'equity securities':
        return 'equity'
      default:
        return 'realEstate'
    }
  }

  const [selectedTemplate, setSelectedTemplate] = useState<keyof typeof RWA_TEMPLATES>(
    getTemplateFromAssetClass(assetClass),
  )
  const [createForm, setCreateForm] = useState(RWA_TEMPLATES[getTemplateFromAssetClass(assetClass)])
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'creating' | 'success' | 'error'>('idle')
  const [createdTokenAddress, setCreatedTokenAddress] = useState<string | null>(null)

  // Handle template selection
  const handleTemplateChange = (templateKey: keyof typeof RWA_TEMPLATES) => {
    setSelectedTemplate(templateKey)
    setCreateForm(RWA_TEMPLATES[templateKey])
  }

  // Load stored tokens from session data
  useEffect(() => {
    setStoredTokens(sessionData.tokens)
  }, [sessionData.tokens])

  // Auto-fill form based on user preferences
  useEffect(() => {
    if (autoFill && sessionData.preferences.autoFillForms) {
      setShowCreateForm(true)

      // Set the preferred asset class template
      const preferredTemplate = getTemplateFromAssetClass(sessionData.journey.preferredAssetClass || assetClass)
      setSelectedTemplate(preferredTemplate)
      setCreateForm(RWA_TEMPLATES[preferredTemplate])
    }
  }, [autoFill, assetClass, sessionData.preferences.autoFillForms, sessionData.journey.preferredAssetClass])

  // Deprecated: local component-level persistence removed in favor of session context persistence

  // Create new RWA token with enhanced configuration
  const handleCreateToken = async () => {
    if (!connected || !publicKey) {
      alert('Please connect your wallet first')
      return
    }

    setSubmitStatus('creating')
    clearError()

    try {
      console.log('Creating RWA token with params:', createForm)

      // Enhanced RWA configuration based on asset class
      const getAssetSpecificConfig = () => {
        switch (createForm.assetClass) {
          case 'Real Estate':
            return {
              minimumKycLevel: 2,
              allowedCountries: ['US', 'CA', 'UK'],
              restrictedStates: [],
              tradingLimits: {
                minTradeAmount: '1000', // $1000 minimum for real estate
                maxTradeAmount: '1000000', // $1M max
                kycBasicDailyLimit: '10000',
                kycEnhancedDailyLimit: '100000',
                kycInstitutionalDailyLimit: '1000000',
              },
              accreditedInvestorRequired: true,
            }
          case 'Commodities':
            return {
              minimumKycLevel: 1,
              allowedCountries: ['US', 'CA', 'UK', 'DE', 'FR'],
              restrictedStates: [],
              tradingLimits: {
                minTradeAmount: '100',
                maxTradeAmount: '500000',
                kycBasicDailyLimit: '5000',
                kycEnhancedDailyLimit: '50000',
                kycInstitutionalDailyLimit: '500000',
              },
              accreditedInvestorRequired: false,
            }
          case 'Fixed Income':
            return {
              minimumKycLevel: 2,
              allowedCountries: ['US'],
              restrictedStates: ['NY'], // Additional regulations
              tradingLimits: {
                minTradeAmount: '1000',
                maxTradeAmount: '10000000',
                kycBasicDailyLimit: '25000',
                kycEnhancedDailyLimit: '250000',
                kycInstitutionalDailyLimit: '10000000',
              },
              accreditedInvestorRequired: true,
            }
          case 'Equity Securities':
            return {
              minimumKycLevel: 3, // Highest level for equity
              allowedCountries: ['US'],
              restrictedStates: ['NY', 'CA'], // SEC regulations
              tradingLimits: {
                minTradeAmount: '500',
                maxTradeAmount: '5000000',
                kycBasicDailyLimit: '10000',
                kycEnhancedDailyLimit: '100000',
                kycInstitutionalDailyLimit: '5000000',
              },
              accreditedInvestorRequired: true,
            }
          default:
            return {
              minimumKycLevel: 2,
              allowedCountries: ['US', 'CA', 'UK'],
              restrictedStates: [],
              tradingLimits: {
                minTradeAmount: '1',
                maxTradeAmount: '10000',
                kycBasicDailyLimit: '1000',
                kycEnhancedDailyLimit: '10000',
                kycInstitutionalDailyLimit: '100000',
              },
              accreditedInvestorRequired: false,
            }
        }
      }

      const assetConfig = getAssetSpecificConfig()

      const rwaConfig = {
        assetClass: createForm.assetClass,
        jurisdiction: createForm.jurisdiction,
        allowedCountries: assetConfig.allowedCountries,
        restrictedStates: assetConfig.restrictedStates,
        minimumKycLevel: assetConfig.minimumKycLevel,
        accreditedInvestorRequired: assetConfig.accreditedInvestorRequired,
        tradingHours: {
          mondayStart: 9,
          mondayEnd: 17,
          tuesdayStart: 9,
          tuesdayEnd: 17,
          wednesdayStart: 9,
          wednesdayEnd: 17,
          thursdayStart: 9,
          thursdayEnd: 17,
          fridayStart: 9,
          fridayEnd: 17,
          saturdayStart: 0,
          saturdayEnd: 0,
          sundayStart: 0,
          sundayEnd: 0,
        },
        tradingLimits: assetConfig.tradingLimits,
        feeStructure: {
          tradingFeeBps: 30,
          protocolFeeBps: 10,
          kycBasicDiscountBps: 0,
          kycEnhancedDiscountBps: 5,
          kycInstitutionalDiscountBps: 10,
        },
        timezoneOffset: -8,
        whitelistRequired: true,
        requiresAccreditedInvestor: false,
      }

      const mintParams = {
        supply: createForm.supply,
        metadata: {
          name: createForm.name,
          symbol: createForm.symbol,
          description: `RWA Token: ${createForm.assetClass} asset from ${createForm.jurisdiction}`,
          uri: '', // Could add IPFS metadata later
          rwaConfig: rwaConfig,
        },
        transferHook: createForm.hasTransferHook
          ? {
              enabled: true,
              programId: new PublicKey('Hos5X6SbGqyDb8FfvRgiDqWpTE9C6FcgAkXrTeryUXwB'),
              authority: publicKey,
            }
          : undefined,
        transferFee: {
          enabled: true,
          transferFeeBasisPoints: 50, // 0.5%
          maximumFee: 1000000, // 1 token max fee
          feeAuthority: publicKey,
        },
      }

      const { mintAddress, signature: createSignature } = await createRwaMint(mintParams)

      console.log('createRwaMint returned:', { 
        mintAddress, 
        createSignature,
        mintAddressType: typeof mintAddress,
        mintAddressLength: mintAddress?.length,
        signatureType: typeof createSignature,
        signatureLength: createSignature?.length
      })

      // Validate returned mint address - mintAddress should already be a string from createRwaMint
      const safeMintAddress = mintAddress
      if (!safeMintAddress) {
        console.error('No mint address returned from createRwaMint', { mintAddress, createSignature })
        setSubmitStatus('error')
        addNotification({
          type: 'error',
          title: 'Mint Creation Error',
          message: 'No mint address received from the SDK. Please try again.',
        })
        return
      }

      // Additional check: ensure mintAddress is not actually a transaction signature
      // Solana PublicKeys are 44 characters in base58, signatures are 88-96 characters
      if (safeMintAddress.length > 50) {
        console.error('Received what appears to be a transaction signature instead of mint address', {
          mintAddress: safeMintAddress,
          length: safeMintAddress.length
        })
        setSubmitStatus('error')
        addNotification({
          type: 'error',
          title: 'Mint Creation Error',
          message: 'Received invalid response from SDK. The mint address appears to be corrupted.',
        })
        return
      }

      // Validate it's a proper PublicKey
      try {
        new PublicKey(safeMintAddress)
      } catch (e) {
        console.error('Invalid mint address returned from createRwaMint', { mintAddress, createSignature, error: e })
        setSubmitStatus('error')
        addNotification({
          type: 'error',
          title: 'Mint Creation Error',
          message: 'Received an invalid mint address from the SDK. Please try again.',
        })
        return
      }

      // Store the created token
      const newToken: StoredToken = {
        address: safeMintAddress,
        name: createForm.name,
        symbol: createForm.symbol,
        decimals: createForm.decimals,
        supply: createForm.supply,
        createdAt: new Date(),
        hasTransferHook: createForm.hasTransferHook,
        hasKyc: createForm.hasKyc,
        assetClass: createForm.assetClass,
        jurisdiction: createForm.jurisdiction,
      }

      // Add to session context
      addToken(newToken)
      markStepCompleted(3) // Token creation step

      // Add success notification with navigation options
      addNotification({
        type: 'success',
        title: 'RWA Token Created Successfully!',
        message: `${createForm.symbol} token is ready for trading`,
        action: {
          label: 'Create Pool',
          href: `/create-pool?tokenA=${mintAddress}&autoFill=true`,
        },
      })

      const updatedTokens = [...storedTokens, newToken]
      setStoredTokens(updatedTokens)

      setCreatedTokenAddress(safeMintAddress)
      setSubmitStatus('success')
      setShowCreateForm(false)

      console.log(`RWA Token created successfully: ${mintAddress}`)
    } catch (err) {
      console.error('Error creating token:', err)
      setSubmitStatus('error')
    }
  }

  // Mint tokens to wallet using the real minting function
  const handleMintToWallet = async () => {
    if (!selectedToken || !connected || !publicKey) {
      alert('Please select a token and connect wallet')
      return
    }

    clearError()

    try {
      console.log(`Minting ${mintAmount} tokens to wallet for token: ${selectedToken}`)

      const selectedTokenData = storedTokens.find((t) => t.address === selectedToken)
      if (!selectedTokenData) {
        throw new Error('Selected token not found')
      }

      const mintParams = {
        mintAddress: selectedToken,
        amount: mintAmount,
        decimals: selectedTokenData.decimals,
        // recipientAddress not provided, so it mints to the connected wallet
      }

      const signature = await mintTokens({
        mintAddress: selectedToken,
        amount: mintAmount,
      })

      console.log(`Mint transaction signature: ${signature}`)
      alert(
        `Successfully minted ${mintAmount} ${selectedTokenData.symbol} tokens to your wallet!\n\nTransaction: ${signature}`,
      )
    } catch (err) {
      console.error('Error minting tokens:', err)
      alert(`Failed to mint tokens: ${err}`)
    }
  }

  // Delete stored token
  const handleDeleteToken = (address: string) => {
    if (confirm('Are you sure you want to remove this token from the list?')) {
      removeToken(address)
      const updatedTokens = storedTokens.filter((t) => t.address !== address)
      setStoredTokens(updatedTokens)
      if (selectedToken === address) {
        setSelectedToken('')
      }
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    alert('Address copied to clipboard!')
  }

  const openExplorer = (address: string) => {
    window.open(
      `https://explorer.solana.com/address/${address}?cluster=custom&customUrl=http%3A%2F%2Flocalhost%3A8899`,
      '_blank',
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-neutral-900 to-neutral-950">
      <Header />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white flex items-center">
            <Coins className="w-8 h-8 mr-3" />
            Mint Tokens to Wallet
          </h1>
          <p className="text-gray-400 mt-2">
            Create RWA tokens with transfer hooks and mint them directly to your wallet for testing.
          </p>
        </div>

        {/* Success Message */}
        {submitStatus === 'success' && createdTokenAddress && (
          <div className="mb-8 bg-green-500/10 border border-green-500/30 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-green-400 mb-2">🎉 RWA Token Created Successfully!</h3>
            <p className="text-gray-300 mb-4">Your RWA token has been created with transfer hook compliance.</p>
            <div className="bg-black/20 rounded-lg p-4">
              <p className="text-sm text-gray-400 mb-2">Token Address:</p>
              <div className="flex items-center space-x-2">
                <p className="text-green-400 font-mono text-sm flex-1 break-all">{createdTokenAddress}</p>
                <button
                  onClick={() => copyToClipboard(createdTokenAddress)}
                  className="p-2 text-gray-400 hover:text-white"
                >
                  <Copy className="w-4 h-4" />
                </button>
                <button
                  onClick={() => openExplorer(createdTokenAddress)}
                  className="p-2 text-gray-400 hover:text-white"
                >
                  <ExternalLink className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-3 mt-4">
              <button
                onClick={() => {
                  const params = new URLSearchParams({
                    tokenA: createdTokenAddress,
                    autoFill: 'true',
                  })
                  router.push(`/create-pool?${params.toString()}`)
                }}
                className="px-4 py-2 bg-gradient-to-b from-neutral-800 to-neutral-950 text-white rounded-lg hover:from-neutral-700 hover:to-neutral-900 transition-all"
              >
                Create Pool
              </button>
              <button
                onClick={() => {
                  setSelectedToken(createdTokenAddress)
                  setShowCreateForm(false)
                }}
                className="px-4 py-2 border border-blue-500 text-blue-400 rounded-lg hover:bg-blue-500/10 transition-all"
              >
                Mint to Wallet
              </button>
              <button
                onClick={() => router.push('/onboard')}
                className="px-4 py-2 border border-purple-500 text-purple-400 rounded-lg hover:bg-purple-500/10 transition-all"
              >
                Continue Journey
              </button>
              <button
                onClick={() => setSubmitStatus('idle')}
                className="px-4 py-2 border border-green-500 text-green-400 rounded-lg hover:bg-green-500/10"
              >
                Create Another Token
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left Column - Create RWA Tokens */}
          <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-white flex items-center">
                <Plus className="w-5 h-5 mr-2" />
                Create RWA Token
              </h2>
              <button
                onClick={() => setShowCreateForm(!showCreateForm)}
                className={`px-4 py-2 rounded-lg transition-all ${
                  showCreateForm ? 'bg-red-500 hover:bg-red-600 text-white' : 'bg-blue-500 hover:bg-blue-600 text-white'
                }`}
              >
                {showCreateForm ? 'Cancel' : 'New Token'}
              </button>
            </div>

            {!connected ? (
              <div className="text-center py-8">
                <p className="text-gray-400 mb-4">Connect your wallet to create RWA tokens</p>
                <button className="px-6 py-3 bg-gradient-to-b from-neutral-800 to-neutral-950 text-white rounded-lg">
                  Connect Wallet
                </button>
              </div>
            ) : showCreateForm ? (
              <div className="space-y-6">
                {/* Template Selector */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-3">RWA Asset Templates</label>
                  <div className="grid grid-cols-1 gap-3">
                    {Object.entries(RWA_TEMPLATES).map(([key, template]) => (
                      <button
                        key={key}
                        onClick={() => handleTemplateChange(key as keyof typeof RWA_TEMPLATES)}
                        className={`p-4 rounded-lg border text-left transition-all ${
                          selectedTemplate === key
                            ? 'border-blue-500 bg-blue-500/10 text-blue-300'
                            : 'border-gray-600 bg-gray-800/50 text-gray-300 hover:border-gray-500'
                        }`}
                      >
                        <div className="font-semibold">
                          {template.symbol} - {template.assetClass}
                        </div>
                        <div className="text-sm opacity-75 mt-1">{template.description}</div>
                        <div className="text-xs mt-2 flex items-center space-x-4">
                          <span>Supply: {template.supply.toLocaleString()}</span>
                          <span>
                            KYC Level:{' '}
                            {template.assetClass === 'Equity Securities'
                              ? '3 (Institutional)'
                              : template.assetClass === 'Commodities'
                                ? '1 (Basic)'
                                : '2 (Enhanced)'}
                          </span>
                          {template.hasTransferHook && <span className="text-blue-400">• Transfer Hook</span>}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Token Configuration Form */}
                <div className="space-y-4">
                  <h3 className="text-lg font-medium text-white">Token Configuration</h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">Token Name</label>
                      <input
                        type="text"
                        value={createForm.name}
                        onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                        className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="My RWA Token"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">Symbol</label>
                      <input
                        type="text"
                        value={createForm.symbol}
                        onChange={(e) => setCreateForm({ ...createForm, symbol: e.target.value.toUpperCase() })}
                        className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="RWAT"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">Supply</label>
                      <input
                        type="number"
                        value={createForm.supply}
                        onChange={(e) => setCreateForm({ ...createForm, supply: parseInt(e.target.value) || 0 })}
                        className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="1000000"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">Decimals</label>
                      <select
                        value={createForm.decimals}
                        onChange={(e) => setCreateForm({ ...createForm, decimals: parseInt(e.target.value) })}
                        className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value={6}>6 (Standard)</option>
                        <option value={8}>8</option>
                        <option value={9}>9</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">Asset Class</label>
                      <select
                        value={createForm.assetClass}
                        onChange={(e) => setCreateForm({ ...createForm, assetClass: e.target.value })}
                        className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value="Real Estate">Real Estate</option>
                        <option value="Commodities">Commodities</option>
                        <option value="Fixed Income">Fixed Income</option>
                        <option value="Equity Securities">Equity Securities</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">Jurisdiction</label>
                      <select
                        value={createForm.jurisdiction}
                        onChange={(e) => setCreateForm({ ...createForm, jurisdiction: e.target.value })}
                        className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value="Delaware">Delaware</option>
                        <option value="New York">New York</option>
                        <option value="California">California</option>
                        <option value="British Virgin Islands">British Virgin Islands</option>
                        <option value="Cayman Islands">Cayman Islands</option>
                      </select>
                    </div>
                  </div>

                  {/* Compliance Features */}
                  <div className="bg-gray-800/50 rounded-lg p-4">
                    <h4 className="text-md font-medium text-white mb-3">Compliance Features</h4>
                    <div className="space-y-3">
                      <label className="flex items-center space-x-3">
                        <input
                          type="checkbox"
                          checked={createForm.hasTransferHook}
                          onChange={(e) => setCreateForm({ ...createForm, hasTransferHook: e.target.checked })}
                          className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500 focus:ring-2"
                        />
                        <span className="text-gray-300">Enable Transfer Hook (RWA Compliance)</span>
                      </label>

                      <label className="flex items-center space-x-3">
                        <input
                          type="checkbox"
                          checked={createForm.hasKyc}
                          onChange={(e) => setCreateForm({ ...createForm, hasKyc: e.target.checked })}
                          className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500 focus:ring-2"
                        />
                        <span className="text-gray-300">Require KYC Verification</span>
                      </label>
                    </div>
                  </div>
                </div>

                {/* Create Button */}
                <button
                  onClick={handleCreateToken}
                  disabled={submitStatus === 'creating' || loading}
                  className={`w-full py-3 rounded-lg font-semibold transition-all ${
                    submitStatus === 'creating' || loading
                      ? 'bg-gray-500 cursor-not-allowed text-gray-300'
                      : 'bg-gradient-to-b from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white'
                  }`}
                >
                  {submitStatus === 'creating' ? 'Creating RWA Token...' : 'Create RWA Token'}
                </button>
              </div>
            ) : (
              <div>
                <div className="text-center py-8">
                  <p className="text-gray-400 mb-4">Create custom RWA tokens with transfer hook compliance</p>
                  <div className="text-left bg-gray-800/50 rounded-lg p-4 mb-6">
                    <h4 className="text-white font-medium mb-2">Available Templates:</h4>
                    <ul className="text-sm text-gray-300 space-y-1">
                      <li>• Real Estate - Enhanced KYC, accredited investors</li>
                      <li>• Commodities - Basic KYC, global trading</li>
                      <li>• Fixed Income - Enhanced KYC, institutional grade</li>
                      <li>• Equity Securities - Institutional KYC, SEC compliance</li>
                    </ul>
                  </div>
                </div>
                <div className="space-y-4">
                  {/* Token Selection */}
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Select Token to Mint</label>
                    <select
                      value={selectedToken}
                      onChange={(e) => setSelectedToken(e.target.value)}
                      className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white"
                    >
                      <option value="">Select a token...</option>
                      {storedTokens.map((token) => (
                        <option key={token.address} value={token.address}>
                          {token.symbol} - {token.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Amount */}
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Amount to Mint</label>
                    <input
                      type="number"
                      value={mintAmount}
                      onChange={(e) => setMintAmount(Number(e.target.value))}
                      className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white"
                      placeholder="100"
                    />
                  </div>

                  {/* Mint Button */}
                  <button
                    onClick={handleMintToWallet}
                    disabled={!selectedToken || mintAmount <= 0 || loading}
                    className="w-full py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? 'Minting...' : `Mint ${mintAmount} Tokens to Wallet`}
                  </button>

                  {selectedToken && (
                    <div className="mt-4 p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                      <p className="text-blue-400 text-sm">
                        Selected: {storedTokens.find((t) => t.address === selectedToken)?.name}
                      </p>
                      <p className="text-gray-400 text-xs mt-1">
                        This will mint tokens directly to your wallet's associated token account.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Right Column - Create New Token */}
          <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-white flex items-center">
                <Coins className="w-5 h-5 mr-2" />
                Create New RWA Token
              </h2>
              <button
                onClick={() => setShowCreateForm(!showCreateForm)}
                className="px-4 py-2 bg-gradient-to-b from-neutral-800 to-neutral-950 text-white rounded-lg hover:from-neutral-700 hover:to-neutral-900 transition-all"
              >
                {showCreateForm ? 'Cancel' : 'Create Token'}
              </button>
            </div>

            {showCreateForm && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Token Name</label>
                    <input
                      type="text"
                      value={createForm.name}
                      onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                      className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white"
                      placeholder="Test RWA Token"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Symbol</label>
                    <input
                      type="text"
                      value={createForm.symbol}
                      onChange={(e) => setCreateForm({ ...createForm, symbol: e.target.value })}
                      className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white"
                      placeholder="TRWA"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Initial Supply</label>
                    <input
                      type="number"
                      value={createForm.supply}
                      onChange={(e) => setCreateForm({ ...createForm, supply: Number(e.target.value) })}
                      className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white"
                      placeholder="1000"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Asset Class</label>
                    <select
                      value={createForm.assetClass}
                      onChange={(e) => setCreateForm({ ...createForm, assetClass: e.target.value })}
                      className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white"
                    >
                      <option value="Real Estate">Real Estate</option>
                      <option value="Commodities">Commodities</option>
                      <option value="Bonds">Bonds</option>
                      <option value="Stocks">Stocks</option>
                      <option value="Art">Art</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Jurisdiction</label>
                    <input
                      type="text"
                      value={createForm.jurisdiction}
                      onChange={(e) => setCreateForm({ ...createForm, jurisdiction: e.target.value })}
                      className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white"
                      placeholder="Delaware"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Country</label>
                    <select
                      value={createForm.country}
                      onChange={(e) => setCreateForm({ ...createForm, country: e.target.value })}
                      className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white"
                    >
                      <option value="US">United States</option>
                      <option value="CA">Canada</option>
                      <option value="UK">United Kingdom</option>
                    </select>
                  </div>
                </div>

                {/* Compliance Features */}
                <div className="space-y-3">
                  <div className="flex items-center space-x-3">
                    <input
                      type="checkbox"
                      id="transferHook"
                      checked={createForm.hasTransferHook}
                      onChange={(e) => setCreateForm({ ...createForm, hasTransferHook: e.target.checked })}
                      className="rounded"
                    />
                    <label htmlFor="transferHook" className="text-gray-300">
                      Enable Transfer Hook (KYC/Compliance)
                    </label>
                  </div>
                  <div className="flex items-center space-x-3">
                    <input
                      type="checkbox"
                      id="kyc"
                      checked={createForm.hasKyc}
                      onChange={(e) => setCreateForm({ ...createForm, hasKyc: e.target.checked })}
                      className="rounded"
                    />
                    <label htmlFor="kyc" className="text-gray-300">
                      Require KYC for Trading
                    </label>
                  </div>
                </div>

                <button
                  onClick={handleCreateToken}
                  disabled={loading || !connected}
                  className="w-full py-3 bg-gradient-to-b from-neutral-800 to-neutral-950 text-white rounded-lg hover:from-neutral-700 hover:to-neutral-900 transition-all disabled:opacity-50"
                >
                  {loading ? 'Creating Token...' : 'Create RWA Token'}
                </button>
              </div>
            )}

            {/* Error Display */}
            {error && (
              <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}
          </div>
        </div>

        {/* Stored Tokens List */}
        <div className="mt-8 bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6">
          <h2 className="text-xl font-semibold text-white mb-6">Your Created Tokens</h2>

          {storedTokens.length === 0 ? (
            <div className="text-center py-8">
              <Coins className="w-12 h-12 text-gray-600 mx-auto mb-4" />
              <p className="text-gray-400">No tokens created yet. Create your first RWA token above!</p>
            </div>
          ) : (
            <div className="space-y-4">
              {storedTokens.map((token) => (
                <div key={token.address} className="bg-black/20 rounded-lg p-4 flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-4 mb-2">
                      <h3 className="text-white font-semibold">{token.symbol}</h3>
                      <span className="text-gray-400">{token.name}</span>
                      {token.hasTransferHook && (
                        <span className="px-2 py-1 bg-blue-500/20 text-blue-400 text-xs rounded">Transfer Hook</span>
                      )}
                      {token.hasKyc && (
                        <span className="px-2 py-1 bg-green-500/20 text-green-400 text-xs rounded">KYC Required</span>
                      )}
                    </div>
                    <div className="flex items-center space-x-4 text-sm text-gray-400">
                      <span>Supply: {token.supply.toLocaleString()}</span>
                      <span>Created: {token.createdAt.toLocaleDateString()}</span>
                    </div>
                    <div className="flex items-center space-x-2 mt-2">
                      <code className="text-xs text-gray-300 bg-black/40 px-2 py-1 rounded font-mono">
                        {token.address.substring(0, 8)}...{token.address.slice(-8)}
                      </code>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => copyToClipboard(token.address)}
                      className="p-2 bg-gray-600 text-gray-300 rounded hover:bg-gray-700 transition-colors"
                      title="Copy Address"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => openExplorer(token.address)}
                      className="p-2 bg-blue-600 text-blue-300 rounded hover:bg-blue-700 transition-colors"
                      title="View on Explorer"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteToken(token.address)}
                      className="p-2 bg-red-600 text-red-300 rounded hover:bg-red-700 transition-colors"
                      title="Remove from List"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function MintTokensPage() {
  return (
    <Suspense fallback={<div />}>
      <MintTokensPageInner />
    </Suspense>
  )
}
