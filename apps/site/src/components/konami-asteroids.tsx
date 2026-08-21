"use client"

import { useEffect, useRef, useState } from "react"

// ↑ ↑ ↓ ↓ ← → ← → B A
const KONAMI = [
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
]

type Vec = { x: number; y: number }
type Ship = Vec & { vx: number; vy: number; a: number; inv: number }
type Bullet = Vec & { vx: number; vy: number; life: number; hue?: number }
type Rock = Vec & { vx: number; vy: number; r: number; verts: number[]; rot: number; vr: number }

const TAU = Math.PI * 2

function makeRock(x: number, y: number, r: number): Rock {
  const verts = Array.from({ length: 10 }, () => 0.72 + Math.random() * 0.4)
  const sp = (0.4 + Math.random() * 0.9) * (60 / r)
  const dir = Math.random() * TAU
  return { x, y, r, verts, rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 1.2, vx: Math.cos(dir) * sp, vy: Math.sin(dir) * sp }
}

/** Hidden Asteroids game, armed by the Konami code. ESC quits. */
export function KonamiAsteroids() {
  const [active, setActive] = useState(false)

  // sequence watcher — always listening, cheap
  useEffect(() => {
    let i = 0
    const onKey = (e: KeyboardEvent) => {
      if (e.code === KONAMI[i]) {
        i++
        if (i === KONAMI.length) {
          i = 0
          setActive(true)
        }
      } else {
        i = e.code === KONAMI[0] ? 1 : 0
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  if (!active) return null
  return <Game onQuit={() => setActive(false)} />
}

function Game({ onQuit }: { onQuit: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current!
    const ctx = canvas.getContext("2d")!
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    let W = 0
    let H = 0
    const resize = () => {
      W = window.innerWidth
      H = window.innerHeight
      canvas.width = W * dpr
      canvas.height = H * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener("resize", resize)

    const ship: Ship = { x: W / 2, y: H / 2, vx: 0, vy: 0, a: -Math.PI / 2, inv: 2 }
    let bullets: Bullet[] = []
    let rocks: Rock[] = []
    let score = 0
    let lives = 3
    let over = false
    let wave = 0
    // rainbow rapid-fire: every 3rd rock destroyed arms it for 5s
    let hits = 0
    let rapidUntil = 0
    let lastShot = 0
    const keys = new Set<string>()

    const fire = (now: number) => {
      const rapid = now < rapidUntil
      if (now - lastShot < (rapid ? 80 : 240)) return
      lastShot = now
      bullets.push({
        x: ship.x + Math.cos(ship.a) * 14,
        y: ship.y + Math.sin(ship.a) * 14,
        vx: ship.vx + Math.cos(ship.a) * 420,
        vy: ship.vy + Math.sin(ship.a) * 420,
        life: 1.1,
        hue: rapid ? (now * 0.36) % 360 : undefined,
      })
      if (bullets.length > (rapid ? 24 : 8)) bullets.shift()
    }

    const spawnWave = () => {
      wave++
      const n = 3 + wave
      rocks = Array.from({ length: n }, () => {
        // spawn on the edges, never on the ship
        const onX = Math.random() < 0.5
        return makeRock(onX ? Math.random() * W : Math.random() < 0.5 ? -40 : W + 40, onX ? (Math.random() < 0.5 ? -40 : H + 40) : Math.random() * H, 34 + Math.random() * 22)
      })
    }
    spawnWave()

    const reset = () => {
      score = 0
      lives = 3
      wave = 0
      over = false
      hits = 0
      rapidUntil = 0
      Object.assign(ship, { x: W / 2, y: H / 2, vx: 0, vy: 0, a: -Math.PI / 2, inv: 2 })
      bullets = []
      spawnWave()
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Escape") {
        onQuit()
        return
      }
      // keep the page from scrolling / clicking buttons underneath
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "Enter", "KeyW", "KeyA", "KeyD"].includes(e.code)) e.preventDefault()
      if (e.code === "Enter" && over) reset()
      keys.add(e.code)
    }
    const onKeyUp = (e: KeyboardEvent) => keys.delete(e.code)
    window.addEventListener("keydown", onKeyDown)
    window.addEventListener("keyup", onKeyUp)

    const wrap = (o: Vec, m = 40) => {
      if (o.x < -m) o.x += W + 2 * m
      if (o.x > W + m) o.x -= W + 2 * m
      if (o.y < -m) o.y += H + 2 * m
      if (o.y > H + m) o.y -= H + 2 * m
    }

    const hitShip = () => {
      lives--
      if (lives <= 0) {
        over = true
        return
      }
      Object.assign(ship, { x: W / 2, y: H / 2, vx: 0, vy: 0, a: -Math.PI / 2, inv: 2.5 })
    }

    let raf = 0
    let prev = performance.now()
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop)
      const dt = Math.min(0.05, (now - prev) / 1000)
      prev = now

      if (!over) {
        if (keys.has("ArrowLeft") || keys.has("KeyA")) ship.a -= 4.2 * dt
        if (keys.has("ArrowRight") || keys.has("KeyD")) ship.a += 4.2 * dt
        const thrust = keys.has("ArrowUp") || keys.has("KeyW")
        if (thrust) {
          ship.vx += Math.cos(ship.a) * 320 * dt
          ship.vy += Math.sin(ship.a) * 320 * dt
        }
        ship.vx *= 1 - 0.6 * dt
        ship.vy *= 1 - 0.6 * dt
        ship.x += ship.vx * dt
        ship.y += ship.vy * dt
        ship.inv = Math.max(0, ship.inv - dt)
        wrap(ship)
        if (keys.has("Space")) fire(now)

        bullets = bullets.filter((b) => (b.life -= dt) > 0)
        for (const b of bullets) {
          b.x += b.vx * dt
          b.y += b.vy * dt
          wrap(b, 4)
        }
        for (const r of rocks) {
          r.x += r.vx * dt * 60
          r.y += r.vy * dt * 60
          r.rot += r.vr * dt
          wrap(r)
        }
        // collisions
        const nextRocks: Rock[] = []
        for (const r of rocks) {
          let hit = false
          for (const b of bullets) {
            if ((b.x - r.x) ** 2 + (b.y - r.y) ** 2 < r.r * r.r) {
              hit = true
              b.life = 0
              score += Math.round(120 - r.r)
              hits++
              if (hits % 3 === 0) rapidUntil = now + 5000
              break
            }
          }
          if (hit && r.r > 16) {
            nextRocks.push(makeRock(r.x, r.y, r.r * 0.55), makeRock(r.x, r.y, r.r * 0.55))
          } else if (!hit) {
            nextRocks.push(r)
          }
        }
        rocks = nextRocks
        bullets = bullets.filter((b) => b.life > 0)
        if (!rocks.length) spawnWave()
        if (!ship.inv) {
          for (const r of rocks) {
            if ((ship.x - r.x) ** 2 + (ship.y - r.y) ** 2 < (r.r + 9) ** 2) {
              hitShip()
              break
            }
          }
        }
      }

      // ── draw: monochrome vector, same palette as the site ──
      ctx.clearRect(0, 0, W, H)
      ctx.fillStyle = "rgba(6,6,6,0.92)"
      ctx.fillRect(0, 0, W, H)
      ctx.strokeStyle = "rgba(255,255,255,0.9)"
      ctx.fillStyle = "#fff"
      ctx.lineWidth = 1.5

      for (const r of rocks) {
        ctx.save()
        ctx.translate(r.x, r.y)
        ctx.rotate(r.rot)
        ctx.beginPath()
        r.verts.forEach((v, i) => {
          const a = (i / r.verts.length) * TAU
          const px = Math.cos(a) * r.r * v
          const py = Math.sin(a) * r.r * v
          i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)
        })
        ctx.closePath()
        ctx.stroke()
        ctx.restore()
      }

      for (const b of bullets) {
        if (b.hue !== undefined) {
          ctx.fillStyle = `hsl(${(b.hue + prev * 0.2) % 360} 100% 65%)`
          ctx.fillRect(b.x - 2, b.y - 2, 4, 4)
          ctx.fillStyle = "#fff"
        } else {
          ctx.fillRect(b.x - 1.5, b.y - 1.5, 3, 3)
        }
      }

      if (!over && (!ship.inv || Math.floor(prev / 120) % 2 === 0)) {
        ctx.save()
        ctx.translate(ship.x, ship.y)
        ctx.rotate(ship.a)
        if (prev < rapidUntil) ctx.strokeStyle = `hsl(${(prev * 0.36) % 360} 100% 70%)`
        ctx.beginPath()
        ctx.moveTo(14, 0)
        ctx.lineTo(-10, 8)
        ctx.lineTo(-6, 0)
        ctx.lineTo(-10, -8)
        ctx.closePath()
        ctx.stroke()
        if (keys.has("ArrowUp") || keys.has("KeyW")) {
          ctx.beginPath()
          ctx.moveTo(-8, 4)
          ctx.lineTo(-15 - Math.random() * 6, 0)
          ctx.lineTo(-8, -4)
          ctx.stroke()
        }
        ctx.restore()
      }

      ctx.font = "14px ui-monospace, monospace"
      ctx.fillStyle = "rgba(255,255,255,0.85)"
      ctx.textAlign = "left"
      ctx.fillText(`SCORE ${score}`, 24, 36)
      ctx.fillText(`SHIPS ${"▲".repeat(Math.max(0, lives))}`, 24, 58)
      if (prev < rapidUntil) {
        ctx.fillStyle = `hsl(${(prev * 0.36) % 360} 100% 70%)`
        ctx.fillText(`RAINBOW ${((rapidUntil - prev) / 1000).toFixed(1)}s`, 24, 80)
        ctx.fillStyle = "rgba(255,255,255,0.85)"
      }
      ctx.textAlign = "right"
      ctx.fillText("ESC quit · ←→ turn · ↑ thrust · SPACE fire", W - 24, 36)
      if (over) {
        ctx.textAlign = "center"
        ctx.font = "32px ui-monospace, monospace"
        ctx.fillText("GAME OVER", W / 2, H / 2 - 12)
        ctx.font = "14px ui-monospace, monospace"
        ctx.fillText("ENTER to play again · ESC to leave", W / 2, H / 2 + 20)
      }
    }
    raf = requestAnimationFrame(loop)

    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener("resize", resize)
      window.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("keyup", onKeyUp)
      document.body.style.overflow = prevOverflow
    }
  }, [onQuit])

  return (
    <div className="fixed inset-0 z-[100]">
      <canvas ref={canvasRef} className="block h-full w-full" data-testid="asteroids" />
    </div>
  )
}
