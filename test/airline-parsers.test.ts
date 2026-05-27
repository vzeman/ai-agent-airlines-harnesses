import assert from "node:assert/strict";
import { test } from "node:test";
import { parseAmericanRouteOfferPage } from "../src/airlines/american.js";
import { parseBritishRouteOfferPage } from "../src/airlines/british.js";
import { extractPriceCandidates } from "../src/airlines/browser-flow.js";
import { parseLufthansaGroupOfferPage } from "../src/airlines/lufthansa-group.js";
import { extractQatarFlights } from "../src/airlines/qatar.js";
import { parseRyanairAvailability, parseRyanairFareFinder } from "../src/airlines/ryanair.js";
import type { FlightSearchInput } from "../src/core/types.js";

const baseInput: FlightSearchInput = {
  airline: "ryanair",
  origin: "VIE",
  destination: "STN",
  dateOut: "2026-06-15",
  adults: 1,
  currency: "EUR"
};

test("Ryanair fare finder parser returns fares only inside the requested date window", () => {
  const flights = parseRyanairFareFinder(
    {
      outbound: {
        fares: [
          {
            day: "2026-06-14",
            departureDate: "2026-06-14T07:00:00",
            price: { value: 42.99, currencyCode: "EUR" }
          },
          {
            day: "2026-06-15",
            departureDate: "2026-06-15T07:25:00",
            arrivalDate: "2026-06-15T08:40:00",
            price: { value: 97.14, currencyCode: "EUR" }
          },
          {
            day: "2026-06-16",
            soldOut: true,
            price: { value: 12.99, currencyCode: "EUR" }
          }
        ]
      }
    },
    baseInput
  );

  assert.equal(flights.length, 1);
  assert.deepEqual(flights[0], {
    airline: "ryanair",
    origin: "VIE",
    destination: "STN",
    departure: "2026-06-15T07:25:00",
    arrival: "2026-06-15T08:40:00",
    currency: "EUR",
    price: 97.14,
    fareClass: "fare-finder",
    raw: {
      day: "2026-06-15",
      departureDate: "2026-06-15T07:25:00",
      arrivalDate: "2026-06-15T08:40:00",
      price: { value: 97.14, currencyCode: "EUR" }
    }
  });
});

test("Ryanair availability parser extracts flight number, time, currency, and fare amount", () => {
  const flights = parseRyanairAvailability(
    {
      trips: [
        {
          dates: [
            {
              dateOut: "2026-06-15",
              flights: [
                {
                  origin: "VIE",
                  destination: "STN",
                  flightNumber: "FR123",
                  time: ["2026-06-15T07:25:00", "2026-06-15T08:40:00"],
                  regularFare: {
                    currency: "EUR",
                    fares: [{ type: "ADT", amount: 97.14 }]
                  }
                }
              ]
            }
          ]
        }
      ]
    },
    baseInput
  );

  assert.equal(flights.length, 1);
  assert.equal(flights[0].flightNumber, "FR123");
  assert.equal(flights[0].price, 97.14);
  assert.equal(flights[0].currency, "EUR");
});

test("generic browser-flow extractor accepts route-priced text and rejects unrelated promo prices", () => {
  const html = `
    <main>
      <section>Flight VIE to LHR economy fare total EUR 143.50 select departing 15 Jun</section>
      <aside>${".".repeat(500)} Holiday from London hotel package EUR 99</aside>
    </main>
  `;

  const flights = extractPriceCandidates(
    html,
    { airline: "british", origin: "VIE", destination: "LHR", dateOut: "2026-06-15", currency: "EUR" },
    "british",
    "BA",
    "https://example.test/results"
  );

  assert.equal(flights.length, 1);
  assert.equal(flights[0].price, 143.5);
  assert.equal(flights[0].currency, "EUR");
});

test("Qatar rendered-page parser extracts multiple economy options from booking-card text", () => {
  const html = `
    <article>
      16:05 VIE Vienna, Austria 14 h 25 m, 1 stop 06:30 +1 LHR Flight details €980 Economy
      16:05 VIE Vienna, Austria 17 h 30 m, 1 stop 09:35 +1 LHR Flight details €1,049 Economy
    </article>
  `;

  const flights = extractQatarFlights(html, {
    airline: "qatar",
    origin: "VIE",
    destination: "LHR",
    dateOut: "2026-06-15",
    currency: "EUR"
  });

  assert.equal(flights.length, 2);
  assert.equal(flights[0].price, 980);
  assert.equal(flights[1].price, 1049);
  assert.equal(flights[0].departure, "2026-06-15T16:05:00");
});

test("Lufthansa Group route offer parser extracts official route page price and Austrian EWR schedule", () => {
  const html = `
    <main>
      <section>Cheapest flight from €581</section>
      <section>Flightplan Vienna New York 10:45 VIE 13:55 EWR Flight duration: 09:10 OS37 Mo Tu We Th Fr Sa Su</section>
    </main>
  `;

  const flights = parseLufthansaGroupOfferPage(
    html,
    { airline: "austrian", origin: "VIE", destination: "EWR", dateOut: "2026-07-23", currency: "EUR" },
    "austrian",
    "OS",
    "https://www.austrian.com/lhg/us/en/o-d/cy-cy/vienna-new-york"
  );

  assert.equal(flights.length, 1);
  assert.equal(flights[0].price, 581);
  assert.equal(flights[0].currency, "EUR");
  assert.equal(flights[0].flightNumber, "OS37");
  assert.equal(flights[0].departure, "2026-07-23T10:45:00");
});

test("American route offer parser extracts structured EveryMundo fares", () => {
  const html = `
    {"priceSpecification":{"totalPrice":277,"currencyCode":"USD","formattedTotalPrice":"$277"},"outboundFlight":{"departureAirportIataCode":"JFK","arrivalAirportIataCode":"LAX"}}
  `;

  const flights = parseAmericanRouteOfferPage(
    html,
    { airline: "american", origin: "JFK", destination: "LAX", dateOut: "2026-07-23", currency: "USD" },
    "https://www.aa.com/en-us/flights-from-new-york-to-los-angeles"
  );

  assert.equal(flights.length, 1);
  assert.equal(flights[0].price, 277);
  assert.equal(flights[0].currency, "USD");
});

test("British route offer parser extracts lowest published From fare", () => {
  const html = `<main>Fare offers From £1175 From £617 From £538 From £541</main>`;
  const flights = parseBritishRouteOfferPage(
    html,
    { airline: "british", origin: "LHR", destination: "JFK", dateOut: "2026-07-23", currency: "GBP" },
    "https://www.britishairways.com/content/flights/usa/new-york"
  );

  assert.equal(flights.length, 1);
  assert.equal(flights[0].price, 538);
  assert.equal(flights[0].currency, "GBP");
});
