# 1C <-> kosmetichka-opt.ru sync
# Runs every 5 minutes via Task Scheduler

$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$BaseUrl  = "https://kosmetichka-opt.ru"
$ApiKey   = $env:SYNC_1C_KEY
$LocalDir = "E:\WEB"
$Headers  = @{ "x-1c-key" = $ApiKey }

function Log($msg) {
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Write-Host "[$ts] $msg"
    [System.IO.File]::AppendAllText("$LocalDir\sync.log", "[$ts] $msg`n", [System.Text.Encoding]::UTF8)
}

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
    # Find import_files folder (inside webdata - ...)
    $importFilesDir = Get-ChildItem -Path $LocalDir -Filter "import_files" -Recurse -Directory -ErrorAction SilentlyContinue |
                      Select-Object -First 1
    if (-not $importFilesDir) {
        Log "import_files not found, skipping image sync"
        return
    }

    # Tracking file for already uploaded images
    $trackFile = "$LocalDir\synced_images.txt"
    $syncedSet  = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
    if (Test-Path $trackFile) {
        [System.IO.File]::ReadAllLines($trackFile, [System.Text.Encoding]::UTF8) |
            Where-Object { $_.Trim() } |
            ForEach-Object { $null = $syncedSet.Add($_.Trim()) }
    }

    # Find all images
    $allImages = Get-ChildItem -Path $importFilesDir.FullName -Recurse -File -ErrorAction SilentlyContinue |
                 Where-Object { $_.Extension -match '\.(jpg|jpeg|png|gif|webp|bmp)$' }
    $newImages  = $allImages | Where-Object { -not $syncedSet.Contains($_.Name) }

    Log "Images on disk: $($allImages.Count) | New to upload: $($newImages.Count)"
    if ($newImages.Count -eq 0) { return }

    $SshKey     = "C:\Users\muhammad\.ssh\id_rsa"
    $SshDest    = "root@5.42.98.4"
    $RemoteBase = "/root/kosmetichka-b2b/data/1c/import_files"

    # Create all required remote directories in one SSH call
    $dirsToCreate = $newImages | ForEach-Object {
        $relDir = $_.DirectoryName.Substring($importFilesDir.FullName.Length).TrimStart("\").Replace("\", "/")
        if ($relDir) { "$RemoteBase/$relDir" } else { $RemoteBase }
    } | Sort-Object -Unique

    $mkdirCmd = "mkdir -p " + ($dirsToCreate -join " ")
    & ssh -i $SshKey -o StrictHostKeyChecking=no -o BatchMode=yes $SshDest $mkdirCmd 2>&1 | Out-Null

    # Upload new files one by one via SCP
    $uploaded     = 0
    $newFileNames = [System.Collections.Generic.List[string]]::new()

    foreach ($img in $newImages) {
        $relDir     = $img.DirectoryName.Substring($importFilesDir.FullName.Length).TrimStart("\").Replace("\", "/")
        $remotePath = if ($relDir) { "${SshDest}:${RemoteBase}/${relDir}/" } else { "${SshDest}:${RemoteBase}/" }

        & scp -i $SshKey -o StrictHostKeyChecking=no -o BatchMode=yes -q "$($img.FullName)" $remotePath 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) {
            $newFileNames.Add($img.Name)
            $uploaded++
        } else {
            Log "ERROR scp $($img.Name)"
        }
        if ($uploaded -gt 0 -and $uploaded % 100 -eq 0) {
            Log "Images uploaded: $uploaded / $($newImages.Count)"
        }
    }

    # Save successfully uploaded filenames to tracking file
    if ($newFileNames.Count -gt 0) {
        [System.IO.File]::AppendAllText($trackFile, ($newFileNames -join "`n") + "`n", [System.Text.Encoding]::UTF8)
    }
    Log "Image sync done: $uploaded of $($newImages.Count)"
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

    # Read order IDs from response header X-Order-Ids
    $orderIdsHeader = $response.Headers["X-Order-Ids"]
    if ($orderIdsHeader) {
        $ids = $orderIdsHeader -split "," | Where-Object { $_ } | ForEach-Object { [int]$_ }
        Log "Orders downloaded: $($ids.Count) new order(s), IDs: $($ids -join ', ')"

        # Acknowledge: mark as exported so they do not appear again
        $ackBody = @{ ids = $ids } | ConvertTo-Json
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
