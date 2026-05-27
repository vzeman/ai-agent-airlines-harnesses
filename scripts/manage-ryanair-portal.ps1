param(
  [string]$HarnessUrl = "http://localhost:8787",
  [ValidateSet("ryanair")]
  [string]$Airline = "ryanair",
  [Parameter(Mandatory = $true)]
  [string]$Username,
  [Parameter(Mandatory = $true)]
  [string]$Password,
  [ValidateSet("personal_information", "travel_documents", "companions", "wallet", "bookings")]
  [string]$Section = "personal_information",
  [ValidateSet("review")]
  [string]$Operation = "review",
  [string]$Locale = "gb/en",
  [switch]$IncludeScreenshot
)

$payload = @{
  airline = $Airline
  username = $Username
  password = $Password
  section = $Section
  operation = $Operation
  locale = $Locale
  includeScreenshot = [bool]$IncludeScreenshot
}

$body = $payload | ConvertTo-Json -Depth 8

Invoke-RestMethod -UseBasicParsing -Uri "$HarnessUrl/task/manage-portal" -Method Post -ContentType "application/json" -Body $body |
  ConvertTo-Json -Depth 12
