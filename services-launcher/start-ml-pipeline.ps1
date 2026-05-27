$ErrorActionPreference = 'Stop'
$dir = 'c:\Hijin\pjbingha\digital_twin_row_models\ml-pipeline'
$log = 'c:\Hijin\pjbingha\services-launcher\logs\ml-pipeline-8003.log'
Set-Location $dir
$ts = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
"[$ts] === start ml-pipeline on 8003 ===" | Out-File -FilePath $log -Append -Encoding utf8
& 'C:\Users\pc3\AppData\Local\Programs\Python\Python314\python.exe' -m uvicorn server:app --host 127.0.0.1 --port 8003 *>> $log
