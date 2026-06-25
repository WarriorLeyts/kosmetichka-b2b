# Синхронизация 1С <-> kosmetichka-opt.ru
# Запускается каждые 5 минут через Task Scheduler

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
        Log "Найден $remoteName`: $localPath"
        $bytes = [System.IO.File]::ReadAllBytes($localPath)
        Invoke-RestMethod -Uri "$BaseUrl/api/1c/upload?file=$remoteName" `
            -Method POST -Headers $Headers -Body $bytes `
            -ContentType "application/xml; charset=utf-8"
        Log "$remoteName загружен ($($bytes.Length) байт)"
    } catch {
        Log "ERROR uploading $remoteName`: $_"
    }
}

function Sync-Images {
    # Найти папку import_files (внутри webdata - ...)
    $importFilesDir = Get-ChildItem -Path $LocalDir -Filter "import_files" -Recurse -Directory -ErrorAction SilentlyContinue |
                      Select-Object -First 1
    if (-not $importFilesDir) {
        Log "import_files не найден, пропускаем синхронизацию картинок"
        return
    }

    # Файл отслеживания уже отправленных картинок
    $trackFile = "$LocalDir\synced_images.txt"
    $syncedSet  = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
    if (Test-Path $trackFile) {
        [System.IO.File]::ReadAllLines($trackFile, [System.Text.Encoding]::UTF8) |
            Where-Object { $_.Trim() } |
            ForEach-Object { $null = $syncedSet.Add($_.Trim()) }
    }

    # Найти все изображения
    $allImages = Get-ChildItem -Path $importFilesDir.FullName -Recurse -File -ErrorAction SilentlyContinue |
                 Where-Object { $_.Extension -match '\.(jpg|jpeg|png|gif|webp|bmp)$' }
    $newImages  = $allImages | Where-Object { -not $syncedSet.Contains($_.Name) }

    Log "Картинок на диске: $($allImages.Count) | Новых для загрузки: $($newImages.Count)"
    if ($newImages.Count -eq 0) { return }

    $SshKey     = "C:\Users\muhammad\.ssh\id_rsa"
    $SshDest    = "root@5.42.98.4"
    $RemoteBase = "/root/kosmetichka-b2b/data/1c/import_files"

    # Создать все нужные папки на сервере одной SSH-командой
    $dirsToCreate = $newImages | ForEach-Object {
        $relDir = $_.DirectoryName.Substring($importFilesDir.FullName.Length).TrimStart("\").Replace("\", "/")
        if ($relDir) { "$RemoteBase/$relDir" } else { $RemoteBase }
    } | Sort-Object -Unique

    $mkdirCmd = "mkdir -p " + ($dirsToCreate -join " ")
    & ssh -i $SshKey -o StrictHostKeyChecking=no -o BatchMode=yes $SshDest $mkdirCmd 2>&1 | Out-Null

    # Загрузить новые файлы по одному через SCP
    $uploaded    = 0
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
            Log "Картинок загружено: $uploaded / $($newImages.Count)"
        }
    }

    # Добавить успешно загруженные в tracking файл
    if ($newFileNames.Count -gt 0) {
        [System.IO.File]::AppendAllText($trackFile, ($newFileNames -join "`n") + "`n", [System.Text.Encoding]::UTF8)
    }
    Log "Синхронизация картинок завершена: $uploaded из $($newImages.Count)"
}

Log "=== Sync started ==="

# 1. Загрузить import.xml
$importFile = Find-LatestFile "import.xml"
if ($importFile) { Upload-File $importFile "import.xml" }
else { Log "import.xml не найден, пропускаем" }

# 2. Загрузить offers.xml
$offersFile = Find-LatestFile "offers.xml"
if ($offersFile) { Upload-File $offersFile "offers.xml" }
else { Log "offers.xml не найден, пропускаем" }

# 3. Загрузить customers.xml
$customersFile = Find-LatestFile "customers.xml"
if ($customersFile) { Upload-File $customersFile "customers.xml" }
else { Log "customers.xml не найден, пропускаем" }

# 4. Запустить импорт на сервере (каталог, цены, контрагенты, картинки)
try {
    $result = Invoke-RestMethod -Uri "$BaseUrl/api/1c/sync" `
        -Method POST -Headers $Headers
    Log "Sync triggered: $($result.message)"
} catch {
    Log "ERROR triggering sync: $_"
}

# 5. Синхронизировать картинки через SCP
Sync-Images

# 6. Скачать заказы с сервера
try {
    $ordersXml  = Invoke-RestMethod -Uri "$BaseUrl/api/1c/orders" -Method GET -Headers $Headers
    $ordersPath = "$LocalDir\Orders.xml"
    [System.IO.File]::WriteAllText($ordersPath, $ordersXml, [System.Text.Encoding]::UTF8)
    Log "Orders.xml скачан: $ordersPath"
} catch {
    Log "ERROR downloading orders: $_"
}

Log "=== Sync done ==="
