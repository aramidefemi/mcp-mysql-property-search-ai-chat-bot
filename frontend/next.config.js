/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable TypeScript strict mode
  typescript: {
    ignoreBuildErrors: false,
  },
  // ESLint configuration
  eslint: {
    ignoreDuringBuilds: false,
  },
}

module.exports = nextConfig
