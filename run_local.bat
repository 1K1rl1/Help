@echo off
cd /d %~dp0
start "Python receiver" cmd /k "py parse_messenger_errors.py"
start "MAX bot" cmd /k "node max_bot.js"
echo Installed Node dependencies and started local receiver and MAX bot in separate windows.
echo Use CTRL+C in each window to stop the process.
pause
