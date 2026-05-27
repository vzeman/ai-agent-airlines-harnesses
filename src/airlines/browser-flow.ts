import { FlareSolverrClient } from "../core/flaresolverr.js";
import { ManualInterventionRequired } from "../core/errors.js";
import type { AirlineAdapter, AirlineCode, FlightOption, FlightSearchInput, HarnessSession } from "../core/types.js";
import { findRenderedFlights } from "./rendered-browser.js";

export interface BrowserFlowConfig {
  code: AirlineCode;
  carrierCode: string;
  displayName: string;
  baseUrl: string;
  sessionPath: string;
  buildBookingUrl: (input: FlightSearchInput, baseUrl: string) => string;
  extractFlights?: (html: string, input: FlightSearchInput, context: BrowserFlowExtractContext) => FlightOption[];
  nextHarnessStep?: string;
}

export interface BrowserFlowExtractContext {
  airline: AirlineCode;
  carrierCode: string;
  resolvedUrl: string;
}

export class BrowserFlowAdapter implements AirlineAdapter {
  readonly code: AirlineCode;
  readonly baseUrl: string;

  constructor(
    private readonly settings: BrowserFlowConfig,
    private readonly flaresolverr = new FlareSolverrClient()
  ) {
    this.code = settings.code;
    this.baseUrl = settings.baseUrl;
  }

  async resolveSession(sessionId: string): Promise<HarnessSession> {
    const solution = await this.flaresolverr.get({
      url: `${this.baseUrl}${this.settings.sessionPath}`,
      session: sessionId,
      returnOnlyCookies: true
    });

    return {
      id: sessionId,
      airline: this.code,
      baseUrl: this.baseUrl,
      userAgent: solution.userAgent,
      cookies: solution.cookies ?? []
    };
  }

  async findFlights(input: FlightSearchInput, session: HarnessSession): Promise<FlightOption[]> {
    const bookingUrl = this.settings.buildBookingUrl(input, this.baseUrl);
    const solution = await this.flaresolverr.get({
      url: bookingUrl,
      session: session.id,
      waitInSeconds: 4,
      disableMedia: false
    });
    const html = solution.response ?? "";
    const extracted =
      this.settings.extractFlights?.(html, input, {
        airline: this.code,
        carrierCode: this.settings.carrierCode,
        resolvedUrl: solution.url
      }) ?? extractPriceCandidates(html, input, this.code, this.settings.carrierCode, solution.url);

    if (extracted.length > 0) {
      return extracted;
    }

    let renderedDiagnostics: Record<string, unknown> | undefined;
    try {
      const rendered = await findRenderedFlights({
        airline: this.code,
        carrierCode: this.settings.carrierCode,
        url: solution.url || bookingUrl,
        input,
        session
      });
      if (rendered?.flights.length) {
        return rendered.flights;
      }
      renderedDiagnostics = rendered?.diagnostics;
    } catch (error) {
      renderedDiagnostics = {
        renderedError: error instanceof Error ? error.message : String(error)
      };
    }

    throw new ManualInterventionRequired(
      `${this.settings.displayName} priced shopping needs the live booking flow or partner/NDC credentials.`,
      {
        airline: this.code,
        carrierCode: this.settings.carrierCode,
        bookingUrl,
        resolvedStatus: solution.status,
        resolvedUrl: solution.url,
        cookieCount: session.cookies.length,
        rendered: renderedDiagnostics,
        nextHarnessStep:
          this.settings.nextHarnessStep ??
          "Add browser automation for this booking URL, or configure a partner/NDC priced-shopping API."
      }
    );
  }
}

export function ymdToMdy(date: string): string {
  const [year, month, day] = date.split("-");
  return `${month}/${day}/${year}`;
}

export function extractPriceCandidates(
  html: string,
  input: FlightSearchInput,
  airline: AirlineCode,
  carrierCode: string,
  resolvedUrl: string
): FlightOption[] {
  const text = normalizePageText(html);
  const currencyHints = [
    input.currency,
    "EUR",
    "GBP",
    "USD",
    "QAR",
    "£",
    "€",
    "$",
    "QR",
    "QAR"
  ].filter(Boolean) as string[];
  const patterns = currencyHints.flatMap((currency) => [
    new RegExp(`${escapeRegExp(currency)}\\s*([0-9][0-9,.]{1,10})`, "gi"),
    new RegExp(`([0-9][0-9,.]{1,10})\\s*${escapeRegExp(currency)}`, "gi")
  ]);
  const candidates = new Map<string, FlightOption>();

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const rawAmount = match[1];
      const price = parsePrice(rawAmount);
      if (price == null || price < 5 || price > 25_000) continue;

      const context = text.slice(Math.max(0, match.index - 160), Math.min(text.length, match.index + 220));
      if (!looksLikeFlightPriceContext(context, input)) continue;

      const currency = normalizeCurrency(match[0], input.currency);
      const key = `${currency}:${price}:${context.slice(0, 80)}`;
      if (candidates.has(key)) continue;

      candidates.set(key, {
        airline,
        origin: input.origin.toUpperCase(),
        destination: input.destination.toUpperCase(),
        departure: input.dateOut,
        currency,
        price,
        fareClass: "page-price-candidate",
        raw: {
          carrierCode,
          resolvedUrl,
          context
        }
      });
    }
  }

  return [...candidates.values()].sort((a, b) => (a.price ?? 0) - (b.price ?? 0)).slice(0, 10);
}

function normalizePageText(html: string): string {
  return html
    .replace(/<script\b[^>]*>/gi, " <script> ")
    .replace(/<\/script>/gi, " </script> ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&pound;/g, "£")
    .replace(/&euro;/g, "€")
    .replace(/&#163;/g, "£")
    .replace(/&#8364;/g, "€")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function looksLikeFlightPriceContext(context: string, input: FlightSearchInput): boolean {
  const lowered = context.toLowerCase();
  const positiveSignals = ["fare", "flight", "price", "total", "economy", "basic", "cabin", "select", "depart"];
  const negativeSignals = [
    "cookie",
    "privacy",
    "baggage allowance",
    "gift card",
    "hotel",
    "car rental",
    "holidays",
    "package",
    "avios",
    "american express",
    "welcome bonus",
    "maldives",
    "caribbean",
    "usa flights",
    "from london"
  ];
  const routeSignals = [input.origin, input.destination].map((value) => value.toLowerCase());
  return (
    positiveSignals.some((signal) => lowered.includes(signal)) &&
    routeSignals.some((signal) => lowered.includes(signal)) &&
    !negativeSignals.some((signal) => lowered.includes(signal))
  );
}

function parsePrice(raw: string): number | undefined {
  const cleaned = raw.replace(/\s/g, "");
  const normalized =
    cleaned.includes(",") && cleaned.includes(".")
      ? cleaned.replace(/,/g, "")
      : cleaned.includes(",")
        ? /\d,\d{3}($|\D)/.test(cleaned)
          ? cleaned.replace(/,/g, "")
          : cleaned.replace(",", ".")
        : cleaned;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : undefined;
}

function normalizeCurrency(rawMatch: string, fallback?: string): string | undefined {
  if (rawMatch.includes("£")) return "GBP";
  if (rawMatch.includes("€")) return "EUR";
  if (/\bQAR\b|\bQR\b/i.test(rawMatch)) return "QAR";
  if (rawMatch.includes("$")) return fallback ?? "USD";
  const iso = rawMatch.match(/\b[A-Z]{3}\b/);
  return iso?.[0] ?? fallback;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
