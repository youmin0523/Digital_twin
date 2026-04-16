@echo off
cd /d C:\cccc\Digital_twin
start "Log Snapshot" /min python log_snapshot.py
echo 스냅샷 스케줄러 백그라운드 시작됨
echo 로그 저장 위치: C:\cccc\Digital_twin\log_snapshot.txt
