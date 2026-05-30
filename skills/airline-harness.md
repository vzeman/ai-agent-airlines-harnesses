# Airline Harness Skill

Use this skill when the agent needs flight discovery or price extraction for Ryanair, Wizz Air, Lufthansa, Austrian, American Airlines, British Airways, or Qatar Airways.

## Principle

Call the harness once for a complete task. Do not navigate the airline website step by step unless the harness returns `manual_intervention_required` or an explicit error that cannot be retried.

Use `docs/agent-task-contract.md` as the source of truth for task names, status handling, verification continuation, evidence artifacts, and session cleanup.

## Start Services

If the harness is not running:

```powershell
.\scripts\start-harness.ps1
```

The harness listens at `http://localhost:8787`.

## Reusable Sessions

Normal task calls create and destroy sessions automatically. For a multi-step workflow, create a reusable session and pass its ID as `taskSessionId`:

```powershell
$session = .\scripts\create-session.ps1 -Airline ryanair -TtlMinutes 30 | ConvertFrom-Json
```

Use `$session.sessionId` only for related task calls, then close it:

```powershell
.\scripts\destroy-session.ps1 -SessionId $session.sessionId
```

Do not keep reusable sessions open after the user workflow is complete.

## Supported Airports

Use support metadata before trying unusual routes:

```powershell
Invoke-RestMethod -UseBasicParsing -Uri "http://localhost:8787/airlines/ryanair/support"
```

For agent workflows, prefer the task-style airport harness so you can search IATA, city, or country before calling `find-flights`:

```powershell
Invoke-RestMethod -UseBasicParsing -Uri "http://localhost:8787/task/supported-airports" -Method Post -ContentType "application/json" -Body '{"airline":"qatar","query":"London"}'
```

Omit `airline` to search all configured adapters. The task returns matching airports plus the airlines that support each airport, and it does not create browser sessions.

The default `source` is `curated`, meaning the harness-tested subset. Use `source: "live"` when you need a fuller airline network catalog. Ryanair uses its public active-airport catalog; the other airline adapters currently use the live OpenFlights route database as a broad remote catalog. Read `data.diagnostics[airline].source` before explaining provenance.

```powershell
Invoke-RestMethod -UseBasicParsing -Uri "http://localhost:8787/task/supported-airports" -Method Post -ContentType "application/json" -Body '{"airline":"ryanair","source":"live","query":"Vienna"}'
```

If a task returns `unsupported_route`, report the reason from `diagnostics.reason` and do not retry that airline for the same route.

## Find Flights

Use:

```powershell
.\scripts\find-flights.ps1 -Airline ryanair -Origin BTS -Destination STN -DateOut 2026-06-15 -Adults 1
```

Use `-IncludeScreenshot` only when the user needs visual evidence of the pricing page:

```powershell
.\scripts\find-flights.ps1 -Airline ryanair -Origin VIE -Destination STN -DateOut 2026-06-15 -Adults 1 -Currency EUR -IncludeScreenshot
```

Use `-Airline wizzair` for Wizz Air.
Use `-Airline lufthansa` or `-Airline austrian` for Lufthansa Group carriers.
Use `-Airline american`, `-Airline british`, or `-Airline qatar` for the new browser-flow adapters.
For Qatar, use each flight row's `raw.extractionSource`, `raw.sourceMethod`, and `raw.sourceUrl` as provenance. Direct browser access can return access-denied while the harness still succeeds through a FlareSolverr-resolved booking HTML response.

The returned `data.flights` array is the canonical result. Prefer structured fields:

- `departure`
- `arrival`
- `flightNumber`
- `currency`
- `price`
- `fareClass`

When `data.screenshot` is present, report `data.screenshot.path` as the evidence artifact. Do not request screenshots by default because they require a rendered browser context and are slower than structured price extraction.

If the response status is `manual_intervention_required`, inspect `diagnostics.bookingUrl`, `diagnostics.rendered`, `diagnostics.renderedState`, `diagnostics.routeOffer`, and `diagnostics.blocker` when present. Do not retry repeatedly; one retry is enough for transient errors. Treat `retryable: false` as a terminal adapter diagnostic that needs implementation work, not as an instruction for the LLM agent to manually click through the whole website. For British Airways `renderedState: "high_demand_queue"`, wait before retrying instead of opening a manual browser session.

## Browser Behavior

The harness owns browser work. It opens a resolved airline session, accepts common cookie-consent banners, loads the booking URL, waits for rendered results and XHR responses, extracts prices, and closes the Playwright context. Custom airline scripts should use ordinary page interactions such as `click`, `fill`, selecting suggestions, date-picker clicks, and search submission. Avoid ad-hoc manual browsing from the agent when the harness can be extended instead.

## Login

Use `POST /task/login` only when the user explicitly asks for an authenticated airline task. Credentials are runtime-only request fields. Never write credentials into examples, tests, docs, logs, screenshots, or commits.

Ryanair login is implemented first. Other airlines return `manual_intervention_required` until their custom login flow is added.

Preferred PowerShell call:

```powershell
$password = Read-Host "Ryanair password" -AsSecureString
.\scripts\login-airline.ps1 -Airline ryanair -Username "user@example.com" -Password $password -Locale "gb/en" -IncludeScreenshot
```

The login response is sanitized and does not include the username or password. It creates and destroys its FlareSolverr session automatically.
When `includeScreenshot` is true, use `data.screenshot.path` as successful login proof.

Interpret `data.authenticated` and `data.diagnostics.reason`:

