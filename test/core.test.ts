import assert from "node:assert/strict";
import { test } from "node:test";
import { cookieHeader } from "../src/core/flaresolverr.js";
import { ManualInterventionRequired } from "../src/core/errors.js";
import { SessionManager } from "../src/core/session-manager.js";
import type { AirlineAdapter, FlightSearchInput, HarnessSession } from "../src/core/types.js";
import { flightSearchSchema, loginSchema, resolveSessionSchema } from "../src/validation.js";
import { pricingScreenshotUrl } from "../src/airlines/screenshot-url.js";
import { assertRouteSupported, getAirlineSupport } from "../src/airlines/support.js";

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
    includeScreenshot: true
  });

  assert.equal(parsed.airline, "qatar");
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
});

test("resolve-session validation accepts optional proxy credentials", () => {
  const parsed = resolveSessionSchema.parse({
    airline: "ryanair",
    proxy: {
      url: "http://proxy.example:8080",
      username: "user",
      password: "pass"
    }
  });

  assert.equal(parsed.proxy?.username, "user");
});

test("login validation accepts runtime credentials without examples needing secrets", () => {
  const parsed = loginSchema.parse({
    airline: "ryanair",
    username: "person@example.com",
    password: "runtime-only",
    locale: "en-gb"
  });

  assert.equal(parsed.airline, "ryanair");
  assert.equal(parsed.username, "person@example.com");
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
