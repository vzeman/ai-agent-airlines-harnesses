# AI Agent Airline Harnesses

Reusable harnesses for AI agents that need to complete airline website tasks with a small number of tool calls. The current scope is flight search and price discovery.

The harness keeps browser infrastructure outside the LLM loop:

- FlareSolverr resolves browser-protected sessions.
- A Playwright browser server is available for rendered pages and screenshots.
- Each task creates a short-lived FlareSolverr session and destroys it in `finally`.
- Rendered fallbacks create a short-lived Playwright context and close it after the task.
- Rendered flows accept common cookie-consent banners before extraction and screenshots.
- Agents call one API endpoint instead of manually clicking through airline sites.

## Supported Airlines

| Airline | Code | Current strategy |
| --- | --- | --- |
| Ryanair | `ryanair` | Fare Finder API first, availability API fallback, optional screenshot of pricing page |
| Wizz Air | `wizzair` | Session resolution, historical API probe, rendered-page diagnostics |
| Austrian | `austrian` | Session resolution, prepared booking URL, rendered-page diagnostics, official route-offer fallback |
| Lufthansa | `lufthansa` | Session resolution, prepared booking URL, rendered-page diagnostics, official route-offer fallback |
| American Airlines | `american` | Session resolution, prepared booking URL, rendered-page diagnostics, official route-offer fallback |
| British Airways | `british` | Session resolution, prepared booking URL, rendered-page diagnostics, official route/destination-offer fallback |
| Qatar Airways | `qatar` | Booking-flow page extraction for priced options |

Some airlines still return `manual_intervention_required` when their live site requires a deeper custom interaction script or partner/NDC priced-shopping access. This is intentional: the response includes the resolved booking URL and diagnostics needed to implement the next custom adapter.

Routes known to be outside an adapter's current network return `unsupported_route` before opening a browser session.

## Compliance Note

This project uses normal browser automation and session lifecycle management. It is not a stealth or fingerprint-spoofing toolkit. Custom browser scripts should model legitimate user actions such as clicking fields, filling text, selecting suggestions, choosing dates, submitting search, waiting for result cards, and extracting displayed prices.

For production use, prefer official airline, partner, GDS, or NDC APIs wherever available.

## Requirements

- Docker and Docker Compose
- Node.js 20+ for local development
- PowerShell 7+ if using the Windows helper scripts

## Quick Start

```bash
npm install
npm run verify
docker compose up -d
curl http://localhost:8787/health
```

The API listens on:

```text
http://localhost:8787
```

Docker services:

- `flaresolverr`: Cloudflare/browser session resolver on port `8191`
- `browser`: Playwright browser server on port `3000`
- `harness`: Node/TypeScript API on port `8787`

## API

### `GET /health`

Returns supported airline codes.

```bash
curl http://localhost:8787/health
```

### `GET /sessions`

Lists active FlareSolverr sessions. Normal task calls should leave this empty after completion.

```bash
curl http://localhost:8787/sessions
```

### `DELETE /sessions/:id`

Destroys a leaked or manually-created FlareSolverr session.

```bash
curl -X DELETE http://localhost:8787/sessions/<session-id>
```

### `GET /airlines`

Returns curated airport/country support metadata for every configured adapter.

```bash
curl http://localhost:8787/airlines
```

### `GET /airlines/:code/support`

Returns airport, country, and tested-route metadata for one adapter.

```bash
curl http://localhost:8787/airlines/ryanair/support
```

### `POST /session/resolve`

Creates a browser-resolved session for debugging.

```bash
curl -X POST http://localhost:8787/session/resolve \
  -H 'content-type: application/json' \
  -d '{"airline":"ryanair"}'
```

Manual sessions must be destroyed after inspection.

### `POST /task/find-flights`

Main agent endpoint for flight search and price discovery.

```bash
curl -X POST http://localhost:8787/task/find-flights \
  -H 'content-type: application/json' \
  -d '{"airline":"ryanair","origin":"VIE","destination":"STN","dateOut":"2026-06-15","adults":1,"currency":"EUR"}'
```

