# Agent Task Contract

This harness is an API boundary between an AI agent and airline websites. The agent should request complete business tasks from the harness and should not click through airline pages step by step unless a task explicitly returns `manual_intervention_required`.

## Contract Rules

- Call one high-level task endpoint for one user intent.
- Treat `data` as the canonical result; screenshots and downloads are evidence artifacts.
- Do not retry `manual_intervention_required` in a loop. Retry once only for transient infrastructure failures.
- Do not commit runtime credentials, verification codes, cookies, real-account screenshots, or receipt downloads.
- When `diagnostics.challengeId` is present, continue the same browser context with `/task/submit-verification-code`; do not restart the original task.
- Use `taskSessionId` only when the user workflow needs multiple related task calls on the same resolved airline session.
- Always close debug/manual sessions with `DELETE /sessions/:id`.

## Status Values

| Status | Meaning | Agent behavior |
| --- | --- | --- |
| `ok` | Task completed or reached a structured terminal state. | Use `data` as the result. |
| `manual_intervention_required` | The adapter needs a custom flow, official API access, human verification, or a non-retryable browser condition. | Report `message` and relevant `diagnostics`; implement adapter work rather than repeatedly clicking manually. |
| `unsupported_route` | The route is outside the adapter support metadata. | Report unsupported route and use `/airlines/:code/support` for alternatives. |
| `error` | Unexpected harness/server failure. | Retry once if transient; otherwise report the error. |

## Canonical Tasks

### `supportedAirports`

Endpoint: `POST /task/supported-airports`

Use this before unusual routes or when the user gives a city/country instead of an IATA code. The task accepts optional `airline`, `query`, `country`, `limit`, and `source` fields. It does not open browser sessions.

Use `source: "curated"` for deterministic harness-tested subsets. Use `source: "live"` when the agent needs a fuller remote network catalog. Ryanair uses its public active-airport catalog; Wizz Air, Lufthansa, Austrian, American Airlines, British Airways, and Qatar Airways use the live OpenFlights route database until a better official public catalog is implemented for that carrier. Always read `data.diagnostics[airline].source` before describing provenance to the user.

Canonical output:

- `data.airports[]` with `iata`, `city`, `country`, and supporting `airlines`
- `data.airlines[]` with supported airports, countries, tested route statuses, and route caveats
- `data.count`
- `data.source` and `data.requestedSource`
- `data.diagnostics[airline].source` with live catalog provenance

Metadata-only alternatives remain available as `GET /airlines` and `GET /airlines/:code/support`.

### `searchFlights`

Endpoint: `POST /task/find-flights`

Purpose: find priced flight options for one airline, origin, destination, date, and passenger mix.

Canonical result:

- `data.count`
- `data.flights[]`
- `data.flights[].departure`
- `data.flights[].arrival`
- `data.flights[].flightNumber`
- `data.flights[].currency`
- `data.flights[].price`
- `data.flights[].fareClass`
- optional `data.screenshot`

Agent notes:

- Prefer structured price fields over text from screenshots.
- `includeScreenshot` is evidence-only and should be requested only when needed.
- A zero-count `ok` response is a structured no-result state, not an error.

### `login`

Endpoint: `POST /task/login`

Purpose: authenticate for account-scoped airline tasks.

Canonical result:

- `data.authenticated`
- `data.accountLabel`
- `data.diagnostics.reason`
- optional `data.diagnostics.challengeId`
- optional `data.screenshot`

Agent notes:

- Credentials are runtime-only.
- If `reason` is `verification_required`, obtain the code from an authorized mailbox tool or human user and call `continueVerification`.

### `continueVerification`

Endpoint: `POST /task/submit-verification-code`

Purpose: resume a paused browser context after email/device verification.

Canonical result:

- The result shape of the original paused task.
- `data.diagnostics.challengeResumed` when continuation was accepted.

Agent notes:

- Use the returned `challengeId`.
- Do not restart the original task while the challenge is valid.
- Verification codes are runtime-only and must not be saved.

### `listBookings`

