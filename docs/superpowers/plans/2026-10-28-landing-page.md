# Trippy Projects Landing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A static, responsive, trippy landing page with one multaichat card over a live WebGL background styled from the Chladni screenshot.

**Architecture:** A full-screen canvas renders the cropped Chladni screenshot as a texture through a fragment shader (liquid warp, pointer/touch ripples, RGB split, hue drift, glow, grain, vignette). Pure helper modules (cover-fit math, adaptive quality, ripple ring buffer) are unit-tested with `node --test`. Page behavior (layout, effects, fallbacks) is verified with headless Chromium.

**Tech Stack:** Vanilla HTML/CSS/ES modules, WebGL (2 with 1 fallback, one GLSL ES 1.00 shader for both), `node --test`, preinstalled Playwright.

**Spec:** `docs/superpowers/specs/2026-10-28-landing-page-design.md`

Deviation from the spec's file table: `bg.js` delegates to three small helper modules (`cover.js`, `quality.js`, `ripples.js`) and a `shader.js` so they can be unit-tested; `createBackground`'s interface is unchanged.

## Global Constraints

- Static site: no build step, no runtime dependencies. ES modules served over http.
- Only one project card: **multaichat**, button `href="#"`. No Chladni card.
- Placeholder copy: hero title `Projects`, a generic tagline, a stand-in multaichat description.
- Chladni screenshot used only as styling source: `assets/chladni.jpg`, cropped to x 0-1090, y 0-800 of the original 1440x900 (removes control panel and caption).
- Texture sampled with mirrored tiling done in the shader (NPOT-safe on WebGL1) and cover-fit scaling.
- DPR capped at 1.5. Layout uses `100svh` and `env(safe-area-inset-*)`. Fluid type via `clamp()`.
- `prefers-reduced-motion: reduce`, no WebGL, or context loss: static CSS fallback (pan + `hue-rotate`), no ripples or tilt.
- Animation pauses when the tab is hidden. iOS tilt permission requested on first tap.
- Test hooks (`window.__bg`) exist only when the URL has `?test`.
- Playwright is imported with `createRequire(import.meta.url)("playwright")`; do not install it. Launch Chromium with `args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox"]`.

## Review Focus

1. Extreme viewports (320x568 phone, 2560x600 ultrawide): no horizontal scroll, card fully visible, background not stretched. (Task 1 layout checks, Task 2 `coverScale` extremes)
2. Tilt unavailable or iOS permission denied: page still works, no thrown error. (Task 4)
3. Resize or orientation change mid-run: canvas resizes to the new size and still renders. (Task 3)
4. Returning to a hidden tab (frame delta of several seconds): no quality collapse and no ripple explosion. (Task 2 `quality` and `ripples` tests, Task 3 loop clamp)
5. WebGL context lost: fallback appears instead of a blank screen. (Task 4)

---

### Task 1: Test harness, cropped asset, static page

**Files:**
- Create: `package.json`, `test/e2e/server.mjs`, `test/e2e/run.mjs`, `assets/chladni.jpg`, `index.html`, `css/style.css`

**Interfaces:**
- Produces: DOM contract used by later tasks:
  `<canvas id="bg">`, `<main>` containing `<h1>`, `<p class="tagline">`, `<article class="card" id="multaichat">` with `<a class="btn" href="#">`; `<body>` classes `no-gl` and `static` (set by `main.js`) switch the fallback background on.
- Produces: `startServer(port?: number): Promise<{ url: string, close(): Promise<void> }>` in `test/e2e/server.mjs`; `run.mjs` exports nothing and exits non-zero on failure, with named checks printed as `PASS name` / `FAIL name`.

- [ ] **Step 1: Write the failing layout checks** in `test/e2e/run.mjs`. For viewports 390x844, 320x568, 1440x900 and 2560x600, load the page and assert:
  `document.documentElement.scrollWidth <= innerWidth` (name `no-h-scroll@WxH`); the `#multaichat` bounding box lies within the viewport horizontally (`card-fits@WxH`); `h1` text is `Projects` (`title@WxH`); the `.btn` has `href` ending `#` (`btn-placeholder`).
- [ ] **Step 2: Run** `node test/e2e/run.mjs`. Expected: FAIL (no page yet).
- [ ] **Step 3: Crop** the screenshot from `/home/user/rdmacadam/cc-playground/docs/screenshot.jpg` to `assets/chladni.jpg` (x 0-1090, y 0-800, quality ~88) using ImageMagick or PIL, whichever is installed. Verify with `file` that it is 1090x800 and view it to confirm no panel or caption remains.
- [ ] **Step 4: Implement `index.html` and `css/style.css`.** Dark base (`#05060f`), full-viewport fixed canvas behind content, centered column, glass card (`backdrop-filter: blur`, translucent border) with animated conic-gradient border using the palette `#1ec8b0 #7b3fe4 #ff4fd8 #fff4fb`. Fallback: `body.no-gl, body.static` shows `assets/chladni.jpg` as a `cover` background with a slow `background-position` pan and `filter: hue-rotate` keyframe animation, and hides the canvas. Phone: card full width minus a 16px gutter. `serve` script in `package.json`: `node test/e2e/server.mjs`; `test` script runs `node --test test/*.test.js`; `e2e` runs `node test/e2e/run.mjs`.
- [ ] **Step 5: Run** `node test/e2e/run.mjs`. Expected: all PASS.
- [ ] **Step 6: Commit** `feat: static page, cropped chladni asset, e2e harness`.

