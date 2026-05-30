import assert from "node:assert/strict";
import { test } from "node:test";
import { cookieHeader } from "../src/core/flaresolverr.js";
import { ManualInterventionRequired } from "../src/core/errors.js";
import { SessionManager } from "../src/core/session-manager.js";
import type { AirlineAdapter, FlightSearchInput, HarnessSession } from "../src/core/types.js";
import {
  bookingDetailSchema,
  bookingListSchema,
  flightSearchSchema,
  loginSchema,
  portalSchema,
  resolveSessionSchema,
  supportedAirportsSchema,
  verificationCodeSchema
} from "../src/validation.js";
import { pricingScreenshotUrl } from "../src/airlines/screenshot-url.js";
import { parseRyanairBookingText } from "../src/airlines/ryanair.js";
import {
  assertRouteSupported,
  findSupportedAirports,
  getAirlineSupport,
  parseOpenFlightsAirportCatalog,
  parseOpenFlightsRouteAirports,
  parseRyanairLiveAirports,
  resolveSupportedAirports
} from "../src/airlines/support.js";

test("cookieHeader filters by domain and serializes name/value pairs", () => {
  const header = cookieHeader(
    [
      { name: "a", value: "1", domain: ".ryanair.com" },
      { name: "b", value: "2", domain: ".example.com" },
      { name: "c", value: "3" }
    ],
    "www.ryanair.com"
  );

  assert.equal(header, "a=1; c=3");
});

test("flight search validation accepts supported airlines and rejects malformed dates", () => {
  const parsed = flightSearchSchema.parse({
    airline: "qatar",
    origin: "VIE",
    destination: "LHR",
    dateOut: "2026-06-15",
    adults: 1,
    taskSessionId: "qatar-reusable-session",
    includeScreenshot: true
  });

  assert.equal(parsed.airline, "qatar");
  assert.equal(parsed.taskSessionId, "qatar-reusable-session");
  assert.equal(parsed.includeScreenshot, true);
  assert.throws(() =>
    flightSearchSchema.parse({
      airline: "qatar",
      origin: "VIE",
      destination: "LHR",
      dateOut: "15-06-2026"
    })
  );
});

test("pricingScreenshotUrl builds a representative Ryanair pricing page URL", () => {
  const url = new URL(
    pricingScreenshotUrl("ryanair", {
      airline: "ryanair",
      origin: "vie",
      destination: "stn",
      dateOut: "2026-06-15",
      adults: 1
    })
  );

  assert.equal(url.hostname, "www.ryanair.com");
  assert.equal(url.searchParams.get("originIata"), "VIE");
  assert.equal(url.searchParams.get("destinationIata"), "STN");
  assert.equal(url.searchParams.get("dateOut"), "2026-06-15");
});

test("airline support exposes airports and rejects known unsupported routes", () => {
  const support = getAirlineSupport("ryanair");
  assert.ok(support.airports.some((airport) => airport.iata === "VIE"));
  assert.ok(support.countries.includes("United Kingdom"));

  assert.throws(
    () =>
      assertRouteSupported({
        airline: "ryanair",
        origin: "VIE",
        destination: "EWR",
        dateOut: "2026-07-23"
      }),
    /does not support VIE-EWR/
  );

  assert.throws(
    () =>
      assertRouteSupported({
        airline: "qatar",
        origin: "VIE",
        destination: "EWR",
        dateOut: "2026-07-23"
      }),
    /does not support VIE-EWR/
  );
});

test("supported airport harness searches by airline, IATA, city, and country", () => {
  const parsed = supportedAirportsSchema.parse({
    airline: "qatar",
    query: "London",
    source: "curated",
    limit: 10
  });
  const qatarLondon = findSupportedAirports(parsed);
  const allVienna = findSupportedAirports({ query: "VIE" });
  const ukAirports = findSupportedAirports({ country: "United Kingdom", limit: 20 });

  assert.deepEqual(
    qatarLondon.airports.map((airport) => airport.iata),
    ["LGW", "LHR"]
  );
  assert.ok(allVienna.airports.some((airport) => airport.iata === "VIE" && airport.airlines.includes("ryanair")));
  assert.ok(ukAirports.airports.every((airport) => airport.country === "United Kingdom"));
  assert.equal(qatarLondon.source, "curated");
});

