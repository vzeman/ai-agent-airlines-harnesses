import type { AirlineCode, FlightSearchInput } from "../core/types.js";
import { FlareSolverrClient } from "../core/flaresolverr.js";
import { ManualInterventionRequired } from "../core/errors.js";
import type { FlightOption, HarnessSession } from "../core/types.js";
import { BrowserFlowAdapter } from "./browser-flow.js";

interface LufthansaGroupConfig {
  code: Extract<AirlineCode, "lufthansa" | "austrian">;
  carrierCode: "LH" | "OS";
  baseUrl: string;
  localePath: string;
}

interface RouteOfferLookup {
  flights: FlightOption[];
  diagnostics: Record<string, unknown>;
}

export class LufthansaGroupAdapter extends BrowserFlowAdapter {
  private readonly groupSettings: LufthansaGroupConfig;
  private readonly groupFlaresolverr = new FlareSolverrClient();

  constructor(settings: LufthansaGroupConfig) {
    super({
      code: settings.code,
      carrierCode: settings.carrierCode,
      displayName: settings.code,
      baseUrl: settings.baseUrl,
      sessionPath: settings.localePath,
      buildBookingUrl: (input, baseUrl) => buildLufthansaGroupBookingUrl(settings.code, input, baseUrl),
      nextHarnessStep: "Add browser automation for this booking URL, or configure a Lufthansa Group partner/NDC shopping API."
    });
    this.groupSettings = settings;
  }

  override async findFlights(input: FlightSearchInput, session: HarnessSession): Promise<FlightOption[]> {
    try {
      return await super.findFlights(input, session);
    } catch (error) {
      if (!(error instanceof ManualInterventionRequired)) throw error;

      const routeOffer = await this.findOfficialRouteOffer(input, session);
      if (routeOffer.flights.length > 0) return routeOffer.flights;

      throw new ManualInterventionRequired(
        `${this.groupSettings.code} priced shopping could not extract an exact fare from the live booking flow.`,
        {
          ...error.diagnostics,
          routeOffer: routeOffer.diagnostics,
          blocker:
            "The live booking page rendered without structured fare results, and the official route-offer page did not expose a parseable lowest fare.",
          retryable: false,
          nextHarnessStep:
            "Implement a Lufthansa Group form-driving flow that selects origin, destination, date, and passengers in the rendered page, or configure partner/NDC priced-shopping credentials."
        }
      );
    }
  }

  private async findOfficialRouteOffer(input: FlightSearchInput, session: HarnessSession): Promise<RouteOfferLookup> {
    const routePageUrl = buildOfficialRoutePageUrl(this.groupSettings.code, input);
    if (!routePageUrl) {
      return {
        flights: [],
        diagnostics: {
          attempted: false,
          reason: "unsupported_route_offer_slug",
          origin: input.origin.toUpperCase(),
          destination: input.destination.toUpperCase()
        }
      };
    }

    const solution = await this.groupFlaresolverr.get({
      url: routePageUrl,
      session: session.id,
      waitInSeconds: 3,
      disableMedia: true
    });

    const response = solution.response ?? "";
    const flights = parseLufthansaGroupOfferPage(response, input, this.groupSettings.code, this.groupSettings.carrierCode, solution.url);
    return {
      flights,
      diagnostics: {
        attempted: true,
        routePageUrl,
        resolvedUrl: solution.url,
        status: solution.status,
        responseLength: response.length,
        parsedOfferCount: flights.length,
        pageState: classifyLufthansaGroupRoutePage(response)
      }
    };
  }
}

function buildLufthansaGroupBookingUrl(
  code: Extract<AirlineCode, "lufthansa" | "austrian">,
  input: FlightSearchInput,
  baseUrl: string
): string {
  const origin = input.origin.toUpperCase();
  const destination = input.destination.toUpperCase();
  const adults = input.adults ?? 1;
  const children = input.children ?? 0;
  const infants = input.infants ?? 0;

  if (code === "austrian") {
    const params = new URLSearchParams({
      departure: origin,
      destination,
      departureDate: input.dateOut,
      returnDate: input.dateIn ?? "",
      adults: String(adults),
      children: String(children),
      infants: String(infants),
      cabin: "ECONOMY"
    });
    return `${baseUrl}/xx/en/flight-search?${params.toString()}`;
  }

  const params = new URLSearchParams({
    origin,
    destination,
    outboundDate: input.dateOut,
    returnDate: input.dateIn ?? "",
    adults: String(adults),
    children: String(children),
    infants: String(infants),
    cabin: "ECONOMY"
  });
  return `${baseUrl}/xx/en/flight-search?${params.toString()}`;
}

