@echo off
echo.
echo ==================================================
echo [VibeStudio AI Launcher]
echo ==================================================
echo.
echo Starting local Node.js proxy server on port 3030...
echo.

:: Start server in background within the same console window
start /b node vibestudio/server.js

:: Wait 2 seconds for server to initialize
timeout /t 2 /nobreak > nul

echo.
echo Opening VibeStudio AI in your default browser...
start http://localhost:3030
echo.
echo --------------------------------------------------
echo To stop the server, just close this console window.
echo --------------------------------------------------
echo.

:: Prevent console window from closing
pause > nul
