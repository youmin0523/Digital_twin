$ErrorActionPreference = 'Stop'
$scriptRoot = $PSScriptRoot
# sar_server.py 는 Digital_twin 루트에 있음
$dir = Join-Path $scriptRoot '..'
$log = Join-Path $scriptRoot 'logs\sar-server-8005.log'
New-Item -ItemType Directory -Force -Path (Split-Path $log) | Out-Null
Set-Location $dir
$ts = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
"[$ts] === start sar-server on 8005 ===" | Out-File -FilePath $log -Append -Encoding utf8
python sar_server.py *>> $log
