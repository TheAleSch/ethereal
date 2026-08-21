// Build the raster icon set from public/favicon.svg — the .ico browsers ask
// for by convention, and the opaque PNGs iOS/Android composite on their own
// backgrounds (a transparent apple-touch-icon comes out with black corners).
import { chromium } from 'playwright'
import { readFileSync, writeFileSync } from 'node:fs'

const PUBLIC = new URL('../public/', import.meta.url)
const svg = readFileSync(new URL('favicon.svg', PUBLIC), 'utf8')
const ICO_SIZES = [16, 24, 32, 48, 64]
const OPAQUE = [
  { size: 180, name: 'apple-touch-icon.png' },
  { size: 192, name: 'icon-192.png' },
  { size: 512, name: 'icon-512.png' },
]

const browser = await chromium.launch()
const render = async (size, opaque) => {
  const page = await browser.newPage({ viewport: { width: size, height: size } })
  await page.setContent(
    `<style>html,body{margin:0;background:${opaque ? '#08070a' : 'transparent'}}
     svg{display:block;width:${size}px;height:${size}px}</style>${svg}`
  )
  const buf = await page.screenshot({ omitBackground: !opaque })
  await page.close()
  return buf
}

const pngs = []
for (const size of ICO_SIZES) pngs.push({ size, buf: await render(size, false) })
for (const { size, name } of OPAQUE) writeFileSync(new URL(name, PUBLIC), await render(size, true))
await browser.close()

// ICO container: 6-byte header, one 16-byte directory entry per image, then
// the PNG payloads. PNG-in-ICO is understood by every browser in support.
const header = Buffer.alloc(6)
header.writeUInt16LE(0, 0) // reserved
header.writeUInt16LE(1, 2) // type 1 = icon
header.writeUInt16LE(pngs.length, 4)
let offset = 6 + pngs.length * 16
const entries = pngs.map(({ size, buf }) => {
  const entry = Buffer.alloc(16)
  entry.writeUInt8(size === 256 ? 0 : size, 0) // width, 0 means 256
  entry.writeUInt8(size === 256 ? 0 : size, 1) // height
  entry.writeUInt8(0, 2) // palette size: 0 for true colour
  entry.writeUInt8(0, 3) // reserved
  entry.writeUInt16LE(1, 4) // colour planes
  entry.writeUInt16LE(32, 6) // bits per pixel
  entry.writeUInt32LE(buf.length, 8)
  entry.writeUInt32LE(offset, 12)
  offset += buf.length
  return entry
})
writeFileSync(
  new URL('favicon.ico', PUBLIC),
  Buffer.concat([header, ...entries, ...pngs.map((p) => p.buf)])
)
console.log('ico sizes', ICO_SIZES.join(','), 'bytes', offset)
process.exit(0)