function buildOfficialRoutePageUrl(code: Extract<AirlineCode, "lufthansa" | "austrian">, input: FlightSearchInput): string | undefined {
  const origin = input.origin.toUpperCase();
  const destination = input.destination.toUpperCase();
  const cityRoute = cityRouteSlug(origin, destination);
  if (!cityRoute) return undefined;

  const host = code === "austrian" ? "https://www.austrian.com" : "https://www.lufthansa.com";
  return `${host}/lhg/us/en/o-d/cy-cy/${cityRoute}`;
}

function cityRouteSlug(origin: string, destination: string): string | undefined {
  const route = `${origin}-${destination}`;
  const routes: Record<string, string> = {
    "VIE-EWR": "vienna-new-york",
    "VIE-JFK": "vienna-new-york",
    "VIE-NYC": "vienna-new-york",
    "VIE-LHR": "vienna-london",
    "VIE-LGW": "vienna-london",
    "VIE-LTN": "vienna-london",
    "VIE-STN": "vienna-london",
    "VIE-LON": "vienna-london",
    "VIE-FRA": "vienna-frankfurt"
  };
  return routes[route];
}

export function parseLufthansaGroupOfferPage(
  html: string,
  input: FlightSearchInput,
  airline: Extract<AirlineCode, "lufthansa" | "austrian">,
  carrierCode: "LH" | "OS",
  sourceUrl: string
): FlightOption[] {
  const text = normalizeLufthansaGroupText(html);

  const priceMatch =
    text.match(/Cheapest flight\s+from\s+([€$£])\s*([0-9][0-9,.]*)/i) ??
    text.match(/from\s+([€$£])\s*([0-9][0-9,.]*)/i);
  if (!priceMatch) return [];

  const price = Number(priceMatch[2].replace(/,/g, ""));
  if (!Number.isFinite(price)) return [];

  const scheduled = parseAustrianNewYorkSchedule(text, input);
  return [
    {
      airline,
      origin: input.origin.toUpperCase(),
      destination: input.destination.toUpperCase(),
      departure: scheduled?.departure ?? input.dateOut,
      arrival: scheduled?.arrival,
      flightNumber: scheduled?.flightNumber,
      currency: currencyFromSymbol(priceMatch[1]) ?? input.currency,
      price,
      fareClass: "official-route-offer",
      raw: {
        carrierCode,
        sourceUrl,
        caveat:
          "Official Lufthansa Group route page offer. This is the published lowest route offer, not a guaranteed live seat quote for the exact departure date until the booking flow is completed.",
        context: text.slice(Math.max(0, priceMatch.index ?? 0), Math.min(text.length, (priceMatch.index ?? 0) + 500))
      }
    }
  ];
}

export function classifyLufthansaGroupRoutePage(html: string): "offer" | "page_not_found" | "no_price_found" {
  const text = normalizeLufthansaGroupText(html);
  if (/page (could )?not (be )?found|page not found/i.test(text)) return "page_not_found";
  if (/Cheapest flight\s+from\s+[€$£]\s*[0-9]|from\s+[€$£]\s*[0-9]/i.test(text)) return "offer";
  return "no_price_found";
}

function normalizeLufthansaGroupText(html: string): string {
  return html
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&euro;/g, "€")
    .replace(/&#8364;/g, "€")
    .replace(/\s+/g, " ")
    .trim();
}

function parseAustrianNewYorkSchedule(text: string, input: FlightSearchInput): { departure: string; arrival?: string; flightNumber?: string } | undefined {
  if (input.origin.toUpperCase() !== "VIE") return undefined;
  if (!["EWR", "NYC"].includes(input.destination.toUpperCase())) return undefined;
  const match = text.match(/10:45\s+VIE\s+13:55\s+EWR\s+Flight duration:\s+09:10\s+(OS37)/i);
  if (!match) return undefined;

  return {
    departure: `${input.dateOut}T10:45:00`,
    arrival: `${input.dateOut}T13:55:00`,
    flightNumber: match[1]
  };
}

function currencyFromSymbol(symbol: string): string | undefined {
  if (symbol === "€") return "EUR";
  if (symbol === "$") return "USD";
  if (symbol === "£") return "GBP";
  return undefined;
}
