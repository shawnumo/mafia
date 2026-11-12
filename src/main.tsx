import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import { announceUpdate } from './app/pwa'
import './index.css'

// Updates wait for the GM (see UpdateBanner) instead of reloading the page mid-game.
const updateServiceWorker = registerSW({
  immediate: true,
  onNeedRefresh() {
    announceUpdate(() => { void updateServiceWorker(true) })
  }
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
