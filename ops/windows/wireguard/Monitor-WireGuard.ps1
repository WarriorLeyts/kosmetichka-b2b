#requires -Version 5.1
param([string]$Root = "$env:ProgramData\Kosmetichka-WireGuardMonitor")
Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'RecoveryPolicy.psm1') -Force

function Test-Tcp([string]$Address, [int]$Port) {
    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $connection = $client.BeginConnect($Address, $Port, $null, $null)
        if (-not $connection.AsyncWaitHandle.WaitOne(3000)) { return $false }
        $client.EndConnect($connection)
        return $client.Connected
    } catch { return $false } finally { $client.Dispose() }
}
function Save-State([hashtable]$Value) {
    $path = Join-Path $Root 'state.json'
    $temp = Join-Path $Root 'state.tmp'
    [IO.File]::WriteAllText($temp, ($Value | ConvertTo-Json -Depth 5), [Text.Encoding]::UTF8)
    if ([IO.File]::Exists($path)) { [IO.File]::Replace($temp, $path, $null) }
    else { [IO.File]::Move($temp, $path) }
}
function Write-Log([string]$Message) {
    $path = Join-Path $Root 'monitor.log'
    if ((Test-Path -LiteralPath $path) -and (Get-Item -LiteralPath $path).Length -gt 1048576) {
        Move-Item -LiteralPath $path -Destination "$path.previous" -Force
    }
    [IO.File]::AppendAllText($path, "$(Get-Date -Format o) $Message`r`n", [Text.Encoding]::UTF8)
}
function Save-Diagnostics([string]$WireGuard) {
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $temp = Join-Path $Root "journal-$stamp.tmp"
    $errorPath = Join-Path $Root "journal-$stamp.err"
    $path = Join-Path $Root "journal-$stamp.txt"
    $process = $null
    try {
        $process = Start-Process -FilePath $WireGuard -ArgumentList '/dumplog' -NoNewWindow -PassThru -RedirectStandardOutput $temp -RedirectStandardError $errorPath
        if (-not $process.WaitForExit(5000)) { $process.Kill(); throw 'Journal export timed out' }
        Get-Content -LiteralPath $temp -Tail 2000 | Set-Content -LiteralPath $path -Encoding UTF8
        Get-ChildItem -LiteralPath $Root -Filter 'journal-*.txt' | Sort-Object LastWriteTime -Descending | Select-Object -Skip 4 | Remove-Item -Force
    } catch { Write-Log "Diagnostic export failed: $($_.Exception.Message)" }
    finally {
        if ($process) { $process.Dispose() }
        Remove-Item -LiteralPath $temp, $errorPath -Force -ErrorAction SilentlyContinue
    }
}

$mutex = New-Object Threading.Mutex($false, 'Global\Kosmetichka-WireGuardMonitor')
$owned = $false
try {
    try { $owned = $mutex.WaitOne(0) } catch [Threading.AbandonedMutexException] { $owned = $true }
    if (-not $owned) { exit 0 }
    $config = Get-Content -LiteralPath (Join-Path $Root 'config.json') -Raw | ConvertFrom-Json
    if ($config.tunnel -notmatch '^[A-Za-z0-9_-]{1,32}$') { throw 'Invalid tunnel name' }
    $serviceName = 'WireGuardTunnel$' + $config.tunnel
    $service = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
    $state = @{}
    $statePath = Join-Path $Root 'state.json'
    if (Test-Path -LiteralPath $statePath) {
        $stored = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
        foreach ($property in $stored.PSObject.Properties) { $state[$property.Name] = $property.Value }
    }
    $now = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
    $running = $null -ne $service -and $service.Status -eq 'Running'
    $handshake = [long]0
    $private = $false
    $public = $false
    if ($running) {
        # Neither command prints private keys. Match the configured peer exactly.
        $lines = @(& $config.wg show $config.tunnel latest-handshakes 2>$null)
        if ($LASTEXITCODE -ne 0) { throw 'Cannot read WireGuard handshakes; no restart attempted' }
        foreach ($line in $lines) {
            $columns = $line -split '\s+'
            if ($columns.Count -eq 2 -and $columns[0] -eq $config.peer) { $handshake = [long]$columns[1] }
        }
        # A changed/removed peer requires an administrator, not an automatic restart.
        if (-not (@($lines | Where-Object { ($_ -split '\s+')[0] -eq $config.peer }).Count)) { throw 'Configured peer missing; no restart attempted' }
        $private = Test-Tcp $config.privateAddress 443
        if (-not $private) { $public = Test-Tcp $config.publicAddress 443 }
    }
    $result = Get-RecoveryDecision -Now $now -Handshake $handshake -PrivateReachable $private -PublicReachable $public -ServiceRunning $running -State $state
    if ($result.Action -eq 'Restart') {
        Save-Diagnostics $config.wireguard
        $state.lastRestart = $now
        $state.restarts = @($state.restarts) + @($now)
        $state.failures = 0
        # Persist the cooldown BEFORE touching the service, including on a failed restart.
        Save-State $state
        Write-Log "Restarting $serviceName; stale handshake and failed VPN probes; public server reachable"
        # Operate only on the dedicated tunnel. Never restart 1C, Windows or other tunnels.
        $service.Refresh()
        if ($service.Status -eq 'Running') { Restart-Service -InputObject $service -Force }
        Write-Log 'Tunnel restart requested; the next scheduled check will verify connectivity'
    } else {
        if (-not $state.ContainsKey('lastReason') -or $state.lastReason -ne $result.Reason -or $result.Action -ne 'Healthy') {
            Write-Log "$($result.Reason); handshake=$handshake; failedChecks=$($state.failures)"
        }
    }
    $state.lastReason = $result.Reason
    Save-State $state
} catch {
    try { Write-Log "Monitor error (no additional restart): $($_.Exception.Message)" } catch {}
    Write-Error $_
    exit 1
} finally {
    if ($owned) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
}
