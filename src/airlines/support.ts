import { UnsupportedRouteError } from "../core/unsupported-route.js";
import type { AirlineCode, AirlineSupport, FlightSearchInput } from "../core/types.js";

const supports: Record<AirlineCode, AirlineSupport> = {
  ryanair: {
    airline: "ryanair",
    coverage: "curated",
    airports: [
      airport("VIE", "Vienna", "Austria"),
      airport("BTS", "Bratislava", "Slovakia"),
      airport("STN", "London Stansted", "United Kingdom"),
      airport("LTN", "London Luton", "United Kingdom"),
      airport("DUB", "Dublin", "Ireland"),
      airport("BGY", "Milan Bergamo", "Italy"),
      airport("FCO", "Rome Fiumicino", "Italy")
    ],
    countries: ["Austria", "Slovakia", "United Kingdom", "Ireland", "Italy"],
    testedRoutes: [
      { origin: "VIE", destination: "STN", status: "priced", note: "Fare Finder API" },
      { origin: "BTS", destination: "STN", status: "priced", note: "Fare Finder API" },
      { origin: "VIE", destination: "EWR", status: "unsupported", note: "EWR is outside Ryanair network" }
    ]
  },
  wizzair: {
    airline: "wizzair",
    coverage: "curated",
    airports: [
      airport("VIE", "Vienna", "Austria"),
      airport("BTS", "Bratislava", "Slovakia"),
      airport("LTN", "London Luton", "United Kingdom"),
      airport("LGW", "London Gatwick", "United Kingdom"),
      airport("VAR", "Varna", "Bulgaria"),
      airport("BUD", "Budapest", "Hungary"),
      airport("OTP", "Bucharest", "Romania"),
      airport("TIA", "Tirana", "Albania"),
      airport("SKP", "Skopje", "North Macedonia")
    ],
    countries: ["Austria", "Slovakia", "United Kingdom", "Bulgaria", "Hungary", "Romania", "Albania", "North Macedonia"],
    testedRoutes: [
      { origin: "BTS", destination: "VAR", status: "priced", note: "Official Wizz Fare Finder route-page fallback" },
      { origin: "BTS", destination: "LTN", status: "priced", note: "Official Wizz Fare Finder route-page fallback" },
      { origin: "VIE", destination: "LTN", status: "manual_intervention_required", note: "Needs current Wizz browser/XHR flow or route fallback" },
      { origin: "VIE", destination: "EWR", status: "unsupported", note: "Wizz Air does not operate transatlantic EWR service" }
    ]
  },
  lufthansa: {
    airline: "lufthansa",
    coverage: "curated",
    airports: [
      airport("VIE", "Vienna", "Austria"),
      airport("EWR", "Newark", "United States"),
      airport("JFK", "New York JFK", "United States"),
      airport("NYC", "New York", "United States"),
      airport("FRA", "Frankfurt", "Germany"),
      airport("MUC", "Munich", "Germany"),
      airport("LHR", "London Heathrow", "United Kingdom")
    ],
    countries: ["Austria", "United States", "Germany", "United Kingdom"],
    testedRoutes: [
      { origin: "VIE", destination: "EWR", status: "priced", note: "Official Lufthansa Group route-offer fallback" },
      { origin: "VIE", destination: "LHR", status: "manual_intervention_required", note: "Precise non-retryable booking-flow diagnostic when the route-offer page is unavailable" }
    ]
  },
  austrian: {
    airline: "austrian",
    coverage: "curated",
    airports: [
      airport("VIE", "Vienna", "Austria"),
      airport("EWR", "Newark", "United States"),
      airport("JFK", "New York JFK", "United States"),
      airport("NYC", "New York", "United States"),
      airport("FRA", "Frankfurt", "Germany"),
      airport("LHR", "London Heathrow", "United Kingdom")
    ],
    countries: ["Austria", "United States", "Germany", "United Kingdom"],
    testedRoutes: [
      { origin: "VIE", destination: "EWR", status: "priced", note: "Official Austrian route-offer fallback with OS37 schedule" },
      { origin: "VIE", destination: "LHR", status: "manual_intervention_required", note: "Precise non-retryable booking-flow diagnostic when the route-offer page is unavailable" }
    ]
  },
  american: {
    airline: "american",
    coverage: "curated",
    airports: [
      airport("JFK", "New York JFK", "United States"),
      airport("LGA", "New York LaGuardia", "United States"),
      airport("EWR", "Newark", "United States"),
      airport("LAX", "Los Angeles", "United States"),
      airport("DFW", "Dallas/Fort Worth", "United States"),
      airport("ORD", "Chicago O'Hare", "United States"),
      airport("MIA", "Miami", "United States"),
      airport("LHR", "London Heathrow", "United Kingdom")
    ],
    countries: ["United States", "United Kingdom"],
    testedRoutes: [
      { origin: "JFK", destination: "LAX", status: "priced", note: "Official American route-offer fallback" },
      { origin: "VIE", destination: "EWR", status: "unsupported", note: "VIE is outside this adapter's current AA support set" }
    ]
  },
  british: {
    airline: "british",
    coverage: "curated",
    airports: [
      airport("LHR", "London Heathrow", "United Kingdom"),
      airport("LGW", "London Gatwick", "United Kingdom"),
      airport("LCY", "London City", "United Kingdom"),
      airport("JFK", "New York JFK", "United States"),
      airport("EWR", "Newark", "United States"),
      airport("VIE", "Vienna", "Austria")
    ],
    countries: ["United Kingdom", "United States", "Austria"],
    testedRoutes: [
      { origin: "LHR", destination: "JFK", status: "priced", note: "Official British Airways route/destination offer fallback" },
      { origin: "VIE", destination: "LHR", status: "manual_intervention_required", note: "Detects BA high-demand queue and returns retryable blocker diagnostics" },
      { origin: "VIE", destination: "LGW", status: "manual_intervention_required", note: "Detects BA high-demand queue and returns retryable blocker diagnostics" },
      { origin: "VIE", destination: "LCY", status: "manual_intervention_required", note: "Detects BA high-demand queue and returns retryable blocker diagnostics" },
      { origin: "VIE", destination: "EWR", status: "manual_intervention_required", note: "Likely connecting itinerary, exact extractor not yet implemented" }
    ]
  },
  qatar: {
    airline: "qatar",
    coverage: "curated",
    airports: [
      airport("DOH", "Doha", "Qatar"),
      airport("VIE", "Vienna", "Austria"),
      airport("LHR", "London Heathrow", "United Kingdom"),
      airport("LGW", "London Gatwick", "United Kingdom"),
      airport("JFK", "New York JFK", "United States"),
      airport("EWR", "Newark", "United States")
    ],
    countries: ["Qatar", "Austria", "United Kingdom", "United States"],
    testedRoutes: [
      { origin: "VIE", destination: "LHR", status: "priced", note: "Booking-flow page extraction" },
      { origin: "DOH", destination: "LHR", status: "priced", note: "Booking-flow page extraction" },
      { origin: "VIE", destination: "EWR", status: "manual_intervention_required", note: "Needs deeper Qatar flow or route-specific fallback" }
    ]
  }
};

