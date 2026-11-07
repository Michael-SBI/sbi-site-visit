import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// Served from https://michael-sbi.github.io/sbi-site-visit/
export default defineConfig({
  base: "/sbi-site-visit/",
  define: { "process.env.IS_PREACT": JSON.stringify("false") },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/*.png", "fonts/**/*.woff2", "config.json"],
      manifest: {
        name: "SBI Site Visit Record",
        short_name: "Site Visit",
        description: "Mark up plans and site photos, saved to the job folder.",
        start_url: ".",
        scope: ".",
        display: "standalone",
        orientation: "any",
        background_color: "#1A1A1A",
        theme_color: "#1A1A1A",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          // Android crops these to its own shape; the art sits inside the safe middle circle.
          { src: "icons/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
          { src: "icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,mjs,css,html,png,svg,woff2}"],
        maximumFileSizeToCacheInBytes: 20 * 1024 * 1024,
        navigateFallback: "index.html",
        // config.json changes without a rebuild of the app shell: always try the network first
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.endsWith("/config.json"),
            handler: "NetworkFirst",
            options: { cacheName: "config" },
          },
        ],
      },
    }),
  ],
  build: { target: "es2022", chunkSizeWarningLimit: 6000 },
  worker: { format: "es" },
});
