import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium, type Browser, type BrowserContext, type Cookie, type Page, type Response } from "playwright-core";
import { config } from "../core/config.js";
import type { AirlineCode, BrowserCookie, FlightOption, FlightSearchInput, HarnessSession, ScreenshotArtifact } from "../core/types.js";

export interface RenderedFlowResult {
  flights: FlightOption[];
  diagnostics: Record<string, unknown>;
}

export interface ScreenshotRequest {
  airline: AirlineCode;
  url: string;
  input: FlightSearchInput;
  session: HarnessSession;
  description: string;
}

interface CapturedPayload {
  url: string;
  contentType: string;
  body: unknown;
}

let browserPromise: Promise<Browser> | undefined;

export async function findRenderedFlights(params: {
  airline: AirlineCode;
  carrierCode: string;
  url: string;
  input: FlightSearchInput;
  session: HarnessSession;
}): Promise<RenderedFlowResult | undefined> {
  if (!config.browserWsEndpoint) return undefined;

  const browser = await getBrowser();
  const context = await browser.newContext({
    userAgent: params.session.userAgent,
    locale: params.input.locale ?? "en-GB",
    viewport: { width: 1440, height: 1100 },
    ignoreHTTPSErrors: true
  });

  try {
    await context.addCookies(toPlaywrightCookies(params.session.cookies, params.url));
    const page = await context.newPage();
    const captured: CapturedPayload[] = [];
    wireResponseCapture(page, params.input, captured);

    const response = await page.goto(params.url, {
      waitUntil: "domcontentloaded",
      timeout: config.renderedFlowTimeoutMs
    });

    await dismissCookieBanners(page);
    await settlePage(page);
    await dismissCookieBanners(page);

    const visibleText = await page.locator("body").innerText({ timeout: 5_000 }).catch(() => "");
    const flights = [
      ...extractFlightsFromPayloads(captured, params.airline, params.carrierCode, params.input),
      ...extractTextPrices(visibleText, params.airline, params.carrierCode, params.input, page.url())
    ];

    return {
      flights: uniqueFlights(flights),
      diagnostics: {
        renderedStatus: response?.status(),
        renderedUrl: page.url(),
        capturedResponseCount: captured.length,
        visibleTextLength: visibleText.length,
        visibleTextSample: visibleText.slice(0, 2_000)
      }
    };
  } finally {
    await context.close();
  }
}

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = chromium.connect(config.browserWsEndpoint!, { timeout: 20_000 }).catch((error) => {
      browserPromise = undefined;
      throw error;
    });
  }
  return browserPromise;
}

async function settlePage(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle", { timeout: config.renderedFlowSettleMs }).catch(() => undefined);
  await page.waitForTimeout(2_000);
}

function wireResponseCapture(page: Page, input: FlightSearchInput, captured: CapturedPayload[]): void {
  page.on("response", async (response: Response) => {
    if (captured.length >= 80) return;

    const request = response.request();
    const resourceType = request.resourceType();
    if (!["document", "fetch", "xhr"].includes(resourceType)) return;

    const contentType = response.headers()["content-type"] ?? "";
    if (!/json|text|javascript|html/i.test(contentType)) return;

    const url = response.url();
    const routeHint = new RegExp(`${input.origin}|${input.destination}|flight|fare|price|search|shopping`, "i");
    if (!routeHint.test(url) && captured.length > 20) return;

    try {
      const text = await response.text();
      if (!routeHint.test(text) && !/price|fare|amount|currency/i.test(text)) return;
      captured.push({
        url,
        contentType,
        body: parseMaybeJson(text)
      });
    } catch {
      // Ignore opaque or already-consumed responses.
    }
  });
}

function toPlaywrightCookies(cookies: BrowserCookie[], url: string): Cookie[] {
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

function sameSite(value?: string): "Strict" | "Lax" | "None" | undefined {
  if (!value) return undefined;
  const normalized = value.toLowerCase();
  if (normalized === "strict") return "Strict";
  if (normalized === "none" || normalized === "no_restriction") return "None";
  return "Lax";
}

function parseMaybeJson(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) return text;
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return text;
    }
  }
  return text;
}

function extractFlightsFromPayloads(
  payloads: CapturedPayload[],
  airline: AirlineCode,
  carrierCode: string,
  input: FlightSearchInput
): FlightOption[] {
  return payloads.flatMap((payload) =>
    collectObjects(payload.body)
      .map((value) => flightFromObject(value, airline, carrierCode, input, payload.url))
      .filter((value): value is FlightOption => Boolean(value))
  );
}

function collectObjects(value: unknown, output: Record<string, unknown>[] = [], seen = new WeakSet<object>()): Record<string, unknown>[] {
  if (value == null || typeof value !== "object") return output;
  if (seen.has(value)) return output;
  seen.add(value);

  if (!Array.isArray(value)) output.push(value as Record<string, unknown>);
  for (const child of Array.isArray(value) ? value : Object.values(value)) {
    collectObjects(child, output, seen);
  }
  return output;
}

