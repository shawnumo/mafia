import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Mafia GM Cockpit',
        short_name: 'Mafia',
        description: 'An offline game runner for Mafia nights.',
        theme_color: '#102a2a',
        background_color: '#f4f0e8',
        display: 'standalone',
        icons: []
      }
    })
  ],
  base: './'
})
