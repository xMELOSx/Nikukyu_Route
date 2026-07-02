import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { apiMiddleware } from './config/api-handlers'

const buildTime = new Date().toISOString()
  .replace(/[:.]/g, '-')
  .replace('T', '_')
  .slice(0, 19)

export default defineConfig({
  base: '/Nikukyu_Route/',
  define: {
    __BUILD_TIME__: JSON.stringify(buildTime)
  },
  plugins: [
    react(),
    apiMiddleware()
  ],
  server: {
    host: true,
    port: 29980,
    watch: {
      ignored: [
        '**/config/data/*.json'
      ]
    }
  }
})
