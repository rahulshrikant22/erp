# Stop the portable PostgreSQL server. See scripts/db-start.ps1 for env vars.

$ErrorActionPreference = 'Stop'

$pgHome = if ($env:PG_HOME) { $env:PG_HOME } else { 'E:\Apps\PostgreSQL16' }
$pgData = if ($env:PG_DATA) { $env:PG_DATA } else { Join-Path $pgHome 'data' }
$pgCtl  = Join-Path $pgHome 'bin\pg_ctl.exe'

if (-not (Test-Path $pgCtl)) {
    throw "pg_ctl not found at $pgCtl."
}

$status = & $pgCtl -D $pgData status 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Output "postgres is not running."
    exit 0
}

Write-Output "stopping postgres..."
& $pgCtl -D $pgData stop -m fast
if ($LASTEXITCODE -ne 0) {
    throw "pg_ctl stop failed (exit $LASTEXITCODE)."
}
Write-Output "stopped."
