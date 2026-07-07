import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { apiMiddleware } from './config/api-handlers'

const now = new Date()
const pad = (n: number) => String(n).padStart(2, '0')
const offsetMin = -now.getTimezoneOffset()
const offsetSign = offsetMin >= 0 ? '+' : '-'
const offsetHours = pad(Math.floor(Math.abs(offsetMin) / 60))
const offsetMins = pad(Math.abs(offsetMin) % 60)
const tz = `UTC${offsetSign}${offsetHours}:${offsetMins}`
const buildTime =
  `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_` +
  `${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}_${tz}`

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
        '**/config/data/*.json',
        '**/public/*.json'
      ]
    }
  }
})
