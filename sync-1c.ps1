# 1C <-> kosmetichka-opt.ru sync
# Runs every 5 minutes via Task Scheduler
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$BaseUrl  = "https://kosmetichka-opt.ru"
$ApiKey   = $env:SYNC_1C_KEY
$LocalDir = "E:\WEB"
$Headers  = @{ "x-1c-key" = $ApiKey }
$LockFile = "$LocalDir\sync.lock"
function Log($msg) {
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Write-Host "[$ts] $msg"
    [System.IO.File]::AppendAllText("$LocalDir\sync.log", "[$ts] $msg`n", [System.Text.Encoding]::UTF8)
}
# --- Determine lock timeout based on pending image count ---
$_webdataDir = Get-ChildItem -Path $LocalDir -Filter "webdata*" -Directory -ErrorAction SilentlyContinue |
               Sort-Object LastWriteTime -Descending | Select-Object -First 1
$_importFilesPath = if ($_webdataDir) { Join-Path $_webdataDir.FullName "import_files" } else { Join-Path $LocalDir "import_files" }
$_trackFile = "$LocalDir\synced_images.txt"
$_syncedSet = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
if (Test-Path $_trackFile) {
    [System.IO.File]::ReadAllLines($_trackFile, [System.Text.Encoding]::UTF8) |
        Where-Object { $_.Trim() } | ForEach-Object { $null = $_syncedSet.Add($_.Trim()) }
}
$_pendingImages = 0
if (Test-Path $_importFilesPath) {
    $_pendingImages = @(Get-ChildItem -Path $_importFilesPath -Recurse -File -ErrorAction SilentlyContinue |
        Where-Object { $_.Extension -match '\.(jpg|jpeg|png|gif|webp|bmp)$' -and -not $_syncedSet.Contains($_.Name) }).Count
}
$LockTimeout = if ($_pendingImages -gt 50) { 120 } else { 30 }

