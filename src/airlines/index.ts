import type { AirlineAdapter, AirlineCode } from "../core/types.js";
import { AmericanAdapter } from "./american.js";
import { BritishAdapter } from "./british.js";
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
  american: new AmericanAdapter(),
  british: new BritishAdapter(),
  qatar: new QatarAdapter()
};

export function getAdapter(code: AirlineCode): AirlineAdapter {
  return adapters[code];
}

export function listAirlines(): AirlineCode[] {
  return Object.keys(adapters) as AirlineCode[];
}
