# austrian VIE-EWR
Confirmed working example for austrian on VIE-EWR, departing 2026-07-23.
- Response: `find-vie-ewr-2026-07-23.response.json`
- Screenshot: `screenshot.png`
- Cheapest returned price: 581 EUR
- Returned flights/options: 1

![Austrian pricing screenshot](screenshot.png)

The screenshot is captured by the harness with cookie banners accepted before capture. Route-offer pages can contain published indicative fares; exact live checkout prices still require the airline booking flow to complete.

## Live Airport Catalog

Confirmed live airport catalog example for Austrian Airlines.

- Endpoint: `POST /task/supported-airports`
- Request body: `{"airline":"austrian","source":"live","limit":500}`
- Response: `supported-airports-live.response.json`
- Screenshot: `supported-airports-live.screenshot.png`
- Airports returned: 109
- Catalog source: `community-openflights-route-database`

![Austrian live airport catalog screenshot](supported-airports-live.screenshot.png)

Airport catalog discovery does not create a browser or FlareSolverr session. Use the response `data.diagnostics.austrian.source` as the provenance field when reporting the catalog source.
