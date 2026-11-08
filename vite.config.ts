import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig(({ mode }) => {
  const login = mode === 'login'
  return {
    plugins: [vue()],
    build: {
      // Build both entries separately so the public login assets never include the private app.
      emptyOutDir: !login,
      assetsDir: login ? 'login-assets' : 'assets',
      rollupOptions: { input: login ? 'login.html' : 'index.html' },
    },
  }
})
