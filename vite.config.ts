/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { VitePWA } from "vite-plugin-pwa";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

// Identifiant du commit compilé : Vercel expose le SHA du déploiement,
// sinon on interroge git (clone local) ; "inconnu" en dernier recours.
function resolveCommit(): string {
  const vercelSha = process.env.VERCEL_GIT_COMMIT_SHA;
  if (vercelSha) return vercelSha.slice(0, 7);
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "inconnu";
  }
}

const pkg = JSON.parse(readFileSync(path.resolve(__dirname, "package.json"), "utf8"));

// https://vitejs.dev/config/
export default defineConfig(() => ({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_COMMIT__: JSON.stringify(resolveCommit()),
    __APP_BUILD_DATE__: JSON.stringify(new Date().toISOString()),
  },
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico", "icons/*.png", "placeholder.svg"],
      manifest: false, // On utilise le manifest.json existant
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,jpg,svg,woff,woff2}"],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-cache",
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "gstatic-fonts-cache",
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "supabase-api-cache",
              networkTimeoutSeconds: 10,
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 },
            },
          },
        ],
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    css: true,
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    coverage: {
      provider: "v8" as const,
      reporter: ["text", "text-summary", "html", "json-summary"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        // Composants shadcn/ui : réexports/wrappers générés, peu de logique propre
        "src/components/ui/**",
        // Fichiers Supabase auto-générés (interdits d'édition)
        "src/integrations/supabase/**",
        // Types purs, point d'entrée et setup de tests
        "src/types/**",
        "src/main.tsx",
        "src/test/**",
        "src/**/*.d.ts",
      ],
    },
  },
}));
