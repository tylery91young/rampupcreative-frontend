<#
  upload-media.ps1 - one-step upload of the site's photos & videos to Cloudflare R2.

  It asks you for 3 values from your Cloudflare dashboard, then runs the upload.
  Nothing is written to disk. Close the window and the keys are forgotten.

  Usage (from the repo folder, in PowerShell):
    .\scripts\upload-media.ps1                 upload everything
    .\scripts\upload-media.ps1 --skip-video    photos only (quick first pass)
    .\scripts\upload-media.ps1 --force         replace files already uploaded
#>

param([Parameter(ValueFromRemainingArguments = $true)] $Extra)

$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)   # always run from the repo root

Write-Host ""
Write-Host "R2 upload - paste 3 values from the Cloudflare dashboard:" -ForegroundColor Cyan
Write-Host "  * Account ID       R2 > Overview  (right-hand side)"        -ForegroundColor DarkGray
Write-Host "  * Access Key ID    from the R2 API token you created"      -ForegroundColor DarkGray
Write-Host "  * Secret Access Key  ditto (won't show on screen as you paste)" -ForegroundColor DarkGray
Write-Host "Right-click in this window to paste." -ForegroundColor DarkGray
Write-Host ""

$env:R2_ACCOUNT_ID    = (Read-Host 'Account ID').Trim()
$env:R2_ACCESS_KEY_ID = (Read-Host 'Access Key ID').Trim()
$secure = Read-Host 'Secret Access Key' -AsSecureString
$env:R2_SECRET_ACCESS_KEY = [System.Net.NetworkCredential]::new('', $secure).Password

if (-not $env:R2_ACCOUNT_ID -or -not $env:R2_ACCESS_KEY_ID -or -not $env:R2_SECRET_ACCESS_KEY) {
    Write-Host "`nOne of the values was blank - stopping, nothing uploaded." -ForegroundColor Red
    exit 1
}

# Optional: override the bucket name if yours isn't the default.
if (-not $env:R2_BUCKET) { $env:R2_BUCKET = 'rampupcreativemedia' }

$python = (Get-Command python -ErrorAction SilentlyContinue).Source
if (-not $python) { $python = (Get-Command py -ErrorAction SilentlyContinue).Source }
if (-not $python) {
    Write-Host "`nPython not found on PATH. Install Python 3, open a new window, and re-run." -ForegroundColor Red
    exit 1
}

Write-Host "`nUploading to bucket '$($env:R2_BUCKET)' ... the videos can take a few minutes.`n" -ForegroundColor Cyan
if ($Extra) { & $python 'scripts/upload_media.py' @Extra } else { & $python 'scripts/upload_media.py' }
$code = $LASTEXITCODE

# Forget the keys as soon as we're done.
$env:R2_ACCOUNT_ID        = $null
$env:R2_ACCESS_KEY_ID     = $null
$env:R2_SECRET_ACCESS_KEY = $null

if ($code -eq 0) {
    Write-Host "`nDone. Next: in Cloudflare, R2 > rampupcreativemedia > Settings >" -ForegroundColor Green
    Write-Host "Public access > Connect Domain > media.rampupcreative.com" -ForegroundColor Green
}
exit $code
