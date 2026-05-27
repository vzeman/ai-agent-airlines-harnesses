param(
  [ValidateSet("ryanair", "wizzair", "lufthansa", "austrian", "american", "british", "qatar")]
  [string]$Airline = "ryanair",
  [Parameter(Mandatory = $true)]
  [string]$Origin,
  [Parameter(Mandatory = $true)]
  [string]$Destination,
  [Parameter(Mandatory = $true)]
  [string]$DateOut,
  [int]$Adults = 1,
  [string]$Currency = "",
  [switch]$IncludeScreenshot,
  [string]$HarnessUrl = "http://localhost:8787"
)

$ErrorActionPreference = "Stop"
$payload = @{
  airline = $Airline
  origin = $Origin
  destination = $Destination
  dateOut = $DateOut
  adults = $Adults
}

if ($Currency -ne "") {
  $payload.currency = $Currency
}

if ($IncludeScreenshot) {
  $payload.includeScreenshot = $true
}

$body = $payload | ConvertTo-Json -Depth 10
Invoke-RestMethod -UseBasicParsing -Uri "$HarnessUrl/task/find-flights" -Method Post -ContentType "application/json" -Body $body |
  ConvertTo-Json -Depth 50
