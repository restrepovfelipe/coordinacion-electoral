/**
 * Run Lighthouse against a locally running Next.js app.
 * Usage: QA_LIGHTHOUSE_URL=http://localhost:3000 node scripts/lighthouse.mjs
 *
 * Requires: pnpm add -D lighthouse  (run this before executing)
 * Also requires: `next build && next start` running in another terminal
 */
import lighthouse from 'lighthouse'
import * as chromeLauncher from 'chrome-launcher'

const BASE_URL = process.env.QA_LIGHTHOUSE_URL ?? 'http://localhost:3000'
const ROUTES = ['/login']  // Only /login is unauthenticated; other routes redirect to login

async function run() {
  const chrome = await chromeLauncher.launch({ chromeFlags: ['--headless', '--no-sandbox'] })
  const results = []

  for (const route of ROUTES) {
    const url = BASE_URL + route
    console.log(`Running Lighthouse on ${url}...`)
    const runnerResult = await lighthouse(url, {
      port: chrome.port,
      output: 'json',
      logLevel: 'error',
      onlyCategories: ['performance', 'accessibility', 'best-practices'],
    })
    const cats = runnerResult?.lhr?.categories ?? {}
    results.push({
      route,
      performance: Math.round((cats.performance?.score ?? 0) * 100),
      accessibility: Math.round((cats.accessibility?.score ?? 0) * 100),
      bestPractices: Math.round((cats['best-practices']?.score ?? 0) * 100),
    })
  }

  await chrome.kill()

  console.log('\n=== LIGHTHOUSE RESULTS ===')
  for (const r of results) {
    console.log(`${r.route}: Performance=${r.performance} Accessibility=${r.accessibility} BestPractices=${r.bestPractices}`)
  }

  // Write to docs
  const { writeFileSync } = await import('fs')
  writeFileSync('docs/lighthouse-results.json', JSON.stringify(results, null, 2))
  console.log('\nSaved to docs/lighthouse-results.json')
}

run().catch(console.error)
