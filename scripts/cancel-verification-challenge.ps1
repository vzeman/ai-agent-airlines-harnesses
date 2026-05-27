param(
  [ValidateSet("ryanair", "wizzair", "lufthansa", "austrian", "american", "british", "qatar")]
  [string]$Airline = "ryanair",
  [Parameter(Mandatory = $true)]
  [string]$ChallengeId,
  [string]$HarnessUrl = "http://localhost:8787"
)

$ErrorActionPreference = "Stop"

$encodedChallengeId = [System.Uri]::EscapeDataString($ChallengeId)
Invoke-RestMethod -UseBasicParsing -Uri "$HarnessUrl/task/verification-challenges/$Airline/$encodedChallengeId" -Method Delete |
  ConvertTo-Json -Depth 20