function flightFromObject(
  value: Record<string, unknown>,
  airline: AirlineCode,
  carrierCode: string,
  input: FlightSearchInput,
  sourceUrl: string
): FlightOption | undefined {
  const flat = flatten(value);
  const origin = firstString(flat, ["origin", "originCode", "from", "departureAirport", "departureStation", "departure"]);
  const destination = firstString(flat, ["destination", "destinationCode", "to", "arrivalAirport", "arrivalStation", "arrival"]);
  const combined = JSON.stringify(value).toUpperCase();
  const routeMatch =
    [origin, destination].some(Boolean)
      ? routeMatchKind(origin, destination, input)
      : combined.includes(input.origin.toUpperCase()) && combined.includes(input.destination.toUpperCase())
        ? "outbound"
        : undefined;
  if (!routeMatch) return undefined;

  const price = firstNumberByKey(flat, /(total|price|fare|amount|sell|gross|lowest)/i);
  if (price == null || price < 5 || price > 25_000) return undefined;

  const departure =
    firstString(flat, ["departureDateTime", "departureTime", "departureDate", "date", "outboundDate"]) ?? input.dateOut;

  return {
    airline,
    origin: normalizeIata(origin) ?? input.origin.toUpperCase(),
    destination: normalizeIata(destination) ?? input.destination.toUpperCase(),
    departure: normalizeDeparture(departure, input.dateOut),
    arrival: firstString(flat, ["arrivalDateTime", "arrivalTime"]),
    flightNumber: firstString(flat, ["flightNumber", "marketingFlightNumber", "number"]),
    currency: firstString(flat, ["currency", "currencyCode", "isoCurrencyCode"]) ?? input.currency,
    price,
    fareClass: firstString(flat, ["fareClass", "bundle", "brand", "cabin"]) ?? "rendered-json",
    raw: {
      carrierCode,
      sourceUrl,
      object: value
    }
  };
}

function flatten(value: unknown, prefix = "", output = new Map<string, unknown>()): Map<string, unknown> {
  if (value == null || typeof value !== "object") {
    output.set(prefix, value);
    return output;
  }
  if (Array.isArray(value)) {
    value.slice(0, 12).forEach((child, index) => flatten(child, `${prefix}.${index}`, output));
    return output;
  }
  for (const [key, child] of Object.entries(value)) {
    flatten(child, prefix ? `${prefix}.${key}` : key, output);
  }
  return output;
}

function firstString(flat: Map<string, unknown>, preferredKeys: string[]): string | undefined {
  for (const key of preferredKeys) {
    const match = [...flat.entries()].find(([path, value]) => pathKey(path) === key.toLowerCase() && typeof value === "string");
    if (match) return String(match[1]);
  }
  return undefined;
}

function firstNumberByKey(flat: Map<string, unknown>, keyPattern: RegExp): number | undefined {
  for (const [path, value] of flat.entries()) {
    if (!keyPattern.test(path)) continue;
    const parsed = numberValue(value);
    if (parsed != null) return parsed;
  }
  return undefined;
}

function pathKey(path: string): string {
  return path.split(".").at(-1)?.toLowerCase() ?? path.toLowerCase();
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return undefined;
  const cleaned = value.replace(/[^\d.,]/g, "");
  if (!cleaned) return undefined;
  const normalized =
    cleaned.includes(",") && cleaned.includes(".")
      ? cleaned.replace(/,/g, "")
      : cleaned.includes(",")
        ? cleaned.replace(",", ".")
        : cleaned;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function routeMatchKind(
  origin: string | undefined,
  destination: string | undefined,
  input: FlightSearchInput
): "outbound" | "return" | undefined {
  const from = normalizeIata(origin);
  const to = normalizeIata(destination);
  const requestedOrigin = input.origin.toUpperCase();
  const requestedDestination = input.destination.toUpperCase();
  if (from === requestedOrigin && to === requestedDestination) return "outbound";
  if (input.dateIn && from === requestedDestination && to === requestedOrigin) return "return";

  const route = `${origin ?? ""} ${destination ?? ""}`.toUpperCase();
  if (route.includes(requestedOrigin) && route.includes(requestedDestination)) return "outbound";
  if (input.dateIn && route.includes(requestedDestination) && route.includes(requestedOrigin)) return "return";
  return undefined;
}

function normalizeIata(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const upper = value.toUpperCase();
  const exact = upper.match(/^[A-Z]{3}$/);
  if (exact) return upper;
  return upper.match(/\b[A-Z]{3}\b/)?.[0];
}

function normalizeDeparture(value: string, dateOut: string): string {
  if (/^\d{2}:\d{2}/.test(value)) return `${dateOut}T${value}`;
  return value;
}

function extractTextPrices(
  text: string,
  airline: AirlineCode,
  carrierCode: string,
  input: FlightSearchInput,
  resolvedUrl: string
): FlightOption[] {
  const currencies = [input.currency, "EUR", "GBP", "USD", "QAR", "€", "£", "$", "QR"].filter(Boolean) as string[];
  const candidates: FlightOption[] = [];
  for (const currency of currencies) {
    const patterns = [
      new RegExp(`${escapeRegExp(currency)}\\s*([0-9][0-9,.]{1,10})`, "gi"),
      new RegExp(`([0-9][0-9,.]{1,10})\\s*${escapeRegExp(currency)}`, "gi")
    ];
    for (const pattern of patterns) {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(text)) !== null) {
        const price = numberValue(match[1]);
        if (price == null || price < 5 || price > 25_000) continue;
        const context = text.slice(Math.max(0, match.index - 250), Math.min(text.length, match.index + 300));
        if (!looksLikeRoutePrice(context, input)) continue;
        candidates.push({
          airline,
          origin: input.origin.toUpperCase(),
          destination: input.destination.toUpperCase(),
          departure: input.dateOut,
          currency: normalizeCurrency(match[0], input.currency),
          price,
          fareClass: "rendered-text",
          raw: { carrierCode, resolvedUrl, context }
        });
      }
    }
  }
  return candidates;
}

