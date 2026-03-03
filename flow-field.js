/* ============================================================
   FLOW FIELD — Animated vector grid with mouse interaction
   Zero dependencies. ~3 KB.
   ============================================================ */

// ── CONFIG ──────────────────────────────────────────────────
const CONFIG = {
  // Grid
  GRID_SPACING: 40, // px between vectors (was 28 — 30% fewer vectors)
  LINE_LENGTH: 34, // drawn length of each line
  LINE_WIDTH: 4.5, // stroke thickness

  // Colour — #00A180
  COLOR_R: 0,
  COLOR_G: 161,
  COLOR_B: 128,
  OPACITY: 0.35, // base alpha (overlaps compound to darker tones)

  // Noise
  NOISE_SCALE: 0.0015, // lower = smoother / larger swirls (neighbors stay coherent)
  TIME_SPEED: 0.00015, // animation speed (slower, more gentle)

  // Mouse interaction (positional)
  MOUSE_MODE: 'repel', // ← 'attract' or 'repel'
  MOUSE_RADIUS: 300, // px — radius of influence
  MOUSE_PULL: 50, // max px a point is displaced toward/away from cursor
  MOUSE_EASE_IN: 0.08, // how fast points move toward target offset
  MOUSE_EASE_OUT: 0.035, // how fast points spring back (slower = more organic)

  // Performance
  FPS_CAP: 0 // 0 = uncapped; set e.g. 30 to save CPU
}

// ── SIMPLEX NOISE (public-domain, compact) ──────────────────
const _F2 = 0.5 * (Math.sqrt(3) - 1)
const _G2 = (3 - Math.sqrt(3)) / 6
const _grad = [
  [1, 1],
  [-1, 1],
  [1, -1],
  [-1, -1],
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1]
]
const _perm = new Uint8Array(512)
const _permMod8 = new Uint8Array(512)

;(function seedNoise() {
  const p = new Uint8Array(256)
  for (let i = 0; i < 256; i++) p[i] = i
  for (let i = 255; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0
    ;[p[i], p[j]] = [p[j], p[i]]
  }
  for (let i = 0; i < 512; i++) {
    _perm[i] = p[i & 255]
    _permMod8[i] = _perm[i] & 7
  }
})()

function simplex2(x, y) {
  const s = (x + y) * _F2
  const i = Math.floor(x + s),
    j = Math.floor(y + s)
  const t = (i + j) * _G2
  const X0 = i - t,
    Y0 = j - t
  const x0 = x - X0,
    y0 = y - Y0
  const i1 = x0 > y0 ? 1 : 0,
    j1 = x0 > y0 ? 0 : 1
  const x1 = x0 - i1 + _G2,
    y1 = y0 - j1 + _G2
  const x2 = x0 - 1 + 2 * _G2,
    y2 = y0 - 1 + 2 * _G2
  const ii = i & 255,
    jj = j & 255

  let n0 = 0,
    n1 = 0,
    n2 = 0
  let t0 = 0.5 - x0 * x0 - y0 * y0
  if (t0 > 0) {
    t0 *= t0
    const g = _grad[_permMod8[ii + _perm[jj]]]
    n0 = t0 * t0 * (g[0] * x0 + g[1] * y0)
  }
  let t1 = 0.5 - x1 * x1 - y1 * y1
  if (t1 > 0) {
    t1 *= t1
    const g = _grad[_permMod8[ii + i1 + _perm[jj + j1]]]
    n1 = t1 * t1 * (g[0] * x1 + g[1] * y1)
  }
  let t2 = 0.5 - x2 * x2 - y2 * y2
  if (t2 > 0) {
    t2 *= t2
    const g = _grad[_permMod8[ii + 1 + _perm[jj + 1]]]
    n2 = t2 * t2 * (g[0] * x2 + g[1] * y2)
  }
  return 70 * (n0 + n1 + n2) // returns -1 … 1
}

// ── CANVAS SETUP ────────────────────────────────────────────
const canvas = document.getElementById('flow')
const ctx = canvas.getContext('2d')
const container = canvas.parentElement
let W, H