const unsupportedRoutes = new Set(
  Object.values(supports).flatMap((support) =>
    support.testedRoutes
      .filter((route) => route.status === "unsupported")
      .map((route) => `${support.airline}:${route.origin}:${route.destination}`)
  )
);

export function getAirlineSupport(airline: AirlineCode): AirlineSupport {
  return supports[airline];
}

export function listAirlineSupport(): AirlineSupport[] {
  return Object.values(supports);
}

export function assertRouteSupported(input: FlightSearchInput): void {
  const origin = input.origin.toUpperCase();
  const destination = input.destination.toUpperCase();
  const key = `${input.airline}:${origin}:${destination}`;
  const support = supports[input.airline];

  if (unsupportedRoutes.has(key)) {
    throw unsupported(input.airline, origin, destination, "Known unsupported route for this airline adapter.");
  }

  if (!support.airports.some((airport) => airport.iata === origin)) {
    throw unsupported(input.airline, origin, destination, `${origin} is not in the adapter's current supported airport set.`);
  }

  if (!support.airports.some((airport) => airport.iata === destination)) {
    throw unsupported(input.airline, origin, destination, `${destination} is not in the adapter's current supported airport set.`);
  }
}

function unsupported(airline: AirlineCode, origin: string, destination: string, reason: string): UnsupportedRouteError {
  return new UnsupportedRouteError(`${airline} does not support ${origin}-${destination} in the current harness.`, {
    airline,
    origin,
    destination,
    reason,
    supportedAirportsEndpoint: `/airlines/${airline}/support`
  });
}

function airport(iata: string, city: string, country: string): { iata: string; city: string; country: string } {
  return { iata, city, country };
}
