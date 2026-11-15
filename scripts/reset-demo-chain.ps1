[CmdletBinding()]
param(
    [switch]$NoOpen,
    [switch]$NoPause
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$contractsRoot = Join-Path $projectRoot "contracts"
$frontendRoot = Join-Path $projectRoot "frontend"
$logRoot = Join-Path $projectRoot "_build"
$rpcUrl = "http://127.0.0.1:8545"
$frontendUrl = "http://127.0.0.1:5173/"
$managerAddress = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
$expectedContractAddress = "0x5FbDB2315678afecb367f032d93F642f64180aa3"

function Resolve-Tool {
    param(
        [string]$Name,
        [string]$Fallback
    )

    $command = Get-Command $Name -ErrorAction SilentlyContinue
    if ($command) {
        return $command.Source
    }
    if (Test-Path -LiteralPath $Fallback) {
        return $Fallback
    }
    throw "Cannot find $Name. Add Foundry's bin directory to PATH or install Foundry."
}

function Wait-ForRpc {
    param([int]$Attempts = 30)

    for ($attempt = 1; $attempt -le $Attempts; $attempt++) {
        try {
            $body = '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'
            $response = Invoke-RestMethod -Uri $rpcUrl -Method Post -ContentType "application/json" -Body $body
            if ($response.result) {
                return
            }
        } catch {
            Start-Sleep -Milliseconds 500
        }
    }
    throw "Anvil did not become ready at $rpcUrl."
}

function Wait-ForHttp {
    param(
        [string]$Url,
        [int]$Attempts = 40
    )

    for ($attempt = 1; $attempt -le $Attempts; $attempt++) {
        try {
            $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 2
            if ($response.StatusCode -eq 200) {
                return
            }
        } catch {
            Start-Sleep -Milliseconds 500
        }
    }
    throw "Frontend did not become ready at $Url."
}

$anvil = Resolve-Tool -Name "anvil" -Fallback "C:\Users\yiche\.foundry\bin\anvil.exe"
$forge = Resolve-Tool -Name "forge" -Fallback "C:\Users\yiche\.foundry\bin\forge.exe"
$cast = Resolve-Tool -Name "cast" -Fallback "C:\Users\yiche\.foundry\bin\cast.exe"

New-Item -ItemType Directory -Force -Path $logRoot | Out-Null

Write-Host ""
Write-Host "GoodFund local chain reset" -ForegroundColor Cyan
Write-Host "Project: $projectRoot"

$listener = Get-NetTCPConnection -LocalPort 8545 -State Listen -ErrorAction SilentlyContinue
if ($listener) {
    $processIds = $listener | Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($processId in $processIds) {
        Write-Host "Stopping Anvil process $processId..."
        Stop-Process -Id $processId -Force
    }

    for ($attempt = 1; $attempt -le 20; $attempt++) {
        if (-not (Get-NetTCPConnection -LocalPort 8545 -State Listen -ErrorAction SilentlyContinue)) {
            break
        }
        Start-Sleep -Milliseconds 250
    }
}

$anvilStdout = Join-Path $logRoot "anvil-reset.out.log"
$anvilStderr = Join-Path $logRoot "anvil-reset.err.log"
$anvilProcess = Start-Process `
    -FilePath $anvil `
    -ArgumentList "--host","127.0.0.1","--port","8545","--chain-id","31337","--silent" `
    -WindowStyle Hidden `
    -RedirectStandardOutput $anvilStdout `
    -RedirectStandardError $anvilStderr `
    -PassThru

Wait-ForRpc
Write-Host "Anvil restarted (PID $($anvilProcess.Id))." -ForegroundColor Green

Push-Location $contractsRoot
try {
    Write-Host "Deploying WelfareFund with Anvil's unlocked Manager account..."
    $deploymentOutput = & $forge create `
        "src/WelfareFund.sol:WelfareFund" `
        --rpc-url $rpcUrl `
        --unlocked `
        --from $managerAddress `
        --broadcast `
        --constructor-args $managerAddress 2>&1

    $deploymentText = $deploymentOutput -join [Environment]::NewLine
    Write-Host $deploymentText
    if ($LASTEXITCODE -ne 0) {
        throw "Contract deployment failed."
    }

    $addressMatch = [regex]::Match($deploymentText, "Deployed to:\s*(0x[0-9a-fA-F]{40})")
    if (-not $addressMatch.Success) {
        throw "Could not read the deployed contract address from forge output."
    }
    $contractAddress = $addressMatch.Groups[1].Value
} finally {
    Pop-Location
}

if ($contractAddress.ToLowerInvariant() -ne $expectedContractAddress.ToLowerInvariant()) {
    throw "Deployed address $contractAddress does not match the frontend default $expectedContractAddress. Update frontend/.env.product before using the app."
}

$balanceWei = & $cast balance $contractAddress --rpc-url $rpcUrl
$totalReceivedWei = & $cast call $contractAddress "totalReceived()(uint256)" --rpc-url $rpcUrl
$donorCount = & $cast call $contractAddress "donorCount()(uint256)" --rpc-url $rpcUrl
$currentTranche = & $cast call $contractAddress "currentTranche()(uint256)" --rpc-url $rpcUrl
$phase = & $cast call $contractAddress "phase()(uint8)" --rpc-url $rpcUrl
$poolBody = '{"jsonrpc":"2.0","method":"txpool_status","params":[],"id":1}'
$pool = (Invoke-RestMethod -Uri $rpcUrl -Method Post -ContentType "application/json" -Body $poolBody).result

$frontendListener = Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue
if (-not $frontendListener) {
    $npmCommand = Get-Command npm.cmd -ErrorAction SilentlyContinue
    if (-not $npmCommand) {
        throw "Frontend is not running and npm.cmd could not be found. Start the frontend manually."
    }

    $viteStdout = Join-Path $logRoot "vite-reset.out.log"
    $viteStderr = Join-Path $logRoot "vite-reset.err.log"
    Start-Process `
        -FilePath $npmCommand.Source `
        -ArgumentList "run","dev:product","--","--host","127.0.0.1","--port","5173" `
        -WorkingDirectory $frontendRoot `
        -WindowStyle Hidden `
        -RedirectStandardOutput $viteStdout `
        -RedirectStandardError $viteStderr
    Wait-ForHttp -Url $frontendUrl
}

Write-Host ""
Write-Host "Reset complete" -ForegroundColor Green
Write-Host "Contract: $contractAddress"
Write-Host "Balance wei: $balanceWei"
Write-Host "Total received wei: $totalReceivedWei"
Write-Host "Donor count: $donorCount"
Write-Host "Current tranche: $currentTranche"
Write-Host "Phase: $phase (0 = Funding)"
Write-Host "Pending / queued: $($pool.pending) / $($pool.queued)"
Write-Host "Frontend: $frontendUrl"

if (-not $NoOpen) {
    Start-Process $frontendUrl
}

Write-Host ""
Write-Host "MetaMask may still cache old nonces after a chain reset." -ForegroundColor Yellow
Write-Host "For Manager, Donor A and Donor B, use:" -ForegroundColor Yellow
Write-Host "Settings > Advanced > Clear activity tab data" -ForegroundColor Yellow
Write-Host "Then refresh the GoodFund page once." -ForegroundColor Yellow

if (-not $NoPause) {
    Write-Host ""
    Read-Host "Press Enter to close this window"
}
