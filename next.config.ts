import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  eslint: {
    // Speed up production builds by ignoring ESLint errors during build
    ignoreDuringBuilds: true,
  },
  webpack: (config) => {
    // Prevent optional pretty printer from breaking bundles
    config.resolve = config.resolve || {}
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      'pino-pretty': false,
    }
    return config
  },
}

export default nextConfig
