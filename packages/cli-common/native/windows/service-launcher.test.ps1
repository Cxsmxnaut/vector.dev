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

  # A console-subsystem wrapper and its console descendant must run without a
  # console window. This is synthetic evidence only, not desktop flash/taskbar proof.
  $consoleProbePath = Join-Path $fixtureRoot 'console-window.txt'
  $consoleProbeScript = Join-Path $fixtureRoot 'console probe.ps1'
  $consoleWrapper = Join-Path $fixtureRoot 'console window probe.ps1'
  $consoleLog = Join-Path $fixtureRoot 'console.launcher.log'
  Set-Content -LiteralPath $consoleProbeScript -Encoding UTF8 -Value @'
param([string]$Out)
Add-Type -Namespace HappierLauncherTest -Name ConsoleProbe -MemberDefinition '[DllImport("kernel32.dll")] public static extern System.IntPtr GetConsoleWindow();'
Add-Content -LiteralPath $Out -Value ([int64][HappierLauncherTest.ConsoleProbe]::GetConsoleWindow())
'@
  $quotedProbeScript = "'{0}'" -f $consoleProbeScript.Replace("'", "''")
  $quotedProbePath = "'{0}'" -f $consoleProbePath.Replace("'", "''")
  Set-Content -LiteralPath $consoleWrapper -Encoding UTF8 -Value @"
& $quotedProbeScript -Out $quotedProbePath
& powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $quotedProbeScript -Out $quotedProbePath
exit `$LASTEXITCODE
"@
  $consoleRun = Start-Launcher $consoleWrapper $consoleLog
  $consoleRun.WaitForExit(30000) | Out-Null
  Assert-True ($consoleRun.HasExited -and $consoleRun.ExitCode -eq 0) "Console probe launcher failed with exit $($consoleRun.ExitCode)"
  $consoleWindows = @(Get-Content -LiteralPath $consoleProbePath)
  Assert-True ($consoleWindows.Count -eq 2) "Expected wrapper and descendant console probes, got $($consoleWindows.Count)"
  Assert-True (@($consoleWindows | Where-Object { $_ -ne '0' }).Count -eq 0) "Wrapper chain received a console window: $($consoleWindows -join ',')"

  # Task Scheduler may already contain the launcher in a job; the launcher's
  # private job must nest inside it rather than failing assignment.
  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class HappierLauncherJobFixture {
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  public static extern IntPtr CreateJobObject(IntPtr attributes, string name);
  [DllImport("kernel32.dll", SetLastError = true)]
  public static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
  [DllImport("kernel32.dll", SetLastError = true)]
  public static extern bool CloseHandle(IntPtr handle);
}
'@
  $nestedGoPath = Join-Path $fixtureRoot 'nested.go'
  $nestedExitPath = Join-Path $fixtureRoot 'nested.exit'
  $nestedLog = Join-Path $fixtureRoot 'nested.launcher.log'
  $nestedParentScript = Join-Path $fixtureRoot 'nested parent.ps1'
  Set-Content -LiteralPath $nestedParentScript -Encoding UTF8 -Value @'
param([string]$Launcher, [string]$Wrapper, [string]$Log, [string]$Go, [string]$ExitPath)
while (-not (Test-Path -LiteralPath $Go)) { Start-Sleep -Milliseconds 50 }
$run = Start-Process -FilePath $Launcher -ArgumentList @('--wrapper', ('"{0}"' -f $Wrapper), '--diagnostic-log', ('"{0}"' -f $Log)) -PassThru -Wait
Set-Content -LiteralPath $ExitPath -Value $run.ExitCode
'@
  $outerJob = [HappierLauncherJobFixture]::CreateJobObject([IntPtr]::Zero, $null)
  Assert-True ($outerJob -ne [IntPtr]::Zero) 'Could not create the outer fixture job'
  try {
    $nestedParent = Start-Process -FilePath powershell.exe -ArgumentList @(
      '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', ('"{0}"' -f $nestedParentScript),
      '-Launcher', ('"{0}"' -f $LauncherPath), '-Wrapper', ('"{0}"' -f $exitWrapper),
      '-Log', ('"{0}"' -f $nestedLog), '-Go', ('"{0}"' -f $nestedGoPath), '-ExitPath', ('"{0}"' -f $nestedExitPath)
    ) -PassThru -WindowStyle Hidden
    $ownedProcessIds.Add($nestedParent.Id) | Out-Null
    Assert-True ([HappierLauncherJobFixture]::AssignProcessToJobObject($outerJob, $nestedParent.Handle)) 'Could not assign the fixture parent to the outer job'
    Set-Content -LiteralPath $nestedGoPath -Value 'go'
    Wait-ForFile $nestedExitPath 30000
    Wait-ForExit $nestedParent.Id
    $ownedProcessIds.Remove($nestedParent.Id) | Out-Null
  } finally {
    [HappierLauncherJobFixture]::CloseHandle($outerJob) | Out-Null
  }
  $nestedExit = (Get-Content -LiteralPath $nestedExitPath -Raw).Trim()
  Assert-True ($nestedExit -eq '37') "Expected nested-job wrapper exit 37, got $nestedExit"
  Assert-True (-not ((Get-Content -LiteralPath $nestedLog -Raw) -match 'stage=assign_job')) 'Launcher failed to assign its job inside an outer job'

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
