import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
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
        id: '/mafia/',
        start_url: '/mafia/',
        scope: '/mafia/',
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
  ],
  // GitHub Pages project site: https://shawnumo.github.io/mafia/
  base: '/mafia/'
})
