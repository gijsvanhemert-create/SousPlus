import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Er staat een lockfile in een bovenliggende map (home-dir); pin de root
  // expliciet op dit project zodat Turbopack/Next de juiste workspace kiest.
  turbopack: {
    root: import.meta.dirname,
  },
  experimental: {
    // Factuur-OCR uploadt een base64-foto/PDF via een server action; de standaard
    // body-limiet van 1MB is te krap. Foto's worden client-side verkleind; PDF's
    // kunnen groter zijn (meerdere pagina's), vandaar de ruimere marge.
    serverActions: {
      bodySizeLimit: "16mb",
    },
  },
};

export default nextConfig;
