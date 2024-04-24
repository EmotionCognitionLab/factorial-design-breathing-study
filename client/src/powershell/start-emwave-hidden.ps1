$empid = Start-Process -WindowStyle minimized -FilePath "C:\Program Files\HeartMath\emWave\emwavepc.exe" -PassThru
Write-Output $empid.Id