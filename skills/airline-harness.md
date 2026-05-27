# Airline Harness Skill

Use this skill when the agent needs flight discovery or price extraction for Ryanair, Wizz Air, Lufthansa, Austrian, American Airlines, British Airways, or Qatar Airways.

## Principle

Call the harness once for a complete task. Do not navigate the airline website step by step unless the harness returns `manual_intervention_required` or an explicit error that cannot be retried.

## Start Services

If the harness is not running:

```powershell
.\scripts\start-harness.ps1
```

The harness listens at `http://localhost:8787`.

## Supported Airports

Use support metadata before trying unusual routes:

```powershell
Invoke-RestMethod -UseBasicParsing -Uri "http://localhost:8787/airlines/ryanair/support"
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

The returned `data.flights` array is the canonical result. Prefer structured fields:

- `departure`
- `arrival`
- `flightNumber`
- `currency`
- `price`
- `fareClass`

When `data.screenshot` is present, report `data.screenshot.path` as the evidence artifact. Do not request screenshots by default because they require a rendered browser context and are slower than structured price extraction.

If the response status is `manual_intervention_required`, inspect `diagnostics.bookingUrl` and `diagnostics.rendered`. Do not retry repeatedly; one retry is enough for transient errors. Treat this as a signal that the airline needs a custom harness script, not as an instruction for the LLM agent to manually click through the whole website.

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

After the code is accepted, the harness continues the same pending task; do not manually click through My Bookings in the LLM loop. The canonical booking result is `data.bookings`. If `includeScreenshot` was requested, use `data.screenshot.path` as visual evidence. If Ryanair shows a retrieval form rather than booking cards, report `data.diagnostics.bookingListState = "retrieve_booking_form"` and the empty `data.bookings` array. See `examples/ryanair/list-bookings-verification-required.response.json` and `examples/ryanair/list-bookings-success.response.json` for sanitized examples.

## Session Lifecycle

For normal tasks, `/task/find-flights`, `/task/login`, and `/task/list-bookings` create and destroy browser sessions automatically. The exception is Ryanair email/device verification: the harness keeps a pending browser context alive until `/task/submit-verification-code` is called or the challenge expires.

Only use manual session commands for debugging:

```powershell
.\scripts\resolve-session.ps1 -Airline ryanair
.\scripts\destroy-session.ps1 -SessionId "<session id>"
```

Always destroy manual sessions after inspection.

## Retry Rules

If a task fails with a transient HTTP or Cloudflare error, retry once. If it fails again, report the exact harness error and avoid opening more browser sessions in a loop.
