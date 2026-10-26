# 평일 오전 10시에 digest.js를 실행하는 작업 스케줄러 등록
# 사용: 이 폴더에서 .\install-task.ps1   /  해제: Unregister-ScheduledTask -TaskName AI-News-Digest

$dir  = $PSScriptRoot
$node = (Get-Command node).Source

$action    = New-ScheduledTaskAction -Execute "$env:WINDIR\System32\conhost.exe" -Argument "--headless `"$node`" `"$dir\digest.js`"" -WorkingDirectory $dir
$trigger   = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday,Tuesday,Wednesday,Thursday,Friday -At 10:00
$settings  = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 30)
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive

Register-ScheduledTask -TaskName "AI-News-Digest" -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description "AI news digest (weekdays 10:00)" -Force | Out-Null
Get-ScheduledTask -TaskName "AI-News-Digest" | Get-ScheduledTaskInfo | Select-Object TaskName, NextRunTime