Request fields:

| Field | Required | Description |
| --- | --- | --- |
| `airline` | yes | One of the supported airline codes |
| `origin` | yes | IATA airport code |
| `destination` | yes | IATA airport code |
| `dateOut` | yes | Outbound date as `YYYY-MM-DD` |
| `dateIn` | no | Return date as `YYYY-MM-DD` |
| `adults` | no | Adult passenger count, defaults to `1` |
| `teens` | no | Teen passenger count |
| `children` | no | Child passenger count |
| `infants` | no | Infant passenger count |
| `currency` | no | Preferred ISO currency |
| `locale` | no | Locale such as `en-gb` |
| `includeScreenshot` | no | When `true`, capture a pricing evidence screenshot and return artifact metadata |
| `proxy` | no | Optional proxy config passed to FlareSolverr session creation |

Successful response:

```json
{
  "status": "ok",
  "sessionId": "ryanair-...",
  "data": {
    "count": 1,
    "flights": [
      {
        "airline": "ryanair",
        "origin": "VIE",
        "destination": "STN",
        "departure": "2026-06-15T07:25:00",
        "arrival": "2026-06-15T08:40:00",
        "currency": "EUR",
        "price": 97.14,
        "fareClass": "fare-finder"
      }
    ]
  }
}
```

Manual-intervention response:

```json
{
  "status": "manual_intervention_required",
  "message": "British Airways priced shopping needs the live booking flow or partner/NDC credentials.",
  "diagnostics": {
    "bookingUrl": "https://...",
    "resolvedStatus": 200,
    "rendered": {
      "capturedResponseCount": 12
    }
  }
}
```

Agents should not repeatedly retry these responses. Use them to implement a custom harness script for that airline.

### `POST /task/login`

Runtime-only airline login. Credentials are supplied by the caller and must not be committed to the repository, examples, logs, or docs. The task creates a short-lived FlareSolverr session, performs the browser login attempt, returns sanitized status, and destroys the session.

Ryanair is the first implemented login harness.

```bash
curl -X POST http://localhost:8787/task/login \
  -H 'content-type: application/json' \
  -d '{"airline":"ryanair","username":"user@example.com","password":"runtime-secret","locale":"gb/en","includeScreenshot":true}'
```

PowerShell helper:

```powershell
$password = Read-Host "Ryanair password" -AsSecureString
.\scripts\login-airline.ps1 -Airline ryanair -Username "user@example.com" -Password $password -IncludeScreenshot
```

Successful response shape:

```json
{
  "status": "ok",
  "sessionId": "ryanair-...",
  "data": {
    "airline": "ryanair",
    "authenticated": true,
    "url": "https://www.ryanair.com/...",
    "accountLabel": "myRyanair",
    "cookieCount": 12,
    "screenshot": {
      "path": "artifacts/screenshots/ryanair_account_...",
      "description": "Ryanair successful login proof"
    },
    "diagnostics": {
      "loginSubmitted": true,
      "reason": "authenticated_indicator_found"
    }
  }
}
```

Ryanair may require email/device verification after a valid password. In that case the harness reports the blocker without exposing credentials:

```json
{
  "status": "ok",
  "sessionId": "ryanair-...",
  "data": {
    "airline": "ryanair",
    "authenticated": false,
    "url": "https://www.ryanair.com/gb/en",
    "cookieCount": 14,
    "diagnostics": {
      "loginSubmitted": true,
      "reason": "verification_required",
      "authFrameVisible": true,
      "challengeId": "ryanair-verification-...",
      "challengeExpiresAt": "2026-05-27T10:30:00.000Z",
      "nextAction": "read_email_verification_code_then_call_submit_verification_code"
    }
  }
}
```

The response deliberately excludes the username and password.

Committed examples are sanitized. See `examples/ryanair/login-verification-required.response.json` for the expected response shape when Ryanair requires email/device verification.

### `POST /task/submit-verification-code`

