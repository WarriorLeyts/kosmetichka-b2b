#requires -Version 5.1
#requires -RunAsAdministrator
param([string]$Tunnel = 'wg0')
Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'
if ($Tunnel -notmatch '^[A-Za-z0-9_-]{1,32}$') { throw 'Invalid tunnel name' }
$wg = Join-Path $env:ProgramFiles 'WireGuard\wg.exe'
$wireguard = Join-Path $env:ProgramFiles 'WireGuard\wireguard.exe'
foreach ($file in @($wg, $wireguard)) { if (-not (Test-Path -LiteralPath $file)) { throw "Not found: $file" } }
$service = Get-Service -Name ('WireGuardTunnel$' + $Tunnel) -ErrorAction Stop
if ($service.Status -ne 'Running') { throw 'Enable the wg0 tunnel in WireGuard first, then run this installer again.' }
$peers = @(& $wg show $Tunnel allowed-ips)
if ($LASTEXITCODE -ne 0) { throw 'Cannot read WireGuard. Run this installer as Administrator.' }
$targetPeers = @($peers | Where-Object { ($_ -split '\s+', 2)[1] -match '(^|[\s,])10\.0\.0\.1/32($|[\s,])' })
if ($targetPeers.Count -ne 1) { throw 'Expected exactly one peer for 10.0.0.1/32; no changes made.' }
$peer = ($targetPeers[0] -split '\s+')[0]
$taskName = 'Kosmetichka-WireGuard-' + $Tunnel
$root = Join-Path $env:ProgramData 'Kosmetichka-WireGuardMonitor'
$marker = 'Kosmetichka WireGuard monitor v1'
if (Test-Path -LiteralPath (Join-Path $root 'installation.json')) {
    $oldInstallation = Get-Content -LiteralPath (Join-Path $root 'installation.json') -Raw | ConvertFrom-Json
    if ($oldInstallation.tunnel -ne $Tunnel) { throw 'This installation already monitors another tunnel; no changes made.' }
}
$existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existing -and $existing.Description -ne $marker) { throw 'Task name is already used by another task; no changes made.' }
foreach ($name in @('Monitor-WireGuard.ps1', 'RecoveryPolicy.psm1')) {
    if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot $name))) { throw 'Extract the complete ZIP before installing.' }
}
# A SYSTEM task must never execute files writable by ordinary Windows users.
foreach ($directory in @($root)) {
    if (Test-Path -LiteralPath $directory) {
        if ((Get-Item -LiteralPath $directory).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Installation directory must not be a link.' }
    } else { New-Item -ItemType Directory -Path $directory | Out-Null }
    $acl = New-Object Security.AccessControl.DirectorySecurity
    $acl.SetAccessRuleProtection($true, $false)
    foreach ($sid in @('S-1-5-18', 'S-1-5-32-544')) {
        $identity = New-Object Security.Principal.SecurityIdentifier($sid)
        $rule = New-Object Security.AccessControl.FileSystemAccessRule($identity, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
        $acl.AddAccessRule($rule)
    }
    $acl.SetOwner((New-Object Security.Principal.SecurityIdentifier('S-1-5-32-544')))
    Set-Acl -LiteralPath $directory -AclObject $acl
}
if (@(Get-ChildItem -LiteralPath $root -Recurse -Force | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint }).Count) { throw 'Installation files must not contain links.' }
if ($existing) { Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue }
foreach ($name in @('Monitor-WireGuard.ps1', 'RecoveryPolicy.psm1')) {
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot $name) -Destination (Join-Path $root $name) -Force
}
$metadataPath = Join-Path $root 'installation.json'
if (-not (Test-Path -LiteralPath $metadataPath)) {
    @{ previousStartType = [string]$service.StartType; tunnel = $Tunnel } | ConvertTo-Json | Set-Content -LiteralPath $metadataPath -Encoding UTF8
}
@{ tunnel = $Tunnel; peer = $peer; wg = $wg; wireguard = $wireguard; privateAddress = '10.0.0.1'; publicAddress = '5.42.98.4' } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $root 'config.json') -Encoding UTF8
$powershell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$action = New-ScheduledTaskAction -Execute $powershell -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$(Join-Path $root 'Monitor-WireGuard.ps1')`" -Root `"$root`""
$periodic = New-ScheduledTaskTrigger -Once -At ((Get-Date).AddMinutes(1)) -RepetitionInterval (New-TimeSpan -Minutes 1)
$boot = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Seconds 50) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
Set-Service -Name $service.Name -StartupType Automatic
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger @($boot, $periodic) -Settings $settings -Principal $principal -Description $marker -Force | Out-Null
# Verify one read-only/normal policy check now. No forced outage test on the live tunnel.
& $powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File (Join-Path $root 'Monitor-WireGuard.ps1') -Root $root
if ($LASTEXITCODE -ne 0) { throw "Task installed, but the first check failed. See $root\monitor.log" }
Write-Host "Installed: $taskName" -ForegroundColor Green
Write-Host 'Checks run every minute, including without a user login. Healthy tunnels are not restarted.'
Write-Host "Logs: $root\monitor.log"
Write-Host 'A manually stopped tunnel is left stopped. This installer does not change VPN keys or 1C.'
