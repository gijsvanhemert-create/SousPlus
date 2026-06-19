import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Er staat een lockfile in een bovenliggende map (home-dir); pin de root
  // expliciet op dit project zodat Turbopack/Next de juiste workspace kiest.
  turbopack: {
    root: import.meta.dirname,
  },
};

export default nextConfig;
