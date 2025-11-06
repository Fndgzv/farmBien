@echo off
setlocal EnableExtensions

rem ==== Deploy a PRODUCCIÓN en Render (build remoto) ====
rem - No compila localmente el front
rem - Solo commit/push del código y Render hace el build

cd /d "%~dp0"

rem 0) Seguridad: aborta si no es rama main
for /f "delims=" %%b in ('git rev-parse --abbrev-ref HEAD 2^>nul') do set CURR_BRANCH=%%b
if not "%CURR_BRANCH%"=="main" (
  echo [ERROR] Debes desplegar desde la rama "main" (estas en "%CURR_BRANCH%").
  exit /b 1
)

rem 1) Asegura dependencias bloqueadas (opcional pero recomendable si tocaste package.json)
rem call npm -v >nul 2>&1 || echo [WARN] npm no esta en PATH, continuando...

rem 2) Mensaje de commit
set "MSG=%~1"
if "%MSG%"=="" set "MSG=chore: prod deploy"

rem 3) Pull por si hay algo pendiente del remoto
git fetch --all --prune
git pull --rebase

rem 4) Agrega TODO y commit (si no hay cambios, no truena)
git add -A
git commit -m "%MSG%"
if errorlevel 1 (
  echo [INFO] Sin cambios para commitear o commit no necesario.
)

rem 5) Push (Render debe tener Auto-Deploy activo para la rama main)
git push || (
  echo [ERROR] Fallo el git push.
  exit /b 1
)

rem 6) Tip final
echo.
echo ✅ Push hecho. Ve al servicio **farmBien** en Render:
echo    - Si no arranca solo, usa: Manual Deploy → "Deploy latest commit"
echo    - Si cambiaste version de Node/Angular o deps: "Clear build cache & Deploy"
echo    - Revisa "Events" y "Logs" para ver el progreso.
echo.

exit /b 0
