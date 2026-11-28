@echo off
chcp 65001 >nul
py "%~dp0zeksi_modpack.py" || python "%~dp0zeksi_modpack.py"
pause
