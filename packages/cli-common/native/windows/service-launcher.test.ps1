param(
  [string]$LauncherPath = (Join-Path $PSScriptRoot 'bin\windows-x64\happier-service-launcher.exe')
)

$ErrorActionPreference = 'Stop'

function Assert-True([bool]$Condition, [string]$Message) {
  if (-not $Condition) { throw $Message }
}

function Wait-ForFile([string]$Path, [int]$TimeoutMs = 10000) {
  $deadline = [DateTime]::UtcNow.AddMilliseconds($TimeoutMs)
  while ([DateTime]::UtcNow -lt $deadline) {
    if (Test-Path -LiteralPath $Path) { return }
    Start-Sleep -Milliseconds 50
  }
  throw "Timed out waiting for fixture file: $Path"
}

function Wait-ForExit([int]$ProcessId, [int]$TimeoutMs = 10000) {
  $deadline = [DateTime]::UtcNow.AddMilliseconds($TimeoutMs)
  while ([DateTime]::UtcNow -lt $deadline) {
    if ($null -eq (Get-Process -Id $ProcessId -ErrorAction SilentlyContinue)) { return }
    Start-Sleep -Milliseconds 50
  }
  throw "Timed out waiting for process $ProcessId to exit"
}

function Start-Launcher([string]$WrapperPath, [string]$LogPath) {
  Start-Process -FilePath $LauncherPath -ArgumentList @(
    '--wrapper',
    ('"{0}"' -f $WrapperPath.Replace('"', '\"')),
    '--diagnostic-log',
    ('"{0}"' -f $LogPath.Replace('"', '\"'))
  ) -PassThru -WindowStyle Hidden
}

if (-not (Test-Path -LiteralPath $LauncherPath -PathType Leaf)) {
  throw "Compiled Windows service launcher is missing: $LauncherPath"
}

