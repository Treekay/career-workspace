param([switch]$CheckOnly)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$rootPath = Split-Path -Parent $PSScriptRoot
$hash = [System.Security.Cryptography.SHA256]::Create()
$key = [BitConverter]::ToString($hash.ComputeHash([Text.Encoding]::UTF8.GetBytes($rootPath.ToLowerInvariant()))).Replace('-', '')
$hash.Dispose()
$created = $false
$mutex = New-Object System.Threading.Mutex($true, "Local\CareerWorkspace-$key", [ref]$created)
if (-not $created) {
  [System.Windows.Forms.MessageBox]::Show('启动器已经打开，请查看任务栏中的 Career Workspace。', 'Career Workspace') | Out-Null
  $mutex.Dispose()
  exit
}
$script:worker = $null
$script:lineTask = $null
$script:errorTask = $null
$script:pageUrl = $null
$script:closing = $false
$script:stopAt = $null
$form = New-Object System.Windows.Forms.Form
$form.Text = 'Career Workspace'
$form.ClientSize = New-Object System.Drawing.Size(570, 290)
$form.StartPosition = 'CenterScreen'
$form.FormBorderStyle = 'FixedDialog'
$form.MaximizeBox = $false
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
$stop.Enabled = $false
$form.Controls.Add($stop)
$note = New-Object System.Windows.Forms.Label
$note.Text = "关闭此窗口也会停止工作台。数据库和配置会保留。`n设置变更或更新后，请停止再启动。仅管理本启动器启动的服务。"
$note.SetBounds(24, 204, 520, 65)
$form.Controls.Add($note)
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
    $script:errorTask = $script:worker.StandardError.ReadToEndAsync()
    $script:lineTask = $script:worker.StandardOutput.ReadLineAsync()
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
$stop.Add_Click({ Stop-Workspace })
$form.Add_FormClosing({
  if ($script:worker -and -not $script:worker.HasExited) {
    $_.Cancel = $true
    $script:closing = $true
    Stop-Workspace
  }
})
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 150
$timer.Add_Tick({
  if (-not $script:worker) { return }
  while ($script:lineTask -and $script:lineTask.IsCompleted) {
    $line = $script:lineTask.GetAwaiter().GetResult()
    if ($null -eq $line) { $script:lineTask = $null; break }
    if ($line.StartsWith('CW_LAUNCHER ')) {
      try {
        $message = $line.Substring(12) | ConvertFrom-Json
        if ($message.state -eq 'ready' -and -not $script:stopAt) {
          $script:pageUrl = $message.url
          $status.Text = '运行中：' + $script:pageUrl
          $open.Enabled = $true
          Start-Process $script:pageUrl
        } elseif ($message.state -eq 'error') { $status.Text = $message.message }
      } catch { $status.Text = '启动反馈错误：' + $_.Exception.Message }
    }
    $script:lineTask = $script:worker.StandardOutput.ReadLineAsync()
  }
  if ($script:worker.HasExited) {
    $code = $script:worker.ExitCode
    if ($code -eq 0) { $status.Text = '已停止。数据库和配置已保留。' }
    elseif ($script:errorTask.IsCompleted -and $script:errorTask.Result) {
      $status.Text = '服务退出：' + $script:errorTask.Result.Substring(0, [Math]::Min(350, $script:errorTask.Result.Length))
    }
    $script:worker.Dispose(); $script:worker = $null
    $script:lineTask = $null; $script:stopAt = $null
    $start.Enabled = $true; $open.Enabled = $false; $stop.Enabled = $false
    if ($script:closing) { $form.Close() }
  }
})
try {
  if ($CheckOnly) { Write-Output 'Launcher UI initialized'; return }
  $timer.Start()
  [System.Windows.Forms.Application]::Run($form)
} finally {
  $timer.Stop(); $timer.Dispose(); $form.Dispose()
  if ($script:worker -and -not $script:worker.HasExited) { $script:worker.StandardInput.Close() }
  $mutex.ReleaseMutex(); $mutex.Dispose()
}
