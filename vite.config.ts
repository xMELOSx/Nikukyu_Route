import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'global-markers-api',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url === '/api/global-markers' && req.method === 'GET') {
            const filePath = path.resolve(__dirname, 'global_markers.json');
            if (fs.existsSync(filePath)) {
              const data = fs.readFileSync(filePath, 'utf-8');
              res.setHeader('Content-Type', 'application/json');
              res.end(data);
            } else {
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify([]));
            }
          } else if (req.url === '/api/global-markers' && req.method === 'POST') {
            let body = '';
            req.on('data', chunk => {
              body += chunk;
            });
            req.on('end', () => {
              const filePath = path.resolve(__dirname, 'global_markers.json');
              fs.writeFileSync(filePath, body, 'utf-8');
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: true }));
            });
          } else {
            next();
          }
        });
      }
    }
  ],
  server: {
    host: true,
    port: 5173,
    watch: {
      ignored: ['**/global_markers.json']
    }
  }
})