$fixtureRoot = Join-Path ([IO.Path]::GetTempPath()) ('happier launcher & '' $ ` fixture {0} ü' -f [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $fixtureRoot | Out-Null
$ownedProcessIds = [Collections.Generic.HashSet[int]]::new()

try {
  $missingRun = Start-Launcher (Join-Path $fixtureRoot 'missing wrapper.ps1') (Join-Path $fixtureRoot 'missing.launcher.log')
  $missingRun.WaitForExit(10000) | Out-Null
  Assert-True ($missingRun.ExitCode -eq 11) "Expected missing-wrapper exit 11, got $($missingRun.ExitCode)"
  $missingDiagnostics = Get-Content -LiteralPath (Join-Path $fixtureRoot 'missing.launcher.log') -Raw
  Assert-True ($missingDiagnostics -match 'stage=validate_wrapper message=failed') 'Missing-wrapper diagnostics omitted the failure stage'

  $deniedWrapper = Join-Path $fixtureRoot 'denied log wrapper.ps1'
  Set-Content -LiteralPath $deniedWrapper -Encoding UTF8 -Value 'exit 0'
  $deniedRun = Start-Launcher $deniedWrapper $fixtureRoot
  $deniedRun.WaitForExit(10000) | Out-Null
  Assert-True ($deniedRun.ExitCode -eq 12) "Expected denied-log exit 12, got $($deniedRun.ExitCode)"

  $exitWrapper = Join-Path $fixtureRoot 'exit code 37.ps1'
  $exitLog = Join-Path $fixtureRoot 'exit code.launcher.log'
  Set-Content -LiteralPath $exitWrapper -Encoding UTF8 -Value @'
[Console]::Error.WriteLine('synthetic warning')
1..10000 | ForEach-Object { [Console]::Out.WriteLine('discarded output ' + $_) }
exit 37
'@
  $exitRun = Start-Launcher $exitWrapper $exitLog
  $exitRun.WaitForExit(10000) | Out-Null
  Assert-True $exitRun.HasExited 'Launcher did not exit with its wrapper'
  Assert-True ($exitRun.ExitCode -eq 37) "Expected wrapper exit 37, got $($exitRun.ExitCode)"
  $exitDiagnostics = Get-Content -LiteralPath $exitLog -Raw
  Assert-True ($exitDiagnostics -match 'wrapper_pid=\d+') 'Launcher diagnostics omitted wrapper PID'
  Assert-True ($exitDiagnostics -match 'wrapper_creation_filetime=\d+') 'Launcher diagnostics omitted wrapper creation time'
  Assert-True ($exitDiagnostics -match 'child_exit=37') 'Launcher diagnostics omitted exact wrapper exit'

  $rapidRuns = 1..4 | ForEach-Object {
    Start-Launcher $deniedWrapper (Join-Path $fixtureRoot ("rapid-$_.launcher.log"))
  }
  foreach ($rapidRun in $rapidRuns) {
    $rapidRun.WaitForExit(10000) | Out-Null
    Assert-True ($rapidRun.HasExited -and $rapidRun.ExitCode -eq 0) 'A rapid launcher start did not exit cleanly'
  }

  $normalChildPidPath = Join-Path $fixtureRoot 'normal-child.pid'
  $normalWrapper = Join-Path $fixtureRoot 'normal descendant.ps1'
  $normalLog = Join-Path $fixtureRoot 'normal.launcher.log'
  Set-Content -LiteralPath $normalWrapper -Encoding UTF8 -Value @"
`$child = Start-Process -FilePath powershell.exe -ArgumentList @('-NoProfile', '-NonInteractive', '-Command', 'Start-Sleep -Seconds 30') -PassThru -WindowStyle Hidden
Set-Content -LiteralPath '$($normalChildPidPath.Replace("'", "''"))' -Value `$child.Id
exit 0
"@
  $normalRun = Start-Launcher $normalWrapper $normalLog
  $normalRun.WaitForExit(10000) | Out-Null
  Assert-True $normalRun.HasExited 'Launcher did not observe a normal wrapper exit'
  Wait-ForFile $normalChildPidPath
  $normalChildPid = [int](Get-Content -LiteralPath $normalChildPidPath -Raw)
  $ownedProcessIds.Add($normalChildPid) | Out-Null
  Assert-True ($null -ne (Get-Process -Id $normalChildPid -ErrorAction SilentlyContinue)) 'Normal wrapper exit killed a retained descendant'
  Stop-Process -Id $normalChildPid -Force
  Wait-ForExit $normalChildPid
  $ownedProcessIds.Remove($normalChildPid) | Out-Null

  $forcedWrapperPidPath = Join-Path $fixtureRoot 'forced-wrapper.pid'
  $forcedChildPidPath = Join-Path $fixtureRoot 'forced-child.pid'
  $forcedWrapper = Join-Path $fixtureRoot 'forced termination.ps1'
  $forcedLog = Join-Path $fixtureRoot 'forced.launcher.log'
  $unrelated = Start-Process -FilePath powershell.exe -ArgumentList @('-NoProfile', '-NonInteractive', '-Command', 'Start-Sleep -Seconds 30') -PassThru -WindowStyle Hidden
  $ownedProcessIds.Add($unrelated.Id) | Out-Null
  Set-Content -LiteralPath $forcedWrapper -Encoding UTF8 -Value @"
Set-Content -LiteralPath '$($forcedWrapperPidPath.Replace("'", "''"))' -Value `$PID
`$child = Start-Process -FilePath powershell.exe -ArgumentList @('-NoProfile', '-NonInteractive', '-Command', 'Start-Sleep -Seconds 30') -PassThru -WindowStyle Hidden
Set-Content -LiteralPath '$($forcedChildPidPath.Replace("'", "''"))' -Value `$child.Id
Start-Sleep -Seconds 30
"@
  $forcedRun = Start-Launcher $forcedWrapper $forcedLog
  $ownedProcessIds.Add($forcedRun.Id) | Out-Null
  Wait-ForFile $forcedWrapperPidPath
  Wait-ForFile $forcedChildPidPath
  $forcedWrapperPid = [int](Get-Content -LiteralPath $forcedWrapperPidPath -Raw)
  $forcedChildPid = [int](Get-Content -LiteralPath $forcedChildPidPath -Raw)
  $ownedProcessIds.Add($forcedWrapperPid) | Out-Null
  $ownedProcessIds.Add($forcedChildPid) | Out-Null
  Stop-Process -Id $forcedRun.Id -Force
  Wait-ForExit $forcedRun.Id
  Wait-ForExit $forcedWrapperPid
  Wait-ForExit $forcedChildPid
  Assert-True ($null -ne (Get-Process -Id $unrelated.Id -ErrorAction SilentlyContinue)) 'Forced launcher stop killed an unrelated process'
  Stop-Process -Id $unrelated.Id -Force
  Wait-ForExit $unrelated.Id
  $ownedProcessIds.Remove($forcedRun.Id) | Out-Null
  $ownedProcessIds.Remove($forcedWrapperPid) | Out-Null
  $ownedProcessIds.Remove($forcedChildPid) | Out-Null
  $ownedProcessIds.Remove($unrelated.Id) | Out-Null

  Write-Output 'Windows service launcher synthetic lifecycle tests passed.'
} finally {
  foreach ($ownedProcessId in @($ownedProcessIds)) {
    Stop-Process -Id $ownedProcessId -Force -ErrorAction SilentlyContinue
  }
  Remove-Item -LiteralPath $fixtureRoot -Recurse -Force -ErrorAction SilentlyContinue
}