- `authenticated_indicator_found`: login completed.
- `verification_required`: Ryanair requires an email/device code; read it from an authorized mailbox tool or ask the human user, then call `scripts/submit-verification-code.ps1` with `data.diagnostics.challengeId`.
- `verification_code_rejected`: the supplied code was rejected or expired; get a fresh code and retry once while the challenge is still valid.
- `login_rejected_or_form_error`: credentials were rejected or the form showed an error; do not retry more than once.

See `examples/ryanair/login-verification-required.response.json` for a sanitized example.

When a response contains `data.diagnostics.challengeId`, the browser context stays alive for `data.diagnostics.challengeTtlMinutes` minutes, default `45`. Do not restart login or call the original task again. Continue the same session:

```powershell
.\scripts\submit-verification-code.ps1 -Airline ryanair -ChallengeId "<challenge id>" -VerificationCode "<fresh code>"
```

The verification code is runtime-only. Never write it into files, examples, logs, or screenshots.

If the user cannot provide the code or the agent stops the task, cancel the pending context:

```powershell
.\scripts\cancel-verification-challenge.ps1 -Airline ryanair -ChallengeId "<challenge id>"
```

## Active Bookings

Use `POST /task/list-bookings` or `scripts/list-bookings.ps1` when the user asks for active bookings in an airline account. Ryanair is implemented first.

```powershell
$password = Read-Host "Ryanair password" -AsSecureString
.\scripts\list-bookings.ps1 -Airline ryanair -Username "user@example.com" -Password $password -Locale "gb/en" -IncludeScreenshot
```

Use `-AllBookings` when the user asks for current plus past bookings:

```powershell
.\scripts\list-bookings.ps1 -Airline ryanair -Username "user@example.com" -Password $password -Locale "gb/en" -AllBookings -IncludeScreenshot
```

If the response has `data.diagnostics.reason = "verification_required"`, use an authorized Gmail/tooling workflow to retrieve the fresh Ryanair verification code, then submit it to the pending challenge:

```powershell
.\scripts\submit-verification-code.ps1 -Airline ryanair -ChallengeId "<challenge id>" -VerificationCode "<fresh code>"
```

After the code is accepted, the harness continues the same pending task; do not manually click through My Bookings in the LLM loop. The canonical booking result is `data.bookings`. With `-AllBookings`, the harness clicks `Load more` on `/trip/manage` until older previous bookings stop appearing, capped at 10 clicks. If `includeScreenshot` was requested, use `data.screenshot.path` as visual evidence. If Ryanair shows a retrieval form rather than booking cards, report `data.diagnostics.bookingListState = "retrieve_booking_form"` and the empty `data.bookings` array. See `examples/ryanair/list-bookings-verification-required.response.json` and `examples/ryanair/list-bookings-success.response.json` for sanitized examples.

## Booking Detail

Use `POST /task/booking-detail` or `scripts/get-booking-detail.ps1` when the user asks for details of a specific Ryanair reservation, itinerary, receipts, claim options, or passenger products. Pass a full Ryanair `detailUrl` from `/trip/manage/...`, including `/itinerary` when the user wants itinerary details.

Supported `actions`:

- `review`
- `itinerary`
- `booking_receipt`
- `inflight_receipt`
- `open_claim`
- `passenger_products`

```powershell
$password = Read-Host "Ryanair password" -AsSecureString
.\scripts\get-booking-detail.ps1 -Username "user@example.com" -Password $password -DetailUrl "https://www.ryanair.com/gb/en/trip/manage/<trip-id>/itinerary" -Actions itinerary,passenger_products -IncludeScreenshot
```

If `data.diagnostics.reason = "verification_required"`, submit the code to the same pending challenge. The continuation returns `data.detailLines`, `data.actionLabels`, `data.downloads`, and optional `data.screenshot.path`. Receipt actions download artifacts only when Ryanair exposes matching controls. `open_claim` navigates/reviews the claim area; it must not submit a claim unless a later explicit submit operation is added.

## Ryanair Portal

Use `POST /task/manage-portal` or `scripts/manage-ryanair-portal.ps1` when the user asks to manage myRyanair account areas without a specific flight. Supported `section` values:

- `personal_information`
- `travel_documents`
- `companions`
- `wallet`
- `bookings`

The only supported `operation` is `review`. It navigates to the section and returns `data.headings`, `data.fieldLabels`, and `data.actionLabels` so the agent can decide the next step with few LLM/browser calls. It does not submit profile, document, companion, wallet, or booking changes.

```powershell
$password = Read-Host "Ryanair password" -AsSecureString
.\scripts\manage-ryanair-portal.ps1 -Username "user@example.com" -Password $password -Section travel_documents -IncludeScreenshot
```

If `data.diagnostics.reason = "verification_required"`, submit the code to the same pending challenge:

```powershell
.\scripts\submit-verification-code.ps1 -Airline ryanair -ChallengeId "<challenge id>" -VerificationCode "<fresh code>"
```

After the code is accepted, the harness resumes the original portal section. Report `data.sectionLoaded`, `data.url`, and the returned labels. Portal screenshots may contain personal account data; never commit real-account portal screenshots.

## Session Lifecycle

For normal tasks, `/task/find-flights`, `/task/login`, `/task/list-bookings`, `/task/booking-detail`, and `/task/manage-portal` create and destroy browser sessions automatically. The exceptions are reusable sessions created through `POST /sessions` and Ryanair email/device verification, where the harness keeps a pending browser context alive until `/task/submit-verification-code` is called or the challenge expires.

Only use manual session commands for debugging:

```powershell
.\scripts\resolve-session.ps1 -Airline ryanair
.\scripts\destroy-session.ps1 -SessionId "<session id>"
```

Always destroy manual sessions after inspection.

## Retry Rules

If a task fails with a transient HTTP or Cloudflare error, retry once. If it fails again, report the exact harness error and avoid opening more browser sessions in a loop.
