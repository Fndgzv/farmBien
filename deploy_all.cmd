@echo off
setlocal EnableExtensions DisableDelayedExpansion

REM Ir a la carpeta del script
cd /d "%~dp0"

echo ==== DEPLOY ALL (Front build + Backend changes) ====

echo [1/5] Build Angular (prod)...
pushd "frontFarm"
call npx ng build --configuration=production --output-path=..\backBien\public\browser
if errorlevel 1 goto :build_fail
popd


REM [0/5] Escribe version.txt con timestamp y corto del commit
for /f %%i in ('git rev-parse --short HEAD') do set GIT_SHORT=%%i
for /f "tokens=1-4 delims=/ " %%a in ("%date%") do set FECHA=%%d-%%b-%%c
for /f "tokens=1-2 delims=: " %%a in ("%time%") do set HORA=%%a:%%b
echo %FECHA% %HORA% - %GIT_SHORT%> backBien\public\browser\version.txt

echo [2/5] Git add de bundle...
git add backBien/public -A

echo [3/5] Git add (resto)...
git add -A

REM Capturar SOLO el primer argumento, removiendo comillas
set "COMMIT_MSG=%~1"
if "%COMMIT_MSG%"=="" set "COMMIT_MSG=deploy: build front+back"
echo Commit message: [%COMMIT_MSG%]

echo [4/5] Git commit...
git commit -m "%COMMIT_MSG%"
if errorlevel 1 echo No hay cambios para commit o fallo de commit.

echo [5/5] Git push...
git push
if errorlevel 1 goto :push_fail

echo Listo. Si Render no auto-deploya, usa "Deploy latest commit".
exit /b 0

:build_fail
popd
echo ERROR: Fallo el build de Angular.
exit /b 1

:push_fail
echo ERROR: Fallo el git push.
exit /b 1
