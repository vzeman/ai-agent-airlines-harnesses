import { FlareSolverrClient } from "../core/flaresolverr.js";
import { ManualInterventionRequired } from "../core/errors.js";
import type { FlightOption, FlightSearchInput, HarnessSession } from "../core/types.js";
import { BrowserFlowAdapter } from "./browser-flow.js";

interface BritishRouteOfferLookup {
  flights: FlightOption[];
  diagnostics: Record<string, unknown>;
}

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
      if (routeOffer.flights.length > 0) return routeOffer.flights;

      const renderedState = classifyBritishRenderedState(error.diagnostics.rendered);
      const isQueue = renderedState === "high_demand_queue";
      throw new ManualInterventionRequired(
        isQueue
          ? "British Airways is serving a high-demand queue page for this shopping request."
          : "British Airways priced shopping could not extract an exact fare from the live booking flow.",
        {
          ...error.diagnostics,
          renderedState,
          routeOffer: routeOffer.diagnostics,
          blocker: isQueue
            ? "BA returned its high-demand waiting page before the booking flow exposed fare results."
            : "The live booking page rendered without structured fare results, and no official route-offer fallback exposed a parseable lowest fare.",
          retryable: isQueue,
          retryAfterSeconds: isQueue ? 300 : undefined,
          nextHarnessStep: isQueue
            ? "Retry the same task later with the same harness endpoint; the official BA Vienna destination page is checked as a fallback but does not expose parseable fares. Do not manually click through the queue from the LLM loop."
            : "Implement a BA form-driving flow or configure partner/NDC priced-shopping credentials."
        }
      );
    }
  }

  private async findOfficialRouteOffer(input: FlightSearchInput, session: HarnessSession): Promise<BritishRouteOfferLookup> {
    const url = buildBritishRoutePageUrl(input);
    if (!url) {
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
    const solution = await this.baFlaresolverr.get({
      url,
      session: session.id,
      waitInSeconds: 3,
      disableMedia: true
    });
    const response = solution.response ?? "";
    const flights = parseBritishRouteOfferPage(response, input, solution.url);
    return {
      flights,
      diagnostics: {
        attempted: true,
        routePageUrl: url,
        resolvedUrl: solution.url,
        status: solution.status,
        responseLength: response.length,
        parsedOfferCount: flights.length,
        pageState: classifyBritishRouteOfferPage(response)
      }
    };
  }
}

function buildBritishRoutePageUrl(input: FlightSearchInput): string | undefined {
  const key = `${input.origin.toUpperCase()}-${input.destination.toUpperCase()}`;
  const routes: Record<string, string> = {
    "VIE-LHR": "https://www.britishairways.com/content/en/bm/flights/austria/vienna",
    "VIE-LGW": "https://www.britishairways.com/content/en/bm/flights/austria/vienna",
    "VIE-LCY": "https://www.britishairways.com/content/en/bm/flights/austria/vienna",
    "LHR-JFK": "https://www.britishairways.com/content/flights/usa/new-york",
    "LHR-EWR": "https://www.britishairways.com/content/flights/usa/new-york",
    "LGW-JFK": "https://www.britishairways.com/content/flights/usa/new-york",
    "JFK-LHR": "https://www.britishairways.com/content/flights/uk/london",
    "EWR-LHR": "https://www.britishairways.com/content/flights/uk/london"
  };
  return routes[key];
}

export function parseBritishRouteOfferPage(html: string, input: FlightSearchInput, sourceUrl: string): FlightOption[] {
  const text = normalizeBritishText(html);
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

export function classifyBritishRenderedState(rendered: unknown): "high_demand_queue" | "search_form" | "no_price_found" {
  const sample =
    rendered && typeof rendered === "object" && "visibleTextSample" in rendered
      ? String((rendered as { visibleTextSample?: unknown }).visibleTextSample ?? "")
      : String(rendered ?? "");
  const text = normalizeBritishText(sample);
  if (/experiencing high demand on ba\.com|thank you for your patience/i.test(text)) return "high_demand_queue";
  if (/book a flight|flight search|from|to|depart/i.test(text)) return "search_form";
  return "no_price_found";
}

export function classifyBritishRouteOfferPage(html: string): "offer" | "high_demand_queue" | "no_price_found" {
  const text = normalizeBritishText(html);
  if (/experiencing high demand on ba\.com|thank you for your patience/i.test(text)) return "high_demand_queue";
  if (/From\s+£\s*[0-9]/i.test(text)) return "offer";
  return "no_price_found";
}

function normalizeBritishText(html: string): string {
  return html
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&pound;/g, "£")
    .replace(/\s+/g, " ")
    .trim();
}
