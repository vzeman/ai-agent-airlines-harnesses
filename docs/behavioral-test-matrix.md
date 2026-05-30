# Behavioral Test Matrix

The project uses two test layers:

- Offline recorded parser tests run in CI through `npm run verify`. These use local fixtures and never call airline websites.
- Optional live smoke tests run locally against the Docker harness with `npm run test:routes`. These call airline websites and can return different outcomes depending on inventory, queues, blocks, and airline changes.

## Recorded Fixtures

Recorded snippets live in `test/fixtures/airline-pages.json` and cover critical parser states:

| Fixture | Purpose |
| --- | --- |
| `lufthansaGroupOffer` | Lufthansa Group official route-offer fare and schedule parsing |
| `lufthansaGroupNotFound` | Lufthansa Group unavailable route-offer page diagnostic |
| `britishRouteOffer` | British Airways route-offer fare parsing |
| `britishHighDemand` | British Airways high-demand queue classification |
| `qatarBookingCards` | Qatar booking-card extraction and duplicate suppression |
| `wizzNoFlights` | Wizz Air rendered no-flight terminal state |

Keep fixtures short and sanitized. Do not commit full airline pages, cookies, account data, receipts, screenshots with personal data, or verification codes.

## Live Matrix

Run the live matrix only when Docker services are up:

```bash
docker compose up -d
npm run test:routes
```

Optional environment variables:

```bash
HARNESS_URL=http://localhost:8787 DATE_OUT=2026-07-23 ROUTE_TIMEOUT_MS=90000 npm run test:routes
```

Use `MATRIX_FILTER` to run one airline or route while debugging:

```bash
MATRIX_FILTER=qatar npm run test:routes
MATRIX_FILTER=VIE-LHR npm run test:routes
```

The script prints one result per route with:

- `status`: raw harness status such as `ok`, `unsupported_route`, or `manual_intervention_required`
- `outcome`: normalized outcome, one of `priced`, `no_flights`, `unsupported_route`, or `manual_intervention_required`
- `cheapest`: cheapest structured fare when the outcome is `priced`
- `blocker`, `retryable`, and `renderedState`: adapter diagnostics for manual-intervention cases
- `durationMs`: elapsed time for the route request

The script writes per-route progress to stderr and applies `ROUTE_TIMEOUT_MS` to every route so one blocked site cannot hang the matrix indefinitely.

Current live routes are defined in `scripts/test-route-matrix.mjs`. The matrix intentionally accepts more than one outcome for routes where live sites can show queues or route-offer pages can disappear. CI does not run this script.
