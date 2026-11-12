import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

/** Normalise MAFIA_BASE_PATH to a leading- and trailing-slash path, e.g. "mafia" -> "/mafia/". */
function basePath(raw: string | undefined): string {
  const trimmed = (raw ?? '').trim().replace(/^\/+|\/+$/g, '')
  return trimmed ? `/${trimmed}/` : '/'
}

// Cloudflare Pages serves from the domain root ("/", the default). The GitHub Pages workflow
// builds with MAFIA_BASE_PATH=/mafia/ for https://shawnumo.github.io/mafia/.
export default defineConfig(({ mode }) => {
  const base = basePath(loadEnv(mode, '.', 'MAFIA_').MAFIA_BASE_PATH)

  return {
    base,
    plugins: [
      react(),
      VitePWA({
        // Updates wait for the GM (setup and end screens) instead of reloading mid-game.
        registerType: 'prompt',
        includeAssets: ['favicon.svg', 'mafia-icon.svg', 'apple-touch-icon.png'],
        manifest: {
          name: 'Mafia GM Cockpit',
          short_name: 'Mafia',
          description: 'An offline game runner for Mafia nights.',
          theme_color: '#102a2a',
          background_color: '#f4f0e8',
          id: base,
          start_url: base,
          scope: base,
          display: 'standalone',
          orientation: 'portrait',
          icons: [
            { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
            { src: 'mafia-icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }
          ]
        }
      })
    ]
  }
})
