import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    unoptimized: true,
  },
  basePath: '/kanban', // Assuming the repo name is 'kanban'
};

export default nextConfig;
