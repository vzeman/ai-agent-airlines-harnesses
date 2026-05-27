import { chromium } from "playwright-core";

const [airline, url] = process.argv.slice(2);
if (!airline || !url) {
  console.error("Usage: node scripts/inspect-render.mjs <airline> <url>");
  process.exit(2);
}

const browser = await chromium.connect(process.env.BROWSER_WS_ENDPOINT ?? "ws://localhost:3000/");
const context = await browser.newContext({
  viewport: { width: 1440, height: 1100 },
  locale: "en-GB",
  ignoreHTTPSErrors: true
});
const page = await context.newPage();
const responses = [];

page.on("response", async (response) => {
  try {
    const contentType = response.headers()["content-type"] ?? "";
    if (!/json|html|text/i.test(contentType)) return;
    const text = await response.text();
    if (!/VIE|EWR|price|fare|flight|amount|currency/i.test(text) && !/flight|fare|search|booking|shop/i.test(response.url())) {
      return;
    }
    responses.push({
      url: response.url(),
      status: response.status(),
      contentType,
      length: text.length,
      sample: text.slice(0, 800)
    });
  } catch {
    // Ignore consumed/opaque responses in diagnostics.
  }
});

const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);
await page.waitForTimeout(3_000);

const text = await page.locator("body").innerText().catch((error) => String(error));
console.log(
  JSON.stringify(
    {
      airline,
      status: response?.status(),
      url: page.url(),
      textLength: text.length,
      text: text.slice(0, 4_000),
      responses: responses.slice(0, 30)
    },
    null,
    2
  )
);

await context.close();
await browser.close();
