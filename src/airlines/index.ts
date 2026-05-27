import type { AirlineAdapter, AirlineCode } from "../core/types.js";
import { BrowserFlowAdapter, ymdToMdy } from "./browser-flow.js";
import { LufthansaGroupAdapter } from "./lufthansa-group.js";
import { QatarAdapter } from "./qatar.js";
import { RyanairAdapter } from "./ryanair.js";
import { WizzairAdapter } from "./wizzair.js";

const adapters: Record<AirlineCode, AirlineAdapter> = {
  ryanair: new RyanairAdapter(),
  wizzair: new WizzairAdapter(),
  lufthansa: new LufthansaGroupAdapter({
    code: "lufthansa",
    carrierCode: "LH",
    baseUrl: "https://www.lufthansa.com",
    localePath: "/xx/en/homepage"
  }),
  austrian: new LufthansaGroupAdapter({
    code: "austrian",
    carrierCode: "OS",
    baseUrl: "https://www.austrian.com",
    localePath: "/xx/en/homepage"
  }),
  american: new BrowserFlowAdapter({
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
  }),
  british: new BrowserFlowAdapter({
    code: "british",
    carrierCode: "BA",
    displayName: "British Airways",
    baseUrl: "https://www.britishairways.com",
    sessionPath: "/travel/home/public/en_gb",
    buildBookingUrl: (input, baseUrl) => {
      const origin = input.origin.toUpperCase();
      const destination = input.destination.toUpperCase();
      const params = new URLSearchParams({
        eId: "111083",
        tab_selected: "flightSearch",
        from: origin,
        to: destination,
        departureDate: input.dateOut,
        returnDate: input.dateIn ?? "",
        adults: String(input.adults ?? 1),
        children: String(input.children ?? 0),
        infants: String(input.infants ?? 0),
        cabin: "M"
      });
      return `${baseUrl}/travel/home/public/en_gb?${params.toString()}`;
    }
  }),
  qatar: new QatarAdapter()
};

export function getAdapter(code: AirlineCode): AirlineAdapter {
  return adapters[code];
}

export function listAirlines(): AirlineCode[] {
  return Object.keys(adapters) as AirlineCode[];
}
