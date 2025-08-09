import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  /* config options here */
  eslint: {
    // Skip ESLint during production builds to avoid blocking on lint errors
    ignoreDuringBuilds: true,
  },
  webpack: (config, { webpack }) => {
    // Ignore optional dependency pulled in by pino to avoid bundling errors
    config.plugins = config.plugins || []
    config.plugins.push(
      new webpack.IgnorePlugin({ resourceRegExp: /^pino-pretty$/ })
    )
    return config
  },
}

export default nextConfig
