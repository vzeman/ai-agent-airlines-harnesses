# Airline Examples

These examples are committed only for airline routes that the live harness confirmed as working and where a screenshot was captured successfully. Each response was generated through `POST /task/find-flights` with `includeScreenshot: true`.

Login examples are sanitized and never include real usernames, passwords, cookies, or verification codes.

| Airline | Route | Request date | Price evidence | Response | Screenshot |
| --- | --- | --- | --- | --- | --- |
| Ryanair | VIE-STN | 2026-07-23 | 56 EUR | [response](ryanair/find-vie-stn-2026-07-23.response.json) | [screenshot](ryanair/find-vie-stn-2026-07-23.screenshot.png) |
| Wizz Air | BTS-VAR | 2026-06-18 to 2026-06-27 | 35.99 EUR outbound, 39.99 EUR return | [response](wizzair/find-bts-var-2026-06-18.response.json) | [screenshot](wizzair/screenshot.png) |
| Austrian | VIE-EWR | 2026-07-23 | 581 EUR | [response](austrian/find-vie-ewr-2026-07-23.response.json) | [screenshot](austrian/screenshot.png) |
| Lufthansa | VIE-EWR | 2026-07-23 | 581 EUR | [response](lufthansa/find-vie-ewr-2026-07-23.response.json) | [screenshot](lufthansa/screenshot.png) |
| American Airlines | JFK-LAX | 2026-07-23 | 277 USD | [response](american/find-jfk-lax-2026-07-23.response.json) | [screenshot](american/screenshot.png) |
| Qatar Airways | VIE-LHR | 2026-07-23 | 1193 EUR | [response](qatar/find-vie-lhr-2026-07-23.response.json) | [screenshot](qatar/screenshot.png) |

British Airways is not included in this screenshot set because both artifact-generation retries hit a FlareSolverr challenge timeout. Route-offer fallbacks are official airline pages but can be indicative rather than guaranteed checkout quotes. The response JSON includes the source and caveat in each fare's `raw` payload where applicable.

## Login Example

- Ryanair runtime login: [sanitized verification-required response](ryanair/login-verification-required.response.json), [redacted screenshot](ryanair/login-verification-required.screenshot.png)
- Ryanair active bookings: [sanitized verification-required response](ryanair/list-bookings-verification-required.response.json), [redacted screenshot](ryanair/list-bookings-verification-required.screenshot.png)

Use `POST /task/login` only for authenticated tasks. Supply credentials at runtime through the API request or `scripts/login-airline.ps1`; do not add them to repository files. A `verification_required` response means the airline accepted the submitted login step but needs a user-controlled email/device code, so the agent should stop and report that blocker.

Use `POST /task/list-bookings` to retrieve active bookings after login. If the first call returns `verification_required`, the agent should read the fresh Ryanair code from Gmail through another authorized tool and retry with the runtime-only `verificationCode` field. If Ryanair rejects the code, retry once with a fresh code.
