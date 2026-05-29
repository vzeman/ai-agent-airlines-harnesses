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

## Endpoint Examples

| Endpoint | Scope | Request | Response | Screenshot / artifact policy |
| --- | --- | --- | --- | --- |
| `POST /task/find-flights` | Public flight pricing | See airline rows above | See airline rows above | Committed only for confirmed public pricing pages |
| `POST /task/login` | Ryanair authenticated login | [request](ryanair/login-verification-required.request.json) | [verification required](ryanair/login-verification-required.response.json), [success](ryanair/login-success.response.json) | Redacted screenshots are committed for verification and success states |
| `POST /task/submit-verification-code` | Continue a live Ryanair verification challenge | [request](ryanair/submit-verification-code.request.json) | [success](ryanair/submit-verification-code.response.json) | Verification codes are runtime-only and never committed |
| `POST /task/list-bookings` | Ryanair current and past bookings | [request](ryanair/list-bookings-verification-required.request.json) | [verification required](ryanair/list-bookings-verification-required.response.json), [success](ryanair/list-bookings-success.response.json) | Redacted screenshots are committed; real booking screenshots stay runtime-only |
| `POST /task/booking-detail` | Ryanair itinerary, passenger products, receipts, claims | [request](ryanair/booking-detail-itinerary.request.json) | [response](ryanair/booking-detail-itinerary.response.json) | Real itinerary screenshots, receipts, and downloads stay under runtime artifacts and are not committed |
| `POST /task/manage-portal` | Ryanair myRyanair portal review | [request](ryanair/manage-portal-travel-documents.request.json) | [response](ryanair/manage-portal-travel-documents.response.json) | Real portal screenshots can expose account data and are not committed |

Use `POST /task/login` only for authenticated tasks. Supply credentials at runtime through the API request or `scripts/login-airline.ps1`; do not add them to repository files. A `verification_required` response means the airline accepted the submitted login step but needs a user-controlled email/device code, so the agent should continue through `POST /task/submit-verification-code` after reading or receiving the fresh code.

Use `POST /task/list-bookings` to retrieve active/current and past bookings after login. If the first call returns `verification_required`, the response includes a short-lived `diagnostics.challengeId`. The agent should read the fresh Ryanair code from Gmail through another authorized tool, or ask the human user for it, then call `POST /task/submit-verification-code` with the `challengeId`. With all bookings, the harness clicks `Load more` for older reservations. If Ryanair loads a retrieval form instead of booking cards, the harness returns `bookingListState: "retrieve_booking_form"` and an empty booking array.

Use `POST /task/manage-portal` to review myRyanair sections such as personal information, travel documents, companions, wallet, and bookings. The first operation is read-only `review`; it navigates and summarizes visible labels without submitting account changes.

Use `POST /task/booking-detail` to review a reservation URL, itinerary, passenger products, receipt download controls, and claim/refund entry points. Receipt downloads are stored as runtime artifacts and should not be committed when they contain real account data.
