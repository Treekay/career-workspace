$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type '[System.Runtime.InteropServices.DllImport("user32.dll")] public static extern System.IntPtr SendMessage(System.IntPtr h,uint m,System.IntPtr w,System.IntPtr l); [System.Runtime.InteropServices.DllImport("user32.dll")] public static extern bool IsWindowVisible(System.IntPtr h);' -Name LauncherButtonTest -Namespace Native
function Click-Button($button) {
  [void][Native.LauncherButtonTest]::SendMessage([IntPtr]$button.Current.NativeWindowHandle, 245, [IntPtr]::Zero, [IntPtr]::Zero)
}
$repo = Split-Path -Parent $PSScriptRoot
$fixture = Join-Path ([IO.Path]::GetTempPath()) ('cw-gui-' + [Guid]::NewGuid())
[void][IO.Directory]::CreateDirectory($fixture)
function Free-Port {
  $socket = New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback, 0)
  $socket.Start(); $port = $socket.LocalEndpoint.Port; $socket.Stop(); return $port
}
$apiPort = Free-Port
$webPort = Free-Port
while ($webPort -eq $apiPort) { $webPort = Free-Port }
$env:API_PORT = [string]$apiPort
$env:WEB_PORT = [string]$webPort
$env:WORKSPACE_CONFIG_PATH = Join-Path $fixture 'settings.json'
$env:DATABASE_PATH = Join-Path $fixture 'workspace.db'
$launcher = Join-Path $repo 'scripts/launcher.ps1'
$gui = $null
function Wait-Until([scriptblock]$check, [string]$message) {
  $deadline = [DateTime]::UtcNow.AddSeconds(30)
  while ([DateTime]::UtcNow -lt $deadline) {
    if (& $check) { return }
    Start-Sleep -Milliseconds 200
  }
  throw $message
}
try {
  for ($cycle = 1; $cycle -le 2; $cycle++) {
    $gui = Start-Process powershell.exe -ArgumentList ('-NoProfile -STA -ExecutionPolicy RemoteSigned -File "' + $launcher + '" -NoBrowser') -WindowStyle Hidden -PassThru -RedirectStandardError (Join-Path $fixture 'error.txt')
    Wait-Until {
      $condition = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ProcessIdProperty, $gui.Id)
      $candidates = [System.Windows.Automation.AutomationElement]::RootElement.FindAll([System.Windows.Automation.TreeScope]::Children, $condition)
      $script:window = $null
      foreach ($candidate in $candidates) {
        if ($candidate.Current.Name -eq 'Career Workspace' -and $candidate.Current.ControlType -eq [System.Windows.Automation.ControlType]::Window) { $script:window = $candidate; break }
      }
      $null -ne $script:window
    } 'Launcher form unavailable'
    $formHandle = [IntPtr]$window.Current.NativeWindowHandle
    function Button([string]$name) {
      $condition = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty, $name)
      return $window.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $condition)
    }
    $startButton = Button '启动并打开'
    $stopButton = Button '停止'
    Click-Button $startButton
    Wait-Until {
      try { (Invoke-RestMethod "http://127.0.0.1:$apiPort/api/health" -TimeoutSec 1).status -eq 'ok' } catch { $false }
    } 'API did not become healthy.'
    $response = Invoke-WebRequest "http://127.0.0.1:$webPort/api/health" -UseBasicParsing -TimeoutSec 3
    if (($response.Content | ConvertFrom-Json).service -ne 'career-workspace') { throw 'Frontend proxy did not reach API' }
    Start-Sleep -Seconds 2
    if (-not $stopButton.Current.IsEnabled) { throw 'GUI did not remain responsive' }
    [void][Native.LauncherButtonTest]::SendMessage($formHandle, 274, [IntPtr]0xF060, [IntPtr]::Zero)
    Wait-Until { $gui.Refresh(); -not $gui.HasExited -and -not [Native.LauncherButtonTest]::IsWindowVisible($formHandle) } 'X did not hide the launcher'
    Wait-Until {
      try { (Invoke-RestMethod "http://127.0.0.1:$apiPort/api/health" -TimeoutSec 3).status -eq 'ok' } catch { $false }
    } 'API unavailable while hidden'
    $restore = Start-Process powershell.exe -ArgumentList ('-NoProfile -STA -ExecutionPolicy RemoteSigned -File "' + $launcher + '" -NoBrowser') -WindowStyle Hidden -PassThru
    if (-not $restore.WaitForExit(10000)) { throw 'Duplicate launcher did not exit' }
    Wait-Until { [Native.LauncherButtonTest]::IsWindowVisible($formHandle) } 'Hidden launcher was not restored'
    Click-Button $stopButton
    if (-not $gui.WaitForExit(15000)) { throw 'Stop did not exit launcher' }
    try { Invoke-RestMethod "http://127.0.0.1:$apiPort/api/health" -TimeoutSec 1 | Out-Null; throw 'API remained running' }
    catch { if ($_.Exception.Message -eq 'API remained running') { throw } }
    Write-Output "PASS: GUI start/proxy/hide/restore/stop-exit cycle $cycle"
  }
  $errors = Get-Content (Join-Path $fixture 'error.txt') -Raw
  if ($errors) { throw $errors }
  # Exercise actual tray menu handlers without starting services.
  $source = (Get-Content $launcher -Raw).Replace('$rootPath = Split-Path -Parent $PSScriptRoot', '$rootPath = $repo')
  $menuChecks = '$form.Hide()
$trayShow.PerformClick()
if (-not $form.Visible) { throw ''Tray Show did not restore the form'' }
$trayExit.PerformClick()
if (-not $form.IsDisposed) { throw ''Tray Exit did not close the idle launcher'' }
Write-Output ''PASS: tray Show and Exit menu handlers'' '
  $source = $source.Replace('[System.Windows.Forms.Application]::Run($form)', $menuChecks)
  & ([scriptblock]::Create($source)) -NoBrowser
  Write-Output 'PASS: no unhandled GUI errors; test data retained in temporary fixture only.'
} finally {
  $gui.Refresh()
  if (-not $gui.HasExited -and $stopButton) { Click-Button $stopButton; [void]$gui.WaitForExit(15000) }
  # Preserve failed-fixture diagnostics; never remove production data.
  Write-Output "Diagnostics: $fixture"
}
