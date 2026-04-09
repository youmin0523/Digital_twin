@echo off
cd /d "c:\Users\Codelab\Desktop\PROJECT\Portfolio\Digital Twin\report-service"
echo Creating venv...
python -m venv venv
if exist venv (
    echo Venv created.
    .\venv\Scripts\python.exe -m pip install -r requirements.txt
    .\venv\Scripts\python.exe -m pip install anthropic reportlab matplotlib httpx python-dotenv
    echo Setup complete.
) else (
    echo Failed to create venv.
)
