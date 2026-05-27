import type { AirlineCode, FlightSearchInput } from "../core/types.js";
import { ymdToMdy } from "./browser-flow.js";

export function pricingScreenshotUrl(airline: AirlineCode, input: FlightSearchInput): string {
  const origin = input.origin.toUpperCase();
  const destination = input.destination.toUpperCase();
  const adults = input.adults ?? 1;
  const children = input.children ?? 0;
  const infants = input.infants ?? 0;

  switch (airline) {
    case "ryanair":
      return `https://www.ryanair.com/gb/en/trip/flights/select?${new URLSearchParams({
        adults: String(adults),
        teens: String(input.teens ?? 0),
        children: String(children),
        infants: String(infants),
        dateOut: input.dateOut,
        dateIn: input.dateIn ?? "",
        isConnectedFlight: "false",
        isReturn: String(Boolean(input.dateIn)),
        originIata: origin,
        destinationIata: destination,
        discount: "0",
        promoCode: ""
      }).toString()}`;

    case "wizzair":
      return `https://wizzair.com/en-gb/booking/select-flight/${origin}/${destination}/${input.dateOut}/${input.dateIn ?? "null"}/${adults}/${children}/${infants}/null`;

    case "austrian":
      return lufthansaGroupRoutePage("austrian", input) ?? `https://www.austrian.com/xx/en/flight-search?${new URLSearchParams({
        departure: origin,
        destination,
        departureDate: input.dateOut,
        returnDate: input.dateIn ?? "",
        adults: String(adults),
        children: String(children),
        infants: String(infants),
        cabin: "ECONOMY"
      }).toString()}`;

    case "lufthansa":
      return lufthansaGroupRoutePage("lufthansa", input) ?? `https://www.lufthansa.com/xx/en/flight-search?${new URLSearchParams({
        origin,
        destination,
        outboundDate: input.dateOut,
        returnDate: input.dateIn ?? "",
        adults: String(adults),
        children: String(children),
        infants: String(infants),
        cabin: "ECONOMY"
      }).toString()}`;

    case "american":
      return americanRoutePage(input) ?? `https://www.aa.com/booking/find-flights?${new URLSearchParams({
        tripType: input.dateIn ? "roundTrip" : "oneWay",
        from: origin,
        to: destination,
        depart: ymdToMdy(input.dateOut),
        return: input.dateIn ? ymdToMdy(input.dateIn) : "",
        adults: String(adults),
        cabin: "COACH"
      }).toString()}`;

    case "british":
      return britishRoutePage(input) ?? `https://www.britishairways.com/travel/home/public/en_gb?${new URLSearchParams({
        eId: "111083",
        tab_selected: "flightSearch",
        from: origin,
        to: destination,
        departureDate: input.dateOut,
        returnDate: input.dateIn ?? "",
        adults: String(adults),
        children: String(children),
        infants: String(infants),
        cabin: "M"
      }).toString()}`;

    case "qatar":
      return `https://www.qatarairways.com/app/booking/flight-selection?${new URLSearchParams({
        tripType: input.dateIn ? "R" : "O",
        fromStation: origin,
        toStation: destination,
        departing: input.dateOut,
        returning: input.dateIn ?? "",
        adults: String(adults),
        children: String(children),
        infants: String(infants),
        cabinClass: "E"
      }).toString()}`;
  }
}

function lufthansaGroupRoutePage(airline: "austrian" | "lufthansa", input: FlightSearchInput): string | undefined {
  const key = `${input.origin.toUpperCase()}-${input.destination.toUpperCase()}`;
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
  const slug = routes[key];
  if (!slug) return undefined;
  const host = airline === "austrian" ? "www.austrian.com" : "www.lufthansa.com";
  return `https://${host}/lhg/us/en/o-d/cy-cy/${slug}`;
}

function americanRoutePage(input: FlightSearchInput): string | undefined {
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

function britishRoutePage(input: FlightSearchInput): string | undefined {
  const key = `${input.origin.toUpperCase()}-${input.destination.toUpperCase()}`;
  const routes: Record<string, string> = {
    "LHR-JFK": "https://www.britishairways.com/content/flights/usa/new-york",
    "LGW-JFK": "https://www.britishairways.com/content/flights/usa/new-york",
    "LHR-EWR": "https://www.britishairways.com/content/flights/usa/new-york",
    "LGW-EWR": "https://www.britishairways.com/content/flights/usa/new-york",
    "JFK-LHR": "https://www.britishairways.com/content/flights/uk/london",
    "EWR-LHR": "https://www.britishairways.com/content/flights/uk/london"
  };
  return routes[key];
}
