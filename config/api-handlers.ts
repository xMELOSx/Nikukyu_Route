import fs from 'fs'
import path from 'path'
import type { Plugin, ViteDevServer } from 'vite'

const DATA_DIR = path.resolve(__dirname, 'data')

function resolveData(file: string): string {
  return path.resolve(DATA_DIR, file)
}

function readJson(file: string): string | null {
  const fp = resolveData(file)
  return fs.existsSync(fp) ? fs.readFileSync(fp, 'utf-8') : null
}

function writeJson(file: string, body: string): void {
  fs.writeFileSync(resolveData(file), body, 'utf-8')
}

function handleGet(_req: any, res: any, file: string, fallback: string): void {
  const data = readJson(file)
  res.setHeader('Content-Type', 'application/json')
  res.end(data ?? fallback)
}

function handlePost(req: any, res: any, file: string, copyToPublicFile?: string): void {
  let body = ''
  req.on('data', (chunk: string) => { body += chunk })
  req.on('end', () => {
    writeJson(file, body)
    if (copyToPublicFile) {
      const publicPath = path.resolve(__dirname, '../public', copyToPublicFile)
      fs.writeFileSync(publicPath, body, 'utf-8')
    }
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ success: true }))
  })
}

function isPathMatch(urlPath: string, apiPath: string): boolean {
  return urlPath === apiPath || urlPath.endsWith(apiPath)
}