function looksLikeRoutePrice(context: string, input: FlightSearchInput): boolean {
  const lowered = context.toLowerCase();
  return (
    lowered.includes(input.origin.toLowerCase()) &&
    lowered.includes(input.destination.toLowerCase()) &&
    /(flight|fare|price|select|economy|basic|light|standard|total|depart)/i.test(context) &&
    !/(hotel|car rental|holiday|gift card|subscription|cookie|privacy)/i.test(context)
  );
}

function normalizeCurrency(rawMatch: string, fallback?: string): string | undefined {
  if (rawMatch.includes("£")) return "GBP";
  if (rawMatch.includes("€")) return "EUR";
  if (/\bQAR\b|\bQR\b/i.test(rawMatch)) return "QAR";
  if (rawMatch.includes("$")) return fallback ?? "USD";
  const iso = rawMatch.match(/\b[A-Z]{3}\b/);
  return iso?.[0] ?? fallback;
}

function uniqueFlights(flights: FlightOption[]): FlightOption[] {
  const unique = new Map<string, FlightOption>();
  for (const flight of flights) {
    const key = [
      flight.airline,
      flight.origin,
      flight.destination,
      flight.departure,
      flight.arrival,
      flight.flightNumber,
      flight.currency,
      flight.price,
      flight.fareClass
    ].join("|");
    if (!unique.has(key)) unique.set(key, flight);
  }
  return [...unique.values()].sort((a, b) => (a.price ?? 0) - (b.price ?? 0)).slice(0, 30);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function dismissCookieBanners(page: Page): Promise<void> {
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
    if (await clickLocatorIfVisible(page.locator(selector).first())) return;
  }

  for (const label of labels) {
    if (await clickLocatorIfVisible(page.getByRole("button", { name: label, exact: true }).first())) return;
  }

  await clickLocatorIfVisible(
    page
      .getByRole("button", {
        name: /^(accept all|accept all cookies|accept cookies|allow all|agree|i agree|yes, i agree|continue|got it|ok)$/i
      })
      .first()
  );
}

async function clickLocatorIfVisible(locator: ReturnType<Page["locator"]>): Promise<boolean> {
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

export async function capturePricingScreenshot(request: ScreenshotRequest): Promise<ScreenshotArtifact | undefined> {
  if (!config.browserWsEndpoint) return undefined;

  const browser = await getBrowser();
  const context = await browser.newContext({
    userAgent: request.session.userAgent,
    locale: request.input.locale ?? "en-GB",
    viewport: { width: 1440, height: 1100 },
    ignoreHTTPSErrors: true
  });

  try {
    await context.addCookies(toPlaywrightCookies(request.session.cookies, request.url));
    const page = await context.newPage();
    const response = await page.goto(request.url, {
      waitUntil: "domcontentloaded",
      timeout: config.renderedFlowTimeoutMs
    });
    await dismissCookieBanners(page);
    await settlePage(page);
    await dismissCookieBanners(page);

    const relativeDir = path.join("artifacts", "screenshots");
    const dir = path.resolve(relativeDir);
    await mkdir(dir, { recursive: true });
    const fileName = [
      request.airline,
      request.input.origin.toUpperCase(),
      request.input.destination.toUpperCase(),
      request.input.dateOut,
      new Date().toISOString().replace(/[:.]/g, "-")
    ].join("_");
    const relativePath = path.join(relativeDir, `${fileName}.png`);
    const filePath = path.resolve(relativePath);
    await page.screenshot({ path: filePath, fullPage: true });

    return {
      path: relativePath,
      url: page.url() || response?.url() || request.url,
      capturedAt: new Date().toISOString(),
      description: request.description
    };
  } finally {
    await context.close();
  }
}
