import { UnsupportedRouteError } from "../core/unsupported-route.js";
import type { AirlineCode, AirlineSupport, AirportSupport, FlightSearchInput, SupportedAirportsInput, SupportedAirportsResult } from "../core/types.js";

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
      { origin: "VIE", destination: "LHR", status: "priced", note: "Official Lufthansa Group route-offer fallback" }
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
      { origin: "VIE", destination: "LHR", status: "priced", note: "Official Austrian route-offer fallback with Vienna-London schedule" }
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
      { origin: "VIE", destination: "LHR", status: "manual_intervention_required", note: "Detects BA high-demand queue and checks official Vienna destination page fallback" },
      { origin: "VIE", destination: "LGW", status: "manual_intervention_required", note: "Detects BA high-demand queue and checks official Vienna destination page fallback" },
      { origin: "VIE", destination: "LCY", status: "manual_intervention_required", note: "Detects BA high-demand queue and checks official Vienna destination page fallback" },
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
      airport("JFK", "New York JFK", "United States")
    ],
    countries: ["Qatar", "Austria", "United Kingdom", "United States"],
    testedRoutes: [
      { origin: "VIE", destination: "LHR", status: "priced", note: "Booking-flow page extraction" },
      { origin: "VIE", destination: "LGW", status: "priced", note: "Booking-flow page extraction" },
      { origin: "DOH", destination: "LHR", status: "priced", note: "Booking-flow page extraction" },
      { origin: "VIE", destination: "EWR", status: "unsupported", note: "Qatar publishes New York JFK, not Newark EWR, in the current support set" }
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

const openFlightsAirlineCodes: Partial<Record<AirlineCode, string>> = {
  wizzair: "W6",
  lufthansa: "LH",
  austrian: "OS",
  american: "AA",
  british: "BA",
  qatar: "QR"
};

const openFlightsRoutesUrl = "https://raw.githubusercontent.com/jpatokal/openflights/master/data/routes.dat";
const openFlightsAirportsUrl = "https://raw.githubusercontent.com/jpatokal/openflights/master/data/airports.dat";
let openFlightsCache: Promise<OpenFlightsData> | undefined;

export function getAirlineSupport(airline: AirlineCode): AirlineSupport {
  return supports[airline];
}

export function listAirlineSupport(): AirlineSupport[] {
  return Object.values(supports);
}

export async function resolveSupportedAirports(input: SupportedAirportsInput = {}): Promise<SupportedAirportsResult> {
  const requestedSource = input.source ?? "curated";
  if (requestedSource !== "live") {
    return findSupportedAirports(input, listAirlineSupport(), "curated", requestedSource);
  }

  const diagnostics: Record<string, unknown> = {};
  let usedLiveSource = false;
  const liveSupports = await Promise.all(
    listAirlineSupport().map(async (support) => {
      if (input.airline && support.airline !== input.airline) return support;

      try {
        const liveCatalog = await fetchLiveAirports(support.airline);
        if (!liveCatalog) {
          diagnostics[support.airline] = {
            source: "curated",
            fallback: "live_source_not_implemented"
          };
          return support;
        }

        const airports = liveCatalog.airports;
        usedLiveSource = true;
        diagnostics[support.airline] = { source: liveCatalog.source, count: airports.length, sourceUrl: liveCatalog.sourceUrl };
        return {
          ...support,
          coverage: "dynamic" as const,
          airports,
          countries: [...new Set(airports.map((airport) => airport.country))].sort()
        };
      } catch (error) {
        diagnostics[support.airline] = {
          source: liveSourceName(support.airline),
          error: error instanceof Error ? error.message : String(error),
          fallback: "curated"
        };
        return support;
      }
    })
  );

  return findSupportedAirports(input, liveSupports, usedLiveSource ? "live" : "curated", requestedSource, diagnostics);
}

export function findSupportedAirports(
  input: SupportedAirportsInput = {},
  supportList = listAirlineSupport(),
  source: "curated" | "live" = "curated",
  requestedSource: "curated" | "live" = input.source ?? "curated",
  diagnostics?: Record<string, unknown>
): SupportedAirportsResult {
  const selectedSupports = input.airline ? [supportList.find((support) => support.airline === input.airline) ?? supports[input.airline]] : supportList;
  const query = normalizeSearch(input.query);
  const country = normalizeSearch(input.country);
  const matches = new Map<string, { iata: string; city: string; country: string; airlines: Set<AirlineCode> }>();

  for (const support of selectedSupports) {
    for (const airport of support.airports) {
      if (country && normalizeSearch(airport.country) !== country) continue;
      if (query && !airportMatches(airport, query)) continue;

      const existing =
        matches.get(airport.iata) ??
        {
          ...airport,
          airlines: new Set<AirlineCode>()
        };
      existing.airlines.add(support.airline);
      matches.set(airport.iata, existing);
    }
  }

  const airports = [...matches.values()]
    .sort((a, b) => a.iata.localeCompare(b.iata))
    .slice(0, input.limit ?? 500)
    .map((airport) => ({
      iata: airport.iata,
      city: airport.city,
      country: airport.country,
      airlines: [...airport.airlines].sort()
    }));

  return {
    source,
    requestedSource,
    query: input.query,
    country: input.country,
    count: airports.length,
    airports,
    airlines: selectedSupports,
    diagnostics
  };
}

export function parseRyanairLiveAirports(value: unknown): AirportSupport[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((airport): AirportSupport | undefined => {
      if (!airport || typeof airport !== "object") return undefined;
      const record = airport as Record<string, unknown>;
      const iata = typeof record.iataCode === "string" ? record.iataCode.toUpperCase() : undefined;
      const city = typeof record.name === "string" ? record.name : undefined;
      const countryCode = typeof record.countryCode === "string" ? record.countryCode.toUpperCase() : undefined;
      if (!iata || !city || !countryCode) return undefined;
      return {
        iata,
        city,
        country: countryName(countryCode)
      };
    })
    .filter((airport): airport is AirportSupport => Boolean(airport))
    .sort((a, b) => a.iata.localeCompare(b.iata));
}

export function parseOpenFlightsAirportCatalog(airportsCsv: string): Map<string, AirportSupport> {
  const airports = new Map<string, AirportSupport>();
  for (const line of airportsCsv.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const columns = parseCsvLine(line);
    const iata = normalizeIata(columns[4]);
    if (!iata) continue;
    airports.set(iata, {
      iata,
      city: columns[2] || columns[1] || iata,
      country: columns[3] || "Unknown"
    });
  }
  return airports;
}

export function parseOpenFlightsRouteAirports(routesCsv: string, airports: Map<string, AirportSupport>, airlineCode: string): AirportSupport[] {
  const matches = new Map<string, AirportSupport>();
  for (const line of routesCsv.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const columns = parseCsvLine(line);
    if (columns[0] !== airlineCode) continue;
    for (const iata of [normalizeIata(columns[2]), normalizeIata(columns[4])]) {
      if (!iata) continue;
      const airport = airports.get(iata);
      if (airport) matches.set(iata, airport);
    }
  }
  return [...matches.values()].sort((a, b) => a.iata.localeCompare(b.iata));
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

async function fetchRyanairLiveAirports(): Promise<AirportSupport[]> {
  const response = await fetch("https://www.ryanair.com/api/views/locate/3/airports/en/active", {
    headers: { accept: "application/json" }
  });
  if (!response.ok) throw new Error(`Ryanair airports HTTP ${response.status}`);
  return parseRyanairLiveAirports(await response.json());
}

async function fetchLiveAirports(airline: AirlineCode): Promise<LiveAirportCatalog | undefined> {
  if (airline === "ryanair") {
    return {
      source: "official-ryanair-active-airports",
      sourceUrl: "https://www.ryanair.com/api/views/locate/3/airports/en/active",
      airports: await fetchRyanairLiveAirports()
    };
  }

  const openFlightsCode = openFlightsAirlineCodes[airline];
  if (!openFlightsCode) return undefined;
  const data = await fetchOpenFlightsData();
  return {
    source: "community-openflights-route-database",
    sourceUrl: openFlightsRoutesUrl,
    airports: parseOpenFlightsRouteAirports(data.routesCsv, data.airports, openFlightsCode)
  };
}

async function fetchOpenFlightsData(): Promise<OpenFlightsData> {
  openFlightsCache ??= Promise.all([fetchText(openFlightsAirportsUrl), fetchText(openFlightsRoutesUrl)]).then(([airportsCsv, routesCsv]) => ({
    airports: parseOpenFlightsAirportCatalog(airportsCsv),
    routesCsv
  }));
  return openFlightsCache;
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { accept: "text/plain,*/*" }
  });
  if (!response.ok) throw new Error(`${url} HTTP ${response.status}`);
  return response.text();
}

function liveSourceName(airline: AirlineCode): string {
  return airline === "ryanair" ? "official-ryanair-active-airports" : "community-openflights-route-database";
}

function airportMatches(airport: { iata: string; city: string; country: string }, query: string): boolean {
  return [airport.iata, airport.city, airport.country].some((value) => normalizeSearch(value).includes(query));
}

function normalizeSearch(value?: string): string {
  return (value ?? "").trim().toLowerCase();
}

function countryName(countryCode: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(countryCode) ?? countryCode;
  } catch {
    return countryCode;
  }
}

function normalizeIata(value: string | undefined): string | undefined {
  if (!value || value === "\\N") return undefined;
  const iata = value.trim().toUpperCase();
  return /^[A-Z0-9]{3}$/.test(iata) ? iata : undefined;
}

function parseCsvLine(line: string): string[] {
  const columns: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === "\"") {
      if (quoted && line[index + 1] === "\"") {
        current += "\"";
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (char === "," && !quoted) {
      columns.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  columns.push(current);
  return columns;
}

interface OpenFlightsData {
  airports: Map<string, AirportSupport>;
  routesCsv: string;
}

interface LiveAirportCatalog {
  source: string;
  sourceUrl: string;
  airports: AirportSupport[];
}
