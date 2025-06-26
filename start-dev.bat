@echo off
echo Starting Frontend Development Server (Next.js)...
REM The "start" command opens a new window. 
REM cmd /k keeps the window open after the command finishes (useful for seeing logs).
start "FrontendDevServer" cmd /k "npm run dev"

echo Starting Backend Server (Express)...
REM Navigate to the backend directory and then run its start script.
start "BackendServer" cmd /k "cd src/backend && npm start"

echo Both servers are attempting to start in separate command prompt windows.
echo You can close this window or leave it open.
