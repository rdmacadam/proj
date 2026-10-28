// Headless-Chromium checks for the landing page. Prints PASS/FAIL per check.
import { createRequire } from "node:module";
import { startServer } from "./server.mjs";

const { chromium } = createRequire(import.meta.url)("playwright");

let failures = 0;
const check = (name, ok, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && detail ? ` (${detail})` : ""}`);
};

const server = await startServer();
const browser = await chromium.launch({
  args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox"],
});

const VIEWPORTS = [
  [390, 844],
  [320, 568],
  [1440, 900],
  [2560, 600],
];

async function layoutChecks() {
  for (const [w, h] of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    page.setDefaultTimeout(3000);
    await page.goto(`${server.url}/index.html`);
    const tag = `${w}x${h}`;

    const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
    check(`no-h-scroll@${tag}`, scrollW <= w, `scrollWidth ${scrollW}`);

    const box = await page.locator("#multaichat").boundingBox().catch(() => null);
    check(`card-fits@${tag}`, !!box && box.x >= 0 && box.x + box.width <= w, JSON.stringify(box));

    const title = await page.locator("h1").first().textContent().catch(() => null);
    check(`title@${tag}`, title?.trim() === "Projects", String(title));

    if (w === 390) {
      const href = await page.locator("#multaichat .btn").getAttribute("href").catch(() => null);
      check("btn-placeholder", href?.endsWith("#") ?? false, String(href));
    }
    await ctx.close();
  }
}

// ---- background (bg.html test page) ----
const sleep = ms => new Promise(r => setTimeout(r, ms));
const channelStd = bytes => {
  const stds = [];
  for (let c = 0; c < 3; c++) {
    const vals = [];
    for (let i = c; i < bytes.length; i += 4) vals.push(bytes[i]);
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    stds.push(Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length));
  }
  return Math.min(...stds);
};
const meanOf = bytes => bytes.reduce((a, b) => a + b, 0) / bytes.length;
const meanAbsDiff = (a, b) => a.reduce((s, v, i) => s + Math.abs(v - b[i]), 0) / a.length;
const sample = page => page.evaluate(() => Array.from(window.__bg.sample()));

async function bgChecks() {
  const ctx = await browser.newContext({ viewport: { width: 800, height: 600 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(5000);
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  page.on("console", m => m.type() === "error" && errors.push(m.text()));
  await page.goto(`${server.url}/test/e2e/bg.html?test`);
  const ready = await page.waitForFunction(() => window.__ready === true).then(() => true, () => false);
  if (!ready) {
    check("bg-created", false, `page never ready: ${errors.join(" | ")}`);
    return;
  }

  const created = await page.evaluate(() => window.__bg !== null);
  check("bg-created", created, await page.evaluate(() => window.__err ?? ""));
  if (!created) return;

  await sleep(300);
  const s0 = await sample(page);
  check("bg-not-blank", channelStd(s0) > 8, `std ${channelStd(s0).toFixed(1)}`);

  await sleep(600);
  const s1 = await sample(page);
  const animDiff = meanAbsDiff(s0, s1);
  check("bg-animates", animDiff > 1, `mean abs diff ${animDiff.toFixed(2)}`);

  // ripple vs. baseline drift over the same time gap
  await sleep(100);
  const r0 = await sample(page);
  await sleep(100);
  const r1 = await sample(page);
  const baseline = meanAbsDiff(r0, r1);
  await page.evaluate(() => {
    window.__bg.setPointer(0.5, 0.5, true);
    for (let i = 1; i <= 6; i++) window.__bg.setPointer(0.5 + i * 0.03, 0.5, true);
  });
  await sleep(100);
  const r2 = await sample(page);
  const rippled = meanAbsDiff(r1, r2);
  check("ripple-changes-frame", rippled > baseline * 2 + 1, `ripple ${rippled.toFixed(2)} vs baseline ${baseline.toFixed(2)}`);

  // resize / orientation change
  for (const [w, h] of [[390, 844], [844, 390]]) {
    await page.setViewportSize({ width: w, height: h });
    await sleep(400);
    const dims = await page.evaluate(() => {
      const c = document.getElementById("bg");
      return { cw: c.width, ch: c.height, w: c.clientWidth, h: c.clientHeight };
    });
    const aspectOk = Math.abs(dims.cw / dims.ch - dims.w / dims.h) < 0.03 * (dims.w / dims.h);
    const ratio = dims.cw / dims.w;
    const after = await sample(page);
    check(
      `resize-works@${w}x${h}`,
      aspectOk && ratio >= 0.5 && ratio <= 1.5 && channelStd(after) > 8,
      JSON.stringify(dims),
    );
  }

  // A resize while the canvas has no layout (display:none, e.g. during context loss) must not
  // collapse the drawing buffer; toggling within one task means no ResizeObserver rescue.
  await page.setViewportSize({ width: 800, height: 600 });
  await sleep(400);
  const collapsed = await page.evaluate(async () => {
    const c = document.getElementById("bg");
    const before = c.width;
    c.style.display = "none";
    window.__bg.resize();
    c.style.display = "";
    await new Promise(r => setTimeout(r, 400));
    return { before, after: c.width };
  });
  check("hidden-resize-keeps-size", collapsed.after >= collapsed.before * 0.5, JSON.stringify(collapsed));

  // returning to a hidden tab
  await page.evaluate(() => window.__bg.pause());
  await sleep(1500);
  await page.evaluate(() => window.__bg.resume());
  const back = await sample(page);
  const m = meanOf(back);
  check("hidden-tab-no-spike", channelStd(back) > 8 && m > 10 && m < 245, `mean ${m.toFixed(1)}`);

  check("bg-no-console-errors", errors.length === 0, errors.join(" | "));
  await ctx.close();
}

// ---- full page (index.html): input, tilt, fallbacks ----
async function openPage({ init, reducedMotion, ...ctxOpts } = {}) {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    ...(reducedMotion ? { reducedMotion } : {}),
    ...ctxOpts,
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(5000);
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  page.on("console", m => m.type() === "error" && errors.push(m.text()));
  if (init) await page.addInitScript(init);
  await page.goto(`${server.url}/index.html?test`);
  return { ctx, page, errors };
}
const waitBg = page => page.waitForFunction(() => !!window.__bg).then(() => true, () => false);
const waitBody = (page, cls, present = true) =>
  page.waitForFunction(([c, p]) => document.body.classList.contains(c) === p, [cls, present], { timeout: 3000 }).then(() => true, () => false);
const tiltVars = page =>
  page.evaluate(() => {
    const s = document.getElementById("multaichat").style;
    return [parseFloat(s.getPropertyValue("--tilt-x") || "0"), parseFloat(s.getPropertyValue("--tilt-y") || "0")];
  });

async function rippleDelta(page, spawn) {
  await sleep(150);
  const a = await sample(page);
  await sleep(100);
  const b = await sample(page);
  const baseline = meanAbsDiff(a, b);
  await spawn();
  await sleep(100);
  const c = await sample(page);
  return { baseline, rippled: meanAbsDiff(b, c) };
}

async function pageChecks() {
  // desktop: mouse ripples and card tilt
  {
    const { ctx, page, errors } = await openPage();
    const ok = await waitBg(page);
    check("page-bg-created", ok);
    if (ok) {
      const { baseline, rippled } = await rippleDelta(page, async () => {
        await page.mouse.move(500, 300);
        for (let i = 1; i <= 8; i++) await page.mouse.move(500 + i * 60, 450);
      });
      check("desktop-ripple", rippled > baseline * 1.5 + 2, `ripple ${rippled.toFixed(2)} vs baseline ${baseline.toFixed(2)}`);

      const box = await page.locator("#multaichat").boundingBox();
      await page.mouse.move(box.x + box.width - 4, box.y + 4);
      await sleep(400);
      const [tx, ty] = await tiltVars(page);
      check("card-tilts", Math.abs(tx) > 0.5 || Math.abs(ty) > 0.5, `tilt ${tx},${ty}`);

      await page.evaluate(() => {
        const e = new Event("deviceorientation");
        Object.assign(e, { gamma: 25, beta: 70, alpha: 0 });
        window.dispatchEvent(e);
      });
      await page.mouse.move(2, 2); // pointer parked; device tilt then decides
      await sleep(50);
      check("tilt-from-device-no-error", (await sample(page)).length > 0 && errors.length === 0, errors.join(" | "));
    }
    check("page-no-console-errors", errors.length === 0, errors.join(" | "));
    await ctx.close();
  }

  // phone: touch ripples, and the button still taps
  {
    const { ctx, page } = await openPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    if (await waitBg(page)) {
      const { baseline, rippled } = await rippleDelta(page, async () => {
        await page.evaluate(() => {
          const fire = (type, x, y) =>
            window.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, pointerType: "touch", isPrimary: true, bubbles: true }));
          fire("pointerdown", 195, 422);
          for (let i = 1; i <= 6; i++) fire("pointermove", 195 + i * 12, 422);
          fire("pointerup", 267, 422);
        });
      });
      check("touch-ripple@phone", rippled > baseline * 1.5 + 2, `ripple ${rippled.toFixed(2)} vs baseline ${baseline.toFixed(2)}`);
    } else {
      check("touch-ripple@phone", false, "bg never created");
    }
    await page.evaluate(() => {
      window.__clicked = false;
      document.querySelector("#multaichat .btn").addEventListener("click", e => {
        e.preventDefault();
        window.__clicked = true;
      });
    });
    await page.locator("#multaichat .btn").tap();
    check("btn-tappable@phone", await page.evaluate(() => window.__clicked));
    await ctx.close();
  }

  // no WebGL at all
  {
    const { ctx, page } = await openPage({ init: () => { HTMLCanvasElement.prototype.getContext = () => null; } });
    check("no-webgl-fallback", await waitBody(page, "no-gl"));
    check("no-webgl-canvas-hidden", !(await page.locator("#bg").isVisible()));
    await ctx.close();
  }

  // reduced motion
  {
    const { ctx, page } = await openPage({ reducedMotion: "reduce" });
    const isStatic = await waitBody(page, "static");
    await sleep(300);
    check("reduced-motion", isStatic && (await page.evaluate(() => window.__bg === undefined)));
    await ctx.close();
  }

  // context loss, then restore
  {
    const { ctx, page } = await openPage();
    if (await waitBg(page)) {
      await page.evaluate(() => {
        const c = document.getElementById("bg");
        const gl = c.getContext("webgl2") || c.getContext("webgl");
        window.__lose = gl.getExtension("WEBGL_lose_context");
        window.__lose.loseContext();
      });
      check("context-lost-fallback", await waitBody(page, "no-gl"));
      await page.evaluate(() => window.__lose.restoreContext());
      const back = await waitBody(page, "no-gl", false);
      await sleep(300);
      const bytes = back ? await sample(page) : [0];
      check("context-restored", back && channelStd(bytes) > 8, `back=${back}`);
    } else {
      check("context-lost-fallback", false, "bg never created");
    }
    await ctx.close();
  }

  // tilt unavailable (no DeviceOrientationEvent) and iOS-style denied permission
  for (const [name, init] of [
    ["tilt-unavailable", () => { Object.defineProperty(window, "DeviceOrientationEvent", { value: undefined, configurable: true }); }],
    ["tilt-permission-denied", () => { window.DeviceOrientationEvent = Object.assign(function () {}, { requestPermission: async () => "denied" }); }],
  ]) {
    const { ctx, page, errors } = await openPage({ init });
    const ok = await waitBg(page);
    if (ok) {
      await page.mouse.click(700, 100);
      await page.evaluate(() => window.dispatchEvent(Object.assign(new Event("deviceorientation"), { gamma: 20, beta: 60 })));
      await sleep(300);
      const bytes = await sample(page);
      check(name, errors.length === 0 && channelStd(bytes) > 8, errors.join(" | "));
    } else {
      check(name, false, "bg never created");
    }
    await ctx.close();
  }
}

try {
  await layoutChecks();
  await bgChecks();
  await pageChecks();
} finally {
  await browser.close();
  await server.close();
}
process.exit(failures ? 1 : 0);
