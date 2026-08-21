// Dev tool, not a test: screenshot every Ethereal preset on both backdrops
// and tile them into two contact sheets.
//
//   node apps/site/e2e/preset-contact-sheet.mjs [outDir]
//
// Presets are a visual artifact and reviewing them by reading numbers does
// not work. This is how the light-mode gap was found: on paper every preset
// looked fine, and on white sixteen of twenty were invisible. Re-run it after
// touching ETHEREAL_PRESETS or any default, and look at the two sheets.
//
// Each preset/theme starts on a fresh page, so nextPhase() and elapsed time are
// equivalent across dark/light. Capture several frames because a travelling
// head or flicker trough cannot be judged from one instant.
import { chromium } from "playwright"
import { mkdirSync, readFileSync, readdirSync } from "node:fs"
import { startDevServer } from "./dev-server.mjs"

const OUT = process.argv[2] || "preset-shots"
const HOST = ["button", "chat", "card", "pill"].includes(process.env.HOST)
  ? process.env.HOST
  : "button"
const ONLY = new Set(
  (process.env.PRESETS || "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean)
)
const FRAMES = Math.min(
  8,
  Math.max(1, Number.parseInt(process.env.FRAMES || "3", 10) || 3)
)
const FRAME_GAP = Math.min(
  2000,
  Math.max(100, Number.parseInt(process.env.FRAME_GAP || "450", 10) || 450)
)
mkdirSync(OUT, { recursive: true })

let server
;(async () => {
  server = await startDevServer()
  const browser = await chromium.launch()
  const discovery = await browser.newPage({
    viewport: { width: 900, height: 700 },
  })
  await discovery.goto(`${server.baseURL}/playground`)
  await discovery.waitForTimeout(1200)

  const openPresets = async (page) => {
    // Anchor to the visible row label. The states editor also owns selects;
    // DOM-order `.first()` can open its hidden "Custom"-only picker instead
    // of the main preset table as that editor evolves.
    // The primary preset picker is the first visible select. Hidden tab/state
    // editors also mount triggers, so visibility is the important qualifier.
    const trigger = page
      .locator('button[data-slot="select-trigger"]:visible')
      .first()
    // TanStack's SSR shell can be visible a moment before React has attached
    // Base UI's handlers. Retry the semantic click until the trigger actually
    // reports open instead of racing hydration and discovering zero options.
    for (let attempt = 0; attempt < 20; attempt++) {
      if ((await trigger.getAttribute("aria-expanded")) === "true") break
      await trigger.dispatchEvent("click")
      await page.waitForTimeout(100)
    }
    if ((await trigger.getAttribute("aria-expanded")) !== "true")
      throw new Error("preset picker did not hydrate/open")
    await page
      .locator('[data-slot="select-item"]:visible')
      .first()
      .waitFor({ state: "visible", timeout: 5000 })
  }
  const selectToggle = async (page, toggle, label) => {
    for (let attempt = 0; attempt < 20; attempt++) {
      if ((await toggle.getAttribute("aria-pressed")) === "true") return
      await toggle.dispatchEvent("click")
      await page.waitForTimeout(100)
    }
    throw new Error(`${label} toggle did not hydrate/select`)
  }
  await openPresets(discovery)
  const names = await discovery
    .locator('[data-slot="select-item"]:visible')
    .evaluateAll((els) => els.map((el) => (el.textContent || "").trim()))
  await discovery.close()
  // "Custom" only exists while the config matches no preset — it is disabled
  // here and clicking it hangs the run
  const presets = names.filter(
    (name) => name !== "Custom" && (!ONLY.size || ONLY.has(name))
  )
  if (!presets.length)
    throw new Error(`no matching presets (discovered: ${names.join(" | ")})`)
  console.log(`${presets.length} presets: ${presets.join(" | ")}`)

  for (const theme of ["dark", "light"]) {
    for (const [index, name] of presets.entries()) {
      // A fresh document gives every preset/theme the same deterministic phase
      // sequence. Reusing one page advances the package-global golden-ratio
      // phase on every selection and makes dark/light captures incomparable.
      const page = await browser.newPage({
        viewport: { width: 900, height: 700 },
      })
      await page.goto(`${server.baseURL}/playground`)
      await page.waitForTimeout(700)
      await selectToggle(
        page,
        page.locator(`button[aria-label="${theme} backdrop"]`),
        `${theme} backdrop`
      )
      // always click the target host — the app's default host is "chat" now,
      // so skipping the toggle for HOST=button would silently shoot chat
      await selectToggle(
        page,
        page.getByRole("button", { name: HOST, exact: true }),
        `${HOST} host`
      )
      await page.waitForTimeout(150)
      await openPresets(page)
      const exact = new RegExp(
        `^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`
      )
      await page
        .locator('[data-slot="select-item"]:visible', { hasText: exact })
        .first()
        .click()
      await page.waitForTimeout(700)
      await page.evaluate(() => window.scrollTo(0, 0))
      // clip to the preview PANEL, found by walking up from the glow host — a
      // hardcoded rect silently slides off as the code column resizes, and you
      // get a sheet of blank boxes that looks like a rendering bug
      const clip = await page.evaluate(() => {
        let el = document.querySelector("[data-fx-host]")
        while (el && el.getBoundingClientRect().height < 300)
          el = el.parentElement
        const rect = el.getBoundingClientRect()
        return {
          x: rect.x + scrollX,
          y: rect.y + scrollY,
          width: rect.width,
          height: rect.height,
        }
      })
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-")
      for (let frame = 0; frame < FRAMES; frame++) {
        if (frame) await page.waitForTimeout(FRAME_GAP)
        await page.screenshot({
          path: `${OUT}/${theme}-${String(index).padStart(2, "0")}-${slug}-f${frame}.png`,
          clip,
        })
      }
      await page.close()
    }
  }

  // tile them — data URIs, not file://, because a page served from about:blank
  // is not allowed to read local files and you get twenty broken-image icons
  const shots = readdirSync(OUT)
    .filter((file) => file.endsWith(".png") && !file.startsWith("sheet-"))
    .sort()
  for (const theme of ["dark", "light"]) {
    const cells = shots
      .filter((file) => file.startsWith(theme))
      .map(
        (file) =>
          `<figure><img src="data:image/png;base64,${readFileSync(`${OUT}/${file}`).toString("base64")}">` +
          `<figcaption>${file.replace(/^\w+-\d+-/, "").replace(".png", "")}</figcaption></figure>`
      )
      .join("")
    const sheet = await browser.newPage({
      viewport: { width: 1360, height: 400 },
    })
    await sheet.setContent(
      `<style>body{margin:0;background:#111;display:grid;grid-template-columns:repeat(4,1fr);gap:6px;` +
        `font:12px monospace;color:#fff}figure{margin:0}img{width:100%;display:block}` +
        `figcaption{padding:2px 4px}</style>${cells}`
    )
    await sheet.waitForTimeout(1200)
    await sheet.screenshot({
      path: `${OUT}/sheet-${theme}.png`,
      fullPage: true,
    })
    await sheet.close()
  }

  await browser.close()
  await server.stop()
  console.log(`wrote ${OUT}/sheet-dark.png and ${OUT}/sheet-light.png`)
})().catch(async (err) => {
  console.error("ERR", err.message)
  await server?.stop()
  process.exit(1)
})
