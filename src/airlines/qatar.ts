import type { FlightOption, FlightSearchInput } from "../core/types.js";
import type { BrowserFlowExtractContext } from "./browser-flow.js";
import { BrowserFlowAdapter } from "./browser-flow.js";

export interface QatarExtractionOptions {
  resolvedUrl?: string;
  extractionSource?: "flaresolverr-html" | "rendered-browser";
}

export class QatarAdapter extends BrowserFlowAdapter {
  constructor() {
    super({
      code: "qatar",
      carrierCode: "QR",
      displayName: "Qatar Airways",
      baseUrl: "https://www.qatarairways.com",
      sessionPath: "/en/homepage.html",
      buildBookingUrl: (input, baseUrl) => {
        const params = new URLSearchParams({
          tripType: input.dateIn ? "R" : "O",
          fromStation: input.origin.toUpperCase(),
          toStation: input.destination.toUpperCase(),
          departing: input.dateOut,
          returning: input.dateIn ?? "",
          adults: String(input.adults ?? 1),
          children: String(input.children ?? 0),
          infants: String(input.infants ?? 0),
          cabinClass: "E"
        });
        return `${baseUrl}/app/booking/flight-selection?${params.toString()}`;
      },
      extractFlights: (html, input, context) => extractQatarFlights(html, input, qatarExtractionOptions(context))
    });
  }
}

function qatarExtractionOptions(context: BrowserFlowExtractContext): QatarExtractionOptions {
  return {
    resolvedUrl: context.resolvedUrl,
    extractionSource: "flaresolverr-html"
  };
}

export function extractQatarFlights(html: string, input: FlightSearchInput, options: QatarExtractionOptions = {}): FlightOption[] {
  const text = normalizeQatarText(html);
  const origin = input.origin.toUpperCase();
  const destination = input.destination.toUpperCase();
  const cardPattern = new RegExp(
    `(\\d{2}:\\d{2})\\s+${origin}\\s+([^,]+,\\s*[^€]{1,40}?)\\s+(\\d{2}:\\d{2})(\\s+\\+\\d)?\\s+${destination}\\s+Flight details\\s+€([0-9][0-9,]*)\\s+Economy`,
    "gi"
  );
  const flights = new Map<string, FlightOption>();

  let match: RegExpExecArray | null;
  while ((match = cardPattern.exec(text)) !== null) {
    const [, departureTime, durationAndStops, arrivalTime, arrivalDayOffset = "", rawPrice] = match;
    const price = Number(rawPrice.replace(/,/g, ""));
    if (!Number.isFinite(price)) continue;

    const key = `${departureTime}-${arrivalTime}-${price}`;
    if (flights.has(key)) continue;

    flights.set(key, {
      airline: "qatar",
      origin,
      destination,
      departure: `${input.dateOut}T${departureTime}:00`,
      arrival: `${arrivalTime}${arrivalDayOffset}`.trim(),
      currency: "EUR",
      price,
      fareClass: "economy",
      raw: {
        carrierCode: "QR",
        extractionSource: options.extractionSource ?? "flaresolverr-html",
        sourceMethod: "qatar-booking-html-card-parser",
        sourceUrl: options.resolvedUrl,
        durationAndStops: durationAndStops.trim(),
        context: text.slice(Math.max(0, match.index - 80), Math.min(text.length, match.index + 220))
      }
    });
  }

  return [...flights.values()].sort((a, b) => (a.price ?? 0) - (b.price ?? 0));
}

export function classifyQatarPageState(html: string): "booking_results" | "access_denied" | "no_price_found" {
  const text = normalizeQatarText(html);
  if (/access denied|request blocked|reference #[a-z0-9-]+/i.test(text)) return "access_denied";
  if (/Flight details\s+€[0-9][0-9,]*\s+Economy/i.test(text)) return "booking_results";
  return "no_price_found";
}

function normalizeQatarText(html: string): string {
  return html
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&euro;/g, "€")
    .replace(/&#8364;/g, "€")
    .replace(/\s+/g, " ")
    .trim();
}
