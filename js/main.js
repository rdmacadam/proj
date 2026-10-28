// Page wiring: pointer / touch / tilt input, card tilt, and fallback selection.
import { createBackground } from "./bg.js";

const body = document.body;
const canvas = document.getElementById("bg");
const card = document.getElementById("multaichat");
const testMode = new URLSearchParams(location.search).has("test");

const MAX_TILT_DEG = 8;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// ---- card tilt, eased so it never snaps ----
let tiltTarget = [0, 0]; // degrees [rotateY, rotateX]
let tiltNow = [0, 0];
let tiltRaf = 0;

function tiltStep() {
  tiltNow = tiltNow.map((v, i) => v + (tiltTarget[i] - v) * 0.12);
  card.style.setProperty("--tilt-x", tiltNow[0].toFixed(2));
  card.style.setProperty("--tilt-y", tiltNow[1].toFixed(2));
  const settled = tiltNow.every((v, i) => Math.abs(tiltTarget[i] - v) < 0.01);
  tiltRaf = settled ? 0 : requestAnimationFrame(tiltStep);
}

// nx, ny in -1..1 (ny positive = down)
function tiltCard(nx, ny) {
  tiltTarget = [nx * MAX_TILT_DEG, -ny * MAX_TILT_DEG];
  if (!tiltRaf) tiltRaf = requestAnimationFrame(tiltStep);
}

// Touch drags only own the gesture when the page does not need to scroll.
function updateTouchAction() {
  const fits = document.documentElement.scrollHeight <= window.innerHeight + 1;
  body.classList.toggle("noscroll", fits);
}
updateTouchAction();
window.addEventListener("resize", updateTouchAction);

// ---- fallback selection ----
let bg = null;
if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
  body.classList.add("static");
} else {
  try {
    const img = new Image();
    img.src = "assets/chladni.jpg";
    await img.decode();
    bg = createBackground(canvas, img, {
      onContextLost: () => body.classList.add("no-gl"),
      onContextRestored: () => body.classList.remove("no-gl"),
    });
  } catch (err) {
    console.warn("background unavailable:", err);
  }
  if (!bg) body.classList.add("no-gl");
}
if (testMode && bg) window.__bg = bg;

// ---- input ----
const norm = e => [e.clientX / window.innerWidth, 1 - e.clientY / window.innerHeight];

if (!body.classList.contains("static")) {
  window.addEventListener("pointermove", e => {
    const [x, y] = norm(e);
    bg?.setPointer(x, y, e.pointerType !== "mouse" || e.buttons > 0);
    tiltCard(x * 2 - 1, 1 - y * 2);
  });
  window.addEventListener("pointerdown", e => {
    const [x, y] = norm(e);
    bg?.setPointer(x, y, true);
  });
  window.addEventListener("pointerup", e => {
    const [x, y] = norm(e);
    bg?.setPointer(x, y, false);
  });

  // device tilt: Android and desktop subscribe straight away; iOS asks on the first tap.
  // The request hangs off pointerup: iOS Safari only fires `click` on tappable elements.
  const onOrient = e => {
    if (e.gamma == null || e.beta == null) return;
    const nx = clamp(e.gamma / 30, -1, 1);
    const ny = clamp((e.beta - 45) / 30, -1, 1);
    bg?.setTilt(nx, ny);
    tiltCard(nx, ny);
  };
  const listenTilt = () => window.addEventListener("deviceorientation", onOrient);
  const DOE = window.DeviceOrientationEvent;
  if (DOE) {
    if (typeof DOE.requestPermission === "function") {
      window.addEventListener(
        "pointerup",
        async () => {
          try {
            if ((await DOE.requestPermission()) === "granted") listenTilt();
          } catch {
            /* permission unavailable or denied: pointer input still works */
          }
        },
        { once: true },
      );
    } else {
      listenTilt();
    }
  }

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) bg?.pause();
    else bg?.resume();
  });
}