---

### Task 2: Pure helper modules (TDD)

**Files:**
- Create: `js/cover.js`, `js/quality.js`, `js/ripples.js`, `test/cover.test.js`, `test/quality.test.js`, `test/ripples.test.js`

**Interfaces:**
- Produces: `coverScale(viewW: number, viewH: number, imgW: number, imgH: number): [number, number]`. UV multiplier so the image covers the view without stretching.
- Produces: `createQuality(opts?: { min?: number, max?: number, targetMs?: number, step?: number }): { update(dtMs: number): number, readonly scale: number }`. Defaults `min 0.5, max 1, targetMs 20, step 0.1`.
- Produces: `createRipples(max?: number): { add(x: number, y: number, t: number): void, data(t: number): Float32Array }`. Default `max 8`; `data` has length `max * 4` laid out `[x, y, age, strength]` per slot; ripple lifetime 2.5 s.

- [ ] **Step 1: Write failing tests.**
  `cover.test.js`: `coverScale(1000,500,1000,1000)` deepEqual `[1, 0.5]`; `coverScale(500,1000,1000,1000)` deepEqual `[0.5, 1]`; `coverScale(800,800,400,400)` deepEqual `[1, 1]`; ultrawide `coverScale(2560,600,1090,800)`: both components in `(0, 1]` and at least one equals 1.
  `quality.test.js`: 120 frames of 40 ms drive `scale` below 1 and never below `min`; 300 frames of 8 ms keep `scale === 1`; after slow frames, 600 frames of 8 ms raise `scale` back above its low point; a single `update(5000)` spike leaves `scale` unchanged (spikes over 250 ms are ignored).
  `ripples.test.js`: adding 10 ripples to `createRipples(8)` leaves 8 slots with strength > 0 and the 2 oldest gone; at `t` before any add, all strengths 0; `data(t0 + 3)` has all strengths 0; strength at `age 0` is greater than at `age 1`; `data(t0 + 1e6)` (returning to a hidden tab) has all strengths 0 and no `NaN`.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL (modules missing).
- [ ] **Step 3: Implement the three modules.** `coverScale` divides the view aspect by the image aspect on the longer axis. `createQuality` keeps an exponential moving average of `dtMs`, lowers `scale` by `step` when the average exceeds `targetMs * 1.3` and raises it when below `targetMs * 0.8` for 3 s of accumulated time, with a 1 s cooldown between changes. `createRipples` is a ring buffer; strength is `max(0, 1 - age / 2.5) ** 2`.
- [ ] **Step 4: Run** `npm test`. Expected: all PASS.
- [ ] **Step 5: Commit** `feat: cover-fit, adaptive quality and ripple helpers`.

---

### Task 3: WebGL background

**Files:**
- Create: `js/shader.js`, `js/bg.js`
- Modify: `test/e2e/run.mjs`, `index.html` (load script is added in Task 4; for this task the test loads `js/bg.js` through a test page `test/e2e/bg.html`)
- Create: `test/e2e/bg.html`

**Interfaces:**
- Consumes: `coverScale`, `createQuality`, `createRipples` from Task 2.
- Produces: `export const VERT: string`, `export const FRAG: string` (GLSL ES 1.00; uniforms `uTex sampler2D, uRes vec2, uCover vec2, uTime float, uTilt vec2, uRipples vec4[8]`).
- Produces: `createBackground(canvas: HTMLCanvasElement, image: HTMLImageElement, opts?: { onContextLost?: () => void }): null | { setPointer(x: number, y: number, down?: boolean): void, setTilt(tx: number, ty: number): void, pause(): void, resume(): void, resize(): void, sample(): Uint8Array, destroy(): void }`. `x`, `y`, `tx`, `ty` are normalized `0..1` (tilt `-1..1`). Returns `null` when no GL context. `sample()` renders one frame and returns RGBA bytes of a 32x32 center block (works without `preserveDrawingBuffer` because it reads in the same tick).

- [ ] **Step 1: Write failing e2e checks** against `test/e2e/bg.html?test` (a bare page with a full-viewport canvas, loading the cropped image and calling `createBackground`; exposes it as `window.__bg`):
  `bg-created` (`__bg` is not null); `bg-not-blank` (the `sample()` bytes have per-channel standard deviation > 8); `bg-animates` (two `sample()` calls 600 ms apart differ in more than 1% of bytes); `ripple-changes-frame` (after `setPointer(0.5, 0.5, true)` plus a few moves, `sample()` differs from a control taken right before); `resize-works` (set viewport 390x844 then 844x390, `canvas.width` follows `clientWidth * dpr * quality` within 1 px tolerance and `sample()` is still not blank); `hidden-tab-no-spike` (call `pause()`, wait, `resume()`; first `sample()` has no all-black or all-white frame).
