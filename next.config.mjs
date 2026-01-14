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
};

export default nextConfig;
