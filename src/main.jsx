import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { showToast } from './components/ui/Toast'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
)

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/matchbook/sw.js')
      .then(registration => {
        registration.addEventListener('updatefound', () => {
          const worker = registration.installing
          if (!worker) return
          worker.addEventListener('statechange', () => {
            // A controller means this is an update, not the first install
            if (worker.state === 'installed' && navigator.serviceWorker.controller) {
              showToast('New version available — refresh to update', 'warn')
            }
          })
        })
      })
      .catch(e => console.error('Service worker registration failed', e))
  })
}
