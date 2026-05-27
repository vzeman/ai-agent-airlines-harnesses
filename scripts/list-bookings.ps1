param(
  [ValidateSet("ryanair", "wizzair", "lufthansa", "austrian", "american", "british", "qatar")]
  [string]$Airline = "ryanair",
  [Parameter(Mandatory = $true)]
  [string]$Username,
  [Parameter(Mandatory = $true)]
  [securestring]$Password,
  [string]$VerificationCode = "",
  [string]$Locale = "gb/en",
  [switch]$AllBookings,
  [switch]$IncludeScreenshot,
  [string]$HarnessUrl = "http://localhost:8787"
)

$ErrorActionPreference = "Stop"
$passwordPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Password)
$plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringAuto($passwordPtr)

try {
  $payload = @{
    airline = $Airline
    username = $Username
    password = $plainPassword
    locale = $Locale
    activeOnly = -not $AllBookings
  }

  if ($IncludeScreenshot) {
    $payload.includeScreenshot = $true
  }

  if ($VerificationCode -ne "") {
    $payload.verificationCode = $VerificationCode
  }

  $body = $payload | ConvertTo-Json -Depth 10
  Invoke-RestMethod -UseBasicParsing -Uri "$HarnessUrl/task/list-bookings" -Method Post -ContentType "application/json" -Body $body |
    ConvertTo-Json -Depth 50
}
finally {
  if ($passwordPtr -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPtr)
  }
  if ($plainPassword) {
    $plainPassword = $null
  }
}
