# Show portable PostgreSQL status.

$pgHome = if ($env:PG_HOME) { $env:PG_HOME } else { 'E:\Apps\PostgreSQL16' }
$pgData = if ($env:PG_DATA) { $env:PG_DATA } else { Join-Path $pgHome 'data' }
$pgCtl  = Join-Path $pgHome 'bin\pg_ctl.exe'

if (-not (Test-Path $pgCtl)) {
    Write-Output "pg_ctl not found at $pgCtl"
    exit 1
}
& $pgCtl -D $pgData status
exit $LASTEXITCODE
