param(
  [ValidateSet("ryanair", "wizzair", "lufthansa", "austrian", "american", "british", "qatar")]
  [string]$Airline = "ryanair",
  [Parameter(Mandatory = $true)]
  [string]$Username,
  [Parameter(Mandatory = $true)]
  [securestring]$Password,
  [string]$VerificationCode = "",
  [string]$Locale = "gb/en",
  [switch]$IncludeScreenshot,
  [string]$HarnessUrl = "http://localhost:8787"
)

$passwordPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Password)
$plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringAuto($passwordPtr)

try {
  $payload = @{
    airline = $Airline
    username = $Username
    password = $plainPassword
    locale = $Locale
  }

  if ($VerificationCode -ne "") {
    $payload.verificationCode = $VerificationCode
  }

  if ($IncludeScreenshot) {
    $payload.includeScreenshot = $true
  }

  $body = $payload | ConvertTo-Json -Depth 5
  Invoke-RestMethod -UseBasicParsing -Uri "$HarnessUrl/task/login" -Method Post -ContentType "application/json" -Body $body
}
finally {
  if ($passwordPtr -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPtr)
  }
  if ($plainPassword) {
    $plainPassword = $null
  }
}
