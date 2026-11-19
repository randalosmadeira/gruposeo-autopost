param(
  [Parameter(Mandatory=$true)][ValidatePattern('^nexus-[0-9]{8}-[a-f0-9]{7,40}$')][string]$ReleaseId,
  [Parameter(Mandatory=$true)][string]$SshIdentity,
  [string]$VpsHost = '143.95.160.31',
  [int]$VpsPort = 22022
)
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path $PSScriptRoot -Parent
$distPath = Join-Path $repoRoot 'dist'
if (-not (Test-Path -LiteralPath (Join-Path $distPath 'index.html'))) { throw 'Build the tested frontend first.' }
if (-not (Test-Path -LiteralPath $SshIdentity)) { throw 'SSH identity is unavailable.' }
$archivePath = Join-Path ([IO.Path]::GetTempPath()) "zica-posts-$ReleaseId.tgz"
& tar -czf $archivePath -C $distPath .
if ($LASTEXITCODE -ne 0) { throw 'Packaging failed.' }
$archiveHash = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
$sshArgs = @('-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','IdentitiesOnly=yes','-i',$SshIdentity)
$destination = "deploy_zica_ia_posts@$VpsHost"
& scp @sshArgs -P $VpsPort $archivePath "${destination}:/tmp/zica-posts-$ReleaseId.tgz"
if ($LASTEXITCODE -ne 0) { throw 'Archive upload failed.' }
& scp @sshArgs -P $VpsPort (Join-Path $PSScriptRoot 'activate-nexus-frontend.sh') "${destination}:/tmp/activate-$ReleaseId.sh"
if ($LASTEXITCODE -ne 0) { throw 'Activation script upload failed.' }
& ssh @sshArgs -p $VpsPort $destination "bash /tmp/activate-$ReleaseId.sh $ReleaseId $archiveHash"
if ($LASTEXITCODE -ne 0) { throw 'Activation failed. Inspect the rollback result before retrying.' }
