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
.\scripts\login-airline.ps1 -Airline ryanair -Username "user@example.com" -Password $password -Locale "gb/en"
```

The login response is sanitized and does not include the username or password. It creates and destroys its FlareSolverr session automatically.

Interpret `data.authenticated` and `data.diagnostics.reason`:

- `authenticated_indicator_found`: login completed.
- `verification_required`: Ryanair requires an email/device code; stop and report that blocker.
- `verification_code_rejected`: the supplied code was rejected or expired; get a fresh code and retry once.
- `login_rejected_or_form_error`: credentials were rejected or the form showed an error; do not retry more than once.

See `examples/ryanair/login-verification-required.response.json` for a sanitized example.

## Active Bookings

Use `POST /task/list-bookings` or `scripts/list-bookings.ps1` when the user asks for active bookings in an airline account. Ryanair is implemented first.

```powershell
$password = Read-Host "Ryanair password" -AsSecureString
.\scripts\list-bookings.ps1 -Airline ryanair -Username "user@example.com" -Password $password -Locale "gb/en" -IncludeScreenshot
```

If the response has `data.diagnostics.reason = "verification_required"`, use an authorized Gmail/tooling workflow to retrieve the fresh Ryanair verification code, then call the same task again with `-VerificationCode`:

```powershell
.\scripts\list-bookings.ps1 -Airline ryanair -Username "user@example.com" -Password $password -Locale "gb/en" -VerificationCode "12345678"
```

After the code is accepted, continue with the same harness task; do not manually click through My Bookings in the LLM loop. The canonical booking result is `data.bookings`. If `includeScreenshot` was requested, use `data.screenshot.path` as visual evidence. See `examples/ryanair/list-bookings-verification-required.response.json` for a sanitized verification example.

## Session Lifecycle

For normal tasks, `/task/find-flights` and `/task/login` create and destroy a browser session automatically.

Only use manual session commands for debugging:

```powershell
.\scripts\resolve-session.ps1 -Airline ryanair
.\scripts\destroy-session.ps1 -SessionId "<session id>"
```

Always destroy manual sessions after inspection.

## Retry Rules

If a task fails with a transient HTTP or Cloudflare error, retry once. If it fails again, report the exact harness error and avoid opening more browser sessions in a loop.
