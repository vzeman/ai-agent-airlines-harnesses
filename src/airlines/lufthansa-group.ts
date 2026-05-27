import type { AirlineCode, FlightSearchInput } from "../core/types.js";
import { BrowserFlowAdapter } from "./browser-flow.js";

interface LufthansaGroupConfig {
  code: Extract<AirlineCode, "lufthansa" | "austrian">;
  carrierCode: "LH" | "OS";
  baseUrl: string;
  localePath: string;
}

export class LufthansaGroupAdapter extends BrowserFlowAdapter {
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
