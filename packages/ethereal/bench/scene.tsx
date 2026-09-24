// Bench scenes for bench/run.mjs. Each host carries a realistic content
// subtree, because per-frame custom-property writes are paid for by every
// element that inherits them — an empty host hides that cost entirely.
import { createRoot } from 'react-dom/client'
import { Ethereal, type EtherealProps } from '../src/ethereal'

const params = new URLSearchParams(location.search)
const scene = params.get('scene') ?? 'gallery'
const strength = Number(params.get('strength') ?? '1')

// ?at=<seconds> freezes every animation clock at that moment, so two builds
// can be screenshotted at the identical frame and diffed
const freezeAt = params.get('at')
if (freezeAt !== null) {
  const nativeFrame = window.requestAnimationFrame.bind(window)
  const start = performance.now()
  window.requestAnimationFrame = (callback) =>
    nativeFrame((now) => callback(Math.min(now - start, Number(freezeAt) * 1000) + 1000))
}

const Content = ({ rows }: { rows: number }) => (
  <span style={{ position: 'relative', zIndex: 10, display: 'block', padding: 12 }}>
    {Array.from({ length: rows }, (_, row) => (
      <span key={row} style={{ display: 'flex', gap: 4, fontSize: 11 }}>
        {Array.from({ length: 8 }, (_, cell) => (
          <span key={cell}>
            <b>item</b> <i>{row * 8 + cell}</i>
          </span>
        ))}
      </span>
    ))}
  </span>
)

const Host = ({ width, height, rows, ...props }: EtherealProps & { width: number; height: number; rows: number }) => (
  <div
    style={{
      position: 'relative',
      isolation: 'isolate',
      width,
      height,
      borderRadius: 16,
      background: params.get('theme') === 'light' ? '#fff' : '#111',
      margin: 36,
      display: 'inline-block',
      color: '#ddd',
      overflow: 'visible',
    }}
  >
    {rows > 0 && <Content rows={rows} />}
    <Ethereal transitionMs={0} strength={strength} {...props} />
  </div>
)

const galleryProps: EtherealProps[] = [
  { path: 'around' },
  { path: 'around', heads: 2, hotspots: 3 },
  { path: 'bottom' },
  { path: 'breathe' },
  { path: 'static' },
  { path: 'around', place: 'both' },
  { path: 'around', place: 'external', trail: 2 },
  { path: 'bottom', place: 'ext-border' },
  { path: 'around', spotShape: 'adaptive' },
  { path: 'breathe', needleJitter: true },
  { path: 'around', flicker: 0.6, wander: 0.4 },
  { path: 'bottom', heads: 2 },
]

// strength sheet: one column per strength, one row per config, on the
// backdrop given by ?bg= — for judging how the glow scales by eye
const sheetStrengths = (params.get('strengths') ?? '0.6,1,1.5,2').split(',').map(Number)
const sheetW = Number(params.get('w') ?? 200)
const sheetH = Number(params.get('h') ?? 56)
const sheetRows: EtherealProps[] = JSON.parse(
  params.get('rows') ?? '[{"path":"around"},{"path":"bottom"},{"path":"around","place":"both","heads":2},{"path":"breathe"}]'
)

// preset sheet: every entry of a presets.json served next to the bundle
// (a name → props map, e.g. the playground's ETHEREAL_PRESETS), rendered in
// the theme given by ?theme= on its matching backdrop
const presetTheme = params.get('theme') === 'light' ? 'light' : 'dark'
const presets: Record<string, EtherealProps> =
  scene === 'presets' ? await (await fetch('presets.json')).json() : {}

function App() {
  if (scene === 'presets')
    return (
      <div style={{ padding: 10, background: presetTheme === 'light' ? '#f4f4f2' : '#050505', display: 'flex', flexWrap: 'wrap' }}>
        {Object.entries(presets).map(([name, props]) => (
          <div key={name} style={{ font: '10px monospace', color: '#888', textAlign: 'center' }}>
            <Host width={200} height={52} rows={0} strength={1} {...props} theme={presetTheme} />
            <div style={{ marginTop: -30 }}>{name}</div>
          </div>
        ))}
      </div>
    )
  if (scene === 'sheet')
    return (
      <div style={{ padding: 10, background: params.get('bg') ?? '#050505' }}>
        {sheetRows.map((row, rowIndex) => (
          <div key={rowIndex}>
            {sheetStrengths.map((value) => (
              <Host key={value} width={sheetW} height={sheetH} rows={0} {...row} strength={value} />
            ))}
          </div>
        ))}
      </div>
    )
  if (scene === 'hero')
    return (
      <div style={{ padding: 40 }}>
        <Host width={900} height={420} rows={30} path="around" place="both" spotW={160} spotH={120} glowBlur={16} />
      </div>
    )
  return (
    <div style={{ padding: 20 }}>
      {galleryProps.map((props, index) => (
        <Host key={index} width={220} height={64} rows={4} {...props} />
      ))}
    </div>
  )
}

document.body.style.cssText = 'margin:0;background:#050505'
createRoot(document.getElementById('root')!).render(<App />)
