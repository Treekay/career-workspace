$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type '[System.Runtime.InteropServices.DllImport("user32.dll")] public static extern System.IntPtr SendMessage(System.IntPtr h,uint m,System.IntPtr w,System.IntPtr l);' -Name LauncherButtonTest -Namespace Native
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
$gui = Start-Process powershell.exe -ArgumentList ('-NoProfile -STA -ExecutionPolicy RemoteSigned -File "' + $launcher + '" -NoBrowser') -WindowStyle Hidden -PassThru -RedirectStandardError (Join-Path $fixture 'error.txt')
function Wait-Until([scriptblock]$check, [string]$message) {
  $deadline = [DateTime]::UtcNow.AddSeconds(30)
  while ([DateTime]::UtcNow -lt $deadline) {
    if (& $check) { return }
    Start-Sleep -Milliseconds 200
  }
  throw $message
}
try {
  Wait-Until { $gui.Refresh(); $gui.MainWindowHandle -ne 0 } 'Launcher window unavailable (close any existing launcher first).'
  $window = [System.Windows.Automation.AutomationElement]::FromHandle($gui.MainWindowHandle)
  function Button([string]$name) {
    $condition = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty, $name)
    return $window.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $condition)
  }
  $startButton = Button '启动并打开'
  $stopButton = Button '停止'
  for ($cycle = 1; $cycle -le 2; $cycle++) {
    Click-Button $startButton
    Wait-Until {
      try { (Invoke-RestMethod "http://127.0.0.1:$apiPort/api/health" -TimeoutSec 1).status -eq 'ok' } catch { $false }
    } 'API did not become healthy.'
    $response = Invoke-WebRequest "http://127.0.0.1:$webPort/api/health" -UseBasicParsing -TimeoutSec 3
    if (($response.Content | ConvertFrom-Json).service -ne 'career-workspace') { throw 'Frontend proxy did not reach API' }
    Start-Sleep -Seconds 2
    if (-not $stopButton.Current.IsEnabled) { throw 'GUI did not remain responsive' }
    Click-Button $stopButton
    Wait-Until { $startButton.Current.IsEnabled } 'Stop did not re-enable Start'
    try { Invoke-RestMethod "http://127.0.0.1:$apiPort/api/health" -TimeoutSec 1 | Out-Null; throw 'API remained running' }
    catch { if ($_.Exception.Message -eq 'API remained running') { throw } }
    Write-Output "PASS: GUI start/proxy/stop cycle $cycle"
  }
  $gui.CloseMainWindow() | Out-Null
  if (-not $gui.WaitForExit(10000)) { throw 'GUI did not exit' }
  $errors = Get-Content (Join-Path $fixture 'error.txt') -Raw
  if ($errors) { throw $errors }
  Write-Output 'PASS: no unhandled GUI errors; test data retained in temporary fixture only.'
} finally {
  $gui.Refresh()
  if (-not $gui.HasExited) { $gui.CloseMainWindow() | Out-Null }
  # Preserve failed-fixture diagnostics; never remove production data.
  Write-Output "Diagnostics: $fixture"
}
