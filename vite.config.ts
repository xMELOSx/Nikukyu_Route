import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  base: '/Nikukyu_Route/',
  plugins: [
    react(),
    {
      name: 'global-markers-api',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const apiPath = '/api/global-markers';
          const presetApiPath = '/api/default-preset';
          const urlPath = req.url?.split('?')[0] || '';
          
          const isApiMatch = urlPath === apiPath || urlPath.endsWith(apiPath);
          const isPresetMatch = urlPath === presetApiPath || urlPath.endsWith(presetApiPath);

          if (isApiMatch) {
            if (req.method === 'GET') {
              const filePath = path.resolve(__dirname, 'global_markers.json');
              if (fs.existsSync(filePath)) {
                const data = fs.readFileSync(filePath, 'utf-8');
                res.setHeader('Content-Type', 'application/json');
                res.end(data);
              } else {
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify([]));
              }
            } else if (req.method === 'POST') {
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
            }
          } else if (isPresetMatch) {
            if (req.method === 'GET') {
              const filePath = path.resolve(__dirname, 'default_preset.json');
              if (fs.existsSync(filePath)) {
                const data = fs.readFileSync(filePath, 'utf-8');
                res.setHeader('Content-Type', 'application/json');
                res.end(data);
              } else {
                res.statusCode = 404;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'Not Found' }));
              }
            } else if (req.method === 'POST') {
              let body = '';
              req.on('data', chunk => {
                body += chunk;
              });
              req.on('end', () => {
                const filePath = path.resolve(__dirname, 'default_preset.json');
                fs.writeFileSync(filePath, body, 'utf-8');
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ success: true }));
              });
            }
          } else {
            next();
          }
        });
      },
      closeBundle() {
        const srcPath = path.resolve(__dirname, 'global_markers.json');
        const destPath = path.resolve(__dirname, 'dist/global_markers.json');
        if (fs.existsSync(srcPath)) {
          const distDir = path.dirname(destPath);
          if (!fs.existsSync(distDir)) {
            fs.mkdirSync(distDir, { recursive: true });
          }
          fs.copyFileSync(srcPath, destPath);
          console.log('Copied global_markers.json to dist/ during build');
        }

        const presetSrcPath = path.resolve(__dirname, 'default_preset.json');
        const presetDestPath = path.resolve(__dirname, 'dist/default_preset.json');
        if (fs.existsSync(presetSrcPath)) {
          const distDir = path.dirname(presetDestPath);
          if (!fs.existsSync(distDir)) {
            fs.mkdirSync(distDir, { recursive: true });
          }
          fs.copyFileSync(presetSrcPath, presetDestPath);
          console.log('Copied default_preset.json to dist/ during build');
        }
      }
    }
  ],
  server: {
    host: true,
    port: 5173,
    watch: {
      ignored: [
        path.resolve(__dirname, 'global_markers.json'),
        '**/global_markers.json',
        path.resolve(__dirname, 'default_preset.json'),
        '**/default_preset.json'
      ]
    }
  }
})
