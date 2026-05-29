param(
  [string]$HarnessUrl = "http://localhost:8787",
  [Parameter(Mandatory = $true)]
  [ValidateSet("ryanair", "wizzair", "lufthansa", "austrian", "american", "british", "qatar")]
  [string]$Airline,
  [int]$TtlMinutes = 30
)

$payload = @{
  airline = $Airline
  ttlMinutes = $TtlMinutes
}

$body = $payload | ConvertTo-Json -Depth 4

Invoke-RestMethod -UseBasicParsing -Uri "$HarnessUrl/sessions" -Method Post -ContentType "application/json" -Body $body |
  ConvertTo-Json -Depth 8