Continues a live Ryanair login or booking-list task after Ryanair asks for an email/device verification code. The original browser context stays open for about 20 minutes and is identified by `diagnostics.challengeId`.

```bash
curl -X POST http://localhost:8787/task/submit-verification-code \
  -H 'content-type: application/json' \
  -d '{"airline":"ryanair","challengeId":"ryanair-verification-...","verificationCode":"12345678"}'
```

PowerShell helper:

```powershell
.\scripts\submit-verification-code.ps1 -Airline ryanair -ChallengeId "ryanair-verification-..." -VerificationCode "12345678"
```

Agent behavior:

1. Call `/task/login` or `/task/list-bookings`.
2. If `data.diagnostics.reason` is `verification_required`, read a fresh Ryanair code from Gmail using an authorized mail tool, or ask the human user to provide it.
3. Call `/task/submit-verification-code` with `data.diagnostics.challengeId` and the code.
4. Continue from the response returned by the continuation endpoint. For booking-list challenges, the harness proceeds to My Bookings automatically after Ryanair accepts the code.

The code is runtime-only. Never commit it to examples, logs, screenshots, tests, or docs.

If the user abandons the challenge, cancel it to close the pending browser context:

```powershell
.\scripts\cancel-verification-challenge.ps1 -Airline ryanair -ChallengeId "ryanair-verification-..."
```

### `POST /task/list-bookings`

Runtime-only authenticated task for listing active bookings in an airline account. Ryanair is implemented first. Credentials are supplied by the caller and are never included in the response.

```bash
curl -X POST http://localhost:8787/task/list-bookings \
  -H 'content-type: application/json' \
  -d '{"airline":"ryanair","username":"user@example.com","password":"runtime-secret","locale":"gb/en","activeOnly":true}'
```

PowerShell helper:

```powershell
$password = Read-Host "Ryanair password" -AsSecureString
.\scripts\list-bookings.ps1 -Airline ryanair -Username "user@example.com" -Password $password -Locale "gb/en"
```

Request fields:

| Field | Required | Description |
| --- | --- | --- |
| `airline` | yes | `ryanair` for the implemented adapter |
| `username` | yes | Runtime-only login username |
| `password` | yes | Runtime-only login password |
| `verificationCode` | no | Runtime-only email/device verification code, used only after Ryanair asks for it |
| `locale` | no | Ryanair site locale, defaults to `gb/en` |
| `activeOnly` | no | Defaults to active/upcoming bookings. Set `false` to request current plus past/all-booking state |
| `includeScreenshot` | no | Captures a booking-list or login-blocker screenshot artifact |
| `proxy` | no | Optional proxy config passed to FlareSolverr session creation |

Successful authenticated response shape:

```json
{
  "status": "ok",
  "sessionId": "ryanair-...",
  "data": {
    "airline": "ryanair",
    "authenticated": true,
    "url": "https://www.ryanair.com/gb/en/my-bookings",
    "count": 1,
    "bookings": [
      {
        "airline": "ryanair",
        "bookingReference": "ABC123",
        "origin": "VIE",
        "destination": "STN",
        "departureDate": "2026-07-23",
        "status": "Confirmed",
        "rawText": "Booking reference ABC123 VIE to STN 2026-07-23 Confirmed"
      }
    ],
    "cookieCount": 14,
    "diagnostics": {
      "loginSubmitted": true,
      "reason": "authenticated_indicator_found",
      "bookingListLoaded": true
    }
  }
}
```

If Ryanair requires email/device verification, the task pauses before the bookings page and returns `authenticated: false` plus `diagnostics.challengeId`. See the sanitized example and redacted screenshot in `examples/ryanair/list-bookings-verification-required.response.json`.

If Ryanair loads a booking retrieval form instead of account booking cards, the harness reports `bookingListState: "retrieve_booking_form"` and returns an empty `bookings` array. This avoids treating form labels as real bookings.

Agent flow for verification:

