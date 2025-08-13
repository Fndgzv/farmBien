@echo off
setlocal enabledelayedexpansion

REM ==== Rutas (ajústalas si tu estructura cambia) ====
set ROOT=D:\farmBien
set FRONT_DIR=%ROOT%\frontFarm
set BACK_DIR=%ROOT%\backBien
set PUBLIC_DIR=%BACK_DIR%\public

echo ==== DEPLOY ALL (Front build + Backend changes) ====

REM --- Sanidad: validar Angular en FRONT_DIR ---
if not exist "%FRONT_DIR%\angular.json" (
  echo [ERROR] No encuentro angular.json en "%FRONT_DIR%".
  echo Asegurate que FRONT_DIR apunta a tu carpeta de Angular.
  exit /b 1
)

REM --- Limpieza de carpeta anidada por builds previos ---
if exist "%PUBLIC_DIR%\browser\browser" (
  echo Limpiando carpeta anidada: %PUBLIC_DIR%\browser\browser
  rmdir /s /q "%PUBLIC_DIR%\browser\browser"
)

REM --- Build Angular hacia backBien/public ---
pushd "%FRONT_DIR%"
echo Compilando Angular (prod) -> %PUBLIC_DIR% ...
call npx ng version >nul 2>&1
if errorlevel 1 (
  echo [INFO] Angular CLI no detectado globalmente. Usando npx...
)

call npx ng build --configuration=production --output-path="%PUBLIC_DIR%"
if errorlevel 1 (
  echo [ERROR] Fallo el build de Angular.
  popd
  exit /b 1
)
popd

REM --- (Opcional) limpiar de nuevo por si el build creó browser\browser ---
if exist "%PUBLIC_DIR%\browser\browser" (
  echo Re-limpieza: %PUBLIC_DIR%\browser\browser
  rmdir /s /q "%PUBLIC_DIR%\browser\browser"
)

REM --- Commit & push desde la RAIZ del repo unificado ---
pushd "%ROOT%"

REM Forzar incluir el bundle compilado y cualquier cambio de back/front
git add -f backBien/public/browser -A
git add -A

REM Mensaje de commit: usa argumentos del script o default
set MSG=%*
if "%MSG%"=="" set MSG=deploy(all): build front + backend changes

git commit -m "%MSG%"
REM Si no hay cambios, mostrara 'nothing to commit' y seguira

git push origin main
if errorlevel 1 (
  echo [ERROR] Fallo el push a origin/main.
  popd
  exit /b 1
)
popd

echo ==== Listo ====
echo Si Render tiene Auto Deploy activado, se desplegara solo.
echo Si no, entra a Render y da click en "Deploy latest commit".
exit /b 0
