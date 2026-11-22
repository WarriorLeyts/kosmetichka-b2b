#requires -Version 5.1
#requires -RunAsAdministrator
param([string]$Tunnel = 'wg0')
Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'
if ($Tunnel -notmatch '^[A-Za-z0-9_-]{1,32}$') { throw 'Invalid tunnel name' }
$taskName = 'Kosmetichka-WireGuard-' + $Tunnel
$root = Join-Path $env:ProgramData 'Kosmetichka-WireGuardMonitor'
$task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($task -and $task.Description -ne 'Kosmetichka WireGuard monitor v1') { throw 'Task is not managed by this installer.' }
if ($task) {
    Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
}
$metadataPath = Join-Path $root 'installation.json'
if (Test-Path -LiteralPath $metadataPath) {
    $metadata = Get-Content -LiteralPath $metadataPath -Raw | ConvertFrom-Json
    if ($metadata.tunnel -eq $Tunnel -and $metadata.previousStartType -in @('Automatic', 'Manual', 'Disabled')) {
        Set-Service -Name ('WireGuardTunnel$' + $Tunnel) -StartupType $metadata.previousStartType
    }
}
Write-Host 'Monitor uninstalled. The WireGuard tunnel has not been stopped or removed.' -ForegroundColor Green
Write-Host "Logs are preserved in $root"
