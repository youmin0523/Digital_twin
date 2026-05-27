$ErrorActionPreference = 'Stop'
$scriptRoot = $PSScriptRoot
$dir = Join-Path $scriptRoot '..\digital_twin_row_models\rl-pipeline'
$log = Join-Path $scriptRoot 'logs\rl-pipeline-8001.log'
New-Item -ItemType Directory -Force -Path (Split-Path $log) | Out-Null
Set-Location $dir
$ts = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
"[$ts] === start rl-pipeline on 8001 ===" | Out-File -FilePath $log -Append -Encoding utf8
python -m uvicorn server:app --host 127.0.0.1 --port 8001 *>> $log
