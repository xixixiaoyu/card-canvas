import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import './assets/main.css'
import { installSyncTracking } from './lib/sync/tracker'

const app = createApp(App)

installSyncTracking()
app.use(createPinia())
app.mount('#app')
