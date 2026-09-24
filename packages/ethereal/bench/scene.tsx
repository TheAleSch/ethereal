// Bench scenes for bench/run.mjs. Each host carries a realistic content
// subtree, because per-frame custom-property writes are paid for by every
// element that inherits them — an empty host hides that cost entirely.
import { createRoot } from 'react-dom/client'
import { Ethereal, type EtherealProps } from '../src/ethereal'

const params = new URLSearchParams(location.search)
const scene = params.get('scene') ?? 'gallery'
const strength = Number(params.get('strength') ?? '1')

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
      background: '#111',
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
const sheetStrengths = [0.6, 1, 1.5, 2]
const sheetRows: EtherealProps[] = JSON.parse(
  params.get('rows') ?? '[{"path":"around"},{"path":"bottom"},{"path":"around","place":"both","heads":2},{"path":"breathe"}]'
)

function App() {
  if (scene === 'sheet')
    return (
      <div style={{ padding: 10, background: params.get('bg') ?? '#050505' }}>
        {sheetRows.map((row, rowIndex) => (
          <div key={rowIndex}>
            {sheetStrengths.map((value) => (
              <Host key={value} width={200} height={56} rows={0} {...row} strength={value} />
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
