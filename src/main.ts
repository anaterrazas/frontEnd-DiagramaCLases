// src/main.ts
import { createApp } from 'vue'
import App from './App.vue'
import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
import router from './router'
import '@fortawesome/fontawesome-free/css/all.min.css'
import '@/assets/css/index.css'
import Snackbar from '@/components/Snackbar.vue'
import 'grapesjs/dist/css/grapes.min.css'
import 'jointjs/dist/joint.css'


const app = createApp(App)
const pinia = createPinia()

pinia.use(piniaPluginPersistedstate)

app.use(pinia)
app.use(router)
app.component('Snackbar', Snackbar)

app.mount('#app')
