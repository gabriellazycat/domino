@echo off
cd /d "%~dp0"
where npm >nul 2>nul || (echo Instale o Node.js em https://nodejs.org e tente de novo. & pause & exit /b 1)
if not exist node_modules (echo Instalando dependencias... & call npm install || (pause & exit /b 1))
call npm run dev -- --open