test("Ryanair live airport parser maps official airport catalog shape", () => {
  const airports = parseRyanairLiveAirports([
    { iataCode: "AAR", name: "Aarhus", countryCode: "dk" },
    { iataCode: "VIE", name: "Vienna", countryCode: "at" },
    { iataCode: null, name: "Broken", countryCode: "xx" }
  ]);

  assert.deepEqual(airports, [
    { iata: "AAR", city: "Aarhus", country: "Denmark" },
    { iata: "VIE", city: "Vienna", country: "Austria" }
  ]);
});

test("OpenFlights route catalog parser maps airline routes to airports", () => {
  const airports = parseOpenFlightsAirportCatalog(
    [
      '1,"Frankfurt","Frankfurt","Germany","FRA","EDDF",50.033333,8.570556,364,1,"E","Europe/Berlin","airport","OurAirports"',
      '2,"Vienna","Vienna","Austria","VIE","LOWW",48.110278,16.569722,600,1,"E","Europe/Vienna","airport","OurAirports"',
      '3,"Broken","Broken","Nowhere","\\\\N","XXXX",0,0,0,0,"U","UTC","airport","OurAirports"'
    ].join("\n")
  );

  const routeAirports = parseOpenFlightsRouteAirports(["LH,3320,FRA,340,VIE,1613,,0,320", "OS,3320,VIE,1613,FRA,340,,0,320"].join("\n"), airports, "LH");

  assert.deepEqual(routeAirports, [
    { iata: "FRA", city: "Frankfurt", country: "Germany" },
    { iata: "VIE", city: "Vienna", country: "Austria" }
  ]);
});

test("live airport discovery returns a broader non-Ryanair remote catalog", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL | Request) => {
    const href = String(url);
    if (href.endsWith("/airports.dat")) {
      return new Response(
        [
          '1,"Doha Hamad International Airport","Doha","Qatar","DOH","OTHH",25.273056,51.608056,13,3,"U","Asia/Qatar","airport","OurAirports"',
          '2,"London Heathrow Airport","London","United Kingdom","LHR","EGLL",51.4706,-0.461941,83,0,"E","Europe/London","airport","OurAirports"',
          '3,"Vienna International Airport","Vienna","Austria","VIE","LOWW",48.110278,16.569722,600,1,"E","Europe/Vienna","airport","OurAirports"',
          '4,"John F Kennedy International Airport","New York","United States","JFK","KJFK",40.639751,-73.778925,13,-5,"A","America/New_York","airport","OurAirports"',
          '5,"Los Angeles International Airport","Los Angeles","United States","LAX","KLAX",33.942536,-118.408075,125,-8,"A","America/Los_Angeles","airport","OurAirports"',
          '6,"Frankfurt am Main Airport","Frankfurt","Germany","FRA","EDDF",50.033333,8.570556,364,1,"E","Europe/Berlin","airport","OurAirports"'
        ].join("\n")
      );
    }
    if (href.endsWith("/routes.dat")) {
      return new Response(
        [
          "QR,4091,DOH,2241,LHR,507,,0,77W",
          "QR,4091,DOH,2241,VIE,1613,,0,788",
          "QR,4091,DOH,2241,JFK,3797,,0,77W",
          "QR,4091,DOH,2241,LAX,3484,,0,77W",
          "QR,4091,DOH,2241,FRA,340,,0,77W"
        ].join("\n")
      );
    }
    throw new Error(`Unexpected test fetch ${href}`);
  }) as typeof fetch;

  let result;
  try {
    result = await resolveSupportedAirports({ airline: "qatar", source: "live", limit: 500 });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.ok(result);
  assert.equal(result.source, "live");
  assert.equal(result.requestedSource, "live");
  assert.ok(result.count > getAirlineSupport("qatar").airports.length);
  assert.equal((result.diagnostics?.qatar as { source?: string } | undefined)?.source, "community-openflights-route-database");
  assert.ok(result.airports.some((airport) => airport.iata === "DOH"));
});

