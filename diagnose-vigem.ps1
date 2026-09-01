$ErrorActionPreference='Stop'
$root=Split-Path -Parent $MyInvocation.MyCommand.Path
$dll=Join-Path $root 'ViGEmClient.dll'
$helper=Join-Path $root 'vigem-helper.ps1'
Write-Host '=== 87Z / ViGEm diagnóstico ===' -ForegroundColor White
Write-Host "Pasta: $root"
Write-Host "ViGEmClient.dll: $(Test-Path $dll)"
Write-Host "vigem-helper.ps1: $(Test-Path $helper)"
Write-Host ''
if (-not (Test-Path $dll)) { Write-Host 'ERRO: ViGEmClient.dll não está presente.' -ForegroundColor Red; exit 2 }
$child=Start-Process powershell.exe -ArgumentList @('-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',$helper,'-DllPath',$dll) -PassThru -WindowStyle Hidden -RedirectStandardOutput (Join-Path $env:TEMP '87z-vigem-diag-out.txt') -RedirectStandardError (Join-Path $env:TEMP '87z-vigem-diag-err.txt')
Start-Sleep -Milliseconds 1500
$out=Get-Content (Join-Path $env:TEMP '87z-vigem-diag-out.txt') -Raw -ErrorAction SilentlyContinue
Write-Host $out
Write-Host ''
Write-Host 'Abra joy.cpl enquanto este teste estiver ativo para comparar o dispositivo.' -ForegroundColor Yellow
Start-Sleep -Seconds 8
try { $child.StandardInput.Close() } catch {}
try { if (-not $child.HasExited) { Stop-Process -Id $child.Id -Force } } catch {}
$err=Get-Content (Join-Path $env:TEMP '87z-vigem-diag-err.txt') -Raw -ErrorAction SilentlyContinue
if($err){Write-Host $err -ForegroundColor Red}