Endpoint: `POST /task/list-bookings`

Purpose: list current or all Ryanair bookings after login.

Canonical result:

- `data.authenticated`
- `data.count`
- `data.bookings[]`
- `data.bookings[].bookingReference`
- `data.bookings[].origin`
- `data.bookings[].destination`
- `data.bookings[].departureDate`
- `data.bookings[].status`
- optional `data.screenshot`

Agent notes:

- Set `activeOnly: false` when the user asks for current plus past bookings.
- For Ryanair, all-bookings mode clicks `Load more` until older rows stop appearing, capped at 10 clicks.
- If Ryanair shows a retrieval form, report `data.diagnostics.bookingListState = "retrieve_booking_form"`.

### `getBookingDetail`

Endpoint: `POST /task/booking-detail`

Purpose: inspect a specific Ryanair reservation detail URL.

Supported actions:

- `review`
- `itinerary`
- `booking_receipt`
- `inflight_receipt`
- `open_claim`
- `passenger_products`

Canonical result:

- `data.detailLoaded`
- `data.booking`
- `data.headings`
- `data.detailLines`
- `data.actionLabels`
- `data.requestedActions`
- `data.downloads`
- optional `data.screenshot`

Agent notes:

- Receipt actions save runtime files only when Ryanair exposes matching download controls.
- `open_claim` navigates/reviews claim or refund entry points; it must not submit a claim unless a future explicit submit action exists.

### `managePortal`

Endpoint: `POST /task/manage-portal`

Purpose: review authenticated myRyanair portal sections without changing data.

Supported sections:

- `personal_information`
- `travel_documents`
- `companions`
- `wallet`
- `bookings`

Canonical result:

- `data.sectionLoaded`
- `data.headings`
- `data.fieldLabels`
- `data.actionLabels`
- optional `data.screenshot`

Agent notes:

- Current operation is read-only `review`.
- Do not submit profile, document, companion, wallet, or booking changes unless a future explicit write operation exists.

### `captureEvidence`

Evidence is requested by setting `includeScreenshot: true` on task endpoints that support it.

Canonical artifact fields:

- `path`
- `url`
- `capturedAt`
- `description`

Agent notes:

- Screenshots can contain personal data. Do not commit real-account evidence.
- Receipt/download artifacts are runtime files and should be treated as sensitive.

### `closeSession`

Endpoint: `DELETE /sessions/:id`

Purpose: close a debug or leaked FlareSolverr session.

Agent notes:

- Normal tasks auto-clean sessions.
- Reusable sessions from `POST /sessions` or `/session/resolve` must be closed explicitly.

### `createReusableSession`

Endpoint: `POST /sessions`

Purpose: create a resolved airline session that can be reused by later task calls.

Request fields:

- `airline`
- optional `ttlMinutes`, clamped to 1-240 minutes
- optional `proxy`

Canonical result:

- `sessionId`
- `data.expiresAt`
- `data.cookieCount`
- `data.userAgent`

Agent notes:

- Pass the returned `sessionId` as `taskSessionId` on supported task requests.
- Reusable sessions are useful for multi-step workflows and debugging; they are not the default.
- Close the session with `DELETE /sessions/:id` as soon as the workflow finishes.
- If a reusable session expires, rerun the original task with a fresh session rather than retrying the expired ID repeatedly.

## Failure Handling

- `unsupported_route`: do not retry the same airline/route.
- `manual_intervention_required` with `verification_required`: continue with a verification code.
- `manual_intervention_required` with booking URL/rendered diagnostics: create adapter work; do not manually operate the site in the LLM loop.
- Unexpected transport or timeout errors: retry once, then report.

## Adapter Quality Bar

An airline adapter is considered complete for a task when it can:

- accept common cookie banners,
- model normal user interactions where a browser flow is required,
- return structured data or a precise terminal state,
- keep credentials and codes out of persisted artifacts,
- close sessions after completion,
- provide deterministic parser/validation tests,
- expose useful diagnostics for unsupported routes and site blockers.
