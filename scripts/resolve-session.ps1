param(
  [ValidateSet("ryanair", "wizzair", "lufthansa", "austrian", "american", "british", "qatar")]
  [string]$Airline = "ryanair",
  [string]$HarnessUrl = "http://localhost:8787"
)

$ErrorActionPreference = "Stop"
$body = @{ airline = $Airline } | ConvertTo-Json -Depth 10
Invoke-RestMethod -UseBasicParsing -Uri "$HarnessUrl/session/resolve" -Method Post -ContentType "application/json" -Body $body |
  ConvertTo-Json -Depth 20