test("resolve-session validation accepts optional proxy credentials", () => {
  const parsed = resolveSessionSchema.parse({
    airline: "ryanair",
    ttlMinutes: 45,
    proxy: {
      url: "http://proxy.example:8080",
      username: "user",
      password: "pass"
    }
  });

  assert.equal(parsed.proxy?.username, "user");
  assert.equal(parsed.ttlMinutes, 45);
});

test("login validation accepts runtime credentials without examples needing secrets", () => {
  const parsed = loginSchema.parse({
    airline: "ryanair",
    username: "person@example.com",
    password: "runtime-only",
    locale: "en-gb",
    includeScreenshot: true
  });

  assert.equal(parsed.airline, "ryanair");
  assert.equal(parsed.username, "person@example.com");
  assert.equal(parsed.includeScreenshot, true);
});

test("booking list validation accepts runtime credentials and screenshot flag", () => {
  const parsed = bookingListSchema.parse({
    airline: "ryanair",
    username: "person@example.com",
    password: "runtime-only",
    verificationCode: "12345678",
    locale: "gb/en",
    activeOnly: true,
    includeScreenshot: true
  });

  assert.equal(parsed.airline, "ryanair");
  assert.equal(parsed.verificationCode, "12345678");
  assert.equal(parsed.includeScreenshot, true);
});

test("portal validation accepts Ryanair account section review tasks", () => {
  const parsed = portalSchema.parse({
    airline: "ryanair",
    username: "person@example.com",
    password: "runtime-only",
    locale: "gb/en",
    section: "travel_documents",
    operation: "review",
    includeScreenshot: true
  });

  assert.equal(parsed.section, "travel_documents");
  assert.equal(parsed.operation, "review");
  assert.equal(parsed.includeScreenshot, true);
  assert.throws(() =>
    portalSchema.parse({
      airline: "ryanair",
      username: "person@example.com",
      password: "runtime-only",
      section: "unsafe_submit"
    })
  );
});

test("booking detail validation accepts itinerary and receipt actions", () => {
  const parsed = bookingDetailSchema.parse({
    airline: "ryanair",
    username: "person@example.com",
    password: "runtime-only",
    locale: "gb/en",
    detailUrl: "https://www.ryanair.com/gb/en/trip/manage/00000000-0000-4000-8000-000000000000/itinerary",
    actions: ["itinerary", "booking_receipt", "inflight_receipt", "open_claim", "passenger_products"],
    includeScreenshot: true
  });

  assert.equal(parsed.actions?.includes("itinerary"), true);
  assert.throws(() =>
    bookingDetailSchema.parse({
      airline: "ryanair",
      username: "person@example.com",
      password: "runtime-only",
      detailUrl: "x",
      actions: ["unsafe_action"]
    })
  );
});

test("verification-code validation accepts challenge continuation input", () => {
  const parsed = verificationCodeSchema.parse({
    airline: "ryanair",
    challengeId: "ryanair-verification-12345678",
    verificationCode: "12345678"
  });

  assert.equal(parsed.challengeId, "ryanair-verification-12345678");
});

test("Ryanair booking text parser extracts reference, route, date, and status", () => {
  const booking = parseRyanairBookingText("Booking reference ABC123 VIE to STN 2026-07-23 Confirmed");

  assert.equal(booking.bookingReference, "ABC123");
  assert.equal(booking.origin, "VIE");
  assert.equal(booking.destination, "STN");
  assert.equal(booking.departureDate, "2026-07-23");
  assert.equal(booking.status, "Confirmed");
});

