const harnessUrl = process.env.HARNESS_URL ?? "http://localhost:8787";
const dateOut = process.env.DATE_OUT ?? "2026-07-23";
const routeTimeoutMs = Number(process.env.ROUTE_TIMEOUT_MS ?? 90_000);
const matrixFilter = process.env.MATRIX_FILTER?.toLowerCase();

const matrix = [
  { airline: "ryanair", origin: "VIE", destination: "STN", expected: ["priced", "no_flights"] },
  { airline: "ryanair", origin: "VIE", destination: "EWR", expected: ["unsupported_route"] },
  { airline: "wizzair", origin: "BTS", destination: "VAR", expected: ["priced", "no_flights"] },
  { airline: "wizzair", origin: "VIE", destination: "EWR", expected: ["unsupported_route"] },
  { airline: "austrian", origin: "VIE", destination: "EWR", expected: ["priced"] },
  { airline: "austrian", origin: "VIE", destination: "LHR", expected: ["manual_intervention_required", "priced"] },
  { airline: "lufthansa", origin: "VIE", destination: "EWR", expected: ["priced"] },
  { airline: "lufthansa", origin: "VIE", destination: "LHR", expected: ["manual_intervention_required", "priced"] },
  { airline: "american", origin: "VIE", destination: "EWR", expected: ["unsupported_route"] },
  { airline: "american", origin: "JFK", destination: "LAX", expected: ["priced"] },
  { airline: "british", origin: "LHR", destination: "JFK", expected: ["priced", "manual_intervention_required"] },
  { airline: "british", origin: "VIE", destination: "LHR", expected: ["manual_intervention_required", "priced"] },
  { airline: "qatar", origin: "VIE", destination: "LHR", expected: ["priced"] },
  { airline: "qatar", origin: "VIE", destination: "LGW", expected: ["priced"] },
  { airline: "qatar", origin: "VIE", destination: "EWR", expected: ["unsupported_route"] }
];

const selectedMatrix = matrix.filter((item) => {
  if (!matrixFilter) return true;
  const haystack = `${item.airline} ${item.origin}-${item.destination}`.toLowerCase();
  return haystack.includes(matrixFilter);
});

const results = [];
for (const item of selectedMatrix) {
  console.error(`Testing ${item.airline} ${item.origin}-${item.destination} ${dateOut}`);
  const startedAt = Date.now();
  const body = await runRoute(item).catch((error) => ({
    status: "error",
    message: error instanceof Error ? error.message : String(error)
  }));
  const flights = body.data?.flights ?? [];
  const priced = flights.filter((flight) => typeof flight.price === "number");
  const cheapest = priced.sort((a, b) => a.price - b.price)[0];
  const outcome = classifyOutcome(body.status, flights, cheapest);
  results.push({
    ...item,
    status: body.status,
    outcome,
    count: flights.length,
    cheapest,
    message: body.message,
    blocker: body.diagnostics?.blocker,
    retryable: body.diagnostics?.retryable,
    renderedState: body.diagnostics?.renderedState,
    durationMs: Date.now() - startedAt
  });
  console.error(`Finished ${item.airline} ${item.origin}-${item.destination}: ${outcome}`);
}

console.log(JSON.stringify(results, null, 2));

const failures = results.filter((result) => {
  return !result.expected.includes(result.outcome);
});

if (failures.length > 0) {
  console.error("Unexpected matrix results:");
  console.error(JSON.stringify(failures, null, 2));
  process.exit(1);
}

function classifyOutcome(status, flights, cheapest) {
  if (status === "ok" && cheapest) return "priced";
  if (status === "ok" && flights.length === 0) return "no_flights";
  return status;
}

async function runRoute(item) {
  const signal = AbortSignal.timeout(routeTimeoutMs);
  const response = await fetch(`${harnessUrl}/task/find-flights`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    signal,
    body: JSON.stringify({
      airline: item.airline,
      origin: item.origin,
      destination: item.destination,
      dateOut,
      adults: 1,
      currency: "EUR"
    })
  });
  return response.json();
}
