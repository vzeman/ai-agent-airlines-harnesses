param(
  [ValidateSet("ryanair", "wizzair", "lufthansa", "austrian", "american", "british", "qatar")]
  [string]$Airline = "ryanair",
  [Parameter(Mandatory = $true)]
  [string]$Username,
  [Parameter(Mandatory = $true)]
  [securestring]$Password,
  [string]$Locale = "gb/en",
  [string]$HarnessUrl = "http://localhost:8787"
)

$passwordPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Password)
$plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringAuto($passwordPtr)

try {
  $body = @{
    airline = $Airline
    username = $Username
    password = $plainPassword
    locale = $Locale
  } | ConvertTo-Json -Depth 5

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
