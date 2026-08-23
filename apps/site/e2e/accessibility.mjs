import { chromium } from "playwright"

import { startDevServer, warmRoutes } from "./dev-server.mjs"

let failures = 0
const ok = (condition, message) => {
  if (!condition) failures++
  console.log(`${condition ? "PASS" : "FAIL"}  ${message}`)
}

let server
let browser
;(async () => {
  server = await startDevServer()
  browser = await chromium.launch()
  await warmRoutes(browser, server.baseURL, ["/", "/docs", "/playground"])

  const errors = []
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
  page.on("pageerror", (error) => errors.push(error.message))
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text())
  })

  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto(`${server.baseURL}/`, { waitUntil: "load" })
  await page.waitForTimeout(500)
  const starAnimation = await page
    .locator(".star-twinkle")
    .first()
    .evaluate((element) => getComputedStyle(element).animationName)
  ok(
    starAnimation === "none",
    `reduced motion stops star twinkle (${starAnimation})`
  )

  const minimumTarget = async (locator, label) => {
    const box = await locator.boundingBox()
    const passes = box !== null && box.width >= 44 && box.height >= 44
    ok(
      passes,
      `${label} target is at least 44x44 (${box ? `${box.width.toFixed(1)}x${box.height.toFixed(1)}` : "missing"})`
    )
  }

  const nav = page.locator("nav.fixed").first()
  await minimumTarget(nav.getByRole("link", { name: "Home" }), "Home nav")
  await minimumTarget(
    nav.getByRole("link", { name: "Playground" }),
    "Playground nav"
  )
  await minimumTarget(nav.getByRole("link", { name: "Docs" }), "Docs nav")
  await minimumTarget(
    nav.getByRole("link", { name: "View on GitHub" }),
    "GitHub nav"
  )

  const home = nav.getByRole("link", { name: "Home" })
  await home.focus()
  for (const key of [
    "ArrowUp",
    "ArrowUp",
    "ArrowDown",
    "ArrowDown",
    "ArrowLeft",
    "ArrowRight",
    "ArrowLeft",
    "ArrowRight",
    "KeyB",
    "KeyA",
  ]) {
    await page.keyboard.press(key)
  }

  const dialog = page.getByRole("dialog", { name: "Ethereal Asteroids" })
  await dialog.waitFor()
  ok(
    await dialog.evaluate((element) => document.activeElement === element),
    "Asteroids moves focus into the dialog"
  )
  ok(
    await home.evaluate((element) => element.closest("[inert]") !== null),
    "Asteroids makes the underlying page inert"
  )
  ok(
    (await dialog.getByRole("status").textContent())?.includes("Score 0") ===
      true,
    "Asteroids exposes game status as DOM text"
  )
  ok(
    (await dialog.getAttribute("aria-describedby"))?.includes(
      "asteroids-instructions"
    ) === true,
    "Asteroids exposes keyboard instructions"
  )
  ok(
    (await dialog.locator("canvas").getAttribute("aria-hidden")) === "true",
    "Asteroids hides the duplicate canvas representation"
  )
  await page.keyboard.press("Tab")
  ok(
    await dialog
      .getByRole("button", { name: "Quit game" })
      .evaluate((element) => document.activeElement === element),
    "Asteroids traps Tab on its quit control"
  )
  await page.keyboard.press("Escape")
  await dialog.waitFor({ state: "detached" })
  ok(
    await home.evaluate((element) => document.activeElement === element),
    "Asteroids restores prior focus"
  )
  ok(
    await home.evaluate((element) => element.closest("[inert]") === null),
    "Asteroids restores background interactivity"
  )

  await page.goto(`${server.baseURL}/docs`, { waitUntil: "load" })
  await page.waitForTimeout(300)
  await minimumTarget(
    page.getByRole("button", { name: "Copy as Markdown" }),
    "Copy Markdown"
  )
  await minimumTarget(
    page.getByRole("button", { name: "More formats for AI tools" }),
    "More formats"
  )
  ok(
    (await page.getByRole("button", { name: "Get started" }).count()) === 0 &&
      (await page.getByText("Get started", { exact: true }).count()) > 0,
    "the visual Get started demo is not an actionable tab stop"
  )

  // Reduced motion is already verified above. The playground's unrelated
  // performance HUD reads this media query during render, so return to the
  // default preference before navigating there to keep this test scoped.
  await page.emulateMedia({ reducedMotion: "no-preference" })
  await page.goto(`${server.baseURL}/playground`, { waitUntil: "load" })
  await page.waitForTimeout(1000)
  await minimumTarget(
    page.getByRole("tab", { name: "Ethereal", exact: true }),
    "Ethereal tab"
  )
  await minimumTarget(
    page.getByRole("tab", { name: "Event Horizon", exact: true }),
    "Event Horizon tab"
  )
  await minimumTarget(
    page.getByRole("tab", { name: "Dither", exact: true }),
    "Dither tab"
  )
  await minimumTarget(
    page.getByRole("combobox", { name: "main preset" }),
    "Preset picker"
  )
  await minimumTarget(
    page.getByRole("button", { name: /Copy this configuration as a prompt/ }),
    "Copy for AI"
  )
  const sendHitArea = await page
    .getByRole("button", { name: "Send" })
    .evaluate((element) => {
      const box = element.getBoundingClientRect()
      const pseudo = getComputedStyle(element, "::after")
      return {
        width: Math.max(box.width, Number.parseFloat(pseudo.width)),
        height: Math.max(box.height, Number.parseFloat(pseudo.height)),
      }
    })
  ok(
    sendHitArea.width >= 44 && sendHitArea.height >= 44,
    `Send effective hit area is at least 44x44 (${sendHitArea.width.toFixed(1)}x${sendHitArea.height.toFixed(1)})`
  )

  ok(errors.length === 0, `no browser errors (${errors.join(" | ") || "none"})`)
  if (failures) process.exitCode = 1
})()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await browser?.close()
    await server?.stop()
  })
