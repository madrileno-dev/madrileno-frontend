import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// Manifest name follows package.json, so init-project's rename re-brands the app.
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as {
  name: string
}
const appName = pkg.name
  .replace(/-frontend$/, '')
  .split(/[-_]/)
  .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
  .join(' ')

// Same-origin /v1 in dev — no CORS needed on the backend. See README for production.
export default defineConfig(({ isSsrBuild }) => ({
  plugins: [
    react(),
    tailwindcss(),
    // The service worker is a client artifact — skip PWA in the SSR bundle.
    ...(isSsrBuild
      ? []
      : [
          VitePWA({
            registerType: 'prompt',
            // Registered from app code (registerPwa.ts), so the nonce CSP needs no inline-script exception.
            injectRegister: null,
            includeAssets: ['favicon.svg'],
            pwaAssets: { config: true, overrideManifestIcons: true },
            manifest: {
              name: appName,
              short_name: appName,
              description: 'Frontend built against the generated API contract',
              theme_color: '#772938',
              background_color: '#ffffff',
              display: 'standalone',
              start_url: '/',
              scope: '/',
            },
            workbox: {
              globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
              navigateFallback: '/index.html',
              // API calls and health probes must never be served from the app-shell cache.
              navigateFallbackDenylist: [/^\/v1\//, /^\/healthz$/],
            },
          }),
        ]),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    proxy: {
      '/v1': {
        target: process.env.API_BASE_URL ?? 'http://localhost:9000',
        changeOrigin: true,
      },
    },
  },
}))
