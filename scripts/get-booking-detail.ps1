param(
  [string]$HarnessUrl = "http://localhost:8787",
  [ValidateSet("ryanair")]
  [string]$Airline = "ryanair",
  [Parameter(Mandatory = $true)]
  [string]$Username,
  [Parameter(Mandatory = $true)]
  [string]$Password,
  [Parameter(Mandatory = $true)]
  [string]$DetailUrl,
  [string[]]$Actions = @("review"),
  [string]$Locale = "gb/en",
  [switch]$IncludeScreenshot
)

$payload = @{
  airline = $Airline
  username = $Username
  password = $Password
  detailUrl = $DetailUrl
  actions = $Actions
  locale = $Locale
  includeScreenshot = [bool]$IncludeScreenshot
}

$body = $payload | ConvertTo-Json -Depth 8

Invoke-RestMethod -UseBasicParsing -Uri "$HarnessUrl/task/booking-detail" -Method Post -ContentType "application/json" -Body $body |
  ConvertTo-Json -Depth 12
