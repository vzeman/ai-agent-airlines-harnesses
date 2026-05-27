import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";

const browserWsEndpoint = process.env.BROWSER_WS_ENDPOINT ?? "ws://localhost:3000/";
const flaresolverrUrl = process.env.FLARESOLVERR_URL ?? "http://localhost:8191/v1";
const outputDir = path.resolve("artifacts", "cookie-consent");

const targets = [
  {
    airline: "ryanair",
    url: "https://www.ryanair.com/gb/en/trip/flights/select?adults=1&teens=0&children=0&infants=0&dateOut=2026-06-15&dateIn=&isConnectedFlight=false&isReturn=false&originIata=VIE&destinationIata=STN&discount=0&promoCode="
  },
  {
    airline: "wizzair",
    url: "https://wizzair.com/en-gb/booking/select-flight/VIE/LTN/2026-06-15/null/1/0/0/null"
  },
  {
    airline: "austrian",
    url: "https://www.austrian.com/xx/en/flight-search?departure=VIE&destination=LHR&departureDate=2026-06-15&returnDate=&adults=1&children=0&infants=0&cabin=ECONOMY"
  },
  {
    airline: "lufthansa",
    url: "https://www.lufthansa.com/xx/en/flight-search?origin=VIE&destination=LHR&outboundDate=2026-06-15&returnDate=&adults=1&children=0&infants=0&cabin=ECONOMY"
  },
  {
    airline: "american",
    url: "https://www.aa.com/booking/find-flights?tripType=oneWay&from=VIE&to=LHR&depart=06%2F15%2F2026&return=&adults=1&cabin=COACH"
  },
  {
    airline: "british",
    url: "https://www.britishairways.com/travel/home/public/en_gb?eId=111083&tab_selected=flightSearch&from=VIE&to=LHR&departureDate=2026-06-15&returnDate=&adults=1&children=0&infants=0&cabin=M"
  },
  {
    airline: "qatar",
    url: "https://www.qatarairways.com/app/booking/flight-selection?tripType=O&fromStation=VIE&toStation=LHR&departing=2026-06-15&returning=&adults=1&children=0&infants=0&cabinClass=E"
  }
];

const browser = await chromium.connect(browserWsEndpoint);
await mkdir(outputDir, { recursive: true });

const results = [];
for (const target of targets) {
  const sessionId = `cookie-test-${target.airline}-${Date.now()}`;
  const context = await browser.newContext({
    locale: "en-GB",
    viewport: { width: 1440, height: 1100 },
    ignoreHTTPSErrors: true
  });

  try {
    const session = await resolveWithFlareSolverr(sessionId, target.url);
    if (session.cookies.length > 0) {
      await context.addCookies(toPlaywrightCookies(session.cookies, target.url));
    }

    const page = await context.newPage();
    const response = await page.goto(target.url, { waitUntil: "domcontentloaded", timeout: 60_000 });
    const firstClick = await dismissCookieBanners(page);
    await page.waitForLoadState("networkidle", { timeout: 12_000 }).catch(() => undefined);
    await page.waitForTimeout(2_000);
    const secondClick = await dismissCookieBanners(page);
    await page.waitForTimeout(1_000);

    const residualCookieBannerVisible = await cookieBannerVisible(page);
    const screenshot = path.join(outputDir, `${target.airline}.png`);
    await page.screenshot({ path: screenshot, fullPage: false });

    results.push({
      airline: target.airline,
      status: response?.status(),
      finalUrl: page.url(),
      flaresolverrStatus: session.status,
      flaresolverrCookieCount: session.cookies.length,
      clickedConsent: firstClick || secondClick,
      residualCookieBannerVisible,
      screenshot: path.relative(process.cwd(), screenshot)
    });
  } catch (error) {
    results.push({
      airline: target.airline,
      error: error instanceof Error ? error.message : String(error)
    });
  } finally {
    await context.close();
    await destroyFlareSolverrSession(sessionId);
  }
}

await browser.close();
console.log(JSON.stringify(results, null, 2));

