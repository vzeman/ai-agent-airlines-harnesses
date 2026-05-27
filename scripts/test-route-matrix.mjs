const harnessUrl = process.env.HARNESS_URL ?? "http://localhost:8787";
const dateOut = process.env.DATE_OUT ?? "2026-07-23";

const matrix = [
  { airline: "ryanair", origin: "VIE", destination: "STN", expected: "priced-or-empty" },
  { airline: "ryanair", origin: "VIE", destination: "EWR", expected: "unsupported_route" },
  { airline: "wizzair", origin: "VIE", destination: "LTN", expected: "manual_or_priced" },
  { airline: "wizzair", origin: "VIE", destination: "EWR", expected: "unsupported_route" },
  { airline: "austrian", origin: "VIE", destination: "EWR", expected: "priced" },
  { airline: "lufthansa", origin: "VIE", destination: "EWR", expected: "priced" },
  { airline: "american", origin: "VIE", destination: "EWR", expected: "unsupported_route" },
  { airline: "american", origin: "JFK", destination: "LAX", expected: "manual_or_priced" },
  { airline: "british", origin: "LHR", destination: "JFK", expected: "manual_or_priced" },
  { airline: "qatar", origin: "VIE", destination: "LHR", expected: "priced" },
  { airline: "qatar", origin: "VIE", destination: "EWR", expected: "manual_or_priced" }
];

const results = [];
for (const item of matrix) {
  const response = await fetch(`${harnessUrl}/task/find-flights`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      airline: item.airline,
      origin: item.origin,
      destination: item.destination,
      dateOut,
      adults: 1,
      currency: "EUR"
    })
  });
  const body = await response.json();
  const flights = body.data?.flights ?? [];
  const priced = flights.filter((flight) => typeof flight.price === "number");
  results.push({
    ...item,
    status: body.status,
    count: flights.length,
    cheapest: priced.sort((a, b) => a.price - b.price)[0],
    message: body.message
  });
}

console.log(JSON.stringify(results, null, 2));

const failures = results.filter((result) => {
  if (result.expected === "priced") return result.status !== "ok" || !result.cheapest;
  if (result.expected === "unsupported_route") return result.status !== "unsupported_route";
  if (result.expected === "manual_or_priced") return !["ok", "manual_intervention_required"].includes(result.status);
  if (result.expected === "priced-or-empty") return result.status !== "ok";
  return true;
});

if (failures.length > 0) {
  console.error("Unexpected matrix results:");
  console.error(JSON.stringify(failures, null, 2));
  process.exit(1);
}
