#requires -Version 5.1
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'RecoveryPolicy.psm1') -Force
function Assert-Equal($Actual, $Expected, [string]$Message) {
    if ($Actual -ne $Expected) { throw "$Message; expected=$Expected actual=$Actual" }
}
$now = [long]10000
$count = 0
foreach ($case in @(
    @{ Name = 'working tunnel'; Private = $true; Public = $true; Running = $true; Handshake = 9000; State = @{ failures = 8 }; Action = 'Healthy'; Reason = 'TunnelReachable' },
    @{ Name = 'manual stop'; Private = $false; Public = $true; Running = $false; Handshake = 9000; State = @{ failures = 8 }; Action = 'Wait'; Reason = 'ServiceStoppedNoAction' },
    @{ Name = 'internet/server unavailable'; Private = $false; Public = $false; Running = $true; Handshake = 9000; State = @{ failures = 8 }; Action = 'Wait'; Reason = 'PublicServerUnreachableNoRestart' },
    @{ Name = 'fresh handshake'; Private = $false; Public = $true; Running = $true; Handshake = 9900; State = @{ failures = 8 }; Action = 'Wait'; Reason = 'RecentHandshakeNoRestart' },
    @{ Name = 'future clock'; Private = $false; Public = $true; Running = $true; Handshake = 11000; State = @{ failures = 8 }; Action = 'Wait'; Reason = 'ClockSkewNoRestart' },
    @{ Name = 'first failure'; Private = $false; Public = $true; Running = $true; Handshake = 9000; State = @{}; Action = 'Wait'; Reason = 'ConfirmFailure' },
    @{ Name = 'startup grace'; Private = $false; Public = $true; Running = $true; Handshake = 0; State = @{ firstObserved = 9900; failures = 8 }; Action = 'Wait'; Reason = 'StartupGrace' },
    @{ Name = 'confirmed outage'; Private = $false; Public = $true; Running = $true; Handshake = 9000; State = @{ failures = 1 }; Action = 'Restart'; Reason = 'StaleHandshakeAndFailedProbes' },
    @{ Name = 'cooldown'; Private = $false; Public = $true; Running = $true; Handshake = 9000; State = @{ failures = 8; lastRestart = 9500 }; Action = 'Wait'; Reason = 'RestartCooldown' },
    @{ Name = 'restart rate limit'; Private = $false; Public = $true; Running = $true; Handshake = 9000; State = @{ failures = 8; restarts = @(7000, 8000, 9000) }; Action = 'Wait'; Reason = 'HourlyRestartLimit' },
    @{ Name = 'expired rate limit'; Private = $false; Public = $true; Running = $true; Handshake = 9000; State = @{ failures = 8; restarts = @(6000, 8000, 9000) }; Action = 'Restart'; Reason = 'StaleHandshakeAndFailedProbes' }
)) {
    $result = Get-RecoveryDecision -Now $now -Handshake $case.Handshake -PrivateReachable $case.Private -PublicReachable $case.Public -ServiceRunning $case.Running -State $case.State
    Assert-Equal $result.Action $case.Action $case.Name
    Assert-Equal $result.Reason $case.Reason $case.Name
    if ($case.Private -or -not $case.Running) { Assert-Equal $result.State.failures 0 'healthy/stopped resets failure streak' }
    $count++
}
# A network loss needs repeated failed checks; recovery clears the failure streak.
$state = @{}
$first = Get-RecoveryDecision -Now 10000 -Handshake 9000 -PrivateReachable $false -PublicReachable $true -ServiceRunning $true -State $state
Assert-Equal $first.Action 'Wait' 'never restart on one failed check'
$second = Get-RecoveryDecision -Now 10060 -Handshake 9000 -PrivateReachable $false -PublicReachable $true -ServiceRunning $true -State $state
Assert-Equal $second.Action 'Restart' 'recover only a confirmed stale tunnel'
$healthy = Get-RecoveryDecision -Now 10120 -Handshake 10100 -PrivateReachable $true -PublicReachable $true -ServiceRunning $true -State $state
Assert-Equal $healthy.State.failures 0 'successful connection resets the sequence'

# Parse every script without executing elevated/system operations.
foreach ($file in Get-ChildItem -LiteralPath $PSScriptRoot -File | Where-Object { $_.Extension -in @('.ps1', '.psm1') }) {
    $tokens = $null; $errors = $null
    [Management.Automation.Language.Parser]::ParseFile($file.FullName, [ref]$tokens, [ref]$errors) | Out-Null
    if ($errors.Count) { throw "Parse errors in $($file.Name): $errors" }
}
Write-Host "PASS: $count recovery cases, failure/recovery sequence, script syntax. No services restarted."
