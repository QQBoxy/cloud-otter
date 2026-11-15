import { createApp } from 'vue'
import 'element-plus/es/components/base/style/css'
import './style.css'
import './pwa.ts'
import App from './App.vue'

window.addEventListener('pageshow', (event) => {
  if (event.persisted) window.location.reload()
})

createApp(App).mount('#app')
