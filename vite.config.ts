import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { apiMiddleware } from './config/api-handlers'

export default defineConfig({
  base: '/Nikukyu_Route/',
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
