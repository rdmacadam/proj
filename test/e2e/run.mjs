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

try {
  await layoutChecks();
} finally {
  await browser.close();
  await server.close();
}
process.exit(failures ? 1 : 0);
