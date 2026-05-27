import type { AirlineCode } from "./types.js";

export class UnsupportedRouteError extends Error {
  constructor(
    message: string,
    readonly diagnostics: {
      airline: AirlineCode;
      origin: string;
      destination: string;
      reason: string;
      supportedAirportsEndpoint: string;
    }
  ) {
    super(message);
    this.name = "UnsupportedRouteError";
  }
}
