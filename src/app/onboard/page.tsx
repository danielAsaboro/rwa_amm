'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useWallet } from '@solana/wallet-adapter-react'
import { useUserSession } from '@/contexts/UserSessionContext'
import Header from '@/components/Header'
import {
  ArrowRight,
  CheckCircle,
  Clock,
  Coins,
  Shield,
  TrendingUp,
  Users,
  Zap,
  DollarSign,
  Globe,
  Rocket,
  Play,
  SkipForward,
} from 'lucide-react'

interface JourneyStep {
  id: number
  title: string
  description: string
  icon: any
  estimatedTime: string
  isCompleted: boolean
  isOptional: boolean
  nextRoute: string
  benefits: string[]
}

export default function OnboardingPage() {
  const router = useRouter()
  const { connected } = useWallet()
  const { sessionData, setCurrentStep, markStepCompleted, updatePreferences, isNewUser, getNextStep } = useUserSession()

  // Mark step 1 (Connect Wallet) complete once connected
  useEffect(() => {
    if (connected) {
      markStepCompleted(1)
    }
  }, [connected])

  const [selectedAssetClass, setSelectedAssetClass] = useState('Real Estate')
  const [showAdvanced, setShowAdvanced] = useState(false)

  // Define the complete user journey
  const journeySteps: JourneyStep[] = [
    {
      id: 1,
      title: 'Connect Wallet',
      description: 'Connect your Solana wallet to get started',
      icon: Shield,
      estimatedTime: '30 seconds',
      isCompleted: connected,
      isOptional: false,
      nextRoute: connected ? '/kyc' : '/onboard',
      benefits: ['Secure transactions', 'Asset ownership', 'Decentralized trading'],
    },
    {
      id: 2,
      title: 'KYC Verification',
      description: 'Complete identity verification to unlock RWA trading',
      icon: Users,
      estimatedTime: '2 minutes',
      isCompleted: sessionData.userKyc.exists,
      isOptional: false,
      nextRoute: '/kyc',
      benefits: ['RWA token access', 'Higher trading limits', 'Compliance assurance'],
    },
    {
      id: 3,
      title: 'Create RWA Token',
      description: 'Mint your first Real-World Asset token',
      icon: Coins,
      estimatedTime: '1 minute',
      isCompleted: sessionData.journey.hasCreatedToken,
      isOptional: false,
      nextRoute: '/mint-tokens',
      benefits: ['Asset tokenization', 'Transfer hook compliance', 'Custom metadata'],
    },
    {
      id: 4,
      title: 'Mint to Wallet',
      description: 'Get tokens in your wallet for trading',
      icon: DollarSign,
      estimatedTime: '30 seconds',
      isCompleted: sessionData.tokens.length > 0,
      isOptional: false,
      nextRoute: '/mint-tokens',
      benefits: ['Ready to trade', 'Liquidity provision', 'Portfolio building'],
    },
    {
      id: 5,
      title: 'Create Pool',
      description: 'Create an AMM pool for your tokens',
      icon: TrendingUp,
      estimatedTime: '2 minutes',
      isCompleted: sessionData.journey.hasCreatedPool,
      isOptional: false,
      nextRoute: '/create-pool',
      benefits: ['Market making', 'Earn fees', 'Provide liquidity'],
    },
    {
      id: 6,
      title: 'Add Liquidity',
      description: 'Fund your pool with initial liquidity',
      icon: Zap,
      estimatedTime: '1 minute',
      isCompleted: sessionData.pools.some((p) => p.liquidity > 0),
      isOptional: false,
      nextRoute: '/create-pool',
      benefits: ['Earn trading fees', 'Pool ownership', 'Market participation'],
    },
    {
      id: 7,
      title: 'Execute Swap',
      description: 'Complete your first RWA-compliant trade',
      icon: Rocket,
      estimatedTime: '1 minute',
      isCompleted: sessionData.journey.hasExecutedSwap,
      isOptional: false,
      nextRoute: '/trade',
      benefits: ['Full RWA trading', 'Compliance validation', 'Seamless swaps'],
    },
  ]

  const completedSteps = journeySteps.filter((step) => step.isCompleted).length
  const totalSteps = journeySteps.length
  const progressPercentage = (completedSteps / totalSteps) * 100

  const assetClasses = [
    {
      name: 'Real Estate',
      description: 'Commercial and residential properties',
      icon: '🏢',
      examples: ['Office buildings', 'Apartments', 'Retail spaces'],
      kycLevel: 2,
    },
    {
      name: 'Commodities',
      description: 'Physical goods and raw materials',
      icon: '🥇',
      examples: ['Gold', 'Silver', 'Oil', 'Agricultural products'],
      kycLevel: 1,
    },
    {
      name: 'Fixed Income',
      description: 'Bonds and debt securities',
      icon: '📜',
      examples: ['Corporate bonds', 'Government bonds', 'Treasury bills'],
      kycLevel: 2,
    },
    {
      name: 'Equity Securities',
      description: 'Stocks and company shares',
      icon: '📈',
      examples: ['Public stocks', 'Private equity', 'Startup shares'],
      kycLevel: 3,
    },
  ]

  const handleStart = () => {
    // Update preferences
    updatePreferences({
      autoFillForms: true,
      showAdvancedOptions: showAdvanced,
    })

    // Set preferred asset class in journey
    let nextStep = getNextStep()
    if (nextStep) {
      // If next step is 1 but wallet is already connected, complete it and move on
      if (nextStep === 1 && connected) {
        markStepCompleted(1)
        nextStep = 2
      }
      setCurrentStep(nextStep)
      const step = journeySteps.find((s) => s.id === nextStep)
      if (step) {
        router.push(step.nextRoute)
      }
    } else {
      // All steps completed, go to dashboard
      router.push('/trade')
    }
  }

  const handleSkip = () => {
    updatePreferences({ skipOnboarding: true })
    router.push('/trade')
  }

  const handleContinueStep = (stepId: number) => {
    const step = journeySteps.find((s) => s.id === stepId)
    if (step) {
      setCurrentStep(stepId)
      router.push(step.nextRoute)
    }
  }

  const nextIncompleteStep = journeySteps.find((step) => !step.isCompleted)
  const isJourneyComplete = completedSteps === totalSteps

  return (
    <div className="min-h-screen bg-gradient-to-b from-neutral-900 to-neutral-950">
      <Header />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Welcome Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-500/20 rounded-full mb-6">
            <Rocket className="w-8 h-8 text-blue-400" />
          </div>

          <h1 className="text-4xl font-bold text-white mb-4">
            {isNewUser() ? 'Welcome to RWA AMM' : 'Continue Your Journey'}
          </h1>

          <p className="text-xl text-gray-400 mb-6 max-w-3xl mx-auto">
            {isNewUser()
              ? 'The first decentralized AMM supporting Token-2022 with transfer hooks. Create, trade, and manage real-world assets on Solana with full compliance.'
              : `You're ${completedSteps} of ${totalSteps} steps complete. Let's finish setting up your RWA trading experience.`}
          </p>

          {/* Enhanced Progress Visualization */}
          <div className="max-w-4xl mx-auto mb-8">
            <div className="flex justify-between text-sm text-gray-400 mb-4">
              <span>Your RWA Trading Journey</span>
              <span>
                {completedSteps}/{totalSteps} steps completed • {Math.round(progressPercentage)}%
              </span>
            </div>

            {/* Progress Bar with Steps */}
            <div className="relative">
              <div className="w-full bg-gray-700 rounded-full h-3 mb-4">
                <div
                  className="bg-gradient-to-r from-blue-500 to-green-500 h-3 rounded-full transition-all duration-500 relative"
                  style={{ width: `${progressPercentage}%` }}
                >
                  {progressPercentage > 0 && (
                    <div className="absolute right-0 top-0 h-3 w-3 bg-white rounded-full border-2 border-green-500 transform translate-x-1/2"></div>
                  )}
                </div>
              </div>

              {/* Step indicators */}
              <div className="flex justify-between relative -mt-1">
                {journeySteps.map((step, index) => (
                  <div key={step.id} className="flex flex-col items-center">
                    <div
                      className={`w-4 h-4 rounded-full border-2 transition-all duration-300 ${
                        step.isCompleted
                          ? 'bg-green-500 border-green-500'
                          : step.id === nextIncompleteStep?.id
                            ? 'bg-blue-500 border-blue-500 animate-pulse'
                            : 'bg-gray-700 border-gray-600'
                      }`}
                    />
                    <span
                      className={`text-xs mt-1 text-center max-w-20 ${
                        step.isCompleted ? 'text-green-400' : 'text-gray-500'
                      }`}
                    >
                      {step.title.split(' ')[0]}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Journey Statistics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
              <div className="bg-white/5 rounded-lg p-3 text-center">
                <div className="text-lg font-semibold text-white">{sessionData.tokens.length}</div>
                <div className="text-xs text-gray-400">Tokens Created</div>
              </div>
              <div className="bg-white/5 rounded-lg p-3 text-center">
                <div className="text-lg font-semibold text-white">{sessionData.pools.length}</div>
                <div className="text-xs text-gray-400">Pools Created</div>
              </div>
              <div className="bg-white/5 rounded-lg p-3 text-center">
                <div className="text-lg font-semibold text-white">
                  {sessionData.userKyc.exists ? `Level ${sessionData.userKyc.level}` : 'None'}
                </div>
                <div className="text-xs text-gray-400">KYC Status</div>
              </div>
              <div className="bg-white/5 rounded-lg p-3 text-center">
                <div className="text-lg font-semibold text-white">{completedSteps}</div>
                <div className="text-xs text-gray-400">Steps Done</div>
              </div>
            </div>
          </div>

          {isJourneyComplete && (
            <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-6 mb-8">
              <CheckCircle className="w-8 h-8 text-green-400 mx-auto mb-3" />
              <h3 className="text-lg font-semibold text-green-400 mb-2">🎉 Journey Complete!</h3>
              <p className="text-gray-300">
                You've successfully set up everything needed for RWA trading. Ready to explore advanced features?
              </p>
              <button
                onClick={() => router.push('/trade')}
                className="mt-4 px-6 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg font-medium"
              >
                Start Trading
              </button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Journey Steps */}
          <div className="lg:col-span-2">
            <h2 className="text-2xl font-bold text-white mb-6">Your RWA Trading Journey</h2>
            <div className="space-y-4">
              {journeySteps.map((step, index) => (
                <div
                  key={step.id}
                  className={`p-6 rounded-xl border transition-all ${
                    step.isCompleted
                      ? 'bg-green-500/10 border-green-500/20'
                      : step.id === nextIncompleteStep?.id
                        ? 'bg-blue-500/10 border-blue-500/20'
                        : 'bg-white/5 border-white/10'
                  }`}
                >
                  <div className="flex items-start space-x-4">
                    <div
                      className={`flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center ${
                        step.isCompleted ? 'bg-green-500' : 'bg-gray-600'
                      }`}
                    >
                      {step.isCompleted ? (
                        <CheckCircle className="w-6 h-6 text-white" />
                      ) : (
                        <step.icon className="w-6 h-6 text-white" />
                      )}
                    </div>

                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-lg font-semibold text-white">{step.title}</h3>
                        <div className="flex items-center space-x-2">
                          <Clock className="w-4 h-4 text-gray-400" />
                          <span className="text-sm text-gray-400">{step.estimatedTime}</span>
                        </div>
                      </div>

                      <p className="text-gray-400 mb-4">{step.description}</p>

                      <div className="flex flex-wrap gap-2 mb-4">
                        {step.benefits.map((benefit, i) => (
                          <span key={i} className="px-2 py-1 bg-gray-700/50 text-gray-300 text-xs rounded">
                            {benefit}
                          </span>
                        ))}
                      </div>

                      {!step.isCompleted && step.id === nextIncompleteStep?.id && (
                        <button
                          onClick={() => handleContinueStep(step.id)}
                          className="flex items-center space-x-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors"
                        >
                          <span>Continue</span>
                          <ArrowRight className="w-4 h-4" />
                        </button>
                      )}

                      {step.isCompleted && (
                        <div className="flex items-center space-x-2 text-green-400">
                          <CheckCircle className="w-4 h-4" />
                          <span className="text-sm font-medium">Completed</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Asset Class Selection & Quick Actions */}
          <div className="space-y-6">
            {/* Asset Class Preferences */}
            {isNewUser() && (
              <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6">
                <h3 className="text-lg font-semibold text-white mb-4">Choose Your Focus</h3>
                <p className="text-gray-400 text-sm mb-4">
                  What type of assets are you most interested in? This helps us customize your experience.
                </p>

                <div className="space-y-3">
                  {assetClasses.map((assetClass) => (
                    <button
                      key={assetClass.name}
                      onClick={() => setSelectedAssetClass(assetClass.name)}
                      className={`w-full p-4 rounded-lg border text-left transition-all ${
                        selectedAssetClass === assetClass.name
                          ? 'border-blue-500 bg-blue-500/10'
                          : 'border-gray-600 hover:border-gray-500'
                      }`}
                    >
                      <div className="flex items-center space-x-3">
                        <span className="text-2xl">{assetClass.icon}</span>
                        <div>
                          <h4 className="font-medium text-white">{assetClass.name}</h4>
                          <p className="text-sm text-gray-400">{assetClass.description}</p>
                          <p className="text-xs text-blue-400 mt-1">KYC Level {assetClass.kycLevel} required</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Quick Actions */}
            <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Quick Actions</h3>

              <div className="space-y-3">
                {nextIncompleteStep && (
                  <button
                    onClick={handleStart}
                    className="w-full flex items-center justify-center space-x-2 py-3 bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white rounded-lg font-medium transition-all"
                  >
                    <Play className="w-4 h-4" />
                    <span>{isNewUser() ? 'Start Journey' : 'Continue Journey'}</span>
                  </button>
                )}

                <button
                  onClick={handleSkip}
                  className="w-full flex items-center justify-center space-x-2 py-3 border border-gray-600 hover:border-gray-500 text-gray-300 hover:text-white rounded-lg font-medium transition-all"
                >
                  <SkipForward className="w-4 h-4" />
                  <span>Skip to Trading</span>
                </button>

                <button
                  onClick={() => router.push('/admin')}
                  className="w-full flex items-center justify-center space-x-2 py-3 border border-purple-600 hover:border-purple-500 text-purple-400 hover:text-purple-300 rounded-lg font-medium transition-all"
                >
                  <Shield className="w-4 h-4" />
                  <span>Admin Dashboard</span>
                </button>
              </div>
            </div>

            {/* Advanced Options */}
            <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Preferences</h3>

              <div className="space-y-3">
                <label className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    checked={showAdvanced}
                    onChange={(e) => setShowAdvanced(e.target.checked)}
                    className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500 focus:ring-2"
                  />
                  <span className="text-gray-300">Show advanced options</span>
                </label>

                <label className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    checked={sessionData.preferences.autoFillForms}
                    onChange={(e) => updatePreferences({ autoFillForms: e.target.checked })}
                    className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500 focus:ring-2"
                  />
                  <span className="text-gray-300">Auto-fill forms with smart defaults</span>
                </label>
              </div>
            </div>

            {/* Stats */}
            <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Your Progress</h3>

              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-400">Tokens Created</span>
                  <span className="text-white font-medium">{sessionData.tokens.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Pools Created</span>
                  <span className="text-white font-medium">{sessionData.pools.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">KYC Level</span>
                  <span className="text-white font-medium">
                    {sessionData.userKyc.exists ? sessionData.userKyc.level : 'None'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Journey Progress</span>
                  <span className="text-white font-medium">{Math.round(progressPercentage)}%</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
