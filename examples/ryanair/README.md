# Ryanair Examples

This folder documents each implemented Ryanair harness skill with a sanitized response and screenshot where the task has a visual state. Login and bookings screenshots are sanitized illustrative captures that use placeholders. Runtime credentials, verification codes, booking references, cookies, and account identifiers must not be committed.

## Flight Pricing

Confirmed working example for Ryanair on VIE-STN, departing 2026-07-23.

- Response: `find-vie-stn-2026-07-23.response.json`
- Screenshot: `find-vie-stn-2026-07-23.screenshot.png`
- Cheapest returned price: 56 EUR
- Returned flights/options: 1

![Ryanair pricing screenshot](find-vie-stn-2026-07-23.screenshot.png)

The screenshot is captured by the harness with cookie banners accepted before capture. Route-offer pages can contain published indicative fares; exact live checkout prices still require the airline booking flow to complete.

## Runtime Login Example

Ryanair login is driven through `POST /task/login`. Credentials are passed only at runtime and must never be committed to examples, screenshots, docs, tests, or logs.

PowerShell:

```powershell
$password = Read-Host "Ryanair password" -AsSecureString
.\scripts\login-airline.ps1 -Airline ryanair -Username "user@example.com" -Password $password -Locale "gb/en"
```

HTTP:

```bash
curl -X POST http://localhost:8787/task/login \
  -H 'content-type: application/json' \
  -d '{"airline":"ryanair","username":"user@example.com","password":"runtime-secret","locale":"gb/en"}'
```

- Request: `login-verification-required.request.json`
- Response: `login-verification-required.response.json`
- Screenshot: `login-verification-required.screenshot.png`

![Ryanair login verification screenshot](login-verification-required.screenshot.png)

This example uses the placeholder username `user@example.com`. Real usernames, passwords, and verification codes are runtime-only values and are not returned by the harness.

When Ryanair asks for device or email verification, the harness returns `authenticated: false`, `diagnostics.reason = "verification_required"`, and a short-lived `diagnostics.challengeId`. Agents should read the fresh code with an authorized Gmail-capable tool or ask the human user for it, then call `POST /task/submit-verification-code` with that `challengeId`. If the continuation response is `authenticated: true`, continue with the authenticated task using the harness rather than manual browser clicks.

## Active Bookings Example

Ryanair active bookings are driven through `POST /task/list-bookings`. This is an authenticated runtime task; no real account data is committed.

PowerShell:

```powershell
$password = Read-Host "Ryanair password" -AsSecureString
.\scripts\list-bookings.ps1 -Airline ryanair -Username "user@example.com" -Password $password -Locale "gb/en" -IncludeScreenshot
```

If Ryanair requires email/device verification, the agent should read the fresh code through a separate Gmail-capable tool or ask the human user, then continue the same browser session with the returned `challengeId`:

```powershell
.\scripts\submit-verification-code.ps1 -Airline ryanair -ChallengeId "ryanair-verification-..." -VerificationCode "12345678"
```

- Request: `list-bookings-verification-required.request.json`
- Response: `list-bookings-verification-required.response.json`
- Continuation request: `submit-verification-code.request.json`
- Screenshot: `list-bookings-verification-required.screenshot.png`

![Ryanair bookings verification screenshot](list-bookings-verification-required.screenshot.png)

This example is intentionally a verification-blocker state. Once the agent supplies a fresh code to `/task/submit-verification-code` and Ryanair accepts it, the harness continues the same pending task to My Bookings and returns `data.bookings`.
