import type { NextConfig } from 'next'

const config: NextConfig = {
  reactStrictMode: true,
  experimental: {
    useTypeScriptCli: true
  },
  // The dev badge sat over the tap on phones; build errors still show without it.
  devIndicators: false,
  // Let phones on the same Wi-Fi load the dev server by its LAN address.
  allowedDevOrigins: ['192.168.*.*', '10.*.*.*', '*.local']
}

export default config
