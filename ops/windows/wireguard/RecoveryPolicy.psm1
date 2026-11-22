Set-StrictMode -Version 2.0

# Pure policy, independently tested without touching services or the network.
function Get-RecoveryDecision {
    param(
        [long]$Now,
        [long]$Handshake,
        [bool]$PrivateReachable,
        [bool]$PublicReachable,
        [bool]$ServiceRunning,
        [hashtable]$State
    )
    if (-not $State.ContainsKey('firstObserved')) { $State.firstObserved = $Now }
    if (-not $State.ContainsKey('failures')) { $State.failures = 0 }
    if (-not $State.ContainsKey('lastRestart')) { $State.lastRestart = 0 }
    if (-not $State.ContainsKey('restarts')) { $State.restarts = @() }
    $State.restarts = @($State.restarts | Where-Object { $_ -ge ($Now - 3600) })
    $action = 'Wait'
    $reason = 'ProbeFailed'
    if (-not $ServiceRunning) {
        $State.failures = 0
        $reason = 'ServiceStoppedNoAction'
    } elseif ($PrivateReachable) {
        $State.failures = 0
        $action = 'Healthy'
        $reason = 'TunnelReachable'
    } else {
        $State.failures = [int]$State.failures + 1
        if (-not $PublicReachable) { $reason = 'PublicServerUnreachableNoRestart' }
        elseif ($Handshake -gt ($Now + 60)) { $reason = 'ClockSkewNoRestart' }
        elseif ($Handshake -gt 0 -and ($Now - $Handshake) -le 180) { $reason = 'RecentHandshakeNoRestart' }
        elseif ($Handshake -eq 0 -and ($Now - $State.firstObserved) -lt 180) { $reason = 'StartupGrace' }
        elseif ($State.failures -lt 2) { $reason = 'ConfirmFailure' }
        elseif ($State.lastRestart -gt 0 -and ($Now - $State.lastRestart) -lt 600) { $reason = 'RestartCooldown' }
        elseif ($State.restarts.Count -ge 3) { $reason = 'HourlyRestartLimit' }
        else { $action = 'Restart'; $reason = 'StaleHandshakeAndFailedProbes' }
    }
    return [pscustomobject]@{ Action = $action; Reason = $reason; State = $State }
}

Export-ModuleMember -Function Get-RecoveryDecision
