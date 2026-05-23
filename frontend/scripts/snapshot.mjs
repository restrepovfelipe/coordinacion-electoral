/**
 * Generates visual snapshots of built pages using Playwright.
 * Serves both the pre-rendered HTML and the /_next/static/* bundle.
 * Run: node scripts/snapshot.mjs
 * Prerequisite: pnpm build must have already run.
 */
import { chromium } from 'playwright'
import { createServer } from 'http'
import { readFileSync, existsSync } from 'fs'
import { join, extname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const ROOT = join(__dirname, '..')
const SERVER_DIR = join(ROOT, '.next', 'server', 'app')
const STATIC_DIR = join(ROOT, '.next', 'static')
const OUT_DIR = join(ROOT, 'docs', 'visual-snapshots')

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
}

const server = createServer((req, res) => {
  const rawPath = req.url?.split('?')[0] ?? '/'

  // Serve /_next/static/* from the static directory
  if (rawPath.startsWith('/_next/static/')) {
    const relativePath = rawPath.replace('/_next/static/', '')
    const filePath = join(STATIC_DIR, relativePath)
    if (existsSync(filePath)) {
      const ext = extname(filePath)
      res.writeHead(200, { 'Content-Type': MIME[ext] ?? 'application/octet-stream' })
      res.end(readFileSync(filePath))
      return
    }
  }

  // Serve pre-rendered HTML pages from server output
  const pageSlug = rawPath === '/' ? 'index' : rawPath.replace(/^\//, '')
  const htmlPath = join(SERVER_DIR, pageSlug + '.html')
  if (existsSync(htmlPath)) {
    let html = readFileSync(htmlPath, 'utf8')
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(html)
    return
  }

  res.writeHead(404)
  res.end('Not found: ' + rawPath)
})

const PORT = 3457

server.listen(PORT, async () => {
  const browser = await chromium.launch()
  const pages = [
    { path: '/login', name: 'login' },
    { path: '/me', name: 'me' },
    { path: '/', name: 'dashboard' },
    { path: '/testigos', name: 'testigos' },
    { path: '/usuarios', name: 'usuarios' },
    { path: '/mapa', name: 'mapa' },
    { path: '/priorizacion', name: 'priorizacion' },
  ]
  const viewports = [
    { width: 1440, height: 900, suffix: '1440' },
    { width: 375, height: 667, suffix: '375' },
  ]

  for (const { path, name } of pages) {
    for (const { width, height, suffix } of viewports) {
      const context = await browser.newContext({ viewport: { width, height } })
      const page = await context.newPage()
      // Suppress console errors from Firebase (no API key in static snapshot)
      page.on('console', () => {})
      page.on('pageerror', () => {})
      await page.goto(`http://localhost:${PORT}${path}`, { waitUntil: 'networkidle' })
      await page.waitForTimeout(800)
      const outPath = join(OUT_DIR, `${name}-${suffix}.png`)
      await page.screenshot({ path: outPath, fullPage: false })
      console.log(`  saved ${outPath}`)
      await context.close()
    }
  }

  await browser.close()
  server.close()
  console.log('done')
})
