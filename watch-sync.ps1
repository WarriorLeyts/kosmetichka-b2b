# watch-sync.ps1
# Monitors webdata folder for changes and triggers sync automatically.
# Run once at startup (add to Task Scheduler as a single "at login" trigger).
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$LocalDir   = "E:\WEB"
$SyncScript = "E:\WEB\sync-1c.ps1"
$LockFile   = "$LocalDir\watch-sync.lock"

# --- Singleton: exit if another instance is already running ---
if (Test-Path $LockFile) {
    $lockAge = (Get-Date) - (Get-Item $LockFile).LastWriteTime
    if ($lockAge.TotalMinutes -lt 60) {
        Write-Host "Another watch-sync instance is running (lock age: $([int]$lockAge.TotalMinutes) min), exiting."
        exit 0
    } else {
        Remove-Item $LockFile -Force
    }
}
New-Item -Path $LockFile -ItemType File -Force | Out-Null

$MaxIntervalMinutes = 5    # force sync if nothing happened for this long
$DebounceSeconds    = 10   # wait after last change before triggering

function Log($msg) {
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Write-Host "[$ts] $msg"
    [System.IO.File]::AppendAllText("$LocalDir\sync.log", "[$ts] $msg`n", [System.Text.Encoding]::UTF8)
}

function Run-Sync([string]$reason) {
    Log "--- Sync triggered: $reason ---"
    & powershell.exe -NonInteractive -ExecutionPolicy Bypass -File $SyncScript
    $script:lastSyncTime    = Get-Date
    $script:changeDetected  = $false
    $script:lastChangeTime  = $null
}

# Find webdata folder (pick latest if multiple)
function Get-WebdataPath {
    $dir = Get-ChildItem -Path $LocalDir -Filter "webdata*" -Directory -ErrorAction SilentlyContinue |
           Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($dir) { return $dir.FullName }
    return $null
}

$watchPath = Get-WebdataPath
if (-not $watchPath) {
    Log "webdata folder not found in $LocalDir, watching $LocalDir itself"
    $watchPath = $LocalDir
}

Log "=== Watch-Sync started ==="
Log "Watching: $watchPath"
Log "Max interval: $MaxIntervalMinutes min | Debounce: $DebounceSeconds sec"

# Set up FileSystemWatcher
$watcher = New-Object System.IO.FileSystemWatcher
$watcher.Path                  = $watchPath
$watcher.IncludeSubdirectories = $true
$watcher.NotifyFilter          = [System.IO.NotifyFilters]::LastWrite -bor
                                 [System.IO.NotifyFilters]::FileName  -bor
                                 [System.IO.NotifyFilters]::DirectoryName
$watcher.EnableRaisingEvents   = $true

$script:changeDetected = $false
$script:lastChangeTime = $null
$script:lastSyncTime   = Get-Date  # start fresh — don't trigger immediately

$onChange = {
    $script:changeDetected = $true
    $script:lastChangeTime = Get-Date
}

$evCreated = Register-ObjectEvent $watcher Created -Action $onChange
$evChanged = Register-ObjectEvent $watcher Changed -Action $onChange
$evDeleted = Register-ObjectEvent $watcher Deleted -Action $onChange
$evRenamed = Register-ObjectEvent $watcher Renamed -Action $onChange

try {
    while ($true) {
        Start-Sleep -Seconds 5

        $now              = Get-Date
        $minutesSinceSync = ($now - $script:lastSyncTime).TotalMinutes

        if ($script:changeDetected -and $script:lastChangeTime) {
            $secondsSinceChange = ($now - $script:lastChangeTime).TotalSeconds
            if ($secondsSinceChange -ge $DebounceSeconds) {
                Run-Sync "file change detected ($([int]$secondsSinceChange)s ago)"
                continue
            }
        }

        if ($minutesSinceSync -ge $MaxIntervalMinutes) {
            Run-Sync "no sync for $([int]$minutesSinceSync) minutes"
        }
    }
} finally {
    Unregister-Event -SourceIdentifier $evCreated.Name -ErrorAction SilentlyContinue
    Unregister-Event -SourceIdentifier $evChanged.Name -ErrorAction SilentlyContinue
    Unregister-Event -SourceIdentifier $evDeleted.Name -ErrorAction SilentlyContinue
    Unregister-Event -SourceIdentifier $evRenamed.Name -ErrorAction SilentlyContinue
    $watcher.Dispose()
    Remove-Item $LockFile -Force -ErrorAction SilentlyContinue
    Log "=== Watch-Sync stopped ==="
}
