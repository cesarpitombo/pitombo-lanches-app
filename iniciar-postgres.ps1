# ═══════════════════════════════════════════════════════════════════════════════
# iniciar-postgres.ps1 — Pitombo Lanches
# Inicia o PostgreSQL e registra como serviço do Windows (se necessário)
#
# COMO USAR:
#   Clique com botão direito → "Executar com PowerShell"
#   OU no terminal PowerShell como administrador:
#   .\iniciar-postgres.ps1
# ═══════════════════════════════════════════════════════════════════════════════

$PG_BIN  = "C:\Program Files\PostgreSQL\16\bin"
$PG_DATA = "C:\Program Files\PostgreSQL\16\data"
$pgCtl   = "$PG_BIN\pg_ctl.exe"
$psql    = "$PG_BIN\psql.exe"

Write-Host "`n🔧 Pitombo Lanches — Inicializando PostgreSQL`n" -ForegroundColor Cyan

# 1. Verificar se o binário existe
if (-not (Test-Path $pgCtl)) {
    Write-Host "❌ pg_ctl.exe não encontrado em: $PG_BIN" -ForegroundColor Red
    Write-Host "   Verifique se o PostgreSQL 16 está instalado corretamente." -ForegroundColor Yellow
    Read-Host "Pressione ENTER para sair"
    exit 1
}

# 2. Verificar status atual
Write-Host "⏳ Verificando status do PostgreSQL..." -ForegroundColor Yellow
$status = & $pgCtl status -D $PG_DATA 2>&1
Write-Host "   $status"

if ($status -like "*server is running*") {
    Write-Host "`n✅ PostgreSQL já está rodando!" -ForegroundColor Green
} else {
    # 3. Tentar iniciar
    Write-Host "`n⏳ Iniciando PostgreSQL..." -ForegroundColor Yellow
    $env:PGDATA = $PG_DATA

    # Registrar como serviço (requer admin)
    $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")
    
    if ($isAdmin) {
        Write-Host "   Registrando como serviço do Windows..." -ForegroundColor Yellow
        & $pgCtl register -N "postgresql-x64-16" -D $PG_DATA -S demand 2>&1
        Start-Service -Name "postgresql-x64-16" -ErrorAction SilentlyContinue
    }

    # Tentar iniciar direto de qualquer forma
    & $pgCtl start -D $PG_DATA -l "$PG_DATA\postgresql.log" 2>&1
    
    Start-Sleep -Seconds 3
    $status2 = & $pgCtl status -D $PG_DATA 2>&1

    if ($status2 -like "*server is running*") {
        Write-Host "`n✅ PostgreSQL iniciado com sucesso!" -ForegroundColor Green
    } else {
        Write-Host "`n❌ Não foi possível iniciar o PostgreSQL automaticamente." -ForegroundColor Red
        Write-Host "   Tente iniciar manualmente:" -ForegroundColor Yellow
        Write-Host "   1. Abra 'Serviços' do Windows (Win+R → services.msc)"
        Write-Host "   2. Procure 'postgresql' e clique em 'Iniciar'"
        Write-Host "   3. OU corra este script como Administrador"
        Read-Host "`nPressione ENTER para sair"
        exit 1
    }
}

# 4. Testar conexão e verificar/redefinir senha
Write-Host "`n⏳ Definindo variável de ambiente PATH para psql..." -ForegroundColor Yellow
$env:PATH = "$PG_BIN;$env:PATH"

Write-Host "⏳ Testando conexão como postgres..." -ForegroundColor Yellow

# Tentar sem senha (trust mode)
$testResult = & $psql -U postgres -c "SELECT 1 as ok;" 2>&1
if ($testResult -like "*ok*") {
    Write-Host "✅ Conexão ok sem senha (modo trust)" -ForegroundColor Green
    
    # Definir a senha padrão para o projeto
    $novaSenha = "pitombo123"
    & $psql -U postgres -c "ALTER USER postgres PASSWORD '$novaSenha';" 2>&1
    Write-Host "✅ Senha do postgres definida como: $novaSenha" -ForegroundColor Green
    Write-Host "`n📝 Atualize seu .env com:" -ForegroundColor Cyan
    Write-Host "   DATABASE_URL=postgresql://postgres:$novaSenha@localhost:5432/pitombo_lanches" -ForegroundColor White
} else {
    Write-Host "   Conexão requer senha." -ForegroundColor Yellow
    $senha = Read-Host "   Digite a senha do usuário postgres"
    
    $env:PGPASSWORD = $senha
    $testResult2 = & $psql -U postgres -c "SELECT 1 as ok;" 2>&1
    if ($testResult2 -like "*ok*") {
        Write-Host "✅ Conexão ok com a senha fornecida!" -ForegroundColor Green
        Write-Host "`n📝 Atualize seu .env com:" -ForegroundColor Cyan
        Write-Host "   DATABASE_URL=postgresql://postgres:$senha@localhost:5432/pitombo_lanches" -ForegroundColor White
    } else {
        Write-Host "❌ Senha incorreta ou conexão recusada." -ForegroundColor Red
        Write-Host "   Detalhes: $testResult2"
    }
}

Write-Host "`n✅ Próximo passo: npm run db:setup`n" -ForegroundColor Green
Read-Host "Pressione ENTER para fechar"
