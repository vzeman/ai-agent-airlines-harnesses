import { cookieHeader, FlareSolverrClient } from "../core/flaresolverr.js";
import { ManualInterventionRequired } from "../core/errors.js";
import type { AirlineAdapter, FlightOption, FlightSearchInput, HarnessSession } from "../core/types.js";
import { extractPriceCandidates } from "./browser-flow.js";
import { findRenderedFlights } from "./rendered-browser.js";

const DEFAULT_LOCALE = "en-gb";

export class WizzairAdapter implements AirlineAdapter {
  code = "wizzair" as const;
  baseUrl = "https://wizzair.com";

  constructor(private readonly flaresolverr = new FlareSolverrClient()) {}

  async resolveSession(sessionId: string): Promise<HarnessSession> {
    const solution = await this.flaresolverr.get({
      url: `${this.baseUrl}/${DEFAULT_LOCALE}`,
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
    const locale = input.locale ?? DEFAULT_LOCALE;
    const payload = {
      isFlightChange: false,
      flightList: [
        {
          departureStation: input.origin.toUpperCase(),
          arrivalStation: input.destination.toUpperCase(),
          departureDate: input.dateOut
        }
      ],
      adultCount: input.adults ?? 1,
      childCount: input.children ?? 0,
      infantCount: input.infants ?? 0,
      wdc: false
    };

    const response = await fetch(`${this.baseUrl}/Api/search/search`, {
      method: "POST",
      headers: {
        accept: "application/json, text/plain, */*",
        "accept-language": locale,
        "content-type": "application/json;charset=UTF-8",
        cookie: cookieHeader(session.cookies, "wizzair.com"),
        origin: this.baseUrl,
        referer: `${this.baseUrl}/${locale}`,
        "user-agent": session.userAgent ?? "Mozilla/5.0"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const text = await response.text();
      if (response.status === 404) {
        const bookingUrl = this.bookingUrl(input);
        const solution = await this.flaresolverr.get({
          url: bookingUrl,
          session: session.id,
          waitInSeconds: 5,
          disableMedia: false
        });
        const extracted = extractPriceCandidates(solution.response ?? "", input, this.code, "W6", solution.url);
        if (extracted.length > 0) return extracted;

        let renderedDiagnostics: Record<string, unknown> | undefined;
        try {
          const rendered = await findRenderedFlights({
            airline: this.code,
            carrierCode: "W6",
            url: solution.url || bookingUrl,
            input,
            session
          });
          if (rendered?.flights.length) return rendered.flights;
          renderedDiagnostics = rendered?.diagnostics;
        } catch (error) {
          renderedDiagnostics = {
            renderedError: error instanceof Error ? error.message : String(error)
          };
        }

        throw new ManualInterventionRequired("Wizz Air's historical search API returned the live website 404 page.", {
          airline: this.code,
          attemptedUrl: `${this.baseUrl}/Api/search/search`,
          bookingUrl,
          resolvedStatus: solution.status,
          resolvedUrl: solution.url,
          rendered: renderedDiagnostics,
          nextHarnessStep:
            "Add a Wizz-specific Playwright script that fills the search form and extracts the select-flight cards."
        });
      }
      throw new Error(`Wizz Air search HTTP ${response.status}: ${text.slice(0, 300)}`);
    }

    const data = await response.json();
    return parseWizzAvailability(data, input);
  }

  private bookingUrl(input: FlightSearchInput): string {
    const origin = input.origin.toUpperCase();
    const destination = input.destination.toUpperCase();
    const dateIn = input.dateIn ?? "null";
    const adults = input.adults ?? 1;
    const children = input.children ?? 0;
    const infants = input.infants ?? 0;
    return `${this.baseUrl}/${DEFAULT_LOCALE}/booking/select-flight/${origin}/${destination}/${input.dateOut}/${dateIn}/${adults}/${children}/${infants}/null`;
  }
}

function parseWizzAvailability(data: unknown, input: FlightSearchInput): FlightOption[] {
  const outboundFlights = firstNonEmptyArray(
    read(data, ["outboundFlights"]),
    read(data, ["data", "outboundFlights"]),
    read(data, ["flightList", 0, "flightOptions"])
  );
  const flights: FlightOption[] = [];

  for (const flight of outboundFlights) {
    const priceValue =
      numberOrUndefined(read(flight, ["price", "amount"])) ??
      numberOrUndefined(read(flight, ["fareSellKey", "price"])) ??
      numberOrUndefined(read(flight, ["price"]));

    flights.push({
      airline: "wizzair",
      origin: String(read(flight, ["departureStation"]) ?? read(flight, ["origin"]) ?? input.origin).toUpperCase(),
      destination: String(read(flight, ["arrivalStation"]) ?? read(flight, ["destination"]) ?? input.destination).toUpperCase(),
      departure: String(read(flight, ["departureDateTime"]) ?? read(flight, ["departure"]) ?? input.dateOut),
      arrival: stringOrUndefined(read(flight, ["arrivalDateTime"]) ?? read(flight, ["arrival"])),
      flightNumber: stringOrUndefined(read(flight, ["flightNumber"])),
      currency: stringOrUndefined(read(flight, ["price", "currencyCode"]) ?? read(flight, ["currencyCode"])) ?? input.currency,
      price: priceValue,
      fareClass: stringOrUndefined(read(flight, ["bundle"]) ?? read(flight, ["fareClass"])),
      raw: flight
    });
  }

  return flights;
}

function read(value: unknown, path: Array<string | number>): unknown {
  return path.reduce<unknown>((current, key) => {
    if (current == null) return undefined;
    if (typeof key === "number" && Array.isArray(current)) return current[key];
    if (typeof current === "object" && key in current) return (current as Record<string, unknown>)[key];
    return undefined;
  }, value);
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function firstNonEmptyArray(...values: unknown[]): unknown[] {
  for (const value of values) {
    const array = asArray(value);
    if (array.length > 0) return array;
  }
  return [];
}

function numberOrUndefined(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
