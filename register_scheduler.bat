@echo off
chcp 65001 >nul
:: 관리자 권한 확인
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [오류] 관리자 권한으로 실행하세요.
    echo 이 파일을 우클릭 → "관리자 권한으로 실행" 하세요.
    pause
    exit /b 1
)

echo ============================================================
echo  Digital Twin Task Scheduler 등록
echo ============================================================

set BASE=c:\cccc\Digital_twin
set TASK_BOOT=DigitalTwin_AutoStart
set TASK_WATCH=DigitalTwin_Watchdog
set PYTHON=python

:: 기존 작업 삭제
schtasks /delete /tn "%TASK_BOOT%" /f >nul 2>&1
schtasks /delete /tn "%TASK_WATCH%" /f >nul 2>&1

:: [작업 1] 로그인 시 서버 기동 + 학습 트리거
schtasks /create ^
    /tn "%TASK_BOOT%" ^
    /tr "\"%BASE%\auto_start.bat\"" ^
    /sc ONLOGON ^
    /delay 0000:20 ^
    /rl HIGHEST ^
    /f >nul

:: [작업 2] Watchdog 데몬 — 30분마다 헬스체크 + 자동재시작
::  (창 없이 pythonw 사용)
schtasks /create ^
    /tn "%TASK_WATCH%" ^
    /tr "pythonw \"%BASE%\watchdog.py\"" ^
    /sc ONLOGON ^
    /delay 0001:00 ^
    /rl HIGHEST ^
    /f >nul

if %errorLevel% == 0 (
    echo.
    echo [성공] Task Scheduler 등록 완료!
    echo.
    echo   [1] %TASK_BOOT%
    echo       - 로그인 시 자동 실행 (20초 딜레이)
    echo       - 4개 서버 기동 + 학습 트리거
    echo.
    echo   [2] %TASK_WATCH%
    echo       - 로그인 후 1분 뒤 시작
    echo       - 5분마다 서버 헬스체크 + 죽으면 자동재시작
    echo       - 학습 멈추면 자동 재트리거
    echo       - 창 없이 백그라운드 실행
    echo.
    echo   로그 위치: %BASE%\logs\
    echo     - watchdog.log
    echo     - rl-pipeline.log
    echo     - report-service.log
    echo     - sar-server.log
    echo     - ml-training.log
    echo.
) else (
    echo [실패] 등록 실패.
)

pause