test("Ryanair booking text parser accepts manage hub city rows", () => {
  const booking = parseRyanairBookingText("Faro to Vienna • 23 May • Reservation number: ABC123 • 2");

  assert.equal(booking.bookingReference, "ABC123");
  assert.equal(booking.origin, "FARO");
  assert.equal(booking.destination, "VIENNA");
  assert.equal(booking.departureDate, "23 May");
});

test("Ryanair booking text parser accepts loaded older reservation rows", () => {
  const booking = parseRyanairBookingText("Vienna to Faro • 18 Apr • Reservation number: Z9Y8X7 • 1");

  assert.equal(booking.bookingReference, "Z9Y8X7");
  assert.equal(booking.origin, "VIENNA");
  assert.equal(booking.destination, "FARO");
  assert.equal(booking.departureDate, "18 Apr");
});

test("ManualInterventionRequired keeps diagnostics for API responses", () => {
  const error = new ManualInterventionRequired("needs browser flow", { bookingUrl: "https://example.test" });
  assert.equal(error.message, "needs browser flow");
  assert.deepEqual(error.diagnostics, { bookingUrl: "https://example.test" });
});

test("SessionManager destroys resolved sessions after successful task execution", async () => {
  const calls: string[] = [];
  const flaresolverr = {
    async createSession(session: string) {
      calls.push(`create:${session}`);
    },
    async destroySession(session: string) {
      calls.push(`destroy:${session}`);
    },
    async listSessions() {
      return [];
    }
  };
  const adapter = fakeAdapter();
  const manager = new SessionManager(flaresolverr as never);

  const result = await manager.withResolvedSession(adapter, input(), async () => ["ok"]);

  assert.deepEqual(result.data, ["ok"]);
  assert.equal(calls.length, 2);
  assert.match(calls[0], /^create:ryanair-/);
  assert.match(calls[1], /^destroy:ryanair-/);
});

test("SessionManager destroys resolved sessions after task failure", async () => {
  const calls: string[] = [];
  const flaresolverr = {
    async createSession(session: string) {
      calls.push(`create:${session}`);
    },
    async destroySession(session: string) {
      calls.push(`destroy:${session}`);
    },
    async listSessions() {
      return [];
    }
  };
  const manager = new SessionManager(flaresolverr as never);

  await assert.rejects(
    () =>
      manager.withResolvedSession(fakeAdapter(), input(), async () => {
        throw new Error("task failed");
      }),
    /task failed/
  );

  assert.equal(calls.length, 2);
  assert.match(calls[1], /^destroy:ryanair-/);
});

test("SessionManager reuses explicit task sessions and destroys them on request", async () => {
  const calls: string[] = [];
  const flaresolverr = {
    async createSession(session: string) {
      calls.push(`create:${session}`);
    },
    async destroySession(session: string) {
      calls.push(`destroy:${session}`);
    },
    async listSessions() {
      return [];
    }
  };
  const manager = new SessionManager(flaresolverr as never);
  const lease = await manager.createReusable(fakeAdapter(), { ttlMinutes: 1 });

  const result = await manager.withResolvedSession(fakeAdapter(), { ...input(), taskSessionId: lease.session.id }, async (session) => session.id);

  assert.equal(result.data, lease.session.id);
  assert.equal(calls.length, 1);
  assert.equal(manager.listReusable()[0]?.sessionId, lease.session.id);

  await manager.destroy(lease.session.id);

  assert.equal(calls.length, 2);
  assert.match(calls[1], /^destroy:ryanair-/);
  assert.deepEqual(manager.listReusable(), []);
});

function fakeAdapter(): AirlineAdapter {
  return {
    code: "ryanair",
    baseUrl: "https://www.ryanair.com",
    async resolveSession(sessionId: string): Promise<HarnessSession> {
      return {
        id: sessionId,
        airline: "ryanair",
        baseUrl: "https://www.ryanair.com",
        cookies: []
      };
    },
    async findFlights() {
      return [];
    }
  };
}

function input(): FlightSearchInput {
  return {
    airline: "ryanair",
    origin: "VIE",
    destination: "STN",
    dateOut: "2026-06-15"
  };
}
