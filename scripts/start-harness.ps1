param(
  [string]$ComposeFile = "docker-compose.yml"
)

$ErrorActionPreference = "Stop"
docker compose -f $ComposeFile up -d

$healthUrl = "http://localhost:8787/health"
for ($i = 0; $i -lt 60; $i++) {
  try {
    $health = Invoke-RestMethod -UseBasicParsing -Uri $healthUrl -Method Get
    $health | ConvertTo-Json -Depth 10
    exit 0
  } catch {
    Start-Sleep -Seconds 2
  }
}

throw "Harness did not become healthy at $healthUrl"
