# Trippy Projects Landing Page — Design

## Goal

A single-page, stunning, trippy landing page for the owner's projects. Links
are added later. The visual language comes from the Chladni screenshot in
`rdmacadam/cc-playground` (`docs/screenshot.jpg`): glowing nodal lines, an
aurora palette (magenta, teal, violet, white-hot highlights) and a liquid,
melting feel. All effects must work on phones as well as desktop.

## Scope

- One featured project: **multaichat**. A single card, link is a `#` placeholder.
- The Chladni screenshot is used **only as a styling source** (background and
  effects). There is no Chladni project card.
- Placeholder copy: hero title "Projects", a generic tagline, and a stand-in
  description for multaichat. The owner replaces these later.
- Static site, no build step, no dependencies (same as cc-playground).

Out of scope: more project cards, routing, a CMS, analytics, a backend.

## Approach

A full-screen WebGL canvas uses the screenshot as a texture. A fragment shader
applies the effects live. A glass card sits above it.

Alternatives rejected: CSS/SVG filters (janky on mobile, limited), and
re-implementing the Chladni field in a shader (not what was asked).

## Files

| File | Responsibility |
|---|---|
| `index.html` | Markup: canvas, hero, multaichat card, noscript/fallback image |
| `css/style.css` | Layout, glass card, animated border, responsive type, fallback animation |
| `js/bg.js` | WebGL setup, shader, render loop, adaptive quality, `setPointer` / `setTilt` inputs. No DOM knowledge beyond the canvas it is given |
| `js/main.js` | Pointer/touch/tilt input, card 3D tilt, wiring to `bg.js`, fallback selection |
| `assets/chladni.jpg` | Screenshot cropped to the pure pattern (control panel and caption removed) |

`bg.js` exposes a small interface (`createBackground(canvas, image)` returning
`{ setPointer, setTilt, pause, resume, destroy }`) so it can be reasoned about
and tested independently of the page.

## Background effects (shader)

- Texture sampled with mirrored repeat and cover-fit scaling, so any aspect
  ratio works with no visible seams.
- Slow, always-on liquid domain warp driven by flowing noise.
- Pointer/finger ripples: a few recent touch points displace UVs with decaying
  waves.
- Chromatic RGB split, stronger near ripples.
- Slow hue rotation (aurora to ember and back).
- Multi-tap soft glow, film grain, vignette.

## Responsive and mobile behavior

- Touch-drag drives ripples. Device tilt (`deviceorientation`) shifts the warp
  and tilts the card. iOS permission is requested on the first tap.
- Device pixel ratio capped at 1.5. Render scale drops automatically when
  frame time runs slow, and recovers when it does not.
- Animation pauses when the tab is hidden.
- Layout uses `100svh` and `env(safe-area-inset-*)`. Type is fluid via
  `clamp()`. The card is centered and full-width with a gutter on phones.

## Fallbacks

- No WebGL, or context creation fails: show `assets/chladni.jpg` as a CSS
  background with a slow pan and `hue-rotate` animation.
- `prefers-reduced-motion: reduce`: same static fallback, no ripples or tilt.
- Context loss: switch to the fallback and, on restore, rebuild the GL state.

## Foreground

- Hero: title and one-line tagline.
- multaichat card: frosted glass, animated gradient border, 3D tilt following
  pointer or phone tilt, a "Visit" button with `href="#"`.
- Text contrast over the animated background is protected by the glass card
  and a subtle text shadow.

## Testing

- Headless Chromium (Playwright is preinstalled) screenshots at desktop
  (1440x900) and phone (390x844) sizes.
- Check the canvas is not blank (pixel variance across frames) and there are no
  console errors.
- Forced no-WebGL run confirms the fallback is shown.
- Reduced-motion run confirms the static fallback is shown.
- Simulated touch drag confirms ripples change the rendered frame.
