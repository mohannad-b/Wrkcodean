/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Temporarily disable ESLint during builds to avoid circular structure error
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Allow build to continue even with type errors (you should fix these)
    ignoreBuildErrors: false,
  },
  images: {
    domains: ["images.unsplash.com", "github.com"],
  },
  // Performance optimizations
  swcMinify: true,
  compiler: {
    removeConsole: process.env.NODE_ENV === "production"
      ? {
          exclude: ["error", "warn"],
        }
      : false,
  },
  // Optimize bundle splitting
  experimental: {
    optimizePackageImports: [
      "lucide-react",
      "@radix-ui/react-accordion",
      "@radix-ui/react-alert-dialog",
      "@radix-ui/react-dialog",
      "@radix-ui/react-dropdown-menu",
      "@radix-ui/react-select",
      "recharts",
    ],
  },
  // Webpack optimizations
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Optimize client-side bundle
      config.optimization = {
        ...config.optimization,
        moduleIds: "deterministic",
        runtimeChunk: "single",
        splitChunks: {
          chunks: "all",
          cacheGroups: {
            default: false,
            vendors: false,
            // Separate heavy libraries into their own chunks
            reactflow: {
              name: "reactflow",
              test: /[\\/]node_modules[\\/]reactflow[\\/]/,
              priority: 30,
              reuseExistingChunk: true,
            },
            recharts: {
              name: "recharts",
              test: /[\\/]node_modules[\\/]recharts[\\/]/,
              priority: 30,
              reuseExistingChunk: true,
            },
            motion: {
              name: "motion",
              test: /[\\/]node_modules[\\/]motion[\\/]/,
              priority: 30,
              reuseExistingChunk: true,
            },
            radix: {
              name: "radix-ui",
              test: /[\\/]node_modules[\\/]@radix-ui[\\/]/,
              priority: 20,
              reuseExistingChunk: true,
            },
            vendor: {
              name: "vendor",
              test: /[\\/]node_modules[\\/]/,
              priority: 10,
              reuseExistingChunk: true,
            },
          },
        },
      };
    }
    return config;
  },
};

export default nextConfig;
