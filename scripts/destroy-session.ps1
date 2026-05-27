param(
  [Parameter(Mandatory = $true)]
  [string]$SessionId,
  [string]$HarnessUrl = "http://localhost:8787"
)

$ErrorActionPreference = "Stop"
$encoded = [System.Uri]::EscapeDataString($SessionId)
Invoke-RestMethod -UseBasicParsing -Uri "$HarnessUrl/sessions/$encoded" -Method Delete |
  ConvertTo-Json -Depth 20
