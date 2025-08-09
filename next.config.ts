import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  /* config options here */
  eslint: {
    // Skip ESLint during production builds to avoid blocking on lint errors
    ignoreDuringBuilds: true,
  },
}

export default nextConfig
