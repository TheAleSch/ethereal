// End-to-end check for the per-theme base config (`themes` prop).
// The playground is client-rendered, so curl proves nothing about it — this
// is the only thing that actually exercises writer -> URL -> parser, the
// round trip that silently lost user edits once before.
//
//   node apps/site/e2e/playground-themes.mjs
//
// The script starts (and stops) its own dev server on a free port; set
// E2E_BASE_URL to reuse one you already have running.
import { chromium } from "playwright"
import { startDevServer, warmRoutes } from "./dev-server.mjs"

// A FAILED ASSERTION MUST FAIL THE PROCESS. Printing FAIL and exiting 0 made
// this script decorative on the left of `test:e2e`'s `&&` — all 17 could fail
// and the suite still reported success.
let failures = 0
const ok = (c, m) => {
  if (!c) failures++
  console.log(`${c ? "PASS" : "FAIL"}  ${m}`)
}

let server
;(async () => {
  server = await startDevServer()
  const BASE = server.baseURL
  const b = await chromium.launch()
  await warmRoutes(b, BASE, ["/playground"])
  const errs = []
  const watchErrors = (page) => {
    page.on("pageerror", (e) => errs.push(e.message))
    page.on("console", (message) => {
      if (message.type() === "error") errs.push(message.text())
    })
  }
  const p = await b.newPage()
  watchErrors(p)

  const openMotion = async (pg) => {
    const t = pg.locator("button", { hasText: /^motion$/i }).first()
    if (await t.count()) {
      const expanded = await t.getAttribute("aria-expanded")
      if (expanded !== "true") {
        await t.click()
        await pg.waitForTimeout(500)
      }
    }
  }

  // Base starts expanded, so an unconditional click COLLAPSES it. Expand only
  // when it is actually closed — this survives the default changing either way.
  const openBase = async (pg) => {
    const t = pg
      .locator("button", { hasText: "what every state inherits" })
      .first()
    if ((await t.getAttribute("aria-expanded")) !== "true") {
      await t.click()
      await pg.waitForTimeout(400)
    }
  }

  await p.goto(`${BASE}/playground`)
  await p.waitForTimeout(2500)

  // open the Base accordion
  await openBase(p)
  await p.waitForTimeout(600)

  // 1. pills read base / dark ↑
  const pills = await p
    .locator("button[aria-pressed]")
    .evaluateAll((els) => els.map((e) => (e.textContent || "").trim()))
  ok(
    pills.includes("base"),
    `Base pill labelled "base"  (pills: ${JSON.stringify(pills.slice(0, 6))})`
  )
  ok(pills.filter((x) => x === "dark").length > 0, 'dark pill labelled "dark"')

  // 2. default selected pill is base (preview theme defaults light)
  const pressed = await p
    .locator('button[aria-pressed="true"]')
    .evaluateAll((els) => els.map((e) => (e.textContent || "").trim()))
  ok(
    pressed.includes("base"),
    `"base" is selected on load  (pressed: ${JSON.stringify(pressed.slice(0, 4))})`
  )

  await openMotion(p)

  // 3. edit duration on BASE -> goes to flat config (?c=), never into the
  //    themes branch. The default Orbit preset ships a themes.dark branch, so
  //    ?tm= legitimately exists on load — the invariant is that a base edit
  //    must not leak the edited key into it.
  const dur = p.locator('input[aria-label="duration value"]').first()
  await dur.fill("7.7")
  await dur.press("Enter")
  await p.waitForTimeout(900)
  let url = p.url()
  ok(/[?&]c=/.test(url), "base edit writes the flat config (?c= present)")
  const tmAfterBase = decodeURIComponent(
    (url.match(/[?&]tm=([^&]*)/) || [])[1] || ""
  )
  ok(
    !tmAfterBase.includes("duration"),
    `base edit does NOT write themes (tm carries no duration: ${tmAfterBase.slice(0, 60)})`
  )

  // 4. switch to dark, edit duration -> goes to themes.dark
  await p
    .locator("button[aria-pressed]", { hasText: /^dark$/ })
    .first()
    .click()
  await p.waitForTimeout(600)
  await openMotion(p)
  const durD = p.locator('input[aria-label="duration value"]').first()
  const beforeDark = await durD.inputValue()
  ok(
    parseFloat(beforeDark) === 7.7,
    `dark cell inherits the base value (${beforeDark})`
  )
  await durD.fill("9.9")
  await durD.press("Enter")
  await p.waitForTimeout(1000)
  url = p.url()
  ok(/[?&]tm=/.test(url), "dark edit writes ?tm=")
  const tm = decodeURIComponent((url.match(/[?&]tm=([^&]*)/) || [])[1] || "")
  ok(
    tm.includes("dark") && tm.includes("9.9"),
    `?tm= carries dark.duration=9.9  (${tm.slice(0, 80)})`
  )
  ok(!tm.includes('"light"'), "themes.light is never written")

  // 5. generated JSX shows the themes prop
  const code = await p.locator("pre").first().innerText()
  ok(/themes=/.test(code), "generated JSX contains themes=")
  ok(/9\.9/.test(code), "generated JSX carries the dark value")

  // 6. amber override marker present, and green dot on dark pill only
  const markers = await p.locator('button[aria-label^="revert "]').count()
  ok(markers > 0, `amber clear-override marker rendered (${markers})`)

  // 7. ROUND TRIP — reload the exact URL in a fresh page
  const p2 = await b.newPage()
  watchErrors(p2)
  await p2.goto(url)
  await p2.waitForTimeout(2600)
  await openBase(p2)
  await p2.waitForTimeout(600)
  await p2
    .locator("button[aria-pressed]", { hasText: /^dark$/ })
    .first()
    .click()
  await p2.waitForTimeout(600)
  await openMotion(p2)
  const after = await p2
    .locator('input[aria-label="duration value"]')
    .first()
    .inputValue()
  ok(
    parseFloat(after) === 9.9,
    `ROUND TRIP: dark override survives reload (got ${after})`
  )
  await p2
    .locator("button[aria-pressed]", { hasText: /^base$/ })
    .first()
    .click()
  await p2.waitForTimeout(600)
  await openMotion(p2)
  const afterBase = await p2
    .locator('input[aria-label="duration value"]')
    .first()
    .inputValue()
  ok(
    parseFloat(afterBase) === 7.7,
    `ROUND TRIP: base value survives reload (got ${afterBase})`
  )

  // 8. a hand-written / legacy ?tm={"light":…} has no cell to live in — it
  //    folds into the flat base config on load instead of hiding there
  // close the earlier pages first — three playgrounds animating at once
  // starves the browser enough to time out the navigation
  await p.close()
  await p2.close()
  const p3 = await b.newPage()
  watchErrors(p3)
  await p3.goto(
    `${BASE}/playground?tab=ethereal&tm=` +
      encodeURIComponent('{"light":{"duration":5.5}}'),
    { waitUntil: "domcontentloaded" }
  )
  await p3.waitForTimeout(2600)
  await openBase(p3)
  await p3.waitForTimeout(600)
  await openMotion(p3)
  const folded = await p3
    .locator('input[aria-label="duration value"]')
    .first()
    .inputValue()
  ok(
    parseFloat(folded) === 5.5,
    `themes.light folds into the base cell (got ${folded})`
  )
  const u3 = p3.url()
  // the Orbit default's themes.dark branch may re-encode as ?tm=; the folded
  // LIGHT branch must not — it lives in ?c= now
  const tm3 = decodeURIComponent((u3.match(/[?&]tm=([^&]*)/) || [])[1] || "")
  ok(
    /[?&]c=/.test(u3) && !tm3.includes('"light"') && !tm3.includes("5.5"),
    `folded light branch re-encodes as ?c=, not ?tm= (${u3.split("?")[1]?.slice(0, 80)})`
  )

  // The expanded control section is owned by EffectSection, not by each cell.
  // Per-cell accordions collapsed back to `color` on every theme/slot/state
  // switch — i.e. exactly when you are mid-tweak and least want to lose your
  // place. These pin that it survives all three.
  const p4 = await b.newPage()
  watchErrors(p4)
  await p4.goto(`${BASE}/playground`)
  await p4.waitForTimeout(2600)
  await openBase(p4)
  await p4.waitForTimeout(500)
  const openTitles = async (pg) =>
    (
      await pg
        .locator('button[aria-expanded="true"]')
        .evaluateAll((els) => els.map((e) => (e.textContent || "").trim()))
    ).filter((t) => /^(color|motion|shape|glow|interaction)$/i.test(t))

  await p4
    .locator("button", { hasText: /^motion$/i })
    .first()
    .click()
  await p4.waitForTimeout(400)
  ok((await openTitles(p4)).includes("motion"), "SECTION: motion opens")

  await p4
    .locator("button[aria-pressed]", { hasText: /^dark$/ })
    .first()
    .click()
  await p4.waitForTimeout(600)
  ok(
    (await openTitles(p4)).includes("motion"),
    "SECTION: survives a theme switch"
  )

  await p4.locator("button[aria-pressed]", { hasText: /hover/ }).first().click()
  await p4.waitForTimeout(600)
  ok(
    (await openTitles(p4)).includes("motion"),
    "SECTION: survives an interaction-slot switch"
  )

  // not an exact match: a state's trigger also carries its mode badge
  // ("derived" while empty, "customized" once it holds config)
  await p4
    .locator("button", { hasText: /^thinking/ })
    .first()
    .click()
  await p4.waitForTimeout(700)
  ok(
    (await openTitles(p4)).includes("motion"),
    "SECTION: survives a state switch"
  )

  // Loading and resetting a named-state preset must never rewrite the main
  // preset. The toolbar reset now follows the active editor scope.
  const mainPreset = p4.getByRole("combobox", { name: "main preset" })
  await mainPreset.click()
  await p4.getByRole("option", { name: "Ocean", exact: true }).click()
  await p4
    .getByRole("combobox", { name: "start thinking from a preset" })
    .click()
  await p4.getByRole("option", { name: "Ember", exact: true }).click()
  ok(
    (await mainPreset.innerText()).trim() === "Ocean",
    "STATE PRESET: leaves the main preset unchanged"
  )
  await p4.getByRole("button", { name: "reset thinking state" }).click()
  ok(
    (await mainPreset.innerText()).trim() === "Ocean",
    "STATE RESET: leaves the main preset unchanged"
  )

  // HOSTILE SHARED LINK: a palette entry is CSS paint. `url(...)`, layered
  // image lists and declaration smuggling once turned one opened link into
  // cross-origin tracking requests (and a 100-request amplifier). The parser
  // must drop them and the page must fire ZERO requests toward the payload.
  const p5 = await b.newPage()
  watchErrors(p5)
  const hostileRequests = []
  p5.on("request", (request) => {
    // match the HOST, not the whole URL — the page's own navigation carries
    // the payload in its ?c= query string and must not count as a hit
    try {
      if (new URL(request.url()).hostname.endsWith("evil.invalid"))
        hostileRequests.push(request.url())
    } catch {
      /* non-URL requests (data:, about:) cannot be hostile fetches */
    }
  })
  const hostileColors = [
    "url(https://evil.invalid/track.png?t=1)",
    // 100-layer amplification variant
    Array.from({ length: 100 }, (_unused, index) => `url(https://evil.invalid/amp-${index}.png)`).join(", "),
    "red, url(https://evil.invalid/layered.png)",
    "#fff; background-image: url(https://evil.invalid/decl.png)",
  ]
  await p5.goto(
    `${BASE}/playground?c=${encodeURIComponent(JSON.stringify({ colors: hostileColors }))}`
  )
  await p5.waitForTimeout(1500)
  ok(
    hostileRequests.length === 0,
    `HOSTILE LINK: zero requests to the payload host (${hostileRequests.length} fired)`
  )
  const paintedUrls = await p5.evaluate(() =>
    Array.from(document.querySelectorAll("[style]")).filter((el) =>
      (el.getAttribute("style") || "").includes("evil.invalid")
    ).length
  )
  ok(paintedUrls === 0, "HOSTILE LINK: no element styles carry the payload")
  await p5.close()

  ok(errs.length === 0, `no page errors (${errs.slice(0, 2).join(" | ")})`)
  await b.close()
  await server?.stop()
  if (failures) {
    console.error(`\n${failures} assertion(s) failed`)
    process.exit(1)
  }
})().catch(async (e) => {
  console.error("ERR", e.message)
  await server?.stop()
  process.exit(1)
})