- [ ] **Step 2: Run** `node test/e2e/run.mjs`. Expected: new checks FAIL.
- [ ] **Step 3: Implement `shader.js`.** Fragment shader pipeline in this order: cover-fit and mirrored tiling (`abs(mod(uv, 2.0) - 1.0)` triangle wave) -> flowing-noise domain warp (slow, `uTime`) -> tilt offset -> ripple displacement (decaying sine rings per `uRipples` slot) -> 3-channel sample with RGB offset scaled by local ripple strength -> hue rotation by `uTime * 0.05` rad -> 5-tap glow -> grain -> vignette.
- [ ] **Step 4: Implement `bg.js`.** Try `webgl2`, fall back to `webgl`; return `null` if neither. Full-screen triangle, texture uploaded with `CLAMP_TO_EDGE` and `LINEAR`. Render loop via `requestAnimationFrame`, frame delta clamped to 100 ms before use. Canvas size is `clientWidth * min(devicePixelRatio, 1.5) * quality.scale`; `resize()` re-reads it and `ResizeObserver` calls it. `webglcontextlost` calls `preventDefault()` and `opts.onContextLost`. `pause()` cancels the loop; `resume()` restarts and resets the last-frame timestamp.
- [ ] **Step 5: Run** `node test/e2e/run.mjs` and `npm test`. Expected: all PASS.
- [ ] **Step 6: Commit** `feat: webgl liquid chladni background`.

---

### Task 4: Page wiring, input, fallbacks

**Files:**
- Create: `js/main.js`
- Modify: `index.html` (module script tag), `css/style.css` (card tilt custom properties, `touch-action`), `test/e2e/run.mjs`

**Interfaces:**
- Consumes: `createBackground` from Task 3.
- Produces: `main.js` has no exports. Sets `document.body` classes `no-gl` (no context, or context lost) and `static` (reduced motion). Sets CSS custom properties `--tilt-x`, `--tilt-y` (degrees) on `#multaichat`. With `?test` in the URL sets `window.__bg`.

- [ ] **Step 1: Write failing e2e checks** on `index.html?test`:
  `desktop-ripple`: mouse move across the page changes `__bg.sample()`; `card-tilts`: hovering a corner of the card changes `--tilt-x` or `--tilt-y` from `0`; `touch-ripple@phone` (390x844, `hasTouch`): dispatch `pointermove` events with `pointerType: "touch"` through `page.evaluate` and assert `sample()` changes, while a tap on `.btn` still fires its `click`; `no-webgl-fallback`: an init script makes `HTMLCanvasElement.prototype.getContext` return `null`, assert `body.no-gl` and the canvas is not visible; `reduced-motion`: `page.emulateMedia({ reducedMotion: "reduce" })`, assert `body.static` and `window.__bg` undefined; `context-lost`: call `WEBGL_lose_context.loseContext()` on the canvas and assert `body.no-gl` appears within 1 s; `tilt-unavailable`: dispatch a `deviceorientation` event and assert no page error and `__bg.sample()` still not blank; `tilt-permission-denied`: stub `DeviceOrientationEvent.requestPermission` to resolve `"denied"`, tap the page, assert no page error and the page still renders.
- [ ] **Step 2: Run** `node test/e2e/run.mjs`. Expected: new checks FAIL.
- [ ] **Step 3: Implement `main.js`.** Pick fallback first (reduced motion -> `static`; `createBackground` returns `null` -> `no-gl`; `onContextLost` -> `no-gl` and `destroy()`). Wire `pointermove`/`pointerdown`/`pointerup` on `window` to `setPointer` (normalized, y flipped). Card tilt: pointer position relative to the viewport center maps to ±8° and is written to the custom properties, eased with a rAF lerp. First user tap: if `DeviceOrientationEvent.requestPermission` is a function, `await` it inside try/catch and only subscribe to `deviceorientation` on `"granted"`; otherwise subscribe directly. Tilt feeds `setTilt` and the card. `visibilitychange` calls `pause`/`resume`. Add `touch-action: none` on the canvas area but not on `.btn`.
- [ ] **Step 4: Run** `node test/e2e/run.mjs` and `npm test`. Expected: all PASS, no console errors in any run.
- [ ] **Step 5: Commit** `feat: page wiring, touch and tilt input, fallbacks`.

---

### Task 5: README and visual verification

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Take screenshots** with headless Chromium at 1440x900 and 390x844 (WebGL on, after 1.5 s) into the scratchpad directory, and view both. Expected: vivid aurora pattern background, glass card legible, no layout breakage. Fix any issue found, re-run `node test/e2e/run.mjs` and `npm test`.
- [ ] **Step 2: Write `README.md`**: what it is, how to run (`npm run serve`), how to add a project (copy the `<article class="card">` block), where to set the multaichat link (`.btn` `href`), the fallbacks, and the test commands.
- [ ] **Step 3: Commit** `docs: readme` and push to `claude/gallant-dirac-jd03od`.
