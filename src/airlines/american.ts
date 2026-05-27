import { FlareSolverrClient } from "../core/flaresolverr.js";
import { ManualInterventionRequired } from "../core/errors.js";
import type { FlightOption, FlightSearchInput, HarnessSession } from "../core/types.js";
import { BrowserFlowAdapter, ymdToMdy } from "./browser-flow.js";

export class AmericanAdapter extends BrowserFlowAdapter {
  private readonly aaFlaresolverr = new FlareSolverrClient();

  constructor() {
    super({
      code: "american",
      carrierCode: "AA",
      displayName: "American Airlines",
      baseUrl: "https://www.aa.com",
      sessionPath: "/homePage.do",
      buildBookingUrl: (input, baseUrl) => {
        const params = new URLSearchParams({
          tripType: input.dateIn ? "roundTrip" : "oneWay",
          from: input.origin.toUpperCase(),
          to: input.destination.toUpperCase(),
          depart: ymdToMdy(input.dateOut),
          return: input.dateIn ? ymdToMdy(input.dateIn) : "",
          adults: String(input.adults ?? 1),
          cabin: "COACH"
        });
        return `${baseUrl}/booking/find-flights?${params.toString()}`;
      }
    });
  }

  override async findFlights(input: FlightSearchInput, session: HarnessSession): Promise<FlightOption[]> {
    try {
      return await super.findFlights(input, session);
    } catch (error) {
      if (!(error instanceof ManualInterventionRequired)) throw error;
      const routeOffer = await this.findOfficialRouteOffer(input, session);
      if (routeOffer.length > 0) return routeOffer;
      throw error;
    }
  }

  private async findOfficialRouteOffer(input: FlightSearchInput, session: HarnessSession): Promise<FlightOption[]> {
    const url = buildAmericanRoutePageUrl(input);
    if (!url) return [];
    const solution = await this.aaFlaresolverr.get({
      url,
      session: session.id,
      waitInSeconds: 3,
      disableMedia: true
    });
    return parseAmericanRouteOfferPage(solution.response ?? "", input, solution.url);
  }
}

function buildAmericanRoutePageUrl(input: FlightSearchInput): string | undefined {
  const key = `${input.origin.toUpperCase()}-${input.destination.toUpperCase()}`;
  const routes: Record<string, string> = {
    "JFK-LAX": "flights-from-new-york-to-los-angeles",
    "NYC-LAX": "flights-from-new-york-to-los-angeles",
    "LAX-JFK": "flights-from-los-angeles-to-new-york",
    "LAX-NYC": "flights-from-los-angeles-to-new-york",
    "JFK-LHR": "flights-from-new-york-to-london",
    "LHR-JFK": "flights-from-london-to-new-york"
  };
  const slug = routes[key];
  return slug ? `https://www.aa.com/en-us/${slug}` : undefined;
}

export function parseAmericanRouteOfferPage(html: string, input: FlightSearchInput, sourceUrl: string): FlightOption[] {
  const origin = input.origin.toUpperCase();
  const destination = input.destination.toUpperCase();
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const pricePattern = /"totalPrice":([0-9.]+)[\s\S]{0,300}?"currencyCode":"([A-Z]{3})"/gi;
  const flights: FlightOption[] = [];
  let match: RegExpExecArray | null;
  while ((match = pricePattern.exec(text)) !== null) {
    const context = text.slice(Math.max(0, match.index - 900), Math.min(text.length, match.index + 1200));
    if (!context.includes(`"arrivalAirportIataCode":"${destination}"`)) continue;
    if (
      !context.includes(`"departureAirportIataCode":"${origin}"`) &&
      !(origin === "JFK" && context.includes('"departureAirportIataCode":"NYC"'))
    ) {
      continue;
    }

    const price = Number(match[1]);
    if (!Number.isFinite(price)) continue;
    flights.push({
      airline: "american",
      origin,
      destination,
      departure: input.dateOut,
      currency: match[2],
      price,
      fareClass: "official-route-offer",
      raw: {
        carrierCode: "AA",
        sourceUrl,
        caveat:
          "Official American Airlines route offer page. Published recent/lowest route fares may not be a guaranteed live quote for the exact requested departure date until the booking flow is completed.",
        context
      }
    });
  }
  const unique = new Map<string, FlightOption>();
  for (const flight of flights) unique.set(`${flight.price}:${flight.currency}`, flight);
  return [...unique.values()].sort((a, b) => (a.price ?? 0) - (b.price ?? 0)).slice(0, 10);
}
