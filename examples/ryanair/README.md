# Ryanair Examples

This folder documents each implemented Ryanair harness skill with a sanitized response and screenshot where the task has a visual state. Runtime credentials, verification codes, booking references, cookies, and account identifiers must not be committed.

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

- Response: `login-verification-required.response.json`
- Screenshot: `login-verification-required.screenshot.png`

![Ryanair login verification screenshot](login-verification-required.screenshot.png)

When Ryanair asks for device or email verification, the harness returns `authenticated: false` with `diagnostics.reason` set to `verification_required`. Agents should report that state and stop; they should not loop retries or ask the harness to keep submitting credentials. If the response is `authenticated: true`, continue with the authenticated task using the harness rather than manual browser clicks.

## Active Bookings Example

Ryanair active bookings are driven through `POST /task/list-bookings`. This is an authenticated runtime task; no real account data is committed.

PowerShell:

```powershell
$password = Read-Host "Ryanair password" -AsSecureString
.\scripts\list-bookings.ps1 -Airline ryanair -Username "user@example.com" -Password $password -Locale "gb/en" -IncludeScreenshot
```

If Ryanair requires email/device verification, the agent should read the fresh code through a separate Gmail-capable tool and retry with `-VerificationCode`:

```powershell
.\scripts\list-bookings.ps1 -Airline ryanair -Username "user@example.com" -Password $password -Locale "gb/en" -VerificationCode "12345678" -IncludeScreenshot
```

- Response: `list-bookings-verification-required.response.json`
- Screenshot: `list-bookings-verification-required.screenshot.png`

![Ryanair bookings verification screenshot](list-bookings-verification-required.screenshot.png)
