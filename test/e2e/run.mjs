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

try {
  await layoutChecks();
  await bgChecks();
} finally {
  await browser.close();
  await server.close();
}
process.exit(failures ? 1 : 0);
