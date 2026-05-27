import type { FlightOption, FlightSearchInput } from "../core/types.js";
import { BrowserFlowAdapter } from "./browser-flow.js";

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
      extractFlights: extractQatarFlights
    });
  }
}

export function extractQatarFlights(html: string, input: FlightSearchInput): FlightOption[] {
  const text = html
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&euro;/g, "€")
    .replace(/&#8364;/g, "€")
    .replace(/\s+/g, " ")
    .trim();
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
        durationAndStops: durationAndStops.trim(),
        context: text.slice(Math.max(0, match.index - 80), Math.min(text.length, match.index + 220))
      }
    });
  }

  return [...flights.values()].sort((a, b) => (a.price ?? 0) - (b.price ?? 0));
}
