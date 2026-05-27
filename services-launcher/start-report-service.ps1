$ErrorActionPreference = 'Stop'
$scriptRoot = $PSScriptRoot
$dir = Join-Path $scriptRoot '..\digital_twin_row_models\report-service'
$log = Join-Path $scriptRoot 'logs\report-service-8002.log'
New-Item -ItemType Directory -Force -Path (Split-Path $log) | Out-Null
Set-Location $dir
$ts = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
"[$ts] === start report-service on 8002 ===" | Out-File -FilePath $log -Append -Encoding utf8
python -m uvicorn server:app --host 127.0.0.1 --port 8002 *>> $log