# --- Lock: skip if previous run is still in progress ---
if (Test-Path $LockFile) {
    $lockAge = (Get-Date) - (Get-Item $LockFile).LastWriteTime
    if ($lockAge.TotalMinutes -lt $LockTimeout) {
        Log "Previous sync still running (lock age: $([int]$lockAge.TotalMinutes) min, timeout: $LockTimeout min), skipping"
        exit 0
    } else {
        Log "WARNING: Stale lock file ($([int]$lockAge.TotalMinutes) minutes old), removing and proceeding"
        Remove-Item $LockFile -Force
    }
}
New-Item -Path $LockFile -ItemType File -Force | Out-Null
try {
function Find-LatestFile($fileName) {
    $found = Get-ChildItem -Path $LocalDir -Filter $fileName -Recurse -ErrorAction SilentlyContinue |
             Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($found) { return $found.FullName }
    return $null
}
function Upload-File($localPath, $remoteName) {
    try {
        Log "Found $remoteName`: $localPath"
        $bytes = [System.IO.File]::ReadAllBytes($localPath)
        Invoke-RestMethod -Uri "$BaseUrl/api/1c/upload?file=$remoteName" `
            -Method POST -Headers $Headers -Body $bytes `
            -ContentType "application/xml; charset=utf-8" | Out-Null
        Log "$remoteName uploaded ($($bytes.Length) bytes)"
    } catch {
        Log "ERROR uploading $remoteName`: $_"
    }
}
function Sync-Images {
    # 1C puts import_files inside webdata-{guid}\ subfolder
    $webdataDir = Get-ChildItem -Path $LocalDir -Filter "webdata*" -Directory -ErrorAction SilentlyContinue |
                  Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($webdataDir) {
        $LocalBase = Join-Path $webdataDir.FullName "import_files"
    } else {
        $LocalBase = Join-Path $LocalDir "import_files"
    }
    if (-not (Test-Path $LocalBase)) {
        Log "import_files not found at $LocalBase, skipping image sync"
        return
    }
    $trackFile = "$LocalDir\synced_images.txt"
    $syncedSet  = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
    if (Test-Path $trackFile) {
        [System.IO.File]::ReadAllLines($trackFile, [System.Text.Encoding]::UTF8) |
            Where-Object { $_.Trim() } |
            ForEach-Object { $null = $syncedSet.Add($_.Trim()) }
    }
    $allImages = Get-ChildItem -Path $LocalBase -Recurse -File -ErrorAction SilentlyContinue |
                 Where-Object { $_.Extension -match '\.(jpg|jpeg|png|gif|webp|bmp)$' }
    $newImages  = $allImages | Where-Object { -not $syncedSet.Contains($_.Name) }
    Log "Images on disk: $($allImages.Count) | New to upload: $($newImages.Count)"
    if ($newImages.Count -eq 0) { return }
    $SshKey      = "C:\Users\muhammad\.ssh\id_rsa"
    $SshDest     = "root@5.42.98.4"
    $RemoteBase  = "/root/kosmetichka-b2b/data/1c/import_files"
    $RemoteParent = "/root/kosmetichka-b2b/data/1c"
    # Find rsync (cwRsync or Git)
    $rsync = $null
    $candidates = @(
        "C:\Program Files\cwrsync_softradar-com\bin\rsync.exe",
        "C:\Program Files\cwRsync\bin\rsync.exe",
        "C:\Program Files\Git\usr\bin\rsync.exe"
    )
    foreach ($c in $candidates) {
        if (Test-Path $c) { $rsync = $c; break }
    }
    if (-not $rsync) {
        $rsync = Get-Command rsync -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source
    }
    if (-not $rsync) {
        Log "ERROR: rsync not found."
        return
    }
    $SshOpts = @("-i", $SshKey, "-o", "StrictHostKeyChecking=no", "-o", "BatchMode=yes")
    if ($newImages.Count -gt 50) {
        # Large batch: copy the import_files folder itself into data/1c/
        Log "Large batch ($($newImages.Count) files): uploading via scp -r..."
        & scp @SshOpts -r "$LocalBase" "${SshDest}:${RemoteParent}/" 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) {
            $newFileNames = $newImages | ForEach-Object { $_.Name }
            [System.IO.File]::AppendAllText($trackFile, ($newFileNames -join "`n") + "`n", [System.Text.Encoding]::UTF8)
            Log "Image sync done: $($newImages.Count) images uploaded via scp -r"
        } else {
            Log "ERROR scp -r failed (exit $LASTEXITCODE)"
        }
    } else {
        # Small batch: per-file scp into the correct subfolder under import_files
        $uploaded     = 0
        $newFileNames = [System.Collections.Generic.List[string]]::new()
        foreach ($img in $newImages) {
            $relDir     = $img.DirectoryName.Substring($LocalBase.Length).TrimStart("\").Replace("\", "/")
            $remotePath = if ($relDir) { "${SshDest}:${RemoteBase}/${relDir}/" } else { "${SshDest}:${RemoteBase}/" }
            & ssh @SshOpts $SshDest "mkdir -p ${RemoteBase}$(if ($relDir) { '/' + $relDir })" 2>&1 | Out-Null
            & scp @SshOpts -q "$($img.FullName)" $remotePath 2>&1 | Out-Null
            if ($LASTEXITCODE -eq 0) {
                $newFileNames.Add($img.Name)
                $uploaded++
            } else {
                Log "ERROR scp $($img.Name)"
            }
        }
        if ($newFileNames.Count -gt 0) {
            [System.IO.File]::AppendAllText($trackFile, ($newFileNames -join "`n") + "`n", [System.Text.Encoding]::UTF8)
        }
        Log "Image sync done: $uploaded of $($newImages.Count)"
    }
}
Log "=== Sync started ==="
# 1. Upload import.xml
$importFile = Find-LatestFile "import.xml"
if ($importFile) { Upload-File $importFile "import.xml" }
else { Log "import.xml not found, skipping" }
# 2. Upload offers.xml
$offersFile = Find-LatestFile "offers.xml"
if ($offersFile) { Upload-File $offersFile "offers.xml" }
else { Log "offers.xml not found, skipping" }
# 3. Upload customers.xml
$customersFile = Find-LatestFile "customers.xml"
if ($customersFile) { Upload-File $customersFile "customers.xml" }
else { Log "customers.xml not found, skipping" }
# 4. Trigger server-side import (catalog, prices, customers, images)
try {
    $result = Invoke-RestMethod -Uri "$BaseUrl/api/1c/sync" `
        -Method POST -Headers $Headers
    Log "Sync triggered: $($result.message)"
} catch {
    Log "ERROR triggering sync: $_"
}
# 5. Sync images via SCP
Sync-Images
# 6. Download orders from server and acknowledge
try {
    $response   = Invoke-WebRequest -Uri "$BaseUrl/api/1c/orders" -Method GET -Headers $Headers -UseBasicParsing
    $ordersXml  = $response.Content
    $ordersPath = "$LocalDir\Orders.xml"
    [System.IO.File]::WriteAllText($ordersPath, $ordersXml, [System.Text.Encoding]::UTF8)
    $orderIdsHeader = $response.Headers["X-Order-Ids"]
    if ($orderIdsHeader) {
        $ids = $orderIdsHeader -split "," | Where-Object { $_ } | ForEach-Object { [int]$_ }
        Log "Orders downloaded: $($ids.Count) new order(s), IDs: $($ids -join ', ')"
        $ackBody = @{ ids = @($ids) } | ConvertTo-Json
        Invoke-RestMethod -Uri "$BaseUrl/api/1c/orders/ack" `
            -Method POST -Headers $Headers -Body $ackBody `
            -ContentType "application/json" | Out-Null
        Log "Orders acknowledged in DB"
    } else {
        Log "No new orders to download"
    }
} catch {
    Log "ERROR downloading orders: $_"
}
Log "=== Sync done ==="
} finally {
    # Always remove lock file when done
    Remove-Item $LockFile -Force -ErrorAction SilentlyContinue
}
