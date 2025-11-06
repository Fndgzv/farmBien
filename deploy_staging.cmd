@echo off
cd /d "%~dp0"
echo ==== DEPLOY STAGING (Front build staging + Backend) ====
pushd "frontFarm"
call npx ng build --configuration=staging --output-path=..\backBien\public\browser
if errorlevel 1 goto :build_fail
popd
git add backBien/public -A
git add -A
set "COMMIT_MSG=%~1"
if "%COMMIT_MSG%"=="" set "COMMIT_MSG=deploy: staging build front+back"
git commit -m "%COMMIT_MSG%"
git push
exit /b 0
:build_fail
popd
echo ERROR: Fallo el build de Angular.
exit /b 1
