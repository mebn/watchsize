import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// Fetches remote images server side so the browser can read their pixels (avoids CORS).
function imageProxy(): Plugin {
  const handler = async (req: any, res: any, next: any) => {
    if (!req.url?.startsWith('/api/img?')) return next()
    const target = new URL(req.url, 'http://x').searchParams.get('url')
    if (!target || !/^https?:\/\//.test(target)) {
      res.statusCode = 400
      return res.end()
    }
    try {
      const r = await fetch(target, { headers: { 'User-Agent': 'Mozilla/5.0 watchsize' } })
      const type = r.headers.get('content-type') ?? ''
      if (!r.ok || !type.startsWith('image/')) {
        res.statusCode = 502
        return res.end()
      }
      res.setHeader('Content-Type', type)
      res.end(Buffer.from(await r.arrayBuffer()))
    } catch {
      res.statusCode = 502
      res.end()
    }
  }
  return {
    name: 'image-proxy',
    configureServer: (s) => void s.middlewares.use(handler),
    configurePreviewServer: (s) => void s.middlewares.use(handler),
  }
}

export default defineConfig({ plugins: [react(), imageProxy()] })
