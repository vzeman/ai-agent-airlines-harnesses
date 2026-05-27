import { FlareSolverrClient } from "../core/flaresolverr.js";
import { ManualInterventionRequired } from "../core/errors.js";
import type { FlightOption, FlightSearchInput, HarnessSession } from "../core/types.js";
import { BrowserFlowAdapter } from "./browser-flow.js";

export class BritishAdapter extends BrowserFlowAdapter {
  private readonly baFlaresolverr = new FlareSolverrClient();

  constructor() {
    super({
      code: "british",
      carrierCode: "BA",
      displayName: "British Airways",
      baseUrl: "https://www.britishairways.com",
      sessionPath: "/travel/home/public/en_gb",
      buildBookingUrl: (input, baseUrl) => {
        const params = new URLSearchParams({
          eId: "111083",
          tab_selected: "flightSearch",
          from: input.origin.toUpperCase(),
          to: input.destination.toUpperCase(),
          departureDate: input.dateOut,
          returnDate: input.dateIn ?? "",
          adults: String(input.adults ?? 1),
          children: String(input.children ?? 0),
          infants: String(input.infants ?? 0),
          cabin: "M"
        });
        return `${baseUrl}/travel/home/public/en_gb?${params.toString()}`;
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
    const url = buildBritishRoutePageUrl(input);
    if (!url) return [];
    const solution = await this.baFlaresolverr.get({
      url,
      session: session.id,
      waitInSeconds: 3,
      disableMedia: true
    });
    return parseBritishRouteOfferPage(solution.response ?? "", input, solution.url);
  }
}

function buildBritishRoutePageUrl(input: FlightSearchInput): string | undefined {
  const key = `${input.origin.toUpperCase()}-${input.destination.toUpperCase()}`;
  const routes: Record<string, string> = {
    "LHR-JFK": "https://www.britishairways.com/content/flights/usa/new-york",
    "LHR-EWR": "https://www.britishairways.com/content/flights/usa/new-york",
    "LGW-JFK": "https://www.britishairways.com/content/flights/usa/new-york",
    "JFK-LHR": "https://www.britishairways.com/content/flights/uk/london",
    "EWR-LHR": "https://www.britishairways.com/content/flights/uk/london"
  };
  return routes[key];
}

export function parseBritishRouteOfferPage(html: string, input: FlightSearchInput, sourceUrl: string): FlightOption[] {
  const text = html
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&pound;/g, "£")
    .replace(/\s+/g, " ");
  const prices = [...text.matchAll(/From\s+£\s*([0-9][0-9,]*)/gi)]
    .map((match) => ({ price: Number(match[1].replace(/,/g, "")), index: match.index ?? 0 }))
    .filter((match) => Number.isFinite(match.price) && match.price > 20 && match.price < 20_000)
    .sort((a, b) => a.price - b.price);
  const cheapest = prices[0];
  if (!cheapest) return [];

  return [
    {
      airline: "british",
      origin: input.origin.toUpperCase(),
      destination: input.destination.toUpperCase(),
      departure: input.dateOut,
      currency: "GBP",
      price: cheapest.price,
      fareClass: "official-route-offer",
      raw: {
        carrierCode: "BA",
        sourceUrl,
        caveat:
          "Official British Airways destination/route offer page. Published 'from' fares may not be a guaranteed live quote for the exact requested departure date until the booking flow is completed.",
        context: text.slice(Math.max(0, cheapest.index - 200), Math.min(text.length, cheapest.index + 500))
      }
    }
  ];
}
