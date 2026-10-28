# proj

A trippy landing page for my projects. The background is the Chladni screenshot
from [cc-playground](https://github.com/rdmacadam/cc-playground), melted live in
WebGL: a liquid warp, ripples that follow your finger or mouse, chromatic
splitting, a drifting hue, glow and grain. It works on phones and desktops.

## Run it

Static site, no build step, no dependencies. ES modules need http, so
double-clicking `index.html` won't work:

```bash
npm run serve        # -> http://localhost:5173
```

Any static host works too (GitHub Pages, Netlify, ...).

## Add your links and projects

- **multaichat link:** the `href` of `.btn` inside `#multaichat` in `index.html`
  points at the deployed app.
- **Copy:** the title, tagline and card text (description and tag chips) are plain
  HTML in `index.html`.
- **More projects:** copy the `<article class="card">` block (give it its own `id`).
  Only `#multaichat` is wired to the 3D tilt; to tilt more cards, change the
  `getElementById("multaichat")` lookup in `js/main.js` to select every `.card`.

## Behavior

| Input | Effect |
|---|---|
| Mouse move | Ripples trail the pointer, the card tilts toward it |
| Touch drag | Ripples follow the finger (when the page fits the screen, so scrolling still works on short phones) |
| Phone tilt | Shifts the warp and tilts the card. iOS asks for permission on the first tap |

Fallbacks: with no WebGL, if the context is lost, or with `prefers-reduced-motion`,
the page shows the same image with a gentle CSS pan and hue drift (still, for
reduced motion). Rendering resolution adapts to keep frames smooth, and the
animation pauses when the tab is hidden.

## How it works

- `js/shader.js`: the fragment shader (warp, ripples, RGB split, hue, glow, grain, vignette)
- `js/bg.js`: WebGL setup, render loop, context loss and restore
- `js/cover.js`, `js/quality.js`, `js/ripples.js`: small pure helpers (cover-fit, adaptive resolution, ripple buffer)
- `js/main.js`: pointer, touch and tilt input, card tilt, fallback selection
- `assets/chladni.jpg`: the screenshot, cropped to the pattern

## Tests

```bash
npm test         # unit tests for the pure helpers (node --test)
npm run e2e      # headless Chromium: layout at several sizes, effects, input, fallbacks
```

`npm run e2e` expects the preinstalled Playwright and Chromium.
