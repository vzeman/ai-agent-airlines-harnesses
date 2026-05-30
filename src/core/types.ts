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

export interface SessionReuseInput {
  taskSessionId?: string;
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

export interface SupportedAirportsInput {
  airline?: AirlineCode;
  query?: string;
  country?: string;
  limit?: number;
}

export interface SupportedAirportMatch extends AirportSupport {
  airlines: AirlineCode[];
}

export interface SupportedAirportsResult {
  query?: string;
  country?: string;
  count: number;
  airports: SupportedAirportMatch[];
  airlines: AirlineSupport[];
}

export interface FlightSearchInput extends SessionReuseInput {
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

export interface LoginInput extends SessionReuseInput {
  airline: AirlineCode;
  username: string;
  password: string;
  verificationCode?: string;
  locale?: string;
  includeScreenshot?: boolean;
  proxy?: ProxyConfig;
}

export interface LoginResult {
  airline: AirlineCode;
  authenticated: boolean;
  url: string;
  accountLabel?: string;
  cookieCount: number;
  screenshot?: ScreenshotArtifact;
  diagnostics?: Record<string, unknown>;
}

export interface VerificationCodeInput {
  airline: AirlineCode;
  challengeId: string;
  verificationCode: string;
}

export interface BookingListInput extends LoginInput {
  activeOnly?: boolean;
  includeScreenshot?: boolean;
}

export interface BookingSummary {
  airline: AirlineCode;
  bookingReference?: string;
  origin?: string;
  destination?: string;
  departureDate?: string;
  returnDate?: string;
  status?: string;
  rawText: string;
}

export interface BookingListResult {
  airline: AirlineCode;
  authenticated: boolean;
  url: string;
  count: number;
  bookings: BookingSummary[];
  cookieCount: number;
  screenshot?: ScreenshotArtifact;
  diagnostics?: Record<string, unknown>;
}

export interface BookingDetailInput extends LoginInput {
  detailUrl: string;
  actions?: BookingDetailAction[];
}

export type BookingDetailAction =
  | "review"
  | "itinerary"
  | "booking_receipt"
  | "inflight_receipt"
  | "open_claim"
  | "passenger_products";

export interface DownloadArtifact {
  path: string;
  url?: string;
  capturedAt: string;
  description: string;
}

export interface BookingDetailResult {
  airline: AirlineCode;
  authenticated: boolean;
  url: string;
  detailLoaded: boolean;
  booking?: BookingSummary;
  headings: string[];
  detailLines: string[];
  actionLabels: string[];
  requestedActions: BookingDetailAction[];
  downloads: DownloadArtifact[];
  cookieCount: number;
  screenshot?: ScreenshotArtifact;
  diagnostics?: Record<string, unknown>;
}

export type RyanairPortalSection = "personal_information" | "travel_documents" | "companions" | "wallet" | "bookings";

export type PortalOperation = "review";

export interface PortalInput extends LoginInput {
  section: RyanairPortalSection;
  operation?: PortalOperation;
}

export interface PortalResult {
  airline: AirlineCode;
  authenticated: boolean;
  section: RyanairPortalSection;
  operation: PortalOperation;
  url: string;
  sectionLoaded: boolean;
  headings: string[];
  fieldLabels: string[];
  actionLabels: string[];
  cookieCount: number;
  screenshot?: ScreenshotArtifact;
  diagnostics?: Record<string, unknown>;
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
  login?(input: LoginInput, session: HarnessSession): Promise<LoginResult>;
  listBookings?(input: BookingListInput, session: HarnessSession): Promise<BookingListResult>;
  getBookingDetail?(input: BookingDetailInput, session: HarnessSession): Promise<BookingDetailResult>;
  managePortal?(input: PortalInput, session: HarnessSession): Promise<PortalResult>;
  submitVerificationCode?(input: VerificationCodeInput): Promise<LoginResult | BookingListResult | BookingDetailResult | PortalResult>;
  cancelVerificationChallenge?(challengeId: string): Promise<boolean>;
}
