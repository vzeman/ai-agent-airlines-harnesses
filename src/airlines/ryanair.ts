import { cookieHeader, FlareSolverrClient } from "../core/flaresolverr.js";
import type { AirlineAdapter, FlightOption, FlightSearchInput, HarnessSession } from "../core/types.js";

const DEFAULT_LOCALE = "en-gb";

export class RyanairAdapter implements AirlineAdapter {
  code = "ryanair" as const;
  baseUrl = "https://www.ryanair.com";

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
    const fares = await this.findFareFinderFlights(input, session);
    if (fares) return fares;
    return this.findAvailabilityFlights(input, session);
  }

  private async findFareFinderFlights(input: FlightSearchInput, session: HarnessSession): Promise<FlightOption[] | null> {
    const month = `${input.dateOut.slice(0, 7)}-01`;
    const currency = input.currency ?? "EUR";
    const url = `${this.baseUrl}/api/farfnd/v4/oneWayFares/${input.origin.toUpperCase()}/${input.destination.toUpperCase()}/cheapestPerDay?${new URLSearchParams({
      outboundMonthOfDate: month,
      currency
    }).toString()}`;

    const response = await fetch(url, {
      headers: this.headers(session, input.locale ?? DEFAULT_LOCALE)
    });
    if (!response.ok) return null;

    const data = await response.json();
    return parseRyanairFareFinder(data, input);
  }

  private async findAvailabilityFlights(input: FlightSearchInput, session: HarnessSession): Promise<FlightOption[]> {
    const locale = input.locale ?? DEFAULT_LOCALE;
    const params = new URLSearchParams({
      ADT: String(input.adults ?? 1),
      TEEN: String(input.teens ?? 0),
      CHD: String(input.children ?? 0),
      INF: String(input.infants ?? 0),
      Origin: input.origin.toUpperCase(),
      Destination: input.destination.toUpperCase(),
      DateOut: input.dateOut,
      DateIn: input.dateIn ?? "",
      Disc: "0",
      promoCode: "",
      IncludeConnectingFlights: "false",
      FlexDaysBeforeOut: String(input.flexDaysBeforeOut ?? 3),
      FlexDaysOut: String(input.flexDaysOut ?? 3),
      FlexDaysBeforeIn: "3",
      FlexDaysIn: "3",
      RoundTrip: String(Boolean(input.dateIn)),
      ToUs: "AGREED",
      exists: "false"
    });
    if (input.currency) params.set("currency", input.currency);

    const url = `${this.baseUrl}/api/booking/v4/${locale}/availability?${params.toString()}`;
    const response = await fetch(url, {
      headers: this.headers(session, locale)
    });

    if (response.ok) {
      const data = await response.json();
      return parseRyanairAvailability(data, input);
    }

    const declinedText = await response.text();
    const solution = await this.flaresolverr.get({
      url,
      session: session.id,
      waitInSeconds: 1,
      disableMedia: true
    });
    if (solution.status < 200 || solution.status >= 300 || !solution.response) {
      throw new Error(
        `Ryanair availability HTTP ${response.status}: ${declinedText.slice(0, 200)}; browser fallback HTTP ${solution.status}`
      );
    }

    const data = JSON.parse(solution.response);
    return parseRyanairAvailability(data, input);
  }

  private headers(session: HarnessSession, locale: string): Record<string, string> {
    return {
      accept: "application/json, text/plain, */*",
      "accept-language": locale.replace("-", "_"),
      cookie: cookieHeader(session.cookies, "ryanair.com"),
      referer: `${this.baseUrl}/${locale}`,
      "user-agent": session.userAgent ?? "Mozilla/5.0"
    };
  }
}

export function parseRyanairFareFinder(data: unknown, input: FlightSearchInput): FlightOption[] {
  const fares = asArray(read(data, ["outbound", "fares"]));
  const wantedDays = dayWindow(input.dateOut, input.flexDaysBeforeOut ?? 0, input.flexDaysOut ?? 0);
  const flights: FlightOption[] = [];

  for (const fare of fares) {
    const day = stringOrUndefined(read(fare, ["day"]));
    if (!day || !wantedDays.has(day)) continue;
    if (read(fare, ["unavailable"]) === true || read(fare, ["soldOut"]) === true) continue;

    const price = read(fare, ["price"]);
    flights.push({
      airline: "ryanair",
      origin: input.origin.toUpperCase(),
      destination: input.destination.toUpperCase(),
      departure: stringOrUndefined(read(fare, ["departureDate"])) ?? day,
      arrival: stringOrUndefined(read(fare, ["arrivalDate"])),
      currency: stringOrUndefined(read(price, ["currencyCode"])) ?? input.currency,
      price: numberOrUndefined(read(price, ["value"])),
      fareClass: "fare-finder",
      raw: fare
    });
  }

  return flights.sort((a, b) => a.departure.localeCompare(b.departure));
}

export function parseRyanairAvailability(data: unknown, input: FlightSearchInput): FlightOption[] {
  const trips = asArray(read(data, ["trips"]));
  const flights: FlightOption[] = [];

  for (const trip of trips) {
    const dates = asArray(read(trip, ["dates"]));
    for (const date of dates) {
      const dateOut = read(date, ["dateOut"]);
      const dateFlights = asArray(read(date, ["flights"]));
      for (const flight of dateFlights) {
        const regularFare = read(flight, ["regularFare"]);
        const fares = asArray(read(regularFare, ["fares"]));
        const firstFare = fares[0] as Record<string, unknown> | undefined;
        const amount = numberOrUndefined(read(firstFare, ["amount"])) ?? numberOrUndefined(read(regularFare, ["amount"]));

        flights.push({
          airline: "ryanair",
          origin: String(read(flight, ["origin"]) ?? input.origin).toUpperCase(),
          destination: String(read(flight, ["destination"]) ?? input.destination).toUpperCase(),
          departure: String(read(flight, ["time", 0]) ?? read(flight, ["timeUTC", 0]) ?? dateOut ?? input.dateOut),
          arrival: stringOrUndefined(read(flight, ["time", 1]) ?? read(flight, ["timeUTC", 1])),
          flightNumber: stringOrUndefined(read(flight, ["flightNumber"])),
          currency: stringOrUndefined(read(regularFare, ["currency"]) ?? read(firstFare, ["currency"])) ?? input.currency,
          price: amount,
          fareClass: stringOrUndefined(read(firstFare, ["type"])) ?? "regular",
          raw: flight
        });
      }
    }
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

function dayWindow(date: string, before: number, after: number): Set<string> {
  const result = new Set<string>();
  const base = new Date(`${date}T00:00:00Z`);
  for (let offset = -before; offset <= after; offset += 1) {
    const current = new Date(base);
    current.setUTCDate(base.getUTCDate() + offset);
    result.add(current.toISOString().slice(0, 10));
  }
  return result;
}
