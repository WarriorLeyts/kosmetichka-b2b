# Синхронизация 1С <-> kosmetichka-opt.ru
# Запускается каждые 5 минут через Task Scheduler

$BaseUrl  = "https://kosmetichka-opt.ru"
$ApiKey   = $env:SYNC_1C_KEY   # задаётся в переменных окружения Windows
$LocalDir = "E:\САЙТ"

$Headers = @{ "x-1c-key" = $ApiKey }

function Log($msg) {
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Write-Host "[$ts] $msg"
    Add-Content "$LocalDir\sync.log" "[$ts] $msg"
}

Log "=== Sync started ==="

# Найти самый свежий файл с именем $fileName в любой подпапке $LocalDir
function Find-LatestFile($fileName) {
    $found = Get-ChildItem -Path $LocalDir -Filter $fileName -Recurse -ErrorAction SilentlyContinue |
             Sort-Object LastWriteTime -Descending |
             Select-Object -First 1
    return $found?.FullName
}

# 1. Загрузить import.xml на сервер
$importFile = Find-LatestFile "import.xml"
if ($importFile) {
    try {
        Log "Найден import.xml: $importFile"
        $body = [System.IO.File]::ReadAllText($importFile, [System.Text.Encoding]::UTF8)
        Invoke-RestMethod -Uri "$BaseUrl/api/1c/upload?file=import.xml" `
            -Method POST -Headers $Headers `
            -Body ([System.Text.Encoding]::UTF8.GetBytes($body)) `
            -ContentType "application/xml; charset=utf-8"
        Log "import.xml uploaded ($($body.Length) bytes)"
    } catch {
        Log "ERROR uploading import.xml: $_"
    }
} else {
    Log "import.xml not found, skipping"
}

# 2. Загрузить offers.xml на сервер
$offersFile = Find-LatestFile "offers.xml"
if ($offersFile) {
    try {
        Log "Найден offers.xml: $offersFile"
        $body = [System.IO.File]::ReadAllText($offersFile, [System.Text.Encoding]::UTF8)
        Invoke-RestMethod -Uri "$BaseUrl/api/1c/upload?file=offers.xml" `
            -Method POST -Headers $Headers `
            -Body ([System.Text.Encoding]::UTF8.GetBytes($body)) `
            -ContentType "application/xml; charset=utf-8"
        Log "offers.xml uploaded ($($body.Length) bytes)"
    } catch {
        Log "ERROR uploading offers.xml: $_"
    }
} else {
    Log "offers.xml not found, skipping"
}

# 3. Запустить импорт на сервере
try {
    $result = Invoke-RestMethod -Uri "$BaseUrl/api/1c/sync" `
        -Method POST -Headers $Headers
    Log "Sync triggered: $($result.message)"
} catch {
    Log "ERROR triggering sync: $_"
}

# 4. Скачать заказы с сервера
try {
    $ordersXml = Invoke-RestMethod -Uri "$BaseUrl/api/1c/orders" `
        -Method GET -Headers $Headers
    $ordersPath = "$LocalDir\Orders.xml"
    [System.IO.File]::WriteAllText($ordersPath, $ordersXml, [System.Text.Encoding]::UTF8)
    Log "Orders.xml downloaded to $ordersPath"
} catch {
    Log "ERROR downloading orders: $_"
}

Log "=== Sync done ==="
