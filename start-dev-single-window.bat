@echo off
echo Starting Backend Server in background (output will be in this window)...
cd src/backend
start /B npm start

echo.
echo Starting Frontend Server in foreground (output will be in this window)...
cd ../..
npm run dev

echo.
echo Both servers have been initiated in this window.
echo Frontend is running in the foreground.
echo Press Ctrl+C to stop the frontend. The backend (started with "start /B") might need to be stopped manually via Task Manager if it doesn't close automatically.
pause