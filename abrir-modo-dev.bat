@echo off
rem Abre o app CISPR 15 LABELO em modo desenvolvimento (Electron + Next dev),
rem sempre lendo o codigo-fonte atual desta pasta — diferente das copias
rem instaladas/empacotadas (Desktop\dist\win-unpacked, T:\...\dist etc.),
rem que sao builds antigos e nao tem os botoes/telas mais recentes.
setlocal
cd /d "%~dp0"

powershell -NoProfile -Command "try { (New-Object Net.Sockets.TcpClient).Connect('127.0.0.1',3000); exit 0 } catch { exit 1 }" >nul 2>&1
if %errorlevel% neq 0 (
    echo Iniciando servidor de desenvolvimento na porta 3000...
    start "CISPR15 - next dev" cmd /c "npm run dev"
    :wait
    timeout /t 1 /nobreak >nul
    powershell -NoProfile -Command "try { (New-Object Net.Sockets.TcpClient).Connect('127.0.0.1',3000); exit 0 } catch { exit 1 }" >nul 2>&1
    if %errorlevel% neq 0 goto wait
) else (
    echo Servidor de desenvolvimento ja esta rodando na porta 3000.
)

echo Abrindo o app...
call npm run electron
