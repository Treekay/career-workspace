param([switch]$CheckOnly, [switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$rootPath = Split-Path -Parent $PSScriptRoot
$instancePath = $rootPath
if ($env:WORKSPACE_CONFIG_PATH) { $instancePath += '|' + $env:WORKSPACE_CONFIG_PATH }
$hash = [System.Security.Cryptography.SHA256]::Create()
$key = [BitConverter]::ToString($hash.ComputeHash([Text.Encoding]::UTF8.GetBytes($instancePath.ToLowerInvariant()))).Replace('-', '')
$hash.Dispose()
Add-Type @"
using System;
using System.Runtime.InteropServices;
public sealed class CareerLauncherOutput {
  public readonly System.Collections.Concurrent.ConcurrentQueue<string> Lines = new System.Collections.Concurrent.ConcurrentQueue<string>();
  private readonly object gate = new object();
  private string errors = "";
  public string ErrorText { get { lock(gate) { return errors; } } }
  public CareerLauncherOutput(System.Diagnostics.Process process) {
    process.OutputDataReceived += (sender, args) => {
      if (args.Data != null && args.Data.StartsWith("CW_LAUNCHER ")) Lines.Enqueue(args.Data);
    };
    process.ErrorDataReceived += (sender, args) => {
      if (args.Data == null) return;
      lock(gate) { if (errors.Length < 4000) errors += args.Data + Environment.NewLine; }
    };
    process.BeginOutputReadLine();
    process.BeginErrorReadLine();
  }
}
public static class CareerLauncherWindow {
  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr window, int command);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr window);
  private delegate bool WindowCallback(IntPtr window, IntPtr data);
  [DllImport("user32.dll")] private static extern bool EnumWindows(WindowCallback callback, IntPtr data);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern bool SetProp(IntPtr window, string name, IntPtr value);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] private static extern IntPtr GetProp(IntPtr window, string name);
  public static void Restore(string key) {
    EnumWindows((window, data) => {
      if (GetProp(window, key) == new IntPtr(1)) {
        ShowWindowAsync(window, 9);
        SetForegroundWindow(window);
        return false;
      }
      return true;
    }, IntPtr.Zero);
  }
}
"@
$created = $false
$mutex = New-Object System.Threading.Mutex($true, "Local\CareerWorkspace-$key", [ref]$created)
if (-not $created) {
  [CareerLauncherWindow]::Restore("CareerWorkspace-$key")
  $mutex.Dispose()
  exit
}
$script:worker = $null
$script:outputPump = $null
$script:pageUrl = $null
$script:closing = $false
$script:stopAt = $null
$form = New-Object System.Windows.Forms.Form
$form.Text = 'Career Workspace'
$form.ClientSize = New-Object System.Drawing.Size(570, 290)
$form.StartPosition = 'CenterScreen'
$form.FormBorderStyle = 'FixedDialog'
$form.MaximizeBox = $false
$form.ShowInTaskbar = $true
$script:firstDisplay = $true
[void][CareerLauncherWindow]::SetProp($form.Handle, "CareerWorkspace-$key", [IntPtr]1)
$form.Font = New-Object System.Drawing.Font('Microsoft YaHei UI', 10)
$title = New-Object System.Windows.Forms.Label
$title.Text = 'Career Workspace · 本地工作台'
$title.SetBounds(24, 20, 520, 32)
$form.Controls.Add($title)
$status = New-Object System.Windows.Forms.Label
$status.Text = '已停止。点击启动，浏览器将自动打开。'
$status.SetBounds(24, 62, 520, 64)
$form.Controls.Add($status)
$start = New-Object System.Windows.Forms.Button
$start.Text = '启动并打开'
$start.SetBounds(24, 140, 158, 42)
$form.Controls.Add($start)
$open = New-Object System.Windows.Forms.Button
$open.Text = '打开页面'
$open.SetBounds(204, 140, 158, 42)
$open.Enabled = $false
$form.Controls.Add($open)
$stop = New-Object System.Windows.Forms.Button
$stop.Text = '停止'
$stop.SetBounds(384, 140, 158, 42)
$stop.Enabled = $true
$form.Controls.Add($stop)
$note = New-Object System.Windows.Forms.Label
$note.Text = "关闭窗口会收到系统托盘，服务继续运行。`n点击停止或托盘右键退出，才会停止服务并退出。"
$note.SetBounds(24, 204, 520, 65)
$form.Controls.Add($note)
$trayMenu = New-Object System.Windows.Forms.ContextMenuStrip
$trayShow = $trayMenu.Items.Add('显示启动器')
[void]$trayMenu.Items.Add((New-Object System.Windows.Forms.ToolStripSeparator))
$trayExit = $trayMenu.Items.Add('退出')
$tray = New-Object System.Windows.Forms.NotifyIcon
$tray.Icon = [System.Drawing.SystemIcons]::Application
$tray.Text = 'Career Workspace'
$tray.ContextMenuStrip = $trayMenu
$tray.Visible = -not $CheckOnly
$script:trayHintShown = $false
function Show-Launcher {
  $form.Show()
  $form.WindowState = [System.Windows.Forms.FormWindowState]::Normal
  [void][CareerLauncherWindow]::ShowWindowAsync($form.Handle, 9)
  [void][CareerLauncherWindow]::SetForegroundWindow($form.Handle)
  $form.Activate()
}
function Exit-Launcher {
  $script:closing = $true
  $start.Enabled = $false
  $stop.Enabled = $false
  $trayExit.Enabled = $false
  if ($script:worker -and -not $script:worker.HasExited) { Stop-Workspace }
  else { $form.Close() }
}
$trayShow.Add_Click({ Show-Launcher })
$tray.Add_DoubleClick({ Show-Launcher })
$trayExit.Add_Click({ Exit-Launcher })
function Stop-Workspace {
  if ($script:worker -and -not $script:worker.HasExited -and -not $script:stopAt) {
    $status.Text = '正在停止并关闭数据库，请稍候…'
    $stop.Enabled = $false
    $open.Enabled = $false
    $script:stopAt = [DateTime]::UtcNow
    try { $script:worker.StandardInput.WriteLine('stop'); $script:worker.StandardInput.Flush() } catch {}
  }
}
$start.Add_Click({
  try {
    $node = (Get-Command node.exe -ErrorAction Stop).Source
    if (-not (Test-Path -LiteralPath (Join-Path $rootPath 'node_modules/tsx'))) { throw '缺少依赖。首次使用请在项目目录运行 npm ci。' }
    $info = New-Object System.Diagnostics.ProcessStartInfo
    $info.FileName = $node
    $info.Arguments = '--import tsx scripts/launcher-runtime.ts'
    $info.WorkingDirectory = $rootPath
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $true
    $info.RedirectStandardInput = $true
    $info.RedirectStandardOutput = $true
    $info.RedirectStandardError = $true
    $script:worker = New-Object System.Diagnostics.Process
    $script:worker.StartInfo = $info
    if (-not $script:worker.Start()) { throw '启动失败。' }
    $script:outputPump = New-Object CareerLauncherOutput($script:worker)
    $script:stopAt = $null
    $script:pageUrl = $null
    $start.Enabled = $false
    $stop.Enabled = $true
    $status.Text = '正在启动本地服务…'
  } catch {
    $status.Text = '无法启动：' + $_.Exception.Message
  }
})
$open.Add_Click({ if ($script:pageUrl) { Start-Process $script:pageUrl } })
$stop.Add_Click({ Exit-Launcher })
$form.Add_FormClosing({
  param($sender, $eventArgs)
  if (-not $script:closing -and $eventArgs.CloseReason -eq [System.Windows.Forms.CloseReason]::UserClosing) {
    $eventArgs.Cancel = $true
    $form.Hide()
    if (-not $script:trayHintShown) {
      $script:trayHintShown = $true
      $tray.ShowBalloonTip(3000, 'Career Workspace', '已收到系统托盘。双击图标恢复；右键退出可停止服务。', [System.Windows.Forms.ToolTipIcon]::Info)
    }
    return
  }
  if ($script:worker -and -not $script:worker.HasExited) {
    $eventArgs.Cancel = $true
    $script:closing = $true
    Stop-Workspace
  }
})
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 150
$timer.Add_Tick({
  $timer.Stop()
  try {
  # WScript starts PowerShell hidden; show the GUI after its message loop starts.
  if ($script:firstDisplay) {
    $script:firstDisplay = $false
    $form.Show()
    $form.WindowState = [System.Windows.Forms.FormWindowState]::Normal
    [void][CareerLauncherWindow]::ShowWindowAsync($form.Handle, 9)
    [void][CareerLauncherWindow]::SetForegroundWindow($form.Handle)
    $form.Activate()
  }
  if (-not $script:worker) { return }
  $line = ''
  while ($script:outputPump -and $script:outputPump.Lines.TryDequeue([ref]$line)) {
    if ($line.StartsWith('CW_LAUNCHER ')) {
      try {
        $message = $line.Substring(12) | ConvertFrom-Json
        if ($message.state -eq 'ready' -and -not $script:stopAt) {
          $script:pageUrl = $message.url
          $status.Text = '运行中：' + $script:pageUrl
          $open.Enabled = $true
          if (-not $NoBrowser) { Start-Process $script:pageUrl }
        } elseif ($message.state -eq 'error') { $status.Text = $message.message }
      } catch { $status.Text = '启动反馈错误：' + $_.Exception.Message }
    }
  }
  if ($script:worker.HasExited) {
    $code = $script:worker.ExitCode
    if ($code -eq 0) { $status.Text = '已停止。数据库和配置已保留。' }
    elseif ($script:outputPump -and $script:outputPump.ErrorText) {
      $status.Text = '服务退出：' + $script:outputPump.ErrorText.Substring(0, [Math]::Min(350, $script:outputPump.ErrorText.Length))
    }
    $script:worker.Dispose(); $script:worker = $null
    $script:outputPump = $null; $script:stopAt = $null
    $start.Enabled = $true; $open.Enabled = $false; $stop.Enabled = $true
    if ($script:closing) { $form.Close() }
  }
  } catch {
    $status.Text = '启动器状态读取失败：' + $_.Exception.Message
    Stop-Workspace
  } finally {
    if (-not $form.IsDisposed) { $timer.Start() }
  }
})
try {
  if ($CheckOnly) { Write-Output 'Launcher UI initialized'; return }
  $timer.Start()
  [System.Windows.Forms.Application]::Run($form)
} finally {
  $tray.Visible = $false; $tray.Dispose(); $trayMenu.Dispose()
  $timer.Stop(); $timer.Dispose(); $form.Dispose()
  if ($script:worker -and -not $script:worker.HasExited) { $script:worker.StandardInput.Close() }
  $mutex.ReleaseMutex(); $mutex.Dispose()
}
