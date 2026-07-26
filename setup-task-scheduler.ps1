# Run this script ONCE as Administrator to create the scheduled task
# Right-click PowerShell -> "Run as administrator" -> paste and run

$OldTaskName  = "Kosmetichka-1C-Sync"
$NewTaskName  = "KosmetichkaWatchSync"
$ScriptPath   = "E:\WEB\watch-sync.ps1"
$LogPath      = "E:\WEB\sync.log"

# Remove old task if exists
if (Get-ScheduledTask -TaskName $OldTaskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $OldTaskName -Confirm:$false
    Write-Host "Old task '$OldTaskName' removed." -ForegroundColor Yellow
}

# Action: run watch-sync.ps1 (runs continuously as a daemon)
$Action = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument "-NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$ScriptPath`""

# Trigger: at login
$Trigger = New-ScheduledTaskTrigger -AtLogOn

# Settings: no time limit (runs forever), don't start new instance if already running
$Settings = New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -MultipleInstances IgnoreNew `
    -StartWhenAvailable `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 1)

# Principal: run as current user with highest privileges
$Principal = New-ScheduledTaskPrincipal `
    -UserId $env:USERNAME `
    -RunLevel Highest

# Register the task
Register-ScheduledTask `
    -TaskName $NewTaskName `
    -Action $Action `
    -Trigger $Trigger `
    -Settings $Settings `
    -Principal $Principal `
    -Description "Watches webdata folder and syncs 1C with kosmetichka-opt.ru automatically" `
    -Force

Write-Host "Task '$NewTaskName' created successfully." -ForegroundColor Green
Write-Host "Logs: $LogPath" -ForegroundColor Cyan

# Start immediately without waiting for reboot
Start-ScheduledTask -TaskName $NewTaskName
Write-Host "Task started." -ForegroundColor Green
