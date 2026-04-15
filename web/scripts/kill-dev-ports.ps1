# Stops processes listening on Next.js dev ports (avoids "Another next dev server is already running").
$ErrorActionPreference = "SilentlyContinue"
foreach ($port in 3000, 3001) {
  Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
    ForEach-Object {
      Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
    }
}
exit 0
