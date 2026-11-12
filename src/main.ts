import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import './assets/main.css'
import { installSyncTracking } from './lib/sync/tracker'
import { registerSW } from 'virtual:pwa-register'

const app = createApp(App)

installSyncTracking()
registerSW({
  immediate: true,
  onRegisterError(error) {
    console.error('[card-canvas] PWA registration failed', error)
  },
})
app.use(createPinia())
app.mount('#app')
