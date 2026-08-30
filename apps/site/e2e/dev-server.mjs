// Every e2e script here owns its own dev server.
//
// Sharing one long-lived server across runs was measurably unreliable: against
// a warm `:3000` a suite was green in roughly a third of runs, in three
// shapes — a host that never lit, zero bright regions, and a hard
// "Execution context was destroyed" mid-navigation. Against a freshly started
// server it is green every time. The failures were all false NEGATIVES, so
// nothing was ever laundered into a pass, but a suite that cries wolf two runs
// in three gets ignored, which costs exactly as much as being wrong.
//
// Owning the server also fixes an ordering problem for free: the site resolves
// ethereal-glow through the workspace symlink to its `dist`, so the e2e
// must build before the server starts or it proves things about an old build.
// `test:e2e` builds first, and the server we start here picks that build up.
//
// Set E2E_BASE_URL to point at a server you are already running (handy while
// iterating); the helper then starts nothing and tears nothing down.
//
// Devtools console piping (and its echo loop — see vite.config.ts) is OFF by
// default everywhere now, so a plain `npm run dev` is safe to point
// E2E_BASE_URL at; just don't run it with ETHEREAL_CONSOLE_PIPING set.
import { spawn } from "node:child_process"
import { createServer } from "node:net"
import { fileURLToPath } from "node:url"

const SITE_DIR = fileURLToPath(new URL("..", import.meta.url))

/** An ephemeral port the OS just told us was free. */
const freePort = () =>
  new Promise((resolve, reject) => {
    const srv = createServer()
    srv.on("error", reject)
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address()
      srv.close(() => resolve(port))
    })
  })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * Load each route once in a throwaway page and drop it.
 *
 * A dev server that has just started transforms every client module on first
 * request, and the first visit to /playground can take longer than Playwright's
 * 30s action timeout — with two pages already animating, long enough to fail a
 * click that has nothing wrong with it. One warm-up visit per route moves that
 * cost out of the assertions.
 */
export async function warmRoutes(browser, baseURL, paths) {
  for (const path of paths) {
    const page = await browser.newPage()
    try {
      await page.goto(baseURL + path, { waitUntil: "load", timeout: 120_000 })
      await page.waitForTimeout(1500)
    } finally {
      await page.close()
    }
  }
  console.log(`# warmed ${paths.join(", ")}`)
}

/**
 * Start a dev server on a free port and wait until it serves.
 *
 * @returns {Promise<{ baseURL: string, stop: () => Promise<void> }>}
 */
export async function startDevServer({ readyTimeoutMs = 90_000 } = {}) {
  if (process.env.E2E_BASE_URL) {
    const baseURL = process.env.E2E_BASE_URL.replace(/\/$/, "")
    console.log(`# using E2E_BASE_URL=${baseURL} (no server started)`)
    return { baseURL, stop: async () => {} }
  }

  const port = await freePort()
  const baseURL = `http://localhost:${port}`
  // detached so we can signal the whole group: `npm run` forks vite, and
  // killing only npm would leave the server holding the port
  const child = spawn(
    "npm",
    ["run", "e2e:server", "--", "--port", String(port)],
    {
      cwd: SITE_DIR,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
      // console piping is opt-in via ETHEREAL_CONSOLE_PIPING (vite.config.ts);
      // make sure an inherited opt-in can't re-enable the echo loop mid-e2e
      env: { ...process.env, ETHEREAL_CONSOLE_PIPING: "" },
    }
  )
  let log = ""
  child.stdout.on("data", (d) => (log += d))
  child.stderr.on("data", (d) => (log += d))
  let exited = false
  child.on("exit", () => (exited = true))

  const stop = async () => {
    if (exited || child.pid === undefined) return
    try {
      process.kill(-child.pid, "SIGTERM")
    } catch {
      // already gone
    }
    // give vite a beat to release the port before the next script asks for one
    for (let i = 0; i < 40 && !exited; i++) await sleep(50)
  }

  const deadline = Date.now() + readyTimeoutMs
  while (Date.now() < deadline) {
    if (exited)
      throw new Error(
        `dev server exited before it was ready:\n${log.slice(-2000)}`
      )
    try {
      const res = await fetch(baseURL + "/", { redirect: "manual" })
      if (res.status < 500) {
        console.log(`# dev server ready on ${baseURL}`)
        return { baseURL, stop }
      }
    } catch {
      // not listening yet
    }
    await sleep(250)
  }
  await stop()
  throw new Error(
    `dev server never became ready on ${baseURL}:\n${log.slice(-2000)}`
  )
}
