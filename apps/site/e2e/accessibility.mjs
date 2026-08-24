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
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  })
  const page = await context.newPage()
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

  const minimumTargets = async (locator, label) => {
    const targets = await locator.all()
    ok(targets.length > 0, `${label} targets are present`)
    for (const [index, target] of targets.entries()) {
      await minimumTarget(target, `${label} ${index + 1}`)
    }
  }

  const minimumEffectiveTarget = async (locator, label) => {
    const hitArea = await locator.evaluate((element) => {
      const box = element.getBoundingClientRect()
      const pseudoSize = (pseudo) => {
        const style = getComputedStyle(element, pseudo)
        return {
          width: Number.parseFloat(style.width) || 0,
          height: Number.parseFloat(style.height) || 0,
        }
      }
      const before = pseudoSize("::before")
      const after = pseudoSize("::after")
      return {
        width: Math.max(box.width, before.width, after.width),
        height: Math.max(box.height, before.height, after.height),
      }
    })
    ok(
      hitArea.width >= 44 && hitArea.height >= 44,
      `${label} effective hit area is at least 44x44 (${hitArea.width.toFixed(1)}x${hitArea.height.toFixed(1)})`
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
  await minimumTarget(
    page.getByRole("button", { name: "Dismiss hint: try the Konami code" }),
    "Konami hint"
  )
  const installTabs = page.locator('[data-slot="tabs-list"]').first()
  const installTabBox = await installTabs.boundingBox()
  const installTriggers = await installTabs
    .locator('[data-slot="tabs-trigger"]')
    .all()
  ok(installTabBox !== null, "Install tab list is visible")
  for (const [index, trigger] of installTriggers.entries()) {
    await minimumTarget(trigger, `Install tab ${index + 1}`)
    const triggerBox = await trigger.boundingBox()
    ok(
      installTabBox !== null &&
        triggerBox !== null &&
        triggerBox.x >= installTabBox.x &&
        triggerBox.y >= installTabBox.y &&
        triggerBox.x + triggerBox.width <=
          installTabBox.x + installTabBox.width &&
        triggerBox.y + triggerBox.height <=
          installTabBox.y + installTabBox.height,
      `Install tab ${index + 1} stays inside its rounded list`
    )
  }

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
  await minimumTargets(
    page.getByRole("button", { name: /^(dark|light) backdrop$/ }),
    "Backdrop selector"
  )
  await minimumTargets(
    page.getByRole("button", {
      name: /^(button|chat|card|pill) preview host$/,
    }),
    "Preview host selector"
  )
  await minimumTargets(
    page.locator('[data-slot="accordion-trigger"]:visible'),
    "Visible accordion trigger"
  )
  await minimumTargets(
    page.locator('[data-slot="select-trigger"]:visible'),
    "Visible select trigger"
  )
  await minimumTargets(
    page.locator('input[aria-label$=" value"]:visible'),
    "Visible numeric input"
  )
  await minimumTargets(
    page.locator('[data-slot="slider-control"]:visible'),
    "Visible slider control"
  )
  const thumbs = await page.locator('[data-slot="slider-thumb"]:visible').all()
  ok(thumbs.length > 0, "Visible slider thumbs are present")
  for (const [index, thumb] of thumbs.entries()) {
    await minimumEffectiveTarget(thumb, `Visible slider thumb ${index + 1}`)
  }
  await minimumTargets(
    page.getByRole("button", { name: /^color \d+$/ }),
    "Visible color swatch"
  )
  await minimumTarget(
    page.getByRole("button", { name: "add color" }),
    "Add color"
  )
  ok(
    (await page.getByRole("textbox", { name: "Chat composer preview" }).count()) ===
      0,
    "Visual chat preview does not expose a fake textbox"
  )
  ok(
    (await page.getByRole("button", { name: "Send" }).count()) === 0,
    "Visual chat preview does not expose a fake Send action"
  )

  const colorSwatches = page.getByRole("button", { name: /^color \d+$/ })
  const colorCount = await colorSwatches.count()
  await colorSwatches.first().focus()
  await page.keyboard.press("Enter")
  const removeColor = page.getByRole("button", { name: "remove color 1" })
  await removeColor.waitFor()
  await page.waitForTimeout(150)
  await minimumTarget(removeColor, "Remove color")
  await removeColor.focus()
  ok(
    await removeColor.evaluate((element) => document.activeElement === element),
    "Remove color is keyboard focusable"
  )
  await removeColor.tap()
  await page.waitForFunction(
    (expected) =>
      document.querySelectorAll('[aria-label^="color "]').length === expected,
    colorCount - 1
  )
  ok(
    (await colorSwatches.count()) === colorCount - 1,
    "Remove color works from a touch interaction"
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
