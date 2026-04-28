@echo off
setlocal EnableExtensions
rem === Deploy a PRODUCCIÓN (build remoto en Render) ===

cd /d "%~dp0"

git fetch --all --prune
git pull --rebase

set "MSG=%*"
if "%MSG%"=="" set "MSG=chore: prod deploy"

git add -A
git commit -m "%MSG%" || goto _PUSH
:_PUSH
git push || goto _FAIL

echo.
echo ✅ Push hecho. En Render:
echo    - Manual Deploy → "Deploy latest commit" (si no arranca solo)
echo    - Clear build cache & Deploy (si cambiaste Node/Angular/deps)
echo.
goto :eof

:_FAIL
echo [ERROR] Fallo git push.
exit /b 1
