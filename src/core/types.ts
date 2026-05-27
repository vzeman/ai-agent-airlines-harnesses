export type AirlineCode =
  | "ryanair"
  | "wizzair"
  | "lufthansa"
  | "austrian"
  | "american"
  | "british"
  | "qatar";

export interface ProxyConfig {
  url: string;
  username?: string;
  password?: string;
}

export interface AirportSupport {
  iata: string;
  city: string;
  country: string;
}

export interface AirlineSupport {
  airline: AirlineCode;
  coverage: "curated" | "dynamic";
  airports: AirportSupport[];
  countries: string[];
  testedRoutes: Array<{
    origin: string;
    destination: string;
    status: "priced" | "unsupported" | "manual_intervention_required";
    note?: string;
  }>;
}

export interface FlightSearchInput {
  airline: AirlineCode;
  origin: string;
  destination: string;
  dateOut: string;
  dateIn?: string;
  adults?: number;
  teens?: number;
  children?: number;
  infants?: number;
  currency?: string;
  flexDaysBeforeOut?: number;
  flexDaysOut?: number;
  locale?: string;
  proxy?: ProxyConfig;
  includeScreenshot?: boolean;
}

export interface HarnessSession {
  id: string;
  airline: AirlineCode;
  baseUrl: string;
  userAgent?: string;
  cookies: BrowserCookie[];
}

export interface BrowserCookie {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: string;
}

export interface FlightOption {
  airline: AirlineCode;
  origin: string;
  destination: string;
  departure: string;
  arrival?: string;
  flightNumber?: string;
  currency?: string;
  price?: number;
  fareClass?: string;
  raw?: unknown;
}

export interface ScreenshotArtifact {
  path: string;
  url: string;
  capturedAt: string;
  description: string;
}

export interface TaskResult<T> {
  status: "ok" | "manual_intervention_required" | "unsupported_route" | "error";
  sessionId?: string;
  data?: T;
  message?: string;
  diagnostics?: Record<string, unknown>;
}

export interface AirlineAdapter {
  code: AirlineCode;
  baseUrl: string;
  resolveSession(sessionId: string, options?: { proxy?: ProxyConfig }): Promise<HarnessSession>;
  findFlights(input: FlightSearchInput, session: HarnessSession): Promise<FlightOption[]>;
}
