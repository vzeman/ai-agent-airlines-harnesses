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
      return `https://www.austrian.com/xx/en/flight-search?${new URLSearchParams({
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
      return `https://www.lufthansa.com/xx/en/flight-search?${new URLSearchParams({
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
      return `https://www.aa.com/booking/find-flights?${new URLSearchParams({
        tripType: input.dateIn ? "roundTrip" : "oneWay",
        from: origin,
        to: destination,
        depart: ymdToMdy(input.dateOut),
        return: input.dateIn ? ymdToMdy(input.dateIn) : "",
        adults: String(adults),
        cabin: "COACH"
      }).toString()}`;

    case "british":
      return `https://www.britishairways.com/travel/home/public/en_gb?${new URLSearchParams({
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
