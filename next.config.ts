import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Los datos GTFS preprocesados (data/, cientos de MB) no se empaquetan con las funciones: en
  // producción se leen de GitHub Pages (GTFS_DATA_URL, ver src/lib/gtfs/store.ts) y en local directamente del disco.
  outputFileTracingExcludes: { "*": ["./data/**"] },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
