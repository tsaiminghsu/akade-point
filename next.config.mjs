/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  async redirects() {
    const gameRoutes = [
      'city-game', 'da-nu-shen', 'jiu-gong-ge', 'minecraft',
      'scratch-card', 'ship-tracker', 'temple-of-desert-god',
      'test-game', 'tiao-dou-ji',
    ];
    return gameRoutes.map((slug) => ({
      source: `/${slug}`,
      destination: `/games/${slug}`,
      permanent: true,
    }));
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "profile.line-scdn.net" },
      { protocol: "https", hostname: "*.line-scdn.net" },
    ],
  },
  webpack: (config) => {
    config.experiments = { ...config.experiments, asyncWebAssembly: true };
    return config;
  },
};

export default nextConfig;
