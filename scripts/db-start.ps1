# Start the portable PostgreSQL server used by the ERP project.
# Postgres runs as a user-space process (no Windows service, no UAC).
#
# Configuration:
#   $env:PG_HOME    Where the portable Postgres binaries live (default: E:\Apps\PostgreSQL16)
#   $env:PG_DATA    Where the cluster lives (default: $PG_HOME\data)
#   $env:PG_PORT    Listen port (default: 5432)

$ErrorActionPreference = 'Stop'

$pgHome = if ($env:PG_HOME) { $env:PG_HOME } else { 'E:\Apps\PostgreSQL16' }
$pgData = if ($env:PG_DATA) { $env:PG_DATA } else { Join-Path $pgHome 'data' }
$pgPort = if ($env:PG_PORT) { $env:PG_PORT } else { '5432' }
$pgCtl  = Join-Path $pgHome 'bin\pg_ctl.exe'
$logDir = Join-Path $pgHome 'log'
$logFile = Join-Path $logDir 'postgres.log'

if (-not (Test-Path $pgCtl)) {
    throw "pg_ctl not found at $pgCtl. Did you extract the portable Postgres binaries to $pgHome?"
}
if (-not (Test-Path $pgData)) {
    throw "Data directory not found at $pgData. Run 'npm run db:init' to initialize the cluster."
}
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }

# Already running?
$status = & $pgCtl -D $pgData status 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Output "postgres already running:"
    Write-Output $status
    exit 0
}

Write-Output "starting postgres ($pgHome) on port $pgPort..."
& $pgCtl -D $pgData -l $logFile -o "-p $pgPort" start
if ($LASTEXITCODE -ne 0) {
    throw "pg_ctl start failed (exit $LASTEXITCODE). See $logFile."
}
Write-Output "postgres started. log: $logFile"
