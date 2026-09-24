// Dev tool, not a test: trace the Ethereal renderer in headless Chromium and
// report where each frame goes.
//
//   node packages/ethereal/bench/run.mjs [scene=gallery|hero] [strength=1] [seconds=4]
//
// Headless Chromium rasterizes in software, so absolute paint numbers are
// pessimistic; compare runs against each other, not against a real GPU.
import { build } from 'esbuild'
import { chromium } from 'playwright'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const [scene = 'gallery', strength = '1', seconds = '4'] = process.argv.slice(2)
const out = mkdtempSync(join(tmpdir(), 'ethereal-bench-'))
await build({
  entryPoints: [join(here, 'scene.tsx')],
  bundle: true,
  format: 'esm',
  outfile: join(out, 'scene.js'),
  define: { 'process.env.NODE_ENV': '"production"' },
  jsx: 'automatic',
  minify: true,
  logLevel: 'error',
})
writeFileSync(join(out, 'index.html'), '<!doctype html><meta charset=utf-8><div id=root></div><script type=module src=scene.js></script>')

const server = createServer((request, response) => {
  const file = new URL(request.url, 'http://bench').pathname.slice(1) || 'index.html'
  response.setHeader('content-type', file.endsWith('.js') ? 'text/javascript' : 'text/html')
  response.end(readFileSync(join(out, file)))
})
await new Promise((resolve) => server.listen(0, resolve))
const baseURL = `http://127.0.0.1:${server.address().port}`
const browser = await chromium.launch({
  // real GPU raster when available; software raster makes paint look 10x worse
  args: process.env.SOFTWARE ? [] : ['--use-angle=metal', '--enable-gpu-rasterization', '--ignore-gpu-blocklist'],
})
const TRACKED = ['UpdateLayoutTree', 'Paint', 'PrePaint', 'Layerize', 'RasterTask', 'FunctionCall']
const runs = []
for (let rep = 0; rep < Number(process.env.REPS || 3); rep++) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  page.on('pageerror', (error) => console.error('pageerror', error.message))
  page.on('console', (message) => message.type() === 'error' && console.error('console', message.text()))
  await page.goto(`${baseURL}/index.html?scene=${scene}&strength=${strength}`)
  await page.waitForTimeout(1500)
  const ticksBefore = await page.evaluate(() => globalThis.__ticks || 0)
  await browser.startTracing(page, { categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline'] })
  await page.waitForTimeout(Number(seconds) * 1000)
  const trace = JSON.parse((await browser.stopTracing()).toString())
  const ticks = (await page.evaluate(() => globalThis.__ticks || 0)) - ticksBefore
  await page.close()
  const totals = Object.fromEntries(TRACKED.map((name) => [name, 0]))
  let frames = 0
  for (const event of trace.traceEvents) {
    if (event.name === 'Commit') frames++
    // thread time, not wall time: a loaded machine inflates wall durations
    if (event.ph === 'X' && event.dur && TRACKED.includes(event.name)) totals[event.name] += (event.tdur ?? event.dur) / 1000
  }
  // main-thread milliseconds spent per wall-clock second: 1000 = saturated
  runs.push({
    frames: frames / Number(seconds),
    ticks: ticks / Number(seconds),
    ...Object.fromEntries(TRACKED.map((name) => [name, totals[name] / Number(seconds)])),
    perTick: Object.fromEntries(TRACKED.map((name) => [name, totals[name] / Math.max(1, ticks)])),
  })
}
await browser.close()
const median = (values) => values.sort((a, b) => a - b)[Math.floor(values.length / 2)]
const perSecond = Object.fromEntries(
  ['frames', 'ticks', ...TRACKED].map((key) => [key, +median(runs.map((run) => run[key])).toFixed(1)])
)
// per animation tick: a faster build ticks MORE often, and a loaded machine
// ticks less, so per-second totals alone mislead in both directions
const msPerTick = Object.fromEntries(TRACKED.map((name) => [name, +median(runs.map((run) => run.perTick[name])).toFixed(3)]))
console.log(JSON.stringify({ scene, strength: +strength, perSecond, msPerTick }))
server.close()
