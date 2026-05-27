param(
  [ValidateSet("ryanair", "wizzair", "lufthansa", "austrian", "american", "british", "qatar")]
  [string]$Airline = "ryanair",
  [Parameter(Mandatory = $true)]
  [string]$ChallengeId,
  [Parameter(Mandatory = $true)]
  [string]$VerificationCode,
  [string]$HarnessUrl = "http://localhost:8787"
)

$ErrorActionPreference = "Stop"

$body = @{
  airline = $Airline
  challengeId = $ChallengeId
  verificationCode = $VerificationCode
} | ConvertTo-Json -Depth 5

Invoke-RestMethod -UseBasicParsing -Uri "$HarnessUrl/task/submit-verification-code" -Method Post -ContentType "application/json" -Body $body |
  ConvertTo-Json -Depth 50
