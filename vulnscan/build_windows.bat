@echo off
rem Builds dist\VulnScan.exe on a Windows PC. Needs Python 3.12 from python.org.
cd /d "%~dp0"
python -m pip install -r requirements.txt -r requirements-build.txt || goto :error
python -m pytest tests -q || goto :error
pyinstaller --noconfirm --distpath dist --workpath build packaging\vulnscan.spec || goto :error
echo.
echo Done. Your program is dist\VulnScan.exe
pause
exit /b 0
:error
echo Build failed - see the messages above.
pause
exit /b 1