async function dismissCookieBanners(page) {
  const selectors = [
    "#onetrust-accept-btn-handler",
    "button#onetrust-accept-btn-handler",
    "button[data-testid='cookie-accept-all']",
    "button[data-test='cookie-accept-all']",
    "button[data-cy='cookie-accept-all']",
    "button[data-ref='cookie.accept-all']",
    "button[aria-label='Accept all']",
    "button[aria-label='Accept all cookies']",
    "button:has-text('Accept all')",
    "button:has-text('Accept cookies')",
    "button:has-text('Allow all')",
    "button:has-text('I agree')",
    "button:has-text('Agree')",
    "button:has-text('Got it')"
  ];
  const labels = [
    "Accept all",
    "Accept All",
    "Accept all cookies",
    "Accept cookies",
    "Allow all",
    "Agree",
    "I agree",
    "Yes, I agree",
    "Continue",
    "Got it",
    "OK"
  ];

  for (const selector of selectors) {
    if (await clickLocatorIfVisible(page.locator(selector).first())) return true;
  }
  for (const label of labels) {
    if (await clickLocatorIfVisible(page.getByRole("button", { name: label, exact: true }).first())) return true;
  }
  return clickLocatorIfVisible(
    page
      .getByRole("button", {
        name: /^(accept all|accept all cookies|accept cookies|allow all|agree|i agree|yes, i agree|continue|got it|ok)$/i
      })
      .first()
  );
}

async function cookieBannerVisible(page) {
  const selectors = [
    "#onetrust-banner-sdk",
    "#onetrust-consent-sdk",
    "[id*='cookie'][role='dialog']",
    "[class*='cookie'][role='dialog']",
    "[aria-label*='cookie' i]",
    "text=/accept all cookies/i",
    "text=/privacy preferences/i"
  ];
  for (const selector of selectors) {
    try {
      const locator = page.locator(selector).first();
      if ((await locator.count()) > 0 && (await locator.isVisible({ timeout: 500 }))) return true;
    } catch {
      // Keep checking other banner patterns.
    }
  }
  return false;
}

async function clickLocatorIfVisible(locator) {
  try {
    if ((await locator.count()) === 0) return false;
    if (!(await locator.isVisible({ timeout: 750 }))) return false;
    await locator.click({ timeout: 2_000 });
    await locator.page().waitForTimeout(500);
    return true;
  } catch {
    return false;
  }
}

async function resolveWithFlareSolverr(sessionId, url) {
  await flareSolverr({ cmd: "sessions.create", session: sessionId });
  const response = await flareSolverr({
    cmd: "request.get",
    session: sessionId,
    url,
    maxTimeout: 90_000,
    waitInSeconds: 3,
    returnOnlyCookies: true
  });
  return {
    status: response.solution?.status,
    cookies: response.solution?.cookies ?? []
  };
}

async function destroyFlareSolverrSession(sessionId) {
  try {
    await flareSolverr({ cmd: "sessions.destroy", session: sessionId });
  } catch {
    // Best effort cleanup for live validation.
  }
}

async function flareSolverr(payload) {
  const response = await fetch(flaresolverrUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error(`FlareSolverr HTTP ${response.status}: ${await response.text()}`);
  const data = await response.json();
  if (data.status !== "ok") throw new Error(data.message || "FlareSolverr command failed");
  return data;
}

function toPlaywrightCookies(cookies, url) {
  const target = new URL(url);
  return cookies.map((cookie) => ({
    name: cookie.name,
    value: cookie.value,
    domain: cookie.domain ?? target.hostname,
    path: cookie.path ?? "/",
    expires: cookie.expires && cookie.expires > 0 ? cookie.expires : -1,
    httpOnly: cookie.httpOnly ?? false,
    secure: cookie.secure ?? target.protocol === "https:",
    sameSite: sameSite(cookie.sameSite) ?? "Lax"
  }));
}

function sameSite(value) {
  if (!value) return undefined;
  const normalized = value.toLowerCase();
  if (normalized === "strict") return "Strict";
  if (normalized === "none" || normalized === "no_restriction") return "None";
  return "Lax";
}
