/** @type {import('next').NextConfig} */
const nextConfig = {
  // NOTE: `output: "standalone"` was removed. AWS Amplify's WEB_COMPUTE platform
  // reads .next/required-server-files.json and .next/server directly; it never
  // uses .next/standalone/server.js, so standalone only duplicated node_modules
  // into the deploy artifact.
  async redirects() {
    const gameRoutes = [
      'city-game', 'da-nu-shen', 'jiu-gong-ge', 'minecraft',
      'scratch-card', 'ship-tracker', 'temple-of-desert-god',
      'combo-arena', 'tiao-dou-ji',
    ];
    return gameRoutes.map((slug) => ({
      source: `/${slug}`,
      destination: `/games/${slug}`,
      permanent: true,
    }));
  },
  eslint: {
    // Lint is a build gate. It was previously disabled because the tree had 13
    // errors; those are fixed, so the build now fails on any new one.
    ignoreDuringBuilds: false,
    dirs: ['app', 'components', 'lib', 'store', 'types'],
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "profile.line-scdn.net" },
      { protocol: "https", hostname: "*.line-scdn.net" },
    ],
  },
  // asyncWebAssembly was only needed by @react-three/rapier, which is no longer
  // a dependency. @dimforge/rapier3d-compat is now a devDependency used solely
  // by scripts/test-ball-physics.ts, which never enters the webpack bundle.
};

export default nextConfig;
