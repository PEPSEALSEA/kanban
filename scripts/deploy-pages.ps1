# Build Next.js static export and push to gh-pages branch for GitHub Pages.
# See docs/DEPLOY.md for one-time GitHub Pages settings (branch: gh-pages).

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot\..

Write-Host "Building static site..." -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

if (-not (Test-Path ".\out")) {
    Write-Error "Build succeeded but ./out folder is missing."
}

Write-Host "Deploying ./out to gh-pages branch..." -ForegroundColor Cyan
npx gh-pages -d out --nojekyll -m "Deploy $(Get-Date -Format 'yyyy-MM-dd HH:mm')"

Write-Host "Done. Site should update at https://pepsealsea.github.io/kanban/ in 1-2 min." -ForegroundColor Green
Write-Host "Pages source must be: branch gh-pages, folder / (root). See docs/DEPLOY.md" -ForegroundColor Yellow
