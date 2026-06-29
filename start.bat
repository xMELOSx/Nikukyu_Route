@echo off
:loop
echo ============================================
echo  Starting server...
echo ============================================
cmd /c npm run dev
echo.
echo ============================================
echo  Server stopped. Restarting in 3 seconds...
echo ============================================
timeout /t 3 /nobreak >nul
goto loop
