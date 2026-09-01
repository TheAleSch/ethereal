// Build the raster icon set from public/favicon.svg — the .ico browsers ask
// for by convention, and the opaque PNGs iOS/Android composite on their own
// backgrounds (a transparent apple-touch-icon comes out with black corners).
import { chromium } from "playwright"
import { readFileSync, writeFileSync } from "node:fs"

const PUBLIC = new URL("../public/", import.meta.url)
const svg = readFileSync(new URL("favicon.svg", PUBLIC), "utf8")
const ICO_SIZES = [16, 24, 32, 48, 64]

// At tab sizes the faded half of the ring drops below what a 16–32px pixel
// grid can hold and the tile reads as a dark smudge. The small frames get the
// same drawing with the volume turned up: a thicker stroke, a gradient floor
// high enough to survive, and a bigger hot node. 48px+ keeps the true art.
const SMALL_MAX = 32
const smallSvg = svg
  .replace('stroke-width="4.5"', 'stroke-width="6.5"')
  .replace('stroke-width="1.3"', 'stroke-width="1.8"')
  .replace('stop-opacity="0.35"', 'stop-opacity="0.55"')
  .replace('stop-opacity="0.18"', 'stop-opacity="0.4"')
  .replace('r="9" fill="url(#node)"', 'r="12" fill="url(#node)"')
  .replace('r="2.6" fill="#fff8ee"', 'r="3.6" fill="#fff8ee"')
const OPAQUE = [
  { size: 180, name: "apple-touch-icon.png" },
  { size: 192, name: "icon-192.png" },
  { size: 512, name: "icon-512.png" },
]

const browser = await chromium.launch()
const render = async (size, opaque) => {
  const art = size <= SMALL_MAX ? smallSvg : svg
  const page = await browser.newPage({
    viewport: { width: size, height: size },
  })
  await page.setContent(
    `<style>html,body{margin:0;background:${opaque ? "#08070a" : "transparent"}}
     svg{display:block;width:${size}px;height:${size}px}</style>${art}`
  )
  const buf = await page.screenshot({ omitBackground: !opaque })
  await page.close()
  return buf
}

const pngs = []
for (const size of ICO_SIZES)
  pngs.push({ size, buf: await render(size, false) })
for (const { size, name } of OPAQUE)
  writeFileSync(new URL(name, PUBLIC), await render(size, true))

// og-image.png — the 1200×630 card link embeds show. Same mark, the brand
// face, and copy that just says what the package is.
{
  // resolve through the package (it may be hoisted to the workspace root)
  const fontDir = new URL(
    "files/",
    import.meta.resolve("@fontsource/apfel-grotezk/package.json")
  )
  const font = (file) => readFileSync(new URL(file, fontDir)).toString("base64")
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } })
  await page.setContent(`<style>
    @font-face{font-family:Apfel;font-weight:400;src:url(data:font/woff2;base64,${font("apfel-grotezk-latin-400-normal.woff2")}) format('woff2')}
    @font-face{font-family:Apfel;font-weight:700;src:url(data:font/woff2;base64,${font("apfel-grotezk-latin-700-normal.woff2")}) format('woff2')}
    html,body{margin:0;background:#08070a;width:1200px;height:630px}
    body{display:flex;align-items:center;gap:72px;padding:0 96px;box-sizing:border-box;font-family:Apfel}
    svg{display:block;width:340px;height:340px;flex:none}
    h1{margin:0;font-size:104px;font-weight:700;letter-spacing:-0.02em;color:#f5efe8}
    p{margin:20px 0 0;font-size:34px;font-weight:400;color:#b8aca0}
    code{display:inline-block;margin-top:36px;font-family:ui-monospace,Menlo,monospace;font-size:26px;color:#ffb347;background:#161013;padding:12px 20px;border-radius:10px}
  </style>${svg}<div>
    <h1>ethereal</h1>
    <p>Glow effects for React. CSS-rendered, SSR-safe.</p>
    <code>npm i ethereal-glow</code>
  </div>`)
  writeFileSync(new URL("og-image.png", PUBLIC), await page.screenshot())
  await page.close()
}
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
  new URL("favicon.ico", PUBLIC),
  Buffer.concat([header, ...entries, ...pngs.map((p) => p.buf)])
)
console.log("ico sizes", ICO_SIZES.join(","), "bytes", offset)
process.exit(0)