1. Call `/task/list-bookings` with runtime credentials.
2. If `data.diagnostics.reason` is `verification_required`, use an external Gmail-capable tool to read the fresh Ryanair verification code, or request it from the human user.
3. Call `/task/submit-verification-code` with `data.diagnostics.challengeId` and the code.
4. If Ryanair accepts the code, the harness continues the same browser session to My Bookings and returns `data.bookings`.
5. If `data.diagnostics.reason` is `verification_code_rejected`, read/request a fresh code and retry once while the challenge has not expired.

Unsupported route response:

```json
{
  "status": "unsupported_route",
  "message": "ryanair does not support VIE-EWR in the current harness.",
  "diagnostics": {
    "airline": "ryanair",
    "origin": "VIE",
    "destination": "EWR",
    "reason": "Known unsupported route for this airline adapter.",
    "supportedAirportsEndpoint": "/airlines/ryanair/support"
  }
}
```

## Screenshots

Set `includeScreenshot` to `true` to capture a rendered pricing evidence page:

```bash
curl -X POST http://localhost:8787/task/find-flights \
  -H 'content-type: application/json' \
  -d '{"airline":"ryanair","origin":"VIE","destination":"STN","dateOut":"2026-06-15","adults":1,"currency":"EUR","includeScreenshot":true}'
```

Response data includes:

```json
{
  "screenshot": {
    "path": "artifacts/screenshots/ryanair_VIE_STN_2026-06-15_...",
    "url": "https://www.ryanair.com/gb/en/trip/flights/select?...",
    "capturedAt": "2026-05-27T06:42:44.533Z",
    "description": "Pricing evidence page for ryanair VIE-STN 2026-06-15"
  }
}
```

Checked-in screenshot-backed examples are available in [examples](examples/README.md) for the airline routes that currently validate successfully.

Before taking screenshots, the browser layer tries common consent controls including OneTrust accept buttons, `Accept all`, `Accept cookies`, `Allow all`, `I agree`, `Agree`, `Continue`, `Got it`, and common `data-test` cookie selectors. This keeps evidence screenshots from being covered by cookie bars and leaves the short-lived browser context with confirmed cookies for the rest of the task.

To live-test cookie consent handling across all configured airline URLs:

```bash
mkdir -p artifacts/cookie-consent
node scripts/test-cookie-consent.mjs | tee artifacts/cookie-consent/results.json
```

The generated `artifacts/cookie-consent/*.png` files are local validation artifacts and are intentionally ignored by git.

## Windows PowerShell

Start services:

```powershell
.\scripts\start-harness.ps1
```

Find flights:

```powershell
.\scripts\find-flights.ps1 -Airline ryanair -Origin VIE -Destination STN -DateOut 2026-06-15 -Adults 1
```

Resolve a debug session:

```powershell
.\scripts\resolve-session.ps1 -Airline ryanair
```

Destroy a debug session:

```powershell
.\scripts\destroy-session.ps1 -SessionId "<session id>"
```

## Development

Run locally:

```bash
npm install
npm run dev
```

Type-check:

```bash
npm run check
```

Run tests:

```bash
npm test
```

Full verification:

```bash
npm run verify
```

Live route matrix against the running Docker harness:

```bash
npm run test:routes
```

The test suite is offline and deterministic. It covers parser behavior, validation, session cleanup, manual-intervention diagnostics, and screenshot URL construction. CI runs `npm run verify`.

## Adding Another Airline

1. Add the airline code to `src/core/types.ts` and `src/validation.ts`.
2. Implement an adapter in `src/airlines/`.
3. Prefer structured APIs when stable and available.
4. If the site needs rendering, use the Playwright browser server through `rendered-browser.ts`.
5. Add a screenshot URL in `src/airlines/screenshot-url.ts`.
6. Register the adapter in `src/airlines/index.ts`.
7. Add parser/session tests under `test/`.
8. Add a PowerShell script enum entry if the airline should be available from scripts.
9. Run `npm run verify`.

## Agent Skill

The agent-facing instructions are in [skills/airline-harness.md](skills/airline-harness.md). Agents should call the harness once per task and only use browser navigation outside the harness when diagnostics show that a new custom adapter must be developed.
