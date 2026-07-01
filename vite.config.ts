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
          const wallsApiPath = '/api/global-walls';
          const presetApiPath = '/api/default-preset';
          const urlPath = req.url?.split('?')[0] || '';
          
          const isApiMatch = urlPath === apiPath || urlPath.endsWith(apiPath);
          const isWallsApiMatch = urlPath === wallsApiPath || urlPath.endsWith(wallsApiPath);
          const isPresetMatch = urlPath === presetApiPath || urlPath.endsWith(presetApiPath);
          const helpApiPath = '/api/global-help';
          const isHelpMatch = urlPath === helpApiPath || urlPath.endsWith(helpApiPath);

          if (isHelpMatch) {
            if (req.method === 'GET') {
              const filePath = path.resolve(__dirname, 'public/global_help.json');
              if (fs.existsSync(filePath)) {
                const data = fs.readFileSync(filePath, 'utf-8');
                res.setHeader('Content-Type', 'application/json');
                res.end(data);
              } else {
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({}));
              }
            } else if (req.method === 'POST') {
              let body = '';
              req.on('data', chunk => { body += chunk; });
              req.on('end', () => {
                const filePath = path.resolve(__dirname, 'public/global_help.json');
                fs.writeFileSync(filePath, body, 'utf-8');
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ success: true }));
              });
            }
          } else if (urlPath === '/api/global-defaults' || urlPath.endsWith('/api/global-defaults')) {
            if (req.method === 'GET') {
              const filePath = path.resolve(__dirname, 'public/global_defaults.json');
              if (fs.existsSync(filePath)) {
                res.setHeader('Content-Type', 'application/json');
                res.end(fs.readFileSync(filePath, 'utf-8'));
              } else {
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ hiddenMarkers: [], hiddenMarkerTypes: [] }));
              }
            } else if (req.method === 'POST') {
              let body = '';
              req.on('data', chunk => { body += chunk; });
              req.on('end', () => {
                fs.writeFileSync(path.resolve(__dirname, 'public/global_defaults.json'), body, 'utf-8');
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ success: true }));
              });
            }
          } else if (isApiMatch) {
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
          } else if (isWallsApiMatch) {
            if (req.method === 'GET') {
              const filePath = path.resolve(__dirname, 'global_walls.json');
              if (fs.existsSync(filePath)) {
                const data = fs.readFileSync(filePath, 'utf-8');
                res.setHeader('Content-Type', 'application/json');
                res.end(data);
              } else {
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({}));
              }
            } else if (req.method === 'POST') {
              let body = '';
              req.on('data', chunk => {
                body += chunk;
              });
              req.on('end', () => {
                const filePath = path.resolve(__dirname, 'global_walls.json');
                fs.writeFileSync(filePath, body, 'utf-8');
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ success: true }));
              });
            }
          } else if (urlPath === '/api/upload-media' || urlPath.endsWith('/api/upload-media')) {
            if (req.method === 'POST') {
              const chunks: Buffer[] = [];
              req.on('data', chunk => chunks.push(chunk));
              req.on('end', () => {
                const body = Buffer.concat(chunks);
                const boundary = req.headers['content-type']?.match(/boundary=(.+)/)?.[1];
                if (!boundary) {
                  res.statusCode = 400;
                  res.end(JSON.stringify({ error: 'No boundary' }));
                  return;
                }
                const parts = body.toString('binary').split('--' + boundary);
                let filename = '';
                let fileData: Buffer | null = null;
                for (const part of parts) {
                  const headerEnd = part.indexOf('\r\n\r\n');
                  if (headerEnd === -1) continue;
                  const header = part.substring(0, headerEnd);
                  const contentDisposition = header.match(/filename="(.+?)"/);
                  if (contentDisposition) {
                    filename = contentDisposition[1];
                    const raw = part.substring(headerEnd + 4);
                    const trimPos = raw.indexOf('\r\n--');
                    fileData = Buffer.from(trimPos > 0 ? raw.substring(0, trimPos) : raw, 'binary');
                  }
                }
                if (filename && fileData) {
                  const uploadDir = path.resolve(__dirname, 'public/uploads');
                  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
                  const safeName = Date.now() + '_' + filename.replace(/[^a-zA-Z0-9._-]/g, '_');
                  fs.writeFileSync(path.join(uploadDir, safeName), fileData);
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ url: `/Nikukyu_Route/uploads/${safeName}`, filename: safeName }));
                } else {
                  res.statusCode = 400;
                  res.end(JSON.stringify({ error: 'No file' }));
                }
              });
            } else if (req.method === 'DELETE') {
              // Delete an uploaded media file
              const chunks: Buffer[] = [];
              req.on('data', chunk => chunks.push(chunk));
              req.on('end', () => {
                try {
                  const body = JSON.parse(Buffer.concat(chunks).toString());
                  const filename = (body.filename || '').replace(/[^a-zA-Z0-9._-]/g, '_');
                  if (!filename) {
                    res.statusCode = 400;
                    res.end(JSON.stringify({ error: 'No filename' }));
                    return;
                  }
                  const filePath = path.resolve(__dirname, 'public/uploads', filename);
                  if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({ ok: true, deleted: filename }));
                  } else {
                    res.statusCode = 404;
                    res.end(JSON.stringify({ error: 'Not found' }));
                  }
                } catch (e) {
                  res.statusCode = 400;
                  res.end(JSON.stringify({ error: 'Bad request' }));
                }
              });
            } else {
              next();
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
            } else if (req.method === 'DELETE') {
              const filePath = path.resolve(__dirname, 'default_preset.json');
              if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: true }));
            }
          } else if (urlPath === '/api/presets' || urlPath.endsWith('/api/presets')) {
            const presetsFile = path.resolve(__dirname, 'presets.json');
            if (req.method === 'GET') {
              if (fs.existsSync(presetsFile)) {
                res.setHeader('Content-Type', 'application/json');
                res.end(fs.readFileSync(presetsFile, 'utf-8'));
              } else {
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify([]));
              }
            } else if (req.method === 'POST') {
              let body = '';
              req.on('data', chunk => { body += chunk; });
              req.on('end', () => {
                fs.writeFileSync(presetsFile, body, 'utf-8');
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ success: true }));
              });
            } else if (req.method === 'DELETE') {
              let body = '';
              req.on('data', chunk => { body += chunk; });
              req.on('end', () => {
                try {
                  const { id } = JSON.parse(body);
                  if (fs.existsSync(presetsFile)) {
                    const presets = JSON.parse(fs.readFileSync(presetsFile, 'utf-8'));
                    const next = presets.filter((p: any) => p.id !== id);
                    fs.writeFileSync(presetsFile, JSON.stringify(next, null, 2), 'utf-8');
                  }
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ success: true }));
                } catch {
                  res.statusCode = 400;
                  res.end(JSON.stringify({ error: 'Invalid request' }));
                }
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

        const wallsSrcPath = path.resolve(__dirname, 'global_walls.json');
        const wallsDestPath = path.resolve(__dirname, 'dist/global_walls.json');
        if (fs.existsSync(wallsSrcPath)) {
          const distDir = path.dirname(wallsDestPath);
          if (!fs.existsSync(distDir)) {
            fs.mkdirSync(distDir, { recursive: true });
          }
          fs.copyFileSync(wallsSrcPath, wallsDestPath);
          console.log('Copied global_walls.json to dist/ during build');
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

        const presetsSrcPath = path.resolve(__dirname, 'presets.json');
        const presetsDestPath = path.resolve(__dirname, 'dist/presets.json');
        if (fs.existsSync(presetsSrcPath)) {
          const distDir = path.dirname(presetsDestPath);
          if (!fs.existsSync(distDir)) {
            fs.mkdirSync(distDir, { recursive: true });
          }
          fs.copyFileSync(presetsSrcPath, presetsDestPath);
          console.log('Copied presets.json to dist/ during build');
        }

        const helpSrcPath = path.resolve(__dirname, 'public/global_help.json');
        const helpDestPath = path.resolve(__dirname, 'dist/global_help.json');
        if (fs.existsSync(helpSrcPath)) {
          const distDir = path.dirname(helpDestPath);
          if (!fs.existsSync(distDir)) {
            fs.mkdirSync(distDir, { recursive: true });
          }
          fs.copyFileSync(helpSrcPath, helpDestPath);
          console.log('Copied global_help.json to dist/ during build');
        }

        const defaultsSrcPath = path.resolve(__dirname, 'public/global_defaults.json');
        const defaultsDestPath = path.resolve(__dirname, 'dist/global_defaults.json');
        if (fs.existsSync(defaultsSrcPath)) {
          const distDir = path.dirname(defaultsDestPath);
          if (!fs.existsSync(distDir)) {
            fs.mkdirSync(distDir, { recursive: true });
          }
          fs.copyFileSync(defaultsSrcPath, defaultsDestPath);
          console.log('Copied global_defaults.json to dist/ during build');
        }

        // public/uploads/ → dist/uploads/ を同期。
        // デフォルトでも public/ はコピーされるが、アップロード後の再ビルド忘れで
        // 個人編集モード (dist 配信) から画像が見えなくなる事故を防ぐため明示的に同期する。
        const uploadsSrcDir = path.resolve(__dirname, 'public/uploads');
        const uploadsDestDir = path.resolve(__dirname, 'dist/uploads');
        if (fs.existsSync(uploadsSrcDir)) {
          if (!fs.existsSync(uploadsDestDir)) {
            fs.mkdirSync(uploadsDestDir, { recursive: true });
          }
          for (const entry of fs.readdirSync(uploadsSrcDir, { withFileTypes: true })) {
            if (!entry.isFile()) continue;
            const srcFile = path.join(uploadsSrcDir, entry.name);
            const destFile = path.join(uploadsDestDir, entry.name);
            fs.copyFileSync(srcFile, destFile);
          }
          console.log('Synced public/uploads/ to dist/uploads/ during build');
        }
      }
    }
  ],
  server: {
    host: true,
    port: 29980,
    watch: {
      ignored: [
        path.resolve(__dirname, 'global_markers.json'),
        '**/global_markers.json',
        path.resolve(__dirname, 'global_walls.json'),
        '**/global_walls.json',
        path.resolve(__dirname, 'default_preset.json'),
        '**/default_preset.json',
        path.resolve(__dirname, 'presets.json'),
        '**/presets.json',
        path.resolve(__dirname, 'public/global_help.json'),
        '**/public/global_help.json',
        path.resolve(__dirname, 'public/global_defaults.json'),
        '**/public/global_defaults.json'
      ]
    }
  }
})