// Per-point offset arrays for smooth mouse attraction
let cols, rows, offsetsX, offsetsY

function resize() {
  const rect = container.getBoundingClientRect()
  W = canvas.width = rect.width
  H = canvas.height = rect.height

  // Rebuild offset arrays
  cols = Math.ceil(W / CONFIG.GRID_SPACING)
  rows = Math.ceil(H / CONFIG.GRID_SPACING)
  const count = cols * rows
  offsetsX = new Float32Array(count)
  offsetsY = new Float32Array(count)
}
window.addEventListener('resize', resize)
resize()

// ── MOUSE TRACKING (relative to container) ────────────────────────
let mx = -9999,
  my = -9999

function updateMouse(clientX, clientY) {
  const rect = container.getBoundingClientRect()
  mx = clientX - rect.left
  my = clientY - rect.top
}

window.addEventListener('mousemove', (e) => {
  updateMouse(e.clientX, e.clientY)
})
window.addEventListener('mouseleave', () => {
  mx = -9999
  my = -9999
})
window.addEventListener(
  'touchmove',
  (e) => {
    const t = e.touches[0]
    updateMouse(t.clientX, t.clientY)
  },
  { passive: true }
)
window.addEventListener('touchend', () => {
  mx = -9999
  my = -9999
})

// ── ANIMATION LOOP ──────────────────────────────────────────
let lastFrame = 0
const minInterval = CONFIG.FPS_CAP > 0 ? 1000 / CONFIG.FPS_CAP : 0

function draw(now) {
  requestAnimationFrame(draw)

  // FPS cap
  if (minInterval && now - lastFrame < minInterval) return
  lastFrame = now

  const time = now * CONFIG.TIME_SPEED
  const {
    GRID_SPACING,
    LINE_LENGTH,
    LINE_WIDTH,
    COLOR_R,
    COLOR_G,
    COLOR_B,
    OPACITY,
    NOISE_SCALE,
    MOUSE_MODE,
    MOUSE_RADIUS,
    MOUSE_PULL,
    MOUSE_EASE_IN,
    MOUSE_EASE_OUT
  } = CONFIG

  ctx.clearRect(0, 0, W, H)
  ctx.strokeStyle = `rgba(${COLOR_R},${COLOR_G},${COLOR_B},${OPACITY})`
  ctx.lineWidth = LINE_WIDTH
  ctx.lineCap = 'butt'

  let idx = 0
  for (let col = 0; col < cols; col++) {
    const hx = GRID_SPACING / 2 + col * GRID_SPACING
    for (let row = 0; row < rows; row++) {
      const hy = GRID_SPACING / 2 + row * GRID_SPACING

      // ── Mouse interaction (positional pull/push) ──
      let tx = 0,
        ty = 0
      const dx = mx - hx,
        dy = my - hy
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist < MOUSE_RADIUS && dist > 0) {
        const falloff = 1 - dist / MOUSE_RADIUS
        const pull = falloff * falloff * MOUSE_PULL // quadratic falloff
        const sign = MOUSE_MODE === 'repel' ? -1 : 1
        tx = sign * (dx / dist) * pull
        ty = sign * (dy / dist) * pull
      }

      // Smooth lerp — ease in when attracting, ease out when returning
      const ease = tx !== 0 || ty !== 0 ? MOUSE_EASE_IN : MOUSE_EASE_OUT
      offsetsX[idx] += (tx - offsetsX[idx]) * ease
      offsetsY[idx] += (ty - offsetsY[idx]) * ease

      // Final drawn position = home + offset
      const px = hx + offsetsX[idx]
      const py = hy + offsetsY[idx]

      // Angle from noise (sample at home position for stability)
      const angle = simplex2(hx * NOISE_SCALE, hy * NOISE_SCALE + time) * Math.PI

      // Draw each vector individually so alpha stacks on overlap
      const ex = px + Math.cos(angle) * LINE_LENGTH
      const ey = py + Math.sin(angle) * LINE_LENGTH
      ctx.beginPath()
      ctx.moveTo(px, py)
      ctx.lineTo(ex, ey)
      ctx.stroke()

      idx++
    }
  }
}

requestAnimationFrame(draw)