export function apiMiddleware(): Plugin {
  return {
    name: 'nikukyu-api',
    configureServer(server: ViteDevServer) {
      server.middlewares.use((req, res, next) => {
        const urlPath = req.url?.split('?')[0] || ''

        // /api/global-markers
        if (isPathMatch(urlPath, '/api/global-markers')) {
          if (req.method === 'GET') return handleGet(req, res, 'global_markers.json', '[]')
          if (req.method === 'POST') return handlePost(req, res, 'global_markers.json', 'global_markers.json')
          return next()
        }

        // /api/global-walls
        if (isPathMatch(urlPath, '/api/global-walls')) {
          if (req.method === 'GET') return handleGet(req, res, 'global_walls.json', '{}')
          if (req.method === 'POST') return handlePost(req, res, 'global_walls.json', 'global_walls.json')
          return next()
        }

        // /api/global-locked-walls
        if (isPathMatch(urlPath, '/api/global-locked-walls')) {
          if (req.method === 'GET') return handleGet(req, res, 'global_locked_walls.json', '{}')
          if (req.method === 'POST') return handlePost(req, res, 'global_locked_walls.json', 'global_locked_walls.json')
          return next()
        }

        // /api/textures
        if (isPathMatch(urlPath, '/api/textures')) {
          if (req.method === 'GET') {
            const textureDir = path.resolve(__dirname, '../public/texture')
            if (!fs.existsSync(textureDir)) {
              fs.mkdirSync(textureDir, { recursive: true })
            }
            const files = fs.readdirSync(textureDir)
            const textures = files.filter(f => /\.(png|jpg|jpeg|webp|gif)$/i.test(f))
            const jsonBody = JSON.stringify(textures)
            const listFile = path.resolve(__dirname, '../public/textures.json')
            fs.writeFileSync(listFile, jsonBody, 'utf-8')
            res.setHeader('Content-Type', 'application/json')
            res.end(jsonBody)
            return
          }
          return next()
        }

        // /api/resize-texture
        if (isPathMatch(urlPath, '/api/resize-texture')) {
          if (req.method === 'POST') {
            let body = ''
            req.on('data', (chunk: string) => { body += chunk })
            req.on('end', () => {
              try {
                const parsed = JSON.parse(body)
                const { name, dataUrl } = parsed
                if (!name || !dataUrl) {
                  res.statusCode = 400
                  res.end(JSON.stringify({ error: 'Missing name or dataUrl' }))
                  return
                }
                const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, "")
                const buffer = Buffer.from(base64Data, 'base64')
                const targetPath = path.resolve(__dirname, '../public/texture', name)
                fs.writeFileSync(targetPath, buffer)
                res.setHeader('Content-Type', 'application/json')
                res.end(JSON.stringify({ success: true }))
              } catch (e) {
                res.statusCode = 500
                res.end(JSON.stringify({ error: 'Resize failed' }))
              }
            })
            return
          }
          return next()
        }

        // /api/global-spawns
        if (isPathMatch(urlPath, '/api/global-spawns')) {
          if (req.method === 'GET') return handleGet(req, res, 'global_spawns.json', JSON.stringify([]))
          if (req.method === 'POST') return handlePost(req, res, 'global_spawns.json')
          return next()
        }

        // /api/global-help
        if (isPathMatch(urlPath, '/api/global-help')) {
          if (req.method === 'GET') return handleGet(req, res, 'global_help.json', '{}')
          if (req.method === 'POST') return handlePost(req, res, 'global_help.json')
          return next()
        }

        // /api/global-defaults
        if (isPathMatch(urlPath, '/api/global-defaults')) {
          if (req.method === 'GET') return handleGet(req, res, 'global_defaults.json', JSON.stringify({ hiddenMarkers: [], hiddenMarkerTypes: [] }))
          if (req.method === 'POST') return handlePost(req, res, 'global_defaults.json')
          return next()
        }

        // /api/global-sim-defaults
        if (isPathMatch(urlPath, '/api/global-sim-defaults')) {
          if (req.method === 'GET') return handleGet(req, res, 'global_sim_defaults.json', JSON.stringify({ probs: {}, probOverrides: {}, multipliers: {}, playerCount: 1 }))
          if (req.method === 'POST') return handlePost(req, res, 'global_sim_defaults.json')
          return next()
        }

        // /api/global-sim-pools
        if (isPathMatch(urlPath, '/api/global-sim-pools')) {
          if (req.method === 'GET') return handleGet(req, res, 'global_sim_pools.json', JSON.stringify({ pools: {}, bluePlusProbs: {} }))
          if (req.method === 'POST') return handlePost(req, res, 'global_sim_pools.json')
          return next()
        }

        // /api/default-preset
        if (isPathMatch(urlPath, '/api/default-preset')) {
          if (req.method === 'GET') {
            const data = readJson('default_preset.json')
            if (data) {
              res.setHeader('Content-Type', 'application/json')
              res.end(data)
            } else {
              res.statusCode = 404
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ error: 'Not Found' }))
            }
            return
          }
          if (req.method === 'POST') return handlePost(req, res, 'default_preset.json')
          if (req.method === 'DELETE') {
            const fp = resolveData('default_preset.json')
            if (fs.existsSync(fp)) fs.unlinkSync(fp)
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ success: true }))
            return
          }
          return next()
        }

        // /api/presets
        if (isPathMatch(urlPath, '/api/presets')) {
          const presetsFile = resolveData('presets.json')
          if (req.method === 'GET') {
            if (fs.existsSync(presetsFile)) {
              res.setHeader('Content-Type', 'application/json')
              res.end(fs.readFileSync(presetsFile, 'utf-8'))
            } else {
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify([]))
            }
            return
          }
          if (req.method === 'POST') {
            let body = ''
            req.on('data', (chunk: string) => { body += chunk })
            req.on('end', () => {
              fs.writeFileSync(presetsFile, body, 'utf-8')
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ success: true }))
            })
            return
          }
          if (req.method === 'DELETE') {
            let body = ''
            req.on('data', (chunk: string) => { body += chunk })
            req.on('end', () => {
              try {
                const { id } = JSON.parse(body)
                if (fs.existsSync(presetsFile)) {
                  const presets = JSON.parse(fs.readFileSync(presetsFile, 'utf-8'))
                  const next = presets.filter((p: any) => p.id !== id)
                  fs.writeFileSync(presetsFile, JSON.stringify(next, null, 2), 'utf-8')
                }
                res.setHeader('Content-Type', 'application/json')
                res.end(JSON.stringify({ success: true }))
              } catch {
                res.statusCode = 400
                res.end(JSON.stringify({ error: 'Invalid request' }))
              }
            })
            return
          }
          return next()
        }

        // /api/mask — per-floor mask PNG (global static file)
        if (isPathMatch(urlPath, '/api/mask')) {
          const floor = new URL(req.url!, 'http://localhost').searchParams.get('floor') || 'main'
          const maskDir = path.resolve(__dirname, '..', 'public', 'masks')
          const filePath = path.join(maskDir, `${floor}.png`)
          if (req.method === 'GET') {
            if (fs.existsSync(filePath)) {
              res.setHeader('Content-Type', 'image/png')
              res.end(fs.readFileSync(filePath))
            } else {
              res.statusCode = 404
              res.end('')
            }
            return
          }
          if (req.method === 'POST') {
            const chunks: Buffer[] = []
            req.on('data', (chunk: Buffer) => chunks.push(chunk))
            req.on('end', () => {
              const body = Buffer.concat(chunks)
              if (!fs.existsSync(maskDir)) fs.mkdirSync(maskDir, { recursive: true })
              fs.writeFileSync(filePath, body)
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ success: true }))
            })
            return
          }
          return next()
        }

        // /api/upload-media
        if (isPathMatch(urlPath, '/api/upload-media')) {
          if (req.method === 'POST') {
            const chunks: Buffer[] = []
            req.on('data', (chunk: Buffer) => chunks.push(chunk))
            req.on('end', () => {
              const body = Buffer.concat(chunks)
              const boundary = req.headers['content-type']?.match(/boundary=(.+)/)?.[1]
              if (!boundary) {
                res.statusCode = 400
                res.end(JSON.stringify({ error: 'No boundary' }))
                return
              }
              const parts = body.toString('binary').split('--' + boundary)
              let filename = ''
              let fileData: Buffer | null = null
              for (const part of parts) {
                const headerEnd = part.indexOf('\r\n\r\n')
                if (headerEnd === -1) continue
                const header = part.substring(0, headerEnd)
                const contentDisposition = header.match(/filename="(.+?)"/)
                if (contentDisposition) {
                  filename = contentDisposition[1]
                  const raw = part.substring(headerEnd + 4)
                  const trimPos = raw.indexOf('\r\n--')
                  fileData = Buffer.from(trimPos > 0 ? raw.substring(0, trimPos) : raw, 'binary')
                }
              }
              if (filename && fileData) {
                const uploadDir = path.resolve(__dirname, '..', 'public', 'uploads')
                if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true })
                const safeName = Date.now() + '_' + filename.replace(/[^a-zA-Z0-9._-]/g, '_')
                fs.writeFileSync(path.join(uploadDir, safeName), fileData)
                res.setHeader('Content-Type', 'application/json')
                res.end(JSON.stringify({ url: `/Nikukyu_Route/uploads/${safeName}`, filename: safeName }))
              } else {
                res.statusCode = 400
                res.end(JSON.stringify({ error: 'No file' }))
              }
            })
            return
          }
          if (req.method === 'DELETE') {
            const chunks: Buffer[] = []
            req.on('data', (chunk: Buffer) => chunks.push(chunk))
            req.on('end', () => {
              try {
                const body = JSON.parse(Buffer.concat(chunks).toString())
                const filename = (body.filename || '').replace(/[^a-zA-Z0-9._-]/g, '_')
                if (!filename) {
                  res.statusCode = 400
                  res.end(JSON.stringify({ error: 'No filename' }))
                  return
                }
                const filePath = path.resolve(__dirname, '..', 'public', 'uploads', filename)
                if (fs.existsSync(filePath)) {
                  fs.unlinkSync(filePath)
                  res.setHeader('Content-Type', 'application/json')
                  res.end(JSON.stringify({ ok: true, deleted: filename }))
                } else {
                  res.statusCode = 404
                  res.end(JSON.stringify({ error: 'Not found' }))
                }
              } catch {
                res.statusCode = 400
                res.end(JSON.stringify({ error: 'Bad request' }))
              }
            })
            return
          }
          return next()
        }

        // Fallback: serve static JSON files from config/data/ for dev mode
        if (!urlPath.startsWith('/api/') && urlPath.endsWith('.json')) {
          const basename = path.basename(urlPath)
          const filePath = resolveData(basename)
          if (fs.existsSync(filePath)) {
            res.setHeader('Content-Type', 'application/json')
            res.end(fs.readFileSync(filePath, 'utf-8'))
            return
          }
        }

        next()
      })
    },

    closeBundle() {
      const copyToDist = (srcName: string) => {
        const srcPath = resolveData(srcName)
        const destPath = path.resolve(__dirname, '..', 'dist', srcName)
        if (fs.existsSync(srcPath)) {
          const distDir = path.dirname(destPath)
          if (!fs.existsSync(distDir)) fs.mkdirSync(distDir, { recursive: true })
          fs.copyFileSync(srcPath, destPath)
        }
      }

      copyToDist('global_markers.json')
      copyToDist('global_walls.json')
      copyToDist('default_preset.json')
      copyToDist('presets.json')
      copyToDist('global_spawns.json')
      copyToDist('global_help.json')
      copyToDist('global_defaults.json')
      copyToDist('global_sim_defaults.json')
      copyToDist('global_sim_pools.json')

      // public/uploads/ → dist/uploads/
      const uploadsSrcDir = path.resolve(__dirname, '..', 'public', 'uploads')
      const uploadsDestDir = path.resolve(__dirname, '..', 'dist', 'uploads')
      if (fs.existsSync(uploadsSrcDir)) {
        if (!fs.existsSync(uploadsDestDir)) fs.mkdirSync(uploadsDestDir, { recursive: true })
        for (const entry of fs.readdirSync(uploadsSrcDir, { withFileTypes: true })) {
          if (!entry.isFile()) continue
          fs.copyFileSync(path.join(uploadsSrcDir, entry.name), path.join(uploadsDestDir, entry.name))
        }
      }

      // public/texture/ → dist/texture/
      const texSrcDir = path.resolve(__dirname, '..', 'public', 'texture')
      const texDestDir = path.resolve(__dirname, '..', 'dist', 'texture')
      if (fs.existsSync(texSrcDir)) {
        if (!fs.existsSync(texDestDir)) fs.mkdirSync(texDestDir, { recursive: true })
        for (const entry of fs.readdirSync(texSrcDir, { withFileTypes: true })) {
          if (!entry.isFile()) continue
          fs.copyFileSync(path.join(texSrcDir, entry.name), path.join(texDestDir, entry.name))
        }
      }

      // public/textures.json → dist/textures.json
      const texListSrc = path.resolve(__dirname, '..', 'public', 'textures.json')
      const texListDest = path.resolve(__dirname, '..', 'dist', 'textures.json')
      if (fs.existsSync(texListSrc)) {
        fs.copyFileSync(texListSrc, texListDest)
      }

      // public/masks/ → dist/masks/
      const maskSrcDir = path.resolve(__dirname, '..', 'public', 'masks')
      const maskDestDir = path.resolve(__dirname, '..', 'dist', 'masks')
      if (fs.existsSync(maskSrcDir)) {
        if (!fs.existsSync(maskDestDir)) fs.mkdirSync(maskDestDir, { recursive: true })
        for (const entry of fs.readdirSync(maskSrcDir, { withFileTypes: true })) {
          if (!entry.isFile()) continue
          fs.copyFileSync(path.join(maskSrcDir, entry.name), path.join(maskDestDir, entry.name))
        }
      }
    }
  }
}
