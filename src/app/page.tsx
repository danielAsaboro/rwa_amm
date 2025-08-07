import { ArrowUpRight, TrendingUp, DollarSign, Activity, Users, Shield } from 'lucide-react'
import Header from '@/components/Header'

export default function Home() {
  return (
    <div className="min-h-screen">
      <Header />

      {/* Hero Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto text-center">
          <h1 className="text-5xl md:text-7xl font-bold text-white mb-6">
            Trade Real World Assets
            <span className="block bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
              Digitally
            </span>
          </h1>
          <p className="text-xl text-gray-300 mb-12 max-w-3xl mx-auto">
            Advanced trading platform for real-world assets. Experience seamless trading with institutional-grade
            funding and security.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href="/trade"
              className="bg-gradient-to-r from-purple-500 to-pink-500 text-white px-8 py-4 rounded-lg font-semibold text-lg hover:from-purple-600 hover:to-pink-600 transition-all flex items-center justify-center"
            >
              Start Trading
              <ArrowUpRight className="ml-2 w-5 h-5" />
            </a>
            <a
              href="/create-mint"
              className="border border-white/20 text-white px-8 py-4 rounded-lg font-semibold text-lg hover:bg-white/10 transition-all text-center"
            >
              Create Asset
            </a>
            <a
              href="/create-pool"
              className="border border-white/20 text-white px-8 py-4 rounded-lg font-semibold text-lg hover:bg-white/10 transition-all text-center"
            >
              Create Trading Pool
            </a>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm">Total Value Locked</p>
                  <p className="text-2xl font-bold text-white">$124.5M</p>
                </div>
                <DollarSign className="w-8 h-8 text-purple-400" />
              </div>
            </div>
            <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm">24h Volume</p>
                  <p className="text-2xl font-bold text-white">$8.2M</p>
                </div>
                <Activity className="w-8 h-8 text-green-400" />
              </div>
            </div>
            <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm">Active Users</p>
                  <p className="text-2xl font-bold text-white">2,847</p>
                </div>
                <Users className="w-8 h-8 text-blue-400" />
              </div>
            </div>
            <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm">Security Score</p>
                  <p className="text-2xl font-bold text-white">99.8%</p>
                </div>
                <Shield className="w-8 h-8 text-yellow-400" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Trading Cards */}
      <section className="py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-3xl font-bold text-white mb-12 text-center">Popular Asset Pairs</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* USDC/USDT Pool */}
            <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6 hover:bg-white/10 transition-all">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-2">
                  <div className="w-8 h-8 bg-blue-500 rounded-full"></div>
                  <div className="w-8 h-8 bg-green-500 rounded-full -ml-2"></div>
                  <span className="text-white font-semibold">USDC/USDT</span>
                </div>
                <span className="text-green-400 text-sm">+2.4%</span>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Available Funds</span>
                  <span className="text-white">$45.2M</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">24h Volume</span>
                  <span className="text-white">$2.1M</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">APY</span>
                  <span className="text-green-400">12.8%</span>
                </div>
              </div>
              <a
                href="/trade"
                className="w-full mt-4 bg-gradient-to-r from-purple-500 to-pink-500 text-white py-2 rounded-lg font-medium hover:from-purple-600 hover:to-pink-600 transition-all block text-center"
              >
                Trade
              </a>
            </div>

            {/* SOL/USDC Pool */}
            <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6 hover:bg-white/10 transition-all">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-2">
                  <div className="w-8 h-8 bg-purple-500 rounded-full"></div>
                  <div className="w-8 h-8 bg-blue-500 rounded-full -ml-2"></div>
                  <span className="text-white font-semibold">SOL/USDC</span>
                </div>
                <span className="text-red-400 text-sm">-1.2%</span>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Available Funds</span>
                  <span className="text-white">$32.8M</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">24h Volume</span>
                  <span className="text-white">$4.7M</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">APY</span>
                  <span className="text-green-400">18.5%</span>
                </div>
              </div>
              <a
                href="/trade"
                className="w-full mt-4 bg-gradient-to-r from-purple-500 to-pink-500 text-white py-2 rounded-lg font-medium hover:from-purple-600 hover:to-pink-600 transition-all block text-center"
              >
                Trade
              </a>
            </div>

            {/* RWA/USDC Pool */}
            <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6 hover:bg-white/10 transition-all">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-2">
                  <div className="w-8 h-8 bg-yellow-500 rounded-full"></div>
                  <div className="w-8 h-8 bg-blue-500 rounded-full -ml-2"></div>
                  <span className="text-white font-semibold">RWA/USDC</span>
                </div>
                <span className="text-green-400 text-sm">+5.7%</span>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Available Funds</span>
                  <span className="text-white">$18.9M</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">24h Volume</span>
                  <span className="text-white">$890K</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">APY</span>
                  <span className="text-green-400">25.3%</span>
                </div>
              </div>
              <a
                href="/trade"
                className="w-full mt-4 bg-gradient-to-r from-purple-500 to-pink-500 text-white py-2 rounded-lg font-medium hover:from-purple-600 hover:to-pink-600 transition-all block text-center"
              >
                Trade
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-3xl font-bold text-white mb-12 text-center">Why Choose RWA AMM?</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="w-16 h-16 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <Shield className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">Institutional Security</h3>
              <p className="text-gray-400">
                Advanced security protocols and multi-signature governance ensure your assets are protected.
              </p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <TrendingUp className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">Deep Funding</h3>
              <p className="text-gray-400">
                Access to institutional-grade funding pools with minimal price changes and optimal pricing.
              </p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <Activity className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">Real-Time Analytics</h3>
              <p className="text-gray-400">
                Comprehensive analytics and real-time data to make informed trading decisions.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 bg-white/5 backdrop-blur-sm py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div>
              <div className="flex items-center space-x-3 mb-4">
                <div className="w-8 h-8 bg-gradient-to-r from-purple-500 to-pink-500 rounded-lg flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-white" />
                </div>
                <h3 className="text-xl font-bold text-white">RWA AMM</h3>
              </div>
              <p className="text-gray-400">Advanced Automated Market Maker for real-world assets on Solana.</p>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Product</h4>
              <ul className="space-y-2 text-gray-400">
                <li>
                  <a href="/trade" className="hover:text-white transition-colors">
                    Trade
                  </a>
                </li>
                <li>
                  <a href="/create-pool" className="hover:text-white transition-colors">
                    Trading Pools
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-white transition-colors">
                    Analytics
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-white transition-colors">
                    API
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Resources</h4>
              <ul className="space-y-2 text-gray-400">
                <li>
                  <a href="#" className="hover:text-white transition-colors">
                    Documentation
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-white transition-colors">
                    GitHub
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-white transition-colors">
                    Blog
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-white transition-colors">
                    Support
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Community</h4>
              <ul className="space-y-2 text-gray-400">
                <li>
                  <a href="#" className="hover:text-white transition-colors">
                    Discord
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-white transition-colors">
                    Twitter
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-white transition-colors">
                    Telegram
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-white transition-colors">
                    Medium
                  </a>
                </li>
              </ul>
            </div>
          </div>
          <div className="border-t border-white/10 mt-8 pt-8 text-center text-gray-400">
            <p>&copy; 2024 RWA AMM. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
